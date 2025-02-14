const EventEmitter = require('events');
const PlaylistTransformer = require('./playlist-transformer');

class CacheManager extends EventEmitter {
    constructor() {
        super();
        this.transformer = new PlaylistTransformer();
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

    normalizeId(id) {
        return id?.toLowerCase() || '';
    }

    async updateCache(force = false, m3uUrl = null) {
        if (!this.cache) this.initCache();

        if (this.cache.updateInProgress) {
            console.log('⚠️  Aggiornamento cache già in corso, skip...');
            return;
        }

        // Aggiorna l'URL M3U se fornito
        if (m3uUrl) {
            this.cache.m3uUrl = m3uUrl;
        }

        if (!this.cache.m3uUrl) {
            console.log('⚠️ Nessun URL M3U disponibile, skip aggiornamento');
            return;
        }

        try {
            this.cache.updateInProgress = true;
            console.log('\n=== Inizio Aggiornamento Cache ===');
            console.log(`Forza aggiornamento: ${force ? 'Sì' : 'No'}`);
            console.log('Caricamento playlist da:', this.cache.m3uUrl);

            const needsUpdate = force || !this.cache.lastUpdated || !this.cache.stremioData ||
                (Date.now() - this.cache.lastUpdated) > 12 * 60 * 60 * 1000;

            if (!needsUpdate) {
                console.log('ℹ️  Cache ancora valida, skip aggiornamento');
                this.cache.updateInProgress = false;
                return;
            }

            const data = await this.transformer.loadAndTransform(this.cache.m3uUrl);
            
            this.cache.stremioData = data;
            this.cache.lastUpdated = Date.now();
            this.cache.updateInProgress = false;

            console.log('\nRiepilogo Cache:');
            console.log(`✓ Canali in cache: ${data.channels.length}`);
            console.log(`✓ Generi trovati: ${data.genres.length}`);
            console.log(`✓ Ultimo aggiornamento: ${new Date().toLocaleString()}`);
            console.log('\n=== Cache Aggiornata con Successo ===\n');

            this.emit('cacheUpdated', this.cache);

        } catch (error) {
            console.error('\n❌ ERRORE nell\'aggiornamento della cache:', error);
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
            const normalizedChannelId = this.normalizeId(ch.id);
            const normalizedTvgId = this.normalizeId(ch.streamInfo?.tvg?.id);
            
            return normalizedChannelId === `tv|${normalizedSearchId}` || 
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
        
        const normalizedGenre = this.normalizeId(genre);
        return this.cache.stremioData.channels.filter(
            channel => channel.genre?.some(g => this.normalizeId(g) === normalizedGenre)
        ) || [];
    }

    searchChannels(query) {
        if (!this.cache?.stremioData?.channels) return [];
        if (!query) return this.cache.stremioData.channels;
        
        const normalizedQuery = this.normalizeId(query);
        return this.cache.stremioData.channels.filter(channel => 
            this.normalizeId(channel.name).includes(normalizedQuery)
        );
    }

    isStale() {
        if (!this.cache || !this.cache.lastUpdated || !this.cache.stremioData) return true;
        return (Date.now() - this.cache.lastUpdated) >= 12 * 60 * 60 * 1000;
    }
}

module.exports = () => new CacheManager();
