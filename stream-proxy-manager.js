const axios = require('axios');
const { URL } = require('url');

class StreamProxyManager {
    constructor(config) {
        this.config = config;
        this.proxyCache = new Map();
        this.lastCheck = new Map();
    }

    async resolveStreamUrl(originalUrl, headers = {}) {
        try {
            const networkHeaders = {
                ...headers,
                'User-Agent': headers['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': headers['Referer'] || '',
                'Origin': headers['Origin'] || ''
            };

            const response = await axios({
                method: 'get',
                url: originalUrl,
                headers: networkHeaders,
                maxRedirects: 5,
                validateStatus: status => status < 400,
                timeout: 10000
            });

            return {
                finalUrl: response.request.res.responseUrl || originalUrl,
                headers: networkHeaders,
                status: response.status
            };
        } catch (error) {
            console.error(`Errore risoluzione URL ${originalUrl}:`, error.message);
            return { 
                finalUrl: originalUrl, 
                headers,
                status: error.response?.status || 500
            };
        }
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
                timeout: 5000,
                validateStatus: status => status < 400,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });
            return response.status < 400;
        } catch {
            return false;
        }
    }

    buildProxyUrl(streamUrl, headers = {}) {
        if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
            return null;
        }

        const baseUrl = this.config.PROXY_URL.replace(/\/+$/, '');
        const params = new URLSearchParams({
            api_password: this.config.PROXY_PASSWORD,
            d: streamUrl,
            'user-agent': headers['User-Agent'] || 'Mozilla/5.0',
            'referer': headers['Referer'] || '',
            'origin': headers['Origin'] || ''
        });

        // Determina il tipo di stream e restituisce l'URL del proxy appropriato
        if (streamUrl.endsWith('.m3u8')) {
            return `${baseUrl}/proxy/hls/manifest.m3u8?${params.toString()}`;
        } else if (streamUrl.endsWith('.mpd')) {
            return `${baseUrl}/proxy/mpd/manifest.m3u8?${params.toString()}`;
        } else if (streamUrl.startsWith('https://')) {
            return `${baseUrl}/proxy/stream?${params.toString()}`;
        }
        
        return null;
    }

    async getProxyStreams(channel) {
        const streams = [];

        if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
            return streams;
        }

        try {
            const { finalUrl, headers, status } = await this.resolveStreamUrl(
                channel.url, 
                channel.headers
            );

            if (status === 404 || !finalUrl) {
                console.log(`Canale non disponibile: ${channel.name}`);
                return streams;
            }

            const proxyUrl = this.buildProxyUrl(finalUrl, headers);
            if (!proxyUrl) {
                console.log(`Formato stream non supportato per: ${channel.name}`);
                return streams;
            }

            const cacheKey = `${channel.name}_${proxyUrl}`;
            const lastCheck = this.lastCheck.get(cacheKey);
            const cacheValid = lastCheck && (Date.now() - lastCheck) < 5 * 60 * 1000;

            if (cacheValid && this.proxyCache.has(cacheKey)) {
                console.log(`Usando cache per: ${channel.name}`);
                return [this.proxyCache.get(cacheKey)];
            }

            if (!await this.checkProxyHealth(proxyUrl)) {
                console.log('Proxy non attivo per:', channel.name);
                return [];
            }

            // Determina il tipo di stream per il suffisso del nome
            let streamType = 'HTTP';
            if (finalUrl.endsWith('.m3u8')) streamType = 'HLS';
            else if (finalUrl.endsWith('.mpd')) streamType = 'DASH';

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

module.exports = config => new StreamProxyManager(config);
