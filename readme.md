# OMG TV - Stremio Addon

Un add-on per Stremio con playlist di canali M3U predefinita, senza personalizzazione.

## Funzionalità

### Core
- Caricamento playlist M3U da URL configurabile
- Visualizzazione dei canali per categorie
- Ricerca dei canali per nome
- Ordinamento automatico per numero di canale (quando disponibile)
- Cache dei dati con aggiornamento automatico

### EPG (Electronic Program Guide)
- Supporto EPG con informazioni dettagliate sui programmi
- Visualizzazione del programma in onda
- Lista dei prossimi programmi con orari
- Aggiornamento automatico dei dati EPG
- Descrizioni dettagliate dei programmi quando disponibili

### Streaming
- Supporto diretto per stream HLS
- Integrazione con MediaFlow Proxy per compatibilità Android e Web
- Gestione degli User-Agent personalizzati per ogni canale
- Fallback automatico tra stream diretti e proxy

### Interfaccia Stremio
- Catalogo organizzato per categorie
- Vista dettagliata dei canali con metadati completi
- Informazioni tecniche del canale (numero canale, qualità, etc.)
- Integrazione con la ricerca nativa di Stremio
- Paginazione dei risultati

## Configurazione

### Variabili d'Ambiente

#### M3U_URL
- **Opzionale**
- URL della playlist M3U personalizzata
- Default: Playlist TUNDRAK (`https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u`)

#### ENABLE_EPG
- **Opzionale**
- Attiva/disattiva le funzionalità EPG
- Valori: `yes` per attivare, qualsiasi altro valore per disattivare
- Default: disattivato
- Durante il caricamente epg potresti notare dei rallentamenti, la durata del processo mediamente è di 5 minuti se rispetti le dimensioni su indicate.
- L'epg viene caricata all'installazione del server e ogni notte alle ore 3:00
- **Nota**: Si consiglia l'attivazione su piani gratuiti di hosting solo per file epg non superiori a 5 MB.
  
#### EPG_URL
- **Opzionale**
- Normalmente l'epg è ricavato dalla playlist M3U
- Puoi però impostarla manualmente con questa variabile d'ambiente
- Puoi usare sia un url compresso che direttamente xml
- **Nota**: l'epg viene mostrata solo se l'id del canale è lo stesso definito nella playlist M3U

#### PROXY_URL e PROXY_PASSWORD
- **Opzionali**
- Configurazione del MediaFlow Proxy
- Necessari per la compatibilità con Android e Web
- Default: nessun proxy

#### FORCE_PROXY
- Se la tua playlist ha bisogno necessariamente di un proxy pui disattivare i link diretti impostando su "yes" questa variabile d'ambiente

#### PORT
- **Opzionale**
- Porta del server
- Default: 10000

#### TIMEZONE_OFFSET
- I dati degli orari dei programmi vengono mostrati con riferimento standard all'orario CET.
- Di base il sistema imposta l'offset per l'orario italiano
- Per impostare il tuo fuso orario imposta l'offset nel formato "+1:00". NB per l'Italia non serve impostare nulla.

### Intervalli di Cache
```javascript
cacheSettings: {
    updateInterval: 12 * 60 * 60 * 1000, // 12 ore
    maxAge: 24 * 60 * 60 * 1000,        // 24 ore
    retryAttempts: 3,
    retryDelay: 5000                     // 5 secondi
}

epgSettings: {
    maxProgramsPerChannel: 50,
    updateInterval: 12 * 60 * 60 * 1000, // 12 ore
    cacheExpiry: 24 * 60 * 60 * 1000    // 24 ore
}
```

## Installazione

### Deploy Locale
1. Clona il repository
2. Installa le dipendenze:
   ```bash
   npm install
   ```
3. Configura le variabili d'ambiente (opzionale)
4. Avvia l'addon:
   ```bash
   npm start
   ```

### Deploy su Render.com
1. Collega il repository a Render
2. Configura le variabili d'ambiente:
3. Deploy automatico ad ogni push

## Struttura del Progetto

```
├── index.js           # Entry point e configurazione server
├── config.js          # Configurazioni globali
├── handlers.js        # Gestori delle richieste Stremio
├── meta-handler.js    # Gestore metadati dettagliati
├── cache-manager.js   # Gestione della cache
├── epg-manager.js     # Gestione dati EPG
├── parser.js          # Parser M3U e EPG
├── playlist-transformer.js  # Trasformazione dati per Stremio
└── proxy-manager.js   # Gestione MediaFlow Proxy
```

## Integrazione con Stremio

### Metodo Automatico
1. Apri la homepage del server (es. `http://localhost:10000`)
2. Clicca su "Aggiungi a Stremio"

### Metodo Manuale
1. Apri Stremio
2. Vai su "Addons" > "Community Addons"
3. Incolla l'URL del manifest (es. `http://localhost:10000/manifest.json`)

## Changelog

### v1.2.0
- Aggiunta vista dettagliata dei canali
- Migliorata integrazione EPG con programmazione dettagliata
- Aggiunto supporto per metadati estesi
- Ottimizzata gestione della cache
- Migliorata stabilità del proxy

### v1.1.0
- Aggiunta visualizzazione dei canali per categorie
- Aggiornato parser a @iptv/playlist 1.1.0
- Migliorato il supporto per i numeri di canale
- Aggiunto ordinamento automatico per numero di canale
- Migliorata la gestione degli user-agent

### v1.0.0
- Release iniziale

## Contribuire
1. Fai un fork del repository
2. Crea un branch per la tua feature (`git checkout -b feature/NuovaFeature`)
3. Committa le modifiche (`git commit -am 'Aggiunta nuova feature'`)
4. Pusha il branch (`git push origin feature/NuovaFeature`)
5. Apri una Pull Request

## Problemi Noti
- L'EPG potrebbe non funzionare correttamente su alcuni hosting gratuiti
- Alcuni stream potrebbero richiedere il proxy per funzionare su dispositivi mobili
- La cache EPG potrebbe occupare molta memoria con molti canali

## Esclusione di responsabilità
- Non sono responsabile dell'uso fraudolento di questo addon e non fornisco ne garanzia ne sicurezza del funzionamento

## Licenza
Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.
