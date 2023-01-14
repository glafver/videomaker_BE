const express = require('express');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const port = 3001

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

var corsOptions = {
    origin: 'http://127.0.0.1:5173',
    optionsSuccessStatus: 200
}

const videoStatuses = []

const randomValue = (length) => {
    const value = crypto.randomBytes(length).toString('hex')
    console.log(value)
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
        console.log('pushed path:' + path)
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
                console.log('Done', filepath)
                resolve(filepath)
            });
    });
}

const alignPictures = async (id, paths) => {
    const result = execSync(`convert ${__dirname}/${id}/*.jpg -resize 1920x1080 -gravity center -background "#222529" -extent 1920x1080 ${__dirname}/${id}/ready.jpg`)
    console.log('align pics result: ', result)
    for (let i = 0; i < paths.length; i++) {
        paths[i] = `${__dirname}/${id}/ready-${i}.jpg`
    }
}

const deleteFolder = (id) => {
    let dir = `${__dirname}/${id}`
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('Folder deleted: ' + dir);
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

            console.log('transition from slide is: ', slide.transition)
            if (amountOfSlides > 1) {
                accumulatedOffset += slide.duration
                if (!isLast) {
                    transition += `[${i === 0 ? 0 : 'out' + i}][${i + 1}]xfade=transition=${slide.transition}:duration=1:offset=${accumulatedOffset}[out${++i}]${!isPreLast ? ';' : ''}`
                }
                ++accumulatedOffset // increment 1 for 1 second of transition
            }
        })

        console.log('transition:', transition)

        if (amountOfSlides > 1) {
            commandArgs.push('-filter_complex', transition)
            commandArgs.push('-c:v', 'libx264', '-r', '25', '-map', `[out${i}]`)
        } else {
            commandArgs.push('-filter_complex', `concat=n=${urls.length}:v=1:a=0`, '-c:v', 'libx264')
        }

        commandArgs.push(`${id}.mp4`)

        console.log('commandArgs', commandArgs.join(" "))

        const ffmpeg = spawn('ffmpeg', commandArgs)

        ffmpeg.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        ffmpeg.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
            if (code === 0) {
                videoStatuses[`${id}`] = 'READY'
            } else {
                videoStatuses[`${id}`] = 'FAILED'
            }
            deleteFolder(id)
        });

    } catch (e) {
        console.error('ERROR!!!', e)
        videoStatuses[`${id}`] = 'FAILED'
        return
    }

}

app.post('/video', cors(corsOptions), async (req, res) => {
    console.log('post video', req.body)
    const id = randomValue(32)

    const urls = req.body.slideshow.map(slide => {
        return slide.src
    })

    console.log(urls)
    const paths = await downloadImages(id, urls)
    alignPictures(id, paths)
    createVideo(id, req.body, paths)

    res.status(201);
    res.json({ id })
})

app.get('/status/:id', (req, res) => {
    console.log('check status')
    const status = videoStatuses[`${req.params.id}`] === undefined ? 'UNKNOWN' : videoStatuses[`${req.params.id}`];
    res.status(200)
    res.json({ status })
})

app.get('/video/:id', (req, res) => {
    res.sendFile(__dirname + '/' + req.params.id + '.mp4')
})

app.listen(port, () => {
    console.log(`Videomaker app listening on port ${port}`)
})