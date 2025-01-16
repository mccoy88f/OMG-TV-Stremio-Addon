const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const ProxyManager = new (require('./proxy-manager'))(config);

/**
 * Arricchisce i metadati del canale con informazioni EPG
 */
function enrichWithEPG(meta, channelId) {
    if (!config.enableEPG) return meta;

    const currentProgram = EPGManager.getCurrentProgram(channelId);
    const upcomingPrograms = EPGManager.getUpcomingPrograms(channelId);

    if (currentProgram) {
        // Descrizione base del programma corrente
        meta.description = `IN ONDA ORA:\n${currentProgram.title}`;

        if (currentProgram.description) {
            meta.description += `\n${currentProgram.description}`;
        }

        // Aggiungi orari
        meta.description += `\nOrario: ${currentProgram.start} - ${currentProgram.stop}`;

        // Aggiungi la categoria se disponibile
        if (currentProgram.category) {
            meta.description += `\nCategoria: ${currentProgram.category}`;
        }

        // Aggiungi i prossimi programmi
        if (upcomingPrograms && upcomingPrograms.length > 0) {
            meta.description += '\n\nPROSSIMI PROGRAMMI:';
            upcomingPrograms.forEach(program => {
                meta.description += `\n${program.start} - ${program.title}`;
            });
        }

        // Informazioni di release
        meta.releaseInfo = `In onda: ${currentProgram.title}`;
    }

    return meta;
}

/**
 * Gestisce le richieste di catalogo
 */
async function catalogHandler({ type, id, extra }) {
    try {
        // Aggiorna la cache se necessario
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        const cachedData = CacheManager.getCachedData();
        const { search, genre, skip = 0 } = extra || {};
        const ITEMS_PER_PAGE = 100;

        // Filtraggio canali
        let channels = [];
        if (genre) {
            channels = cachedData.channels.filter(channel => 
                channel.genre && channel.genre.includes(genre)
            );
        } else if (search) {
            const searchLower = search.toLowerCase();
            channels = cachedData.channels.filter(channel => 
                channel.name.toLowerCase().includes(searchLower)
            );
        } else {
            channels = cachedData.channels;
        }

        // Ordinamento canali
        channels.sort((a, b) => {
            const numA = parseInt(a.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            const numB = parseInt(b.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        // Paginazione
        const startIdx = parseInt(skip) || 0;
        const paginatedChannels = channels.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        // Crea i meta object per ogni canale
        const metas = paginatedChannels.map(channel => {
            const meta = {
                id: channel.id,
                type: 'tv',
                name: channel.name,
                poster: channel.poster,
                background: channel.background,
                logo: channel.logo,
                description: channel.description || `Canale: ${channel.name}`,
                genre: channel.genre,
                posterShape: channel.posterShape || 'square',
                releaseInfo: 'LIVE',
                behaviorHints: {
                    isLive: true,
                    ...channel.behaviorHints
                }
            };

            // Aggiungi informazioni del numero del canale se disponibile
            if (channel.streamInfo?.tvg?.chno) {
                meta.name = `${channel.streamInfo.tvg.chno}. ${channel.name}`;
            }
            
            // Arricchisci con informazioni EPG
            return enrichWithEPG(meta, channel.streamInfo?.tvg?.id);
        });

        return {
            metas,
            genres: cachedData.genres
        };

    } catch (error) {
        console.error('[Handlers] Errore nella gestione del catalogo:', error);
        return { metas: [], genres: [] };
    }
}

/**
 * Gestisce le richieste di stream
 */
async function streamHandler({ id }) {
    try {
        const channelId = id.split('|')[1];
        const channel = CacheManager.getChannel(channelId);

        if (!channel) {
            return { streams: [] };
        }

        let streams = [];

        // Gestione degli stream in base alla configurazione del proxy
        if (config.FORCE_PROXY && config.PROXY_URL && config.PROXY_PASSWORD) {
            // Solo stream proxy se FORCE_PROXY è attivo
            const proxyStreams = await ProxyManager.getProxyStreams({
                name: channel.name,
                url: channel.streamInfo.url,
                headers: channel.streamInfo.headers
            });
            streams.push(...proxyStreams);
        } else {
            // Stream diretto
            streams.push({
                name: channel.name,
                title: channel.name,
                url: channel.streamInfo.url,
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: "tv"
                }
            });

            // Aggiungi stream proxy se configurato
            if (config.PROXY_URL && config.PROXY_PASSWORD) {
                const proxyStreams = await ProxyManager.getProxyStreams({
                    name: channel.name,
                    url: channel.streamInfo.url,
                    headers: channel.streamInfo.headers
                });
                streams.push(...proxyStreams);
            }
        }

        // Crea i metadati base
        const meta = {
            id: channel.id,
            type: 'tv',
            name: channel.name,
            poster: channel.poster,
            background: channel.background,
            logo: channel.logo,
            description: channel.description || `Canale: ${channel.name}`,
            genre: channel.genre,
            posterShape: channel.posterShape || 'square',
            releaseInfo: 'LIVE',
            behaviorHints: {
                isLive: true,
                ...channel.behaviorHints
            }
        };

        // Arricchisci con EPG e aggiungi ai stream
        const enrichedMeta = enrichWithEPG(meta, channel.streamInfo?.tvg?.id);
        streams.forEach(stream => {
            stream.meta = enrichedMeta;
        });

        return { streams };
    } catch (error) {
        console.error('[Handlers] Errore nel caricamento dello stream:', error);
        return { 
            streams: [{
                name: 'Errore',
                title: 'Errore nel caricamento dello stream',
                url: '',
                behaviorHints: {
                    notWebReady: true,
                    bingeGroup: "tv",
                    errorMessage: `Errore: ${error.message}`
                }
            }]
        };
    }
}

module.exports = {
    catalogHandler,
    streamHandler
};
