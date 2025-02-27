# Usa un'immagine Node.js come base
FROM node:16-slim

# Imposta la directory di lavoro
WORKDIR /app

# Installa git, Python e pip (se necessario)
RUN apt-get update && \
    apt-get install -y git python3 python3-pip && \
    pip3 install requests && \
    rm -rf /var/lib/apt/lists/*

# Copia i file del progetto
COPY package.json package-lock.json ./
RUN npm install

# Copia il resto del codice
COPY . .

# Crea directory per i dati e imposta i permessi
RUN mkdir -p /app/data && chown -R node:node /app/data

# Crea la directory temp e imposta i permessi (come nel Dockerfile di Hugging Face)
RUN mkdir -p /app/temp && \
    chmod 777 /app/temp

# Esponi la porta 10000 (usata dal server)
EXPOSE 10000

# Avvia l'add-on
CMD ["node", "index.js"]
