const EventEmitter = require('events');
const PlaylistTransformer = require('./playlist-transformer');

class CacheManager extends EventEmitter {
    constructor(config) {
        super();
        this.transformer = new PlaylistTransformer();
        this.config = config;
        this.cache = null;
        this.initCache();
    }

    initCache() {
        this.cache = {
            stremioData: null,
            lastUpdated: null,
            updateInProgress: false,
            m3uUrl: null
        };
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

    // Manteniamo questo metodo duplicato per compatibilità
    normalizeId(id) {
        return id?.toLowerCase().replace(/[^\w.]/g, '').trim() || '';
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
                
                // Validazione ore e minuti
                if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    updateIntervalMs = (hours * 60 * 60 + minutes * 60) * 1000;
                } else {
                    console.warn('Formato ora non valido, uso valore predefinito');
                }
            } else {
                console.warn('Formato ora non valido, uso valore predefinito');
            }
        }

        return (Date.now() - this.cache.lastUpdated) >= updateIntervalMs;
    }
}

module.exports = (config) => new CacheManager(config);
