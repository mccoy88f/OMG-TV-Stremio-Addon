const EventEmitter = require('events');
const PlaylistTransformer = require('./playlist-transformer');

class CacheManager extends EventEmitter {
    constructor(config) {
        super();
        this.transformer = new PlaylistTransformer();
        this.config = config;
        this.cache = null;
        this.pollingInterval = null;
        this.lastFilter = null;
        this.initCache();
        this.startPolling();
    }

    initCache() {
        this.cache = {
            stremioData: null,
            lastUpdated: null,
            updateInProgress: false,
            m3uUrl: null,
            epgUrls: []
        };
        this.lastFilter = null;
    }

    async updateConfig(newConfig) {
        // Verifica separatamente i cambiamenti di M3U e EPG
        const hasM3UChanges = this.config?.m3u !== newConfig.m3u;
        const hasEPGChanges = 
            this.config?.epg_enabled !== newConfig.epg_enabled ||
            this.config?.epg !== newConfig.epg;
        
        // Verifica altri cambiamenti di configurazione
        const hasOtherChanges = 
            this.config?.update_interval !== newConfig.update_interval ||
            this.config?.id_suffix !== newConfig.id_suffix ||
            this.config?.remapper_path !== newConfig.remapper_path;

        // Aggiorna la configurazione
        this.config = { ...this.config, ...newConfig };

        if (hasM3UChanges) {
            console.log('Playlist M3U modificata, ricarico solo i dati della playlist...');
            // Resetta solo i dati della playlist
            this.cache.stremioData = null;
            this.cache.m3uUrl = null;
            
            if (this.config.m3u) {
                await this.rebuildCache(this.config.m3u, this.config);
            }
        }

        if (hasEPGChanges) {
            console.log('Configurazione EPG modificata, aggiorno solo EPG...');
            // Non tocchiamo i dati della playlist, lasciamo gestire l'EPG all'EPGManager
        }

        if (hasOtherChanges) {
            console.log('Altre configurazioni modificate, riavvio polling...');
            this.startPolling();
        }
    }

    startPolling() {
        // Pulisci eventuali polling precedenti
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        // Controlla ogni tot secondi se è necessario aggiornare
        this.pollingInterval = setInterval(async () => {
            // Controlla se abbiamo una cache valida
            if (!this.cache?.stremioData) {
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

        let updateIntervalMs = 12 * 60 * 60 * 1000;

        if (config.update_interval) {
            const timeMatch = config.update_interval.match(/^(\d{1,2}):(\d{2})$/);
            
            if (timeMatch) {
                const hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                
                if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    updateIntervalMs = (hours * 60 * 60 + minutes * 60) * 1000;
                } else {
                    console.warn('Formato ora non valido, uso valore predefinito');
                }
            } else {
                console.warn('Formato ora non valido, uso valore predefinito');
            }
        }

        const timeSinceLastUpdate = Date.now() - this.cache.lastUpdated;

        const needsUpdate = timeSinceLastUpdate >= updateIntervalMs;
        if (needsUpdate) {
            console.log('Cache obsoleta, necessario aggiornamento');
        }

        return needsUpdate;
    }

    setLastFilter(filterType, value) {
        this.lastFilter = { type: filterType, value };
    }

    getLastFilter() {
        return this.lastFilter;
    }

    clearLastFilter() {
        this.lastFilter = null;
    }

    getFilteredChannels() {
        if (!this.cache?.stremioData?.channels) return [];
        
        let channels = this.cache.stremioData.channels;
        
        if (this.lastFilter) {
            if (this.lastFilter.type === 'genre') {
                channels = this.getChannelsByGenre(this.lastFilter.value);
            } else if (this.lastFilter.type === 'search') {
                channels = this.searchChannels(this.lastFilter.value);
            }
        }

        return channels;
    }

    cleanup() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}

module.exports = (config) => new CacheManager(config);
