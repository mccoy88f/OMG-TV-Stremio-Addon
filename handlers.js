const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const StreamProxyManager = require('./stream-proxy-manager')(config);

function normalizeId(id) {
    return id?.toLowerCase().replace(/[^\w.]/g, '').trim() || '';
}

function cleanNameForImage(name) {
    // Prima rimuoviamo la data e l'ora se presente (pattern: dd/dd/dd - dd:dd (CET))
    let cleaned = name.replace(/\d{2}\/\d{2}\/\d{2}\s*-\s*\d{2}:\d{2}\s*\(CET\)/g, '').trim();
    
    // Rimuoviamo l'anno se inizia con esso
    cleaned = cleaned.replace(/^20\d{2}\s+/, '');
    
    // Rimuoviamo caratteri speciali mantenendo spazi e trattini
    cleaned = cleaned.replace(/[^a-zA-Z0-9\s-]/g, '');
    
    // Rimuoviamo spazi multipli
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Prendiamo solo la parte principale del nome
    let parts = cleaned.split(' - ');
    if (parts.length > 1) {
        cleaned = parts[0].trim();
    }
    
    // Se ancora troppo lungo, tronchiamo preservando parole intere
    if (cleaned.length > 30) {
        let words = cleaned.split(' ');
        let result = '';
        for (let word of words) {
            if ((result + ' ' + word).length <= 27) {
                result += (result ? ' ' : '') + word;
            } else {
                break;
            }
        }
        cleaned = result + '...';
    }
    
    return cleaned || 'No Name';
}

async function catalogHandler({ type, id, extra, config: userConfig }) {
    try {
        if (!userConfig.m3u) {
            console.log('[Handlers] URL M3U mancante nella configurazione');
            return { metas: [], genres: [] };
        }

        // Aggiorna sempre la configurazione
        await CacheManager.updateConfig(userConfig);

        // Se l'EPG è abilitato, inizializzalo
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
        
        if (genre && genre.includes('&skip')) {
            const parts = genre.split('&skip');
            genre = parts[0];
            if (parts[1] && parts[1].startsWith('=')) {
                skip = parseInt(parts[1].substring(1)) || 0;
            }
        }

        // Se riceviamo un nuovo filtro (search o genre), lo salviamo
        if (search) {
            CacheManager.setLastFilter('search', search);
        } else if (genre) {
            CacheManager.setLastFilter('genre', genre);
        } else if (!skip) {
            // Se non c'è skip, significa che è una nuova richiesta senza filtri
            CacheManager.clearLastFilter();
        }

        skip = parseInt(skip) || 0;
        const ITEMS_PER_PAGE = 100;
        
        // Otteniamo i canali già filtrati
        let filteredChannels = CacheManager.getFilteredChannels();
        const cachedData = CacheManager.getCachedData();

        // Ordina i canali
        filteredChannels.sort((a, b) => {
            const numA = parseInt(a.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            const numB = parseInt(b.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        const paginatedChannels = filteredChannels.slice(skip, skip + ITEMS_PER_PAGE);

        const metas = paginatedChannels.map(channel => {
            const displayName = cleanNameForImage(channel.name);
            const encodedName = encodeURIComponent(displayName).replace(/%20/g, '+');
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
        await CacheManager.updateConfig(userConfig);

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
                        name: channel.name,
                        originalName: stream.name,
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
                        name: channel.name,
                        title: `📺 ${stream.name || channel.name}`,
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
                            name: channel.name,
                            originalName: stream.name,
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
        const encodedName = encodeURIComponent(displayName).replace(/%20/g, '+');
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
