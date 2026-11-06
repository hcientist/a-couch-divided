# A Couch Divided

A splitscreen ink turf war for 1–4 players on one screen (three.js + Vite).

## Develop

```sh
npm install
npm run dev
```

## Host with Docker

```sh
docker compose up -d --build     # serves on http://localhost:8080
PORT=9000 docker compose up -d   # or pick another host port
```

The image is a two-stage build: Node builds the static bundle, then nginx serves `dist/`.
