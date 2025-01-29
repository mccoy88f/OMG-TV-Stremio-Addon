const axios = require('axios');
const { URL } = require('url');

class HlsProxyManager {
   constructor(config) {
       this.config = config;
       this.proxyCache = new Map();
       this.lastCheck = new Map();
   }

   async resolveStreamUrl(originalUrl, headers) {
       try {
           console.log(`Risoluzione URL: ${originalUrl}`);
           console.log('Headers iniziali:', headers);

           const response = await axios({
               method: 'get',
               url: originalUrl,
               headers: headers,
               maxRedirects: 0,
               validateStatus: status => status >= 200 && status < 400
           });

           // Gestione redirect
           if (response.status >= 300 && response.status < 400) {
               const redirectUrl = response.headers.location;
               console.log(`Redirect a: ${redirectUrl}`);

               return {
                   finalUrl: redirectUrl,
                   headers: {
                       ...headers,
                       ...response.headers
                   },
                   status: response.status
               };
           }

           // Se nessun redirect, restituisci l'URL originale
           return {
               finalUrl: originalUrl,
               headers,
               status: response.status
           };

       } catch (error) {
           console.error(`Errore risoluzione URL ${originalUrl}:`, error.message);
           return { 
               finalUrl: originalUrl, 
               headers,
               status: 500
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
           const response = await axios.head(proxyUrl, {
               timeout: 5000,
               validateStatus: status => status === 200 || status === 302
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

       return `${this.config.PROXY_URL}/proxy/hls/manifest.m3u8?${params.toString()}`;
   }

   async getProxyStreams(channel) {
       const streams = [];

       if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
           return streams;
       }

       try {
           // Risolvi l'URL del flusso
           const { finalUrl, headers, status } = await this.resolveStreamUrl(
               channel.url, 
               channel.headers
           );

           // Se lo status è 404, non generare lo stream
           if (status === 404) {
               console.log(`Canale non disponibile: ${channel.name}`);
               return streams;
           }

           const proxyUrl = this.buildProxyUrl(finalUrl, headers);

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
               name: `${channel.name} (Proxy HLS)`,
               title: `${channel.name} (Proxy HLS)`,
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
           console.error('Headers:', channel.headers);
       }

       return streams;
   }
}

module.exports = HlsProxyManager;
