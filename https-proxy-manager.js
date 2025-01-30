const axios = require('axios');
const { URL } = require('url');

class HttpsProxyManager {
    constructor(config) {
        this.config = config;
        this.proxyCache = new Map();
        this.lastCheck = new Map();
    }

    async resolveStreamUrl(originalUrl, headers) {
        try {
            console.log(`Risoluzione URL HTTPS: ${originalUrl}`);
            
            const networkHeaders = {
                ...headers,
                'User-Agent': headers['User-Agent'] || [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                    'Mozilla/5.0 (X11; Linux x86_64)'
                ][Math.floor(Math.random() * 3)],
                'Accept': '*/*',
                'Accept-Language': 'it-IT,it;q=0.8,en-US;q=0.5,en;q=0.3',
                'Referer': headers.Referer || 'https://vavoo.to/',
                'Origin': headers.Origin || 'https://vavoo.to',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache'
            };

            const response = await axios({
                method: 'get',
                url: originalUrl,
                headers: networkHeaders,
                maxRedirects: 5,
                validateStatus: status => status < 400,
                timeout: 10000
            });

            const finalUrl = response.request.res.responseUrl || originalUrl;
            console.log(`URL HTTPS finale: ${finalUrl}`);

            return {
                finalUrl,
                headers: {
                    ...networkHeaders,
                    ...response.headers
                },
                status: response.status
            };

        } catch (error) {
            console.error(`Errore risoluzione URL HTTPS ${originalUrl}:`, error.message);
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
            return parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    async checkProxyHealth(proxyUrl) {
        try {
            const response = await axios.head(proxyUrl, {
                timeout: 5000,
                validateStatus: status => status === 200 || status === 302,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            return response.status === 200 || response.status === 302;
        } catch {
            return false;
        }
    }

    buildProxyUrl(streamUrl, headers) {
        if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
            return null;
        }

        const params = new URLSearchParams({
            api_password: this.config.PROXY_PASSWORD,
            d: streamUrl
        });

        if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
                params.append(`h_${key}`, value);
            });
        }

        return `${this.config.PROXY_URL}/proxy/stream?${params.toString()}`;
    }

    async getProxyStreams(channel) {
        const streams = [];

        if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
            return streams;
        }

        try {
            // Risolvi l'URL del flusso con headers dinamici
            const { finalUrl, headers, status } = await this.resolveStreamUrl(
                channel.url, 
                channel.headers
            );

            // Verifica URL finale
            if (status === 404 || !finalUrl) {
                console.log(`Canale HTTPS non disponibile: ${channel.name}`);
                return streams;
            }

            const proxyUrl = this.buildProxyUrl(finalUrl, headers);

            const cacheKey = `${channel.name}_${proxyUrl}`;
            const lastCheck = this.lastCheck.get(cacheKey);
            const cacheValid = lastCheck && (Date.now() - lastCheck) < 5 * 60 * 1000;

            if (cacheValid && this.proxyCache.has(cacheKey)) {
                console.log(`Usando cache HTTPS per: ${channel.name}`);
                return [this.proxyCache.get(cacheKey)];
            }

            if (!await this.checkProxyHealth(proxyUrl)) {
                console.log('Proxy HTTPS non attivo per:', channel.name);
                return [];
            }

            // Costruisci stream proxy
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
            console.error('Errore proxy HTTPS per il canale:', channel.name, error.message);
            console.error('URL richiesto:', channel.url);
            console.error('Headers:', channel.headers);
        }

        return streams;
    }
}

module.exports = HttpsProxyManager;
