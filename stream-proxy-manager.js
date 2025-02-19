const axios = require('axios');
const { URL } = require('url');
const config = require('./config');

class StreamProxyManager {
    constructor() {
        this.proxyCache = new Map();
        this.lastCheck = new Map();
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
        try {
            const response = await axios.get(proxyUrl, {
                timeout: 10000,
                validateStatus: status => status < 400,
                headers: {
                    'User-Agent': config.defaultUserAgent
                }
            });
            return response.status < 400;
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
            'user-agent': headers['User-Agent'] || config.defaultUserAgent
        });

    // Verifica sia versione maiuscola che minuscola
        if (headers['referer'] || headers['Referer']) {
            params.append('referer', headers['referer'] || headers['Referer']);
        }

    // Verifica sia versione maiuscola che minuscola
        if (headers['origin'] || headers['Origin']) {
            params.append('origin', headers['origin'] || headers['Origin']);
        }

        let proxyUrl;
        if (streamUrl.endsWith('.m3u8')) {
            proxyUrl = `${baseUrl}/proxy/hls/manifest.m3u8?${params.toString()}`;
        } else if (streamUrl.endsWith('.mpd')) {
            proxyUrl = `${baseUrl}/proxy/mpd/manifest.m3u8?${params.toString()}`;
        } else if (streamUrl.startsWith('https://')) {
            proxyUrl = `${baseUrl}/proxy/stream?${params.toString()}`;
        }
        console.log('Headers passati al proxy:', headers);
        console.log('Parametri URL proxy:', params.toString());
        console.log('Url inviato:', proxyUrl);
        return proxyUrl;
    }

    async getProxyStreams(channel, userConfig = {}) {
        const streams = [];
        
        if (!userConfig.proxy || !userConfig.proxy_pwd) {
            console.log('Proxy non configurato per:', channel.name);
            return streams;
        }

        try {
            const proxyUrl = await this.buildProxyUrl(channel.url, channel.headers, userConfig);
            if (!proxyUrl) {
                console.log(`Formato stream non supportato per: ${channel.name}`);
                return streams;
            }

            const cacheKey = `${channel.name}_${proxyUrl}`;
            const lastCheck = this.lastCheck.get(cacheKey);
            const cacheValid = lastCheck && (Date.now() - lastCheck) < 5 * 60 * 1000;

            if (cacheValid && this.proxyCache.has(cacheKey)) {
                return [this.proxyCache.get(cacheKey)];
            }

            if (!await this.checkProxyHealth(proxyUrl)) {
                console.log('Proxy non attivo per:', channel.name);
                return [];
            }

            let streamType = channel.url.endsWith('.m3u8') ? 'HLS' : 
                         channel.url.endsWith('.mpd') ? 'DASH' : 'HTTP';

            const proxyStream = {
                name: `${channel.name} [P](${streamType})`,
                title: `${channel.name} [P](${streamType})`,
                url: proxyUrl,
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: "tv"
                }
            };

            this.proxyCache.set(cacheKey, proxyStream);
            this.lastCheck.set(cacheKey, Date.now());
            streams.push(proxyStream);

        } catch (error) {
            console.error('Errore proxy per il canale:', channel.name, error.message);
            console.error('URL richiesto:', channel.url);
            console.error('Headers:', channel.headers);
        }

        return streams;
    }
}

module.exports = () => new StreamProxyManager();
