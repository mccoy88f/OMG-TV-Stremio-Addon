const config = require('./config');
const PythonResolver = require('./python-resolver');

class ResolverStreamManager {
    constructor() {
        this.resolverCache = new Map();
        this.lastCheck = new Map();
        this.CACHE_DURATION = 30 * 60 * 1000; // 30 minuti di cache
    }

    /**
     * Verifica se il resolver è configurato correttamente
     * @param {Object} userConfig - Configurazione utente
     * @returns {Boolean} - true se il resolver è configurato
     */
    isResolverConfigured(userConfig) {
        return userConfig.resolver_enabled === 'true' && userConfig.resolver_script;
    }

    /**
     * Inizializza il resolver Python
     * @param {Object} userConfig - Configurazione utente
     * @returns {Promise<Boolean>} - true se l'inizializzazione è avvenuta con successo
     */
    async initializeResolver(userConfig) {
        if (!this.isResolverConfigured(userConfig)) {
            return false;
        }

        try {
            const resolverScriptUrl = userConfig.resolver_script;
            
            // Se l'URL è già stato impostato, non scaricare di nuovo lo script
            if (PythonResolver.scriptUrl === resolverScriptUrl) {
                // Verifica che lo script sia funzionante
                const isHealthy = await PythonResolver.checkScriptHealth();
                return isHealthy;
            }
            
            // Scarica lo script
            const downloaded = await PythonResolver.downloadScript(resolverScriptUrl);
            if (!downloaded) {
                console.error('❌ Errore nel download dello script resolver');
                return false;
            }
            
            // Verifica la salute dello script
            const isHealthy = await PythonResolver.checkScriptHealth();
            if (!isHealthy) {
                console.error('❌ Script resolver non valido');
                return false;
            }
            
            // Imposta l'aggiornamento automatico se configurato
            if (userConfig.resolver_update_interval) {
                PythonResolver.scheduleUpdate(userConfig.resolver_update_interval);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Errore nell\'inizializzazione del resolver:', error.message);
            return false;
        }
    }

    /**
     * Ottiene gli stream risolti
     * @param {Object} input - Oggetto con i dettagli dello stream
     * @param {Object} userConfig - Configurazione utente
     * @returns {Promise<Array>} - Array di stream risolti
     */
    async getResolvedStreams(input, userConfig = {}) {
        if (!this.isResolverConfigured(userConfig)) {
            console.log('Resolver non configurato per:', input.name);
            return [];
        }

        let streams = [];

        try {
            // Inizializza il resolver se necessario
            await this.initializeResolver(userConfig);
            
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

                    // Risolvi l'URL tramite lo script Python
                    const result = await PythonResolver.resolveLink(
                        streamDetails.url, 
                        streamDetails.headers,
                        isChannel ? input.name : input.originalName || input.name
                    );

                    if (!result || !result.resolved_url) {
                        console.log(`❌ Nessun URL risolto per: ${streamDetails.name}`);
                        return null;
                    }

                    // Determina il tipo di stream
                    let streamType = 'HTTP';
                    if (result.resolved_url.includes('.m3u8')) {
                        streamType = 'HLS';
                    } else if (result.resolved_url.includes('.mpd')) {
                        streamType = 'DASH';
                    }

                    return {
                        name: `${streamDetails.name}`,
                        title: `🔍 ${input.originalName || streamDetails.name}\n[Resolver ${streamType}]`,
                        url: result.resolved_url,
                        headers: result.headers || streamDetails.headers,
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
            
            // Filtriamo i risultati nulli e restituiamo gli stream validi
            streams = results.filter(stream => stream !== null);

            if (streams.length === 0) {
                console.log('Nessuno stream risolto valido trovato per:', input.name);
            } else {
                console.log(`✓ Trovati ${streams.length} stream risolti per:`, input.name);
            }

        } catch (error) {
            console.error('Errore generale resolver:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Headers:', error.response.headers);
            }
        }

        return streams;
    }

    /**
     * Cancella la cache del resolver
     */
    clearCache() {
        PythonResolver.clearCache();
    }

    /**
     * Ottiene lo stato del resolver
     * @returns {Object} - Stato del resolver
     */
    getStatus() {
        return PythonResolver.getStatus();
    }
}

module.exports = () => new ResolverStreamManager();
