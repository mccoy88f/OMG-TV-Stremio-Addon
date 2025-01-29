const axios = require('axios');
const { URL } = require('url');

class HttpsProxyManager {
    constructor(config) {
        this.config = config;
        this.proxyCache = new Map();
        this.lastCheck = new Map();
    }

    async validateProxyUrl(url) {
        if (!url) return false;
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    async checkProxyHealth(proxyUrl) {
        try {
            const response = await axios.head(proxyUrl, {
                timeout: 5000,
                validateStatus: status => status === 200 || status === 302
            });
            return response.status === 200 || response.status === 302;
        } catch {
            return false;
        }
    }

    buildProxyUrl(streamUrl, userAgent) {
        if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
            return null;
        }

        const params = new URLSearchParams({
            api_password: this.config.PROXY_PASSWORD,
            d: streamUrl
        });

        if (userAgent) {
            params.append('h_User-Agent', userAgent);
        }

        // Usiamo l'endpoint per flussi HTTPS generici
        return `${this.config.PROXY_URL}/proxy/stream?${params.toString()}`;
    }

    async getProxyStreams(channel) {
        const streams = [];
        const userAgent = channel.headers?.['User-Agent'] || 'Mozilla/5.0';

        if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
            return streams;
        }

        try {
            const proxyUrl = this.buildProxyUrl(channel.url, userAgent);

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

            const proxyStream = {
                name: `${channel.name} (Proxy HTTPS)`,
                title: `${channel.name} (Proxy HTTPS)`,
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
            console.error('URL richiesto:', proxyUrl);
            console.error('User-Agent:', userAgent);
        }

        return streams;
    }
}

module.exports = HttpsProxyManager;
