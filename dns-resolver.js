const axios = require('axios');
const dns = require('dns');
const { URL } = require('url');

class DNSResolver {
    constructor(options = {}) {
        // Provider DNS configurabili
        this.dnsServers = options.dnsServers || [
            '1.1.1.1',     // Cloudflare
            '8.8.8.8',     // Google
            '9.9.9.9'      // Quad9
        ];

        // Configura resolver DNS
        dns.setServers(this.dnsServers);
    }

    resolveHostname(hostname) {
        return new Promise((resolve, reject) => {
            dns.resolve(hostname, (err, addresses) => {
                if (err) {
                    console.error(`Errore risoluzione DNS per ${hostname}:`, err);
                    resolve(hostname);
                } else {
                    // Restituisce il primo indirizzo IP
                    resolve(addresses[0] || hostname);
                }
            });
        });
    }

    async resolveUrl(originalUrl) {
        try {
            const url = new URL(originalUrl);
            const resolvedIp = await this.resolveHostname(url.hostname);

            // Ricostruisci URL con IP risolto
            url.hostname = resolvedIp;
            return url.toString();
        } catch (error) {
            console.error('Errore risoluzione URL:', error);
            return originalUrl;
        }
    }

    async validateAndResolveUrl(url, headers = {}) {
        try {
            const resolvedUrl = await this.resolveUrl(url);
            
            // Verifica raggiungibilità URL risolto
            await axios.head(resolvedUrl, { 
                headers, 
                timeout: 3000 
            });

            return resolvedUrl;
        } catch (error) {
            console.error('Errore validazione URL:', error);
            return url;
        }
    }
}

module.exports = new DNSResolver();
