const EventEmitter = require('events');
const PlaylistTransformer = require('./playlist-transformer');

class CacheManager extends EventEmitter {
    constructor(config) {
        super();
        this.transformer = new PlaylistTransformer();
        this.config = config;
        this.cache = null;
        this.pollingInterval = null;
        this.initCache();
        this.startPolling();
    }

    initCache() {
        this.cache = {
            stremioData: null,
            lastUpdated: null,
            updateInProgress: false,
            m3uUrl: null
        };
    }

    updateConfig(newConfig) {
        const oldInterval = this.config?.update_interval;
        const oldEpgEnabled = this.config?.epg_enabled;
        const oldEpgUrl = this.config?.epg;
        
        this.config = { ...this.config, ...newConfig };
        
        // Controlla cambiamenti nell'intervallo
        if (oldInterval !== newConfig.update_interval) {
            console.log('Intervallo aggiornamento modificato, riavvio polling...');
            console.log('Nuovo intervallo:', newConfig.update_interval);
            this.startPolling();
        }

        // Controlla cambiamenti nell'EPG
        if (oldEpgEnabled !== newConfig.epg_enabled || oldEpgUrl !== newConfig.epg) {
            console.log('Configurazione EPG modificata...');
            console.log('EPG abilitato:', newConfig.epg_enabled);
            console.log('Nuovo URL EPG:', newConfig.epg || 'usa EPG dalla playlist');
            
            // Forza il ricaricamento della cache per aggiornare l'EPG
            if (this.cache.m3uUrl) {
                this.rebuildCache(this.cache.m3uUrl, this.config);
            }
        }
    }

    startPolling() {
    // Pulisci eventuali polling precedenti
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

    // Controlla ogni 30 secondi se è necessario aggiornare
        this.pollingInterval = setInterval(async () => {
        // Aggiungi questo controllo
            if (!this.cache.m3uUrl) {
                console.log('Nessun URL M3U configurato, skip aggiornamento...');
                return;
            }

            if (this.isStale(this.config)) {
                console.log('Controllo aggiornamento cache...');
                try {
                    await this.rebuildCache(this.cache.m3uUrl, this.config);
                } catch (error) {
                    console.error('Errore durante l\'aggiornamento automatico:', error);
                }
            }
        }, 60000); // 60 secondi
    }

    normalizeId(id, removeSuffix = false) {
        let normalized = id?.toLowerCase().replace(/[^\w.]/g, '').trim() || '';
        
        if (removeSuffix && this.config?.id_suffix) {
            const suffix = `.${this.config.id_suffix}`;
            if (normalized.endsWith(suffix)) {
                normalized = normalized.substring(0, normalized.length - suffix.length);
            }
        }
        
        return normalized;
    }

    addSuffix(id) {
        if (!id || !this.config?.id_suffix) return id;
        const suffix = `.${this.config.id_suffix}`;
        return id.endsWith(suffix) ? id : `${id}${suffix}`;
    }

    async rebuildCache(m3uUrl, config) {
        if (this.cache.updateInProgress) {
            console.log('⚠️  Ricostruzione cache già in corso, skip...');
            return;
        }

        try {
            this.cache.updateInProgress = true;
            console.log('\n=== Inizio Ricostruzione Cache ===');
            console.log('URL M3U:', m3uUrl);

            // Aggiorniamo this.config con i valori forniti
            if (config) {
                this.config = {...this.config, ...config};
            }

            const data = await this.transformer.loadAndTransform(m3uUrl, this.config);
        
            this.cache = {
                stremioData: data,
                lastUpdated: Date.now(),
                updateInProgress: false,
                m3uUrl: m3uUrl,
                epgUrls: data.epgUrls
            };

            console.log(`✓ Canali in cache: ${data.channels.length}`);
            console.log(`✓ Generi trovati: ${data.genres.length}`);
            console.log('\n=== Cache Ricostruita ===\n');

            this.emit('cacheUpdated', this.cache);

        } catch (error) {
            console.error('\n❌ ERRORE nella ricostruzione della cache:', error);
            this.cache.updateInProgress = false;
            this.emit('cacheError', error);
            throw error;
        }
    }

    getCachedData() {
        if (!this.cache || !this.cache.stremioData) return { channels: [], genres: [] };
        return {
            channels: this.cache.stremioData.channels,
            genres: this.cache.stremioData.genres
        };
    }

    getChannel(channelId) {
        if (!channelId || !this.cache?.stremioData?.channels) return null;
        const normalizedSearchId = this.normalizeId(channelId);
        
        const channel = this.cache.stremioData.channels.find(ch => {
            const normalizedChannelId = this.normalizeId(ch.id.replace('tv|', ''));
            const normalizedTvgId = this.normalizeId(ch.streamInfo?.tvg?.id);
            
            return normalizedChannelId === normalizedSearchId || 
                   normalizedTvgId === normalizedSearchId;
        });

        if (!channel) {
            return this.cache.stremioData.channels.find(ch => 
                this.normalizeId(ch.name) === normalizedSearchId
            );
        }

        return channel;
    }

    getChannelsByGenre(genre) {
        if (!genre || !this.cache?.stremioData?.channels) return [];
        
        return this.cache.stremioData.channels.filter(channel => {
            if (!Array.isArray(channel.genre)) return false;
            const hasGenre = channel.genre.includes(genre);
            return hasGenre;
        });
    }

    searchChannels(query) {
        if (!this.cache?.stremioData?.channels) return [];
        if (!query) return this.cache.stremioData.channels;
    
        const normalizedQuery = this.normalizeId(query);
    
        return this.cache.stremioData.channels.filter(channel => {
            const normalizedName = this.normalizeId(channel.name);
            return normalizedName.includes(normalizedQuery);
        });
    }

    isStale(config = {}) {
        if (!this.cache || !this.cache.lastUpdated || !this.cache.stremioData) return true;

        // Imposta l'intervallo di aggiornamento predefinito a 12 ore
        let updateIntervalMs = 12 * 60 * 60 * 1000;

        // Se è stato fornito un intervallo personalizzato
        if (config.update_interval) {
            // Supporta formati con e senza zero iniziale
            const timeMatch = config.update_interval.match(/^(\d{1,2}):(\d{2})$/);
            
            if (timeMatch) {
                const hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                
                // Debug: mostra i valori parsati
                console.log('Debug - Intervallo configurato:', {
                    input: config.update_interval,
                    hours,
                    minutes
                });
                
                // Validazione ore e minuti
                if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    updateIntervalMs = (hours * 60 * 60 + minutes * 60) * 1000;
                    console.log('Debug - Intervallo in ms:', updateIntervalMs);
                } else {
                    console.warn('Formato ora non valido, uso valore predefinito');
                }
            } else {
                console.warn('Formato ora non valido, uso valore predefinito');
            }
        }

        const timeSinceLastUpdate = Date.now() - this.cache.lastUpdated;
        console.log('Debug - Tempo dall\'ultimo aggiornamento:', {
            ms: timeSinceLastUpdate,
            seconds: Math.floor(timeSinceLastUpdate / 1000),
            minutes: Math.floor(timeSinceLastUpdate / (60 * 1000))
        });

        const needsUpdate = timeSinceLastUpdate >= updateIntervalMs;
        if (needsUpdate) {
            console.log('Cache obsoleta, necessario aggiornamento');
        }

        return needsUpdate;
    }

    cleanup() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}

module.exports = (config) => new CacheManager(config);
