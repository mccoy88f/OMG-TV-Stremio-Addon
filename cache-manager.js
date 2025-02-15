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

    async rebuildCache(m3uUrl) {
        if (this.cache.updateInProgress) {
            console.log('⚠️  Ricostruzione cache già in corso, skip...');
            return;
        }

        try {
            this.cache.updateInProgress = true;
            console.log('\n=== Inizio Ricostruzione Cache ===');
            console.log('URL M3U:', m3uUrl);

            const data = await this.transformer.loadAndTransform(m3uUrl);
            
            this.cache = {
                stremioData: data,
                lastUpdated: Date.now(),
                updateInProgress: false,
                m3uUrl: m3uUrl
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
    
        console.log('Requested genre:', genre);
    
        return this.cache.stremioData.channels.filter(channel => {;
        
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
            const normalizedGenres = channel.genre.map(genre => this.normalizeId(genre));
        
            // Verifica se la query è contenuta nel nome o nei generi
            const nameMatch = normalizedName.includes(normalizedQuery);
            const genreMatch = normalizedGenres.some(genre => genre.includes(normalizedQuery));
        
            return nameMatch || genreMatch;
        });
    }

    isStale() {
        if (!this.cache || !this.cache.lastUpdated || !this.cache.stremioData) return true;
        return (Date.now() - this.cache.lastUpdated) >= 12 * 60 * 60 * 1000;
    }
}

module.exports = () => new CacheManager();
