const express = require('express');
const crypto = require('crypto');
const base64url = require('base64url');

const port = 3001

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const videoStatuses = []

const randomValue = (length) => {
    const value = base64url(crypto.randomBytes(length))
    console.log(value)
    return value
}

app.post('/video', (req, res) => {
    console.log('post video', req.body)
    const id = randomValue(32)

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
    console.log(req.params.id)
})

app.listen(port, () => {
    console.log(`Videomaker app listening on port ${port}`)
})