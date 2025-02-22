const axios = require('axios');
const { URL } = require('url');
const config = require('./config');

class StreamProxyManager {
    constructor() {
        this.proxyCache = new Map();
        this.lastCheck = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minuti
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

    async checkProxyHealth(proxyUrl) {
        const cacheKey = proxyUrl;
        const now = Date.now();
        const lastCheckTime = this.lastCheck.get(cacheKey);

        // Se abbiamo un check recente, usiamo quello
        if (lastCheckTime && (now - lastCheckTime) < this.CACHE_DURATION) {
            return this.proxyCache.get(cacheKey);
        }

        try {
            const response = await axios.get(proxyUrl, {
                timeout: 3000, // Ridotto da 10s a 3s
                validateStatus: status => status < 400,
                headers: {
                    'User-Agent': config.defaultUserAgent
                }
            });
            
            const isHealthy = response.status < 400;
            this.proxyCache.set(cacheKey, isHealthy);
            this.lastCheck.set(cacheKey, now);
            return isHealthy;
        } catch (error) {
            console.error('Verifica dello stato di salute del proxy fallita:', {
                messaggio: error.message,
                codice: error.code
            });
            return false;
        }
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

    async getProxyStreams(channel, userConfig = {}) {
        if (!userConfig.proxy || !userConfig.proxy_pwd) {
            console.log('Proxy non configurato per:', channel.name);
            return [];
        }

        let streams = [];

        try {
            // Verifichiamo che il canale abbia degli URL validi
            if (!channel.streamInfo?.urls || !Array.isArray(channel.streamInfo.urls)) {
                console.error('Struttura stream non valida per il canale:', channel.name);
                return streams;
            }

            // Creiamo array di promesse per elaborazione parallela
            const streamPromises = channel.streamInfo.urls.map(async stream => {
                try {
                    // Assicuriamoci di avere degli headers validi con user agent
                    const headers = stream.headers || {};
                    if (!headers['User-Agent'] && !headers['user-agent']) {
                        headers['User-Agent'] = config.defaultUserAgent;
                    }

                    const streamDetails = {
                        name: stream.name || channel.name,
                        url: stream.url,
                        headers: headers
                    };

                    const proxyUrl = await this.buildProxyUrl(
                        streamDetails.url, 
                        streamDetails.headers, 
                        userConfig
                    );

                    if (!proxyUrl) {
                        return null;
                    }

                    // Controllo salute del proxy solo se non c'è in cache
                    if (!this.proxyCache.has(proxyUrl)) {
                        const isHealthy = await this.checkProxyHealth(proxyUrl);
                        if (!isHealthy) {
                            return null;
                        }
                    }

                    let streamType = streamDetails.url.endsWith('.m3u8') ? 'HLS' : 
                                   streamDetails.url.endsWith('.mpd') ? 'DASH' : 'HTTP';

                    return {
                        name: `${streamDetails.name} [P](${streamType})`,
                        title: `${streamDetails.name} [P](${streamType})`,
                        url: proxyUrl,
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: "tv"
                        }
                    };
                } catch (error) {
                    console.error('Errore elaborazione stream:', streamDetails?.name, error.message);
                    return null;
                }
            });

            // Attendiamo tutte le promesse in parallelo
            const results = await Promise.all(streamPromises);
            
            // Filtriamo i risultati nulli e restituiamo gli stream validi
            streams = results.filter(stream => stream !== null);

            if (streams.length === 0) {
                console.log('Nessuno stream proxy valido trovato per:', channel.name);
            } else {
                console.log(`Trovati ${streams.length} stream proxy validi per:`, channel.name);
            }

        } catch (error) {
            console.error('Errore generale proxy per il canale:', channel.name, error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Headers:', error.response.headers);
            }
        }

        return streams;
    }
}

module.exports = () => new StreamProxyManager();
