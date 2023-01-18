const express = require('express');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config()

const { initializeApp } = require("firebase/app");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

const port = process.env.PORT

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

const corsOptions = {
    origin: process.env.CORS_ORIGIN,
    optionsSuccessStatus: 200
}

const videoStatuses = []
const videoUrls = []

const randomValue = (length) => {
    const value = crypto.randomBytes(length).toString('hex')
    // console.log(value)
    return value
}
const downloadImages = async (id, urls) => {
    let dir = `${__dirname}/${id}`;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    let i = 0
    const paths = []
    for (const url of urls) {
        const path = `${dir}/${++i}.jpg`
        await downloadImage(url, path)
        // console.log('pushed path:' + path)
        paths.push(path)
    }

    return paths
}

const downloadImage = async (url, filepath) => {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    return new Promise((resolve, reject) => {
        response.data.pipe(fs.createWriteStream(filepath))
            .on('error', reject)
            .once('close', () => {
                // console.log('Done', filepath)
                resolve(filepath)
            });
    });
}

const alignPictures = async (id, paths) => {
    const result = execSync(`convert ${__dirname}/${id}/*.jpg -resize 1920x1080 -gravity center -background "#222529" -extent 1920x1080 ${__dirname}/${id}/ready${paths.length > 1 ? '' : '-0'}.jpg`)
    // console.log('align pics result: ', result)
    for (let i = 0; i < paths.length; i++) {
        paths[i] = `${__dirname}/${id}/ready-${i}.jpg`
    }
}

const deleteFile = (id) => {
    let dir = `${__dirname}/${id}`
    fs.rmSync(dir, { recursive: true, force: true });
    // console.log('Folder deleted: ' + dir);
}

const uploadVideo = async (id, userID) => {
    const fileName = id + '.mp4'
    try {
        const storageRef = ref(storage, `/${userID}/${fileName}`);
        const fileData = fs.readFileSync(fileName);
        await uploadBytes(storageRef, fileData)
        const url = await getDownloadURL(storageRef)
        videoUrls[`${id}`] = url
        deleteFile(fileName)
        // console.log('Download url: ', url);
        // console.log(videoUrls[`${id}`])
    } catch (error) {
        console.log(error)
    }
}

const createVideo = (id, instructions, paths) => {

    videoStatuses[`${id}`] = 'IN_PROGRESS'

    const commandArgs = ['-y']

    try {

        let amountOfSlides = instructions.slideshow.length;
        let durationAddition = amountOfSlides > 1 ? 2 : 0;

        let transition = ''

        let i = 0;
        let accumulatedOffset = 0
        const urls = instructions.slideshow.map(function (slide) {
            const isFirstOrLast = (i === 0 || i + 1 === instructions.slideshow.length)
            const isLast = (i + 1 === instructions.slideshow.length)
            const isPreLast = (i + 2 === instructions.slideshow.length)
            commandArgs.push('-loop', '1', '-t', slide.duration + (amountOfSlides > 1 ? (isFirstOrLast ? 1 : durationAddition) : 0), '-i', paths[i])

            // console.log('transition from slide is: ', slide.transition)
            if (amountOfSlides > 1) {
                accumulatedOffset += slide.duration
                if (!isLast) {
                    transition += `[${i === 0 ? 0 : 'out' + i}][${i + 1}]xfade=transition=${slide.transition}:duration=1:offset=${accumulatedOffset}[out${++i}]${!isPreLast ? ';' : ''}`
                }
                ++accumulatedOffset // increment 1 for 1 second of transition
            }
        })

        // console.log('transition:', transition)
        // console.log('amount ', amountOfSlides)
        if (amountOfSlides > 1) {
            commandArgs.push('-filter_complex', transition)
            commandArgs.push('-c:v', 'libx264', '-r', '25', '-map', `[out${i}]`)
        } else {
            commandArgs.push('-filter_complex', `concat=n=${urls.length}:v=1:a=0`, '-c:v', 'libx264')
        }

        commandArgs.push(`${id}.mp4`)

        // console.log('commandArgs', commandArgs.join(" "))

        const ffmpeg = spawn('ffmpeg', commandArgs)

        ffmpeg.stdout.on('data', (data) => {
            // console.log(`stdout: ${data}`);
        });

        ffmpeg.stderr.on('data', (data) => {
            // console.error(`stderr: ${data}`);
        });

        ffmpeg.on('close', async (code) => {
            // console.log(`child process exited with code ${code}`);
            if (code === 0) {
                await uploadVideo(id, instructions.userID)
                videoStatuses[`${id}`] = 'READY'
            } else {
                videoStatuses[`${id}`] = 'FAILED'
            }
            deleteFile(id)
        });


    } catch (e) {
        console.error('ERROR!!!', e)
        videoStatuses[`${id}`] = 'FAILED'
        return
    }

}

app.post('/video', cors(corsOptions), async (req, res) => {
    // console.log('post video', req.body)
    const id = randomValue(32)

    const urls = req.body.slideshow.map(slide => {
        return slide.src
    })

    // console.log(urls)
    const paths = await downloadImages(id, urls)
    alignPictures(id, paths)
    createVideo(id, req.body, paths)

    res.status(201);
    res.json({ id })
})

app.get('/status/:id', (req, res) => {
    // console.log('check status')
    const result = {}
    result.status = videoStatuses[`${req.params.id}`] === undefined ? 'UNKNOWN' : videoStatuses[`${req.params.id}`];
    if (result.status === 'READY') {
        result.url = videoUrls[`${req.params.id}`]
    }
    res.status(200)
    res.json(result)
})

app.listen(port, () => {
    console.log(`Videomaker app listening on port ${port}`)
})