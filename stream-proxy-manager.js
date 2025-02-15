const axios = require('axios');
const { URL } = require('url');
const defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';


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
                timeout: 5000,
                validateStatus: status => status < 400,
                headers: {
                    'User-Agent': config.defaultUserAgent
                }
            });
            return response.status < 400;
        } catch {
            return false;
        }
    }

    async buildProxyUrl(streamUrl, headers = {}, config = {}) {
        if (!config.proxy || !config.proxy_pwd) {
            return null;
        }

        const baseUrl = config.proxy.replace(/\/+$/, '');
        const params = new URLSearchParams({
            api_password: config.proxy_pwd,
            d: streamUrl,
            'user-agent': headers['User-Agent'] || config.defaultUserAgent,
            'referer': headers['Referer'],
            'origin': headers['Origin']
        });

        if (streamUrl.endsWith('.m3u8')) {
            return `${baseUrl}/proxy/hls/manifest.m3u8?${params.toString()}`;
        } else if (streamUrl.endsWith('.mpd')) {
            return `${baseUrl}/proxy/mpd/manifest.m3u8?${params.toString()}`;
        } else if (streamUrl.startsWith('https://')) {
            return `${baseUrl}/proxy/stream?${params.toString()}`;
        }
        
        return null;
    }

    async getProxyStreams(channel, config = {}) {
        const streams = [];
        if (!config.proxy || !config.proxy_pwd) return streams;
    
        try {
            const proxyUrl = await this.buildProxyUrl(channel.url, channel.headers, config);
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

            let streamType = 'HTTP';
            if (channel.url.endsWith('.m3u8')) streamType = 'HLS';
            else if (channel.url.endsWith('.mpd')) streamType = 'DASH';

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
        }

        return streams;
    }
}
module.exports = () => new StreamProxyManager();
