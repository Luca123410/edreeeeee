FROM node:18-alpine

# Installa python/make per eventuali dipendenze native di engines.js (cloudscraper)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install

# Copia il resto del codice
COPY . .

CMD ["node", "src/server.js"]
