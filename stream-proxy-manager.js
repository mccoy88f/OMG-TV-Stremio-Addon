const axios = require('axios');
const { URL } = require('url');
const config = require('./config');

class StreamProxyManager {
    constructor() {}

    async validateProxyUrl(url) {
        if (!url) return false;
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
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

    async getProxyStreams(input, userConfig = {}) {
        if (!userConfig.proxy || !userConfig.proxy_pwd) {
            console.log('Proxy non configurato per:', input.name);
            return [];
        }

        let streams = [];

        try {
            // Determiniamo se stiamo ricevendo un channel o uno streamDetails
            const isChannel = input.streamInfo?.urls;
            const streamsList = isChannel ? input.streamInfo.urls : [input];

            // Creiamo array di promesse per elaborazione parallela
            const streamPromises = streamsList.map(async stream => {
                try {
                    // Assicuriamoci di avere degli headers validi con user agent
                    const headers = stream.headers || {};
                    if (!headers['User-Agent'] && !headers['user-agent']) {
                        headers['User-Agent'] = config.defaultUserAgent;
                    }

                    const streamDetails = {
                        name: stream.name || input.name,
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
                    console.error('Errore elaborazione stream:', error.message);
                    return null;
                }
            });

            // Attendiamo tutte le promesse in parallelo
            const results = await Promise.all(streamPromises);
            
            // Filtriamo i risultati nulli
            streams = results.filter(stream => stream !== null);

            if (streams.length === 0) {
                console.log('Nessuno stream proxy trovato per:', input.name);
            } else {
                console.log(`Trovati ${streams.length} stream proxy per:`, input.name);
            }

        } catch (error) {
            console.error('Errore generale proxy:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Headers:', error.response.headers);
            }
        }

        return streams;
    }
}

module.exports = () => new StreamProxyManager();
