# OMG TV - Stremio Addon

Un add-on per Stremio con playlist di canali M3U predefinita e non modificabile.

## 🚀 Novità in questa Versione

### Caratteristiche Principali
- 🔒 **Playlist Statica**: URL completamente hardcoded
- 🛡️ Configurazione semplificata e più sicura
- 📺 Canali TV italiani sempre aggiornati

### Playlist Utilizzata
- **URL Fisso**: `https://tivustream.website/urls/listm3u`
- **EPG Predefinita**: `http://www.epg-guide.com/it.gz`
- Vuoi modificare l'url della playlist? Utilizza quest'altra versione: https://github.com/mccoy88f/OMG-Plus-TV-Stremio-Addon
  
## 🌟 Funzionalità 

### Core
- Playlist M3U predefinita e non modificabile
- Visualizzazione dei canali per categorie
- Ricerca dei canali per nome
- Ordinamento automatico per numero di canale
- Cache dei dati con aggiornamento automatico

### EPG (Electronic Program Guide)
- Supporto EPG con informazioni dettagliate
- Visualizzazione del programma in onda
- Lista dei prossimi programmi

### Streaming
- Supporto diretto per stream HLS
- Integrazione con MediaFlow Proxy
- Gestione degli User-Agent personalizzati

## 🛠️ Configurazione

### Variabili d'Ambiente Supportate

#### ENABLE_EPG
- Attiva/disattiva le funzionalità EPG
- Valori: 
  - `yes` per attivare 
  - Qualsiasi altro valore per disattivare
- Default: disattivato

#### PROXY_URL e PROXY_PASSWORD
- Configurazione del MediaFlow Proxy
- Opzionali per la compatibilità con Android e Web

#### FORCE_PROXY
- Forza l'utilizzo del proxy se configurato

#### PORT
- Porta del server
- Default: 10000

## 📦 Installazione

### Deploy Locale
1. Clona il repository
2. Installa le dipendenze:
   ```bash
   npm install
   ```
3. Avvia l'addon:
   ```bash
   npm start
   ```

### Deploy su Render.com
1. Collega il repository a Render
2. Configura le variabili d'ambiente opzionali
3. Deploy automatico

## 🔄 Changelog

### v1.5.0
- 🔒 Playlist sempre fissata a quella di Tivustream
- 🚀 Migliorata stabilità e semplicità di configurazione

## 🤝 Contribuire
1. Fai un fork del repository
2. Crea un branch per la tua feature
3. Committa le modifiche
4. Pusha il branch
5. Apri una Pull Request

## ⚠️ Avvertenze
- L'EPG potrebbe non funzionare su alcuni hosting gratuiti
- Alcuni stream potrebbero richiedere il proxy
- ⚠️ Render.com ha un timer che manda in standby il server se non utilizzato, rallentando poi il riavvio; utilizza [uptime](https://uptimerobot.com/) per risolvere il problema

## 📋 Requisiti
- Node.js 16+
- Connessione Internet
- Client Stremio

## 🔒 Esclusione di Responsabilità
- Non sono responsabile di un eventuale uso illecito di questo addon
- Contenuti forniti da terze parti
- Nessuna garanzia sulla disponibilità dei canali

## 👏 Ringraziamenti
- Grazie a FuriousCat per l'idea del nome OMG
- Grazie a tutto il team di https://www.reddit.com/r/Stremio_Italia/ per il supporto, i suggerimenti e le guide di questo addon disponibili anche sul canale telegram https://t.me/Stremio_ITA

## 📜 Licenza
Progetto rilasciato sotto licenza MIT.
