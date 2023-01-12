const express = require('express');
const crypto = require('crypto');
const { spawn } = require("node:child_process");
const cors = require('cors')

const port = 3001

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

var corsOptions = {
    origin: 'http://127.0.0.1:5173',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

const videoStatuses = []

const randomValue = (length) => {
    const value = crypto.randomBytes(length).toString('hex')
    console.log(value)
    return value
}

const createVideo = (id, instructions) => {

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
            commandArgs.push('-loop', '1', '-t', slide.duration + (amountOfSlides > 1 ? (isFirstOrLast ? 1 : durationAddition) : 0), '-i', slide.src)

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
        });

    } catch (e) {
        console.error('ERROR!!!', e)
        videoStatuses[`${id}`] = 'FAILED'
        return
    }

}

app.post('/video', cors(corsOptions), (req, res) => {
    console.log('post video', req.body)
    const id = randomValue(32)

    createVideo(id, req.body)

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