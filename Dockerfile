# Usa un'immagine Node.js come base
FROM node:16

# Imposta la directory di lavoro
WORKDIR /app

# Copia i file del progetto
COPY package.json package-lock.json ./
RUN npm install

# Copia il resto del codice
COPY . .

# Esponi la porta 10000 (usata dal server)
EXPOSE 10000

# Avvia l'add-on
CMD ["node", "index.js"]
