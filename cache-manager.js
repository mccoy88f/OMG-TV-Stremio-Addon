const EventEmitter = require('events');
const PlaylistTransformer = require('./playlist-transformer');

class CacheManager extends EventEmitter {
    constructor() {
        super();
        this.transformer = new PlaylistTransformer();
        this.cache = {
            stremioData: null,
            lastUpdated: null,
            updateInProgress: false
        };
    }

    normalizeId(id) {
        return id?.toLowerCase() || '';
    }

    async updateCache(force = false) {
        if (this.cache.updateInProgress) {
            console.log('⚠️  Aggiornamento cache già in corso, skip...');
            return;
        }

        try {
            this.cache.updateInProgress = true;
            console.log('\n=== Inizio Aggiornamento Cache ===');
            console.log(`Forza aggiornamento: ${force ? 'Sì' : 'No'}`);

            const needsUpdate = force || !this.cache.lastUpdated || 
                (Date.now() - this.cache.lastUpdated) > 12 * 60 * 60 * 1000;

            if (!needsUpdate) {
                console.log('ℹ️  Cache ancora valida, skip aggiornamento');
                this.cache.updateInProgress = false;
                return;
            }

            this.cache = {
                stremioData: null,
                lastUpdated: Date.now(),
                updateInProgress: false
            };

            // Log dettagliato
            if (this.cache.stremioData) {
                console.log('\nRiepilogo Cache:');
                console.log(`✓ Canali in cache: ${this.cache.stremioData.channels.length}`);
                console.log(`✓ Generi trovati: ${this.cache.stremioData.genres.length}`);
                console.log(`✓ Ultimo aggiornamento: ${new Date().toLocaleString()}`);
                console.log('\n=== Cache Aggiornata con Successo ===\n');
            }

            this.emit('cacheUpdated', this.cache);

        } catch (error) {
            console.error('\n❌ ERRORE nell\'aggiornamento della cache:', error);
            this.cache.updateInProgress = false;
            this.emit('cacheError', error);
            throw error;
        }
    }

    getCachedData() {
        if (!this.cache.stremioData) return { channels: [], genres: [] };
        return {
            channels: this.cache.stremioData.channels,
            genres: this.cache.stremioData.genres
        };
    }

    getChannel(channelId) {
        if (!channelId) return null;
        const normalizedSearchId = this.normalizeId(channelId);
        
        const channel = this.cache.stremioData?.channels.find(ch => {
            const normalizedChannelId = this.normalizeId(ch.id);
            const normalizedTvgId = this.normalizeId(ch.streamInfo?.tvg?.id);
            
            return normalizedChannelId === `tv|${normalizedSearchId}` || 
                   normalizedTvgId === normalizedSearchId;
        });

        if (!channel) {
            return this.cache.stremioData?.channels.find(ch => 
                this.normalizeId(ch.name) === normalizedSearchId
            );
        }

        return channel;
    }

    getChannelsByGenre(genre) {
        if (!genre) return this.cache.stremioData?.channels || [];
        
        const normalizedGenre = this.normalizeId(genre);
        return this.cache.stremioData?.channels.filter(
            channel => channel.genre?.some(g => this.normalizeId(g) === normalizedGenre)
        ) || [];
    }

    searchChannels(query) {
        if (!query) return this.cache.stremioData?.channels || [];
        
        const normalizedQuery = this.normalizeId(query);
        return this.cache.stremioData?.channels.filter(channel => 
            this.normalizeId(channel.name).includes(normalizedQuery)
        ) || [];
    }

    isStale() {
        if (!this.cache.lastUpdated) return true;
        return (Date.now() - this.cache.lastUpdated) >= 12 * 60 * 60 * 1000; // 12 ore
    }
}

module.exports = () => new CacheManager();
