const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const StreamProxyManager = require('./stream-proxy-manager')(config);

function normalizeId(id) {
    return id?.toLowerCase().replace(/[^\w.]/g, '').trim() || '';
}

function cleanNameForImage(name) {
    const cleaned = name
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    return cleaned.length > 15 
        ? cleaned.substring(0, 12) + '...' 
        : cleaned.substring(0, 15);
}

async function catalogHandler({ type, id, extra, config: userConfig }) {
    try {
        // Log iniziale della richiesta
        console.log('\n=== Nuova richiesta catalogo ===');
        console.log('Type:', type);
        console.log('ID:', id);
        console.log('Extra:', JSON.stringify(extra, null, 2));
        console.log('Skip value:', extra?.skip);
        console.log('Search value:', extra?.search);

        if (!userConfig.m3u) {
            console.log('[Handlers] URL M3U mancante nella configurazione');
            return { metas: [], genres: [] };
        }

        // Aggiorna sempre la configurazione
        CacheManager.updateConfig(userConfig);

        if (CacheManager.cache.m3uUrl !== userConfig.m3u) {
            await CacheManager.rebuildCache(userConfig.m3u, userConfig);
        }

        if (userConfig.epg_enabled === 'true') {
            const epgToUse = userConfig.epg ||
                (CacheManager.cache.epgUrls && 
                CacheManager.cache.epgUrls.length > 0
                    ? CacheManager.cache.epgUrls.join(',')
                    : null);
                    
            if (epgToUse) {
                await EPGManager.initializeEPG(epgToUse);
            }
        }

        let { search, genre, skip = 0 } = extra || {};
        
        // Log dei parametri dopo l'estrazione
        console.log('\nParametri estratti:');
        console.log('Search:', search);
        console.log('Genre:', genre);
        console.log('Skip:', skip);
        
        if (genre && genre.includes('&skip')) {
            const parts = genre.split('&skip');
            genre = parts[0];
            if (parts[1] && parts[1].startsWith('=')) {
                skip = parseInt(parts[1].substring(1)) || 0;
            }
            console.log('Genre dopo parsing:', genre);
            console.log('Skip dopo parsing:', skip);
        }

        skip = parseInt(skip) || 0;
        const ITEMS_PER_PAGE = 100;
        
        const cachedData = CacheManager.getCachedData();
        let filteredChannels = [];
        
        if (genre) {
            filteredChannels = CacheManager.getChannelsByGenre(genre);
            console.log('\nFiltro per genere:', genre);
            console.log('Canali trovati:', filteredChannels.length);
        } else if (search) {
            filteredChannels = CacheManager.searchChannels(search);
            console.log('\nFiltro per ricerca:', search);
            console.log('Canali trovati:', filteredChannels.length);
        } else {
            filteredChannels = cachedData.channels;
            console.log('\nNessun filtro applicato');
            console.log('Totale canali:', filteredChannels.length);
        }

        filteredChannels.sort((a, b) => {
            const numA = parseInt(a.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            const numB = parseInt(b.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        // Log paginazione
        console.log('\nPaginazione:');
        console.log('Indice iniziale:', skip);
        console.log('Indice finale:', skip + ITEMS_PER_PAGE);
        console.log('Totale canali filtrati:', filteredChannels.length);

        const paginatedChannels = filteredChannels.slice(skip, skip + ITEMS_PER_PAGE);
        console.log('Canali in questa pagina:', paginatedChannels.length);

        const metas = paginatedChannels.map(channel => {
            const displayName = cleanNameForImage(channel.name);
            const encodedName = encodeURIComponent(displayName);
            const fallbackLogo = `https://dummyimage.com/500x500/590b8a/ffffff.jpg&text=${encodedName}`;
            
            const meta = {
                id: channel.id,
                type: 'tv',
                name: channel.name,
                poster: channel.poster || fallbackLogo,
                background: channel.background || fallbackLogo,
                logo: channel.logo || fallbackLogo,
                description: channel.description || `Canale: ${channel.name} - ID: ${channel.streamInfo?.tvg?.id}`,
                genre: channel.genre,
                posterShape: channel.posterShape || 'square',
                releaseInfo: 'LIVE',
                behaviorHints: {
                    isLive: true,
                    ...channel.behaviorHints
                },
                streamInfo: channel.streamInfo
            };

            if (channel.streamInfo?.tvg?.chno) {
                meta.name = `${channel.streamInfo.tvg.chno}. ${channel.name}`;
            }

            if ((!meta.poster || !meta.background || !meta.logo) && channel.streamInfo?.tvg?.id) {
                const epgIcon = EPGManager.getChannelIcon(channel.streamInfo.tvg.id);
                if (epgIcon) {
                    meta.poster = meta.poster || epgIcon;
                    meta.background = meta.background || epgIcon;
                    meta.logo = meta.logo || epgIcon;
                }
            }

            return enrichWithEPG(meta, channel.streamInfo?.tvg?.id, userConfig);
        });

        console.log('Metas generati:', metas.length);
        console.log('=== Fine richiesta catalogo ===\n');

        return {
            metas,
            genres: cachedData.genres
        };

    } catch (error) {
        console.error('[Handlers] Errore nella gestione del catalogo:', error);
        return { metas: [], genres: [] };
    }
}



function enrichWithEPG(meta, channelId, userConfig) {
    if (!userConfig.epg_enabled || !channelId) {
        meta.description = `Canale live: ${meta.name}`;
        meta.releaseInfo = 'LIVE';
        return meta;
    }

    const currentProgram = EPGManager.getCurrentProgram(normalizeId(channelId));
    const upcomingPrograms = EPGManager.getUpcomingPrograms(normalizeId(channelId));

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

async function streamHandler({ id, config: userConfig }) {
    try {
        if (!userConfig.m3u) {
            console.log('M3U URL mancante');
            return { streams: [] };
        }

        // Aggiorna sempre la configurazione
        CacheManager.updateConfig(userConfig);

        if (CacheManager.cache.m3uUrl !== userConfig.m3u) {
            console.log('Cache non aggiornata, ricostruzione...');
            await CacheManager.rebuildCache(userConfig.m3u, userConfig);
        }

        const channelId = id.split('|')[1];
        const channel = CacheManager.getChannel(channelId);

        if (!channel) {
            console.log('Canale non trovato:', channelId);
            return { streams: [] };
        }

        let streams = [];

        if (userConfig.force_proxy === 'true') {
            if (userConfig.proxy && userConfig.proxy_pwd) {
                for (const stream of channel.streamInfo.urls) {
                    const streamDetails = {
                        name: stream.name || channel.name,
                        url: stream.url,
                        headers: stream.headers || { 'User-Agent': config.defaultUserAgent }
                    };
                    if (!streamDetails.headers['User-Agent']) {
                        streamDetails.headers['User-Agent'] = config.defaultUserAgent;
                    }
                    const proxyStreams = await StreamProxyManager.getProxyStreams(streamDetails, userConfig);
                    streams.push(...proxyStreams);
                }
            }
        } else {
            if (channel.streamInfo.urls) {
                for (const stream of channel.streamInfo.urls) {
                    const headers = stream.headers || {};
                    if (!headers['User-Agent']) {
                        headers['User-Agent'] = config.defaultUserAgent;
                    }
                    
                    const streamMeta = {
                        name: stream.name || channel.name,
                        title: stream.name || channel.name,
                        url: stream.url,
                        headers: headers,
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: "tv"
                        }
                    };
                    streams.push(streamMeta);

                    if (userConfig.proxy && userConfig.proxy_pwd) {
                        const streamDetails = {
                            name: stream.name || channel.name,
                            url: stream.url,
                            headers: headers
                        };
                        const proxyStreams = await StreamProxyManager.getProxyStreams(streamDetails, userConfig);
                        streams.push(...proxyStreams);
                    }
                }
            }
        }

        const displayName = cleanNameForImage(channel.name);
        const encodedName = encodeURIComponent(displayName);
        const fallbackLogo = `https://dummyimage.com/500x500/590b8a/ffffff.jpg&text=${encodedName}`;

        const meta = {
            id: channel.id,
            type: 'tv',
            name: channel.name,
            poster: channel.poster || fallbackLogo,
            background: channel.background || fallbackLogo,
            logo: channel.logo || fallbackLogo,
            description: channel.description || `ID Canale: ${channel.streamInfo?.tvg?.id}`,
            genre: channel.genre,
            posterShape: channel.posterShape || 'square',
            releaseInfo: 'LIVE',
            behaviorHints: {
                isLive: true,
                ...channel.behaviorHints
            },
            streamInfo: channel.streamInfo
        };

        if ((!meta.poster || !meta.background || !meta.logo) && channel.streamInfo?.tvg?.id) {
            const epgIcon = EPGManager.getChannelIcon(channel.streamInfo.tvg.id);
            if (epgIcon) {
                meta.poster = meta.poster || epgIcon;
                meta.background = meta.background || epgIcon;
                meta.logo = meta.logo || epgIcon;
            }
        }

        streams.forEach(stream => {
            stream.meta = meta;
        });

        return { streams };
    } catch (error) {
        console.error('Errore stream handler:', error);
        return { streams: [] };
    }
}

module.exports = {
    catalogHandler,
    streamHandler
};
