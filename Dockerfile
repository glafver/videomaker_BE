FROM node:16-alpine3.16

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

RUN apk update
RUN apk add
RUN apk add ffmpeg
RUN apk add imagemagick

COPY . .

EXPOSE 3001

#RUN npm run build

CMD [ "node", "app.js" ]