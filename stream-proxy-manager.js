const axios = require('axios');
const { URL } = require('url');
const config = require('./config');

class StreamProxyManager {
    constructor() {
        this.proxyCache = new Map();  // Usato per memorizzare lo stato di salute dei proxy
        this.lastCheck = new Map();   // Usato per memorizzare l'ultimo controllo di salute
        this.CACHE_DURATION = 1 * 60 * 1000; // 1 minuto
        this.MAX_RETRY_ATTEMPTS = 3; // Numero massimo di tentativi
        this.RETRY_DELAY = 1000; // Intervallo tra i tentativi in ms
    }

    async validateProxyUrl(url) {
        if (!url) return false;
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    // Funzione di sleep per il ritardo tra i tentativi
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async checkProxyHealth(proxyUrl, headers = {}) {
        const cacheKey = proxyUrl;
        const now = Date.now();
        const lastCheckTime = this.lastCheck.get(cacheKey);

        // Se abbiamo un check recente, usiamo quello
        if (lastCheckTime && (now - lastCheckTime) < this.CACHE_DURATION) {
            return this.proxyCache.get(cacheKey);
        }

        // Prepara gli headers finali per la richiesta
        const finalHeaders = {
            'User-Agent': headers['User-Agent'] || headers['user-agent'] || config.defaultUserAgent
        };

        if (headers['referer'] || headers['Referer'] || headers['referrer'] || headers['Referrer']) {
            finalHeaders['Referer'] = headers['referer'] || headers['Referer'] || 
                                    headers['referrer'] || headers['Referrer'];
        }

        if (headers['origin'] || headers['Origin']) {
            finalHeaders['Origin'] = headers['origin'] || headers['Origin'];
        }

        // Implementazione dei tentativi multipli
        let attempts = 0;
        let isHealthy = false;
        let lastError = null;

        while (attempts < this.MAX_RETRY_ATTEMPTS && !isHealthy) {
            attempts++;
            
            try {
                console.log(`Tentativo ${attempts}/${this.MAX_RETRY_ATTEMPTS} di verifica proxy`);
                
                const response = await axios.get(proxyUrl, {
                    timeout: 10000,
                    validateStatus: status => status < 400,
                    headers: finalHeaders
                });
                
                isHealthy = response.status < 400;
                
                if (isHealthy) {
                    console.log(`✓ Proxy verificato con successo al tentativo ${attempts}`);
                } else {
                    console.log(`✗ Proxy non valido al tentativo ${attempts}`);
                    if (attempts < this.MAX_RETRY_ATTEMPTS) {
                        await this.sleep(this.RETRY_DELAY);
                    }
                }
            } catch (error) {
                lastError = error;
                console.error(`✗ Errore al tentativo ${attempts}/${this.MAX_RETRY_ATTEMPTS}:`, {
                    messaggio: error.message,
                    codice: error.code
                });
                
                // Se non è l'ultimo tentativo, aspetta prima di riprovare
                if (attempts < this.MAX_RETRY_ATTEMPTS) {
                    await this.sleep(this.RETRY_DELAY);
                }
            }
        }

        // Aggiorna la cache solo dopo tutti i tentativi
        this.proxyCache.set(cacheKey, isHealthy);
        this.lastCheck.set(cacheKey, now);
        
        if (!isHealthy) {
            // Log dettagliato in caso di fallimento di tutti i tentativi
            console.error('❌ ERRORE PROXY HEALTH CHECK - Tutti i tentativi falliti:');
            console.error(`  URL: ${proxyUrl}`);
            console.error(`  Tentativi effettuati: ${attempts}/${this.MAX_RETRY_ATTEMPTS}`);
            
            if (lastError) {
                console.error(`  Ultimo errore: ${lastError.message}`);
                console.error(`  Codice errore: ${lastError.code || 'N/A'}`);
                
                if (lastError.response) {
                    console.error(`  Status HTTP: ${lastError.response.status}`);
                    console.error(`  Headers risposta:`, lastError.response.headers);
                }
                
                // Log dello stack trace per debug avanzato
            } else {
                console.error(`  Nessun errore specifico rilevato, controllo fallito senza eccezioni`);
            }
            
            // Log degli headers usati nella richiesta
            console.error('============================================================');
        } else if (attempts > 1) {
            // Log di successo dopo tentativi multipli
            console.log(`✅ Proxy verificato con successo dopo ${attempts} tentativi`);
        }
        
        return isHealthy;
    }

    async buildProxyUrl(streamUrl, headers = {}, userConfig = {}) {
        if (!userConfig.proxy || !userConfig.proxy_pwd) {
            return null;
        }

        const baseUrl = userConfig.proxy.replace(/\/+$/, '');
        const params = new URLSearchParams({
            api_password: userConfig.proxy_pwd,
            d: streamUrl,
        });

        // Assicuriamoci di avere uno user agent valido
        const userAgent = headers['User-Agent'] || headers['user-agent'] || config.defaultUserAgent;
        params.append('h_user-agent', userAgent);

        // Verifica tutte le varianti di referer/referrer e aggiunge con prefisso h_
        if (headers['referer'] || headers['Referer'] || headers['referrer'] || headers['Referrer']) {
            params.append('h_referer', 
                headers['referer'] || headers['Referer'] || 
                headers['referrer'] || headers['Referrer']);
        }

        // Verifica tutte le varianti di origin e aggiunge con prefisso h_
        if (headers['origin'] || headers['Origin']) {
            params.append('h_origin', headers['origin'] || headers['Origin']);
        }

        let proxyUrl;
        if (streamUrl.endsWith('.m3u8')) {
            proxyUrl = `${baseUrl}/proxy/hls/manifest.m3u8?${params.toString()}`;
        } else if (streamUrl.endsWith('.mpd')) {
            proxyUrl = `${baseUrl}/proxy/mpd/manifest.m3u8?${params.toString()}`;
        } else if (streamUrl.startsWith('https://')) {
            proxyUrl = `${baseUrl}/proxy/stream?${params.toString()}`;
        }

        return proxyUrl;
    }

    async getProxyStreams(input, userConfig = {}) {
        // Blocca solo gli URL che sono già proxy
        if (input.url.includes(userConfig.proxy)) {
            console.log(`⚠️ L'URL è già un proxy, salto: ${input.url}`);
            return [];
        }
        
        // Se il proxy non è configurato, interrompe l'elaborazione
        if (!userConfig.proxy || !userConfig.proxy_pwd) {
            console.log('⚠️ Proxy non configurato per:', input.name);
            return [];
        }
    
        let streams = [];
        
        try {
            const headers = input.headers || {};
            
            // Assicura che lo User-Agent sia impostato
            if (!headers['User-Agent'] && !headers['user-agent']) {
                headers['User-Agent'] = config.defaultUserAgent;
            }
    
            // Costruisce l'URL del proxy
            const proxyUrl = await this.buildProxyUrl(input.url, headers, userConfig);
    
            // Verifica se il proxy è attivo e funzionante
            const isHealthy = await this.checkProxyHealth(proxyUrl, headers);
            if (!isHealthy) {
                console.log(`✗ Proxy non valido per: ${input.url}`);
                return [];
            }
    
            // Determina il tipo di stream (HLS, DASH o HTTP)
            let streamType = input.url.endsWith('.m3u8') ? 'HLS' : 
                             input.url.endsWith('.mpd') ? 'DASH' : 'HTTP';
    
            // Aggiunge lo stream proxato all'array
            streams.push({
                name: input.name,
                title: `✅ ${input.name}\n[Proxy ${streamType}]`,
                url: proxyUrl,
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: "tv"
                }
            });
    
            console.log(`✅ Proxy aggiunto: ${proxyUrl}`);
    
        } catch (error) {
            console.error('❌ Errore durante l\'elaborazione del proxy:', error.message);
        }
    
        return streams;
    }


}

module.exports = () => new StreamProxyManager();
