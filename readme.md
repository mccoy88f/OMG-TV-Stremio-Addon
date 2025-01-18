# OMG TV % OMG+ TV- Stremio Addon

Un add-on per Stremio per aggiungere al catalogo playlist di canali M3U con EPG.

## 🚀 Novità in questa Versione

### Caratteristiche Principali
- 🔒 Versione Base: **Playlist Statica**: URL completamente hardcoded
- 🔒 Versione Plus: **Playlist Dinamica**: URL definito tramite variabile d'ambiente
- 🛡️ Configurazione semplificata e più sicura
- 📺 Versione Base: Canali TV italiani sempre aggiornati senza necessità di impostazioni

### Playlist Utilizzata
- **URL Fisso multiplaylist**: `https://github.com/mccoy88f/OMG-TV-Stremio-Addon/tree/link.playlist`
- **EPG Fisso multiplaylist**: `https://github.com/mccoy88f/OMG-TV-Stremio-Addon/tree/link.epg`
- **URL & EPG Personalizzata multiplaylist** utilizza la versione plus: `https://github.com/mccoy88f/OMG-TV-Stremio-Addon/tree/plus`
  
## 🌟 Funzionalità 

### Core
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
  - `no` per disattivare 
- Default: attivo
- ATTENZIONE: epg con dimensione estratta maggiore di 5/7 Mbyte potrebbero bloccare i servere se presenti su Render.com

#### PROXY_URL e PROXY_PASSWORD
- Configurazione del MediaFlow Proxy
- Opzionali per la compatibilità con Android e Web

#### FORCE_PROXY
- Forza l'utilizzo del proxy se configurato rimuovendo i canali diretti

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
2. Configura le variabili d'ambiente opzionali e procedi al deploy oppure
3. Deploy automatico tramite questo pulsante (è necessario avere account anche gratuito su render.com) - Selezionare la branch su plus per attivare la versione plus

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mccoy88f/OMG-TV-Stremio-Addon)

## 🔄 Changelog

### v2.0.0
- 🔒 Playlist aggiornata per la versione base
- 📃 Modalità multiplaylist - multiepg (solo versione plus): invece di linkare direttamente ad una playlist o ad una epg puoi inserire nelle variabili il link ad un file di testo con più link dentro)
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
