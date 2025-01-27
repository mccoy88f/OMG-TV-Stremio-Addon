const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const HlsProxyManager = require('./hls-proxy-manager');
const DashProxyManager = require('./dash-proxy-manager');
const HttpsProxyManager = require('./https-proxy-manager');

function normalizeId(id) {
    return id?.toLowerCase().trim().replace(/\s+/g, '') || '';
}

function enrichWithEPG(meta, channelId) {
    if (!config.enableEPG || !channelId) return meta;

    const normalizedId = normalizeId(channelId);
    const currentProgram = EPGManager.getCurrentProgram(normalizedId);
    const upcomingPrograms = EPGManager.getUpcomingPrograms(normalizedId);

    if (currentProgram) {
        meta.description = `IN ONDA ORA:\n${currentProgram.title}`;

        if (currentProgram.description) {
            meta.description += `\n${currentProgram.description}`;
        }

        meta.description += `\nOrario: ${currentProgram.start} - ${currentProgram.stop}`;

        if (currentProgram.category) {
            meta.description += `\nCategoria: ${currentProgram.category}`;
        }

        if (upcomingPrograms && upcomingPrograms.length > 0) {
            meta.description += '\n\nPROSSIMI PROGRAMMI:';
            upcomingPrograms.forEach(program => {
                meta.description += `\n${program.start} - ${program.title}`;
            });
        }

        meta.releaseInfo = `In onda: ${currentProgram.title}`;
    }

    return meta;
}

async function catalogHandler({ type, id, extra }) {
    try {
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        const cachedData = CacheManager.getCachedData();
        const { search, genre, skip = 0 } = extra || {};
        const ITEMS_PER_PAGE = 100;

        let channels = [];
        if (genre) {
            channels = CacheManager.getChannelsByGenre(genre);
        } else if (search) {
            channels = CacheManager.searchChannels(search);
        } else {
            channels = cachedData.channels;
        }

        channels.sort((a, b) => {
            const numA = parseInt(a.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            const numB = parseInt(b.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        const startIdx = parseInt(skip) || 0;
        const paginatedChannels = channels.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        const metas = paginatedChannels.map(channel => {
            const meta = {
                id: channel.id,
                type: 'tv',
                name: channel.name,
                poster: channel.poster,
                background: channel.background,
                logo: channel.logo,
                description: channel.description || `Canale: ${channel.name} - ID: ${channel.streamInfo?.tvg?.id}`,
                genre: channel.genre,
                posterShape: channel.posterShape || 'square',
                releaseInfo: 'LIVE',
                behaviorHints: {
                    isLive: true,
                    ...channel.behaviorHints
                }
            };

            if (channel.streamInfo?.tvg?.chno) {
                meta.name = `${channel.streamInfo.tvg.chno}. ${channel.name}`;
            }

            // Aggiungi icona EPG se mancano le immagini
            if ((!meta.poster || !meta.background || !meta.logo) && channel.streamInfo?.tvg?.id) {
                const epgIcon = EPGManager.getChannelIcon(channel.streamInfo.tvg.id);
                if (epgIcon) {
                    meta.poster = meta.poster || epgIcon;
                    meta.background = meta.background || epgIcon;
                    meta.logo = meta.logo || epgIcon;
                }
            }

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

async function streamHandler({ id }) {
    try {
        const channelId = id.split('|')[1];
        const channel = CacheManager.getChannel(channelId);

        if (!channel) {
            console.log('[Handlers] Nessun canale trovato per ID:', channelId);
            return { streams: [] };
        }

        let streams = [];

        // Se FORCE_PROXY è attivo, aggiungi solo i flussi proxy
        if (config.FORCE_PROXY === true) {
            if (config.PROXY_URL && config.PROXY_PASSWORD) {
                for (const stream of channel.streamInfo.urls) {
                    let proxyStreams = [];

                    if (stream.url.endsWith('.m3u8')) {
                        const hlsProxy = new HlsProxyManager(config);
                        proxyStreams = await hlsProxy.getProxyStreams({
                            name: stream.name || channel.name,
                            url: stream.url,
                            headers: channel.streamInfo.headers
                        });
                    } else if (stream.url.endsWith('.mpd')) {
                        const dashProxy = new DashProxyManager(config);
                        proxyStreams = await dashProxy.getProxyStreams({
                            name: stream.name || channel.name,
                            url: stream.url,
                            headers: channel.streamInfo.headers
                        });
                    } else if (stream.url.startsWith('https://')) {
                        const httpsProxy = new HttpsProxyManager(config);
                        proxyStreams = await httpsProxy.getProxyStreams({
                            name: stream.name || channel.name,
                            url: stream.url,
                            headers: channel.streamInfo.headers
                        });
                    }

                    streams.push(...proxyStreams);
                }
            }
        } else {
            // Se FORCE_PROXY non è attivo, aggiungi sia flussi diretti che proxy
            if (channel.streamInfo.urls && channel.streamInfo.urls.length > 0) {
                for (const stream of channel.streamInfo.urls) {
                    // Aggiungi flusso diretto
                    streams.push({
                        name: stream.name || channel.name,
                        title: stream.name || channel.name,
                        url: stream.url,
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: "tv"
                        }
                    });

                    // Aggiungi flussi proxy se la configurazione è disponibile
                    if (config.PROXY_URL && config.PROXY_PASSWORD) {
                        let proxyStreams = [];

                        if (stream.url.endsWith('.m3u8')) {
                            const hlsProxy = new HlsProxyManager(config);
                            proxyStreams = await hlsProxy.getProxyStreams({
                                name: stream.name || channel.name,
                                url: stream.url,
                                headers: channel.streamInfo.headers
                            });
                        } else if (stream.url.endsWith('.mpd')) {
                            const dashProxy = new DashProxyManager(config);
                            proxyStreams = await dashProxy.getProxyStreams({
                                name: stream.name || channel.name,
                                url: stream.url,
                                headers: channel.streamInfo.headers
                            });
                        } else if (stream.url.startsWith('https://')) {
                            const httpsProxy = new HttpsProxyManager(config);
                            proxyStreams = await httpsProxy.getProxyStreams({
                                name: stream.name || channel.name,
                                url: stream.url,
                                headers: channel.streamInfo.headers
                            });
                        }

                        streams.push(...proxyStreams);
                    }
                }
            }
        }

        // Aggiungi meta dati ai flussi
        const meta = {
            id: channel.id,
            type: 'tv',
            name: channel.name,
            poster: channel.poster,
            background: channel.background,
            logo: channel.logo,
            description: channel.description || `ID Canale: ${channel.streamInfo?.tvg?.id}`,
            genre: channel.genre,
            posterShape: channel.posterShape || 'square',
            releaseInfo: 'LIVE',
            behaviorHints: {
                isLive: true,
                ...channel.behaviorHints
            }
        };

        // Aggiungi icona EPG se mancano le immagini
        if ((!meta.poster || !meta.background || !meta.logo) && channel.streamInfo?.tvg?.id) {
            const epgIcon = EPGManager.getChannelIcon(channel.streamInfo.tvg.id);
            if (epgIcon) {
                meta.poster = meta.poster || epgIcon;
                meta.background = meta.background || epgIcon;
                meta.logo = meta.logo || epgIcon;
            }
        }

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
