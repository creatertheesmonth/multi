# Dockerfile

# 1. Basis-Image: Nutze ein schlankes Node.js-Image für den Pi (ARM-Architektur)
FROM node:18-alpine

# 2. Lege das Arbeitsverzeichnis im Container fest
WORKDIR /app

# 3. Kopiere nur die package.json und installiere Abhängigkeiten
# Dies nutzt das Docker-Caching und macht den Rebuild schneller
COPY package*.json ./
RUN npm install

# 4. Kopiere den gesamten Rest des Codes in den Container (server.js, index.html, etc.)
COPY . .

# 5. Port, den der Server im Container nutzt (Standard ist 3000)
EXPOSE 3000 

# 6. Startbefehl: Führt den "start"-Script aus package.json aus (npm start -> node server.js)
CMD ["npm", "start"]
