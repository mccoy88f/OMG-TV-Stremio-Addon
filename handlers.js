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
                console.log('[Handlers] Inizializzazione EPG con URL:', epgToUse);
                await EPGManager.initializeEPG(epgToUse);
            } else {
                console.log('[Handlers] EPG abilitato ma nessun URL disponibile');
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
        
        const cachedData = CacheManager.getCachedData();
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

async function metaHandler({ type, id, config: userConfig }) {
    try {
        // Aggiorna sempre la configurazione
        CacheManager.updateConfig(userConfig);

        const channelId = id.split('|')[1];
        const channel = CacheManager.getChannel(channelId);
        
        if (!channel) {
            console.log('=== Fine Meta Handler ===\n');
            return { meta: null };
        }

        const meta = {
            id: channel.id,
            type: 'tv',
            name: channel.streamInfo?.tvg?.chno 
                ? `${channel.streamInfo.tvg.chno}. ${channel.name}`
                : channel.name,
            poster: channel.poster || channel.logo,
            background: channel.background || channel.logo,
            logo: channel.logo,
            description: '',
            releaseInfo: 'LIVE',
            genre: channel.genre,
            posterShape: 'square',
            language: 'ita',
            country: 'ITA',
            isFree: true,
            behaviorHints: {
                isLive: true,
                defaultVideoId: channel.id
            }
        };

        if ((!meta.poster || !meta.background || !meta.logo) && channel.streamInfo?.tvg?.id) {
            const epgIcon = EPGManager.getChannelIcon(normalizeId(channel.streamInfo.tvg.id));
            if (epgIcon) {
                meta.poster = meta.poster || epgIcon;
                meta.background = meta.background || epgIcon;
                meta.logo = meta.logo || epgIcon;
            }
        }

        let baseDescription = [];
        
        if (channel.streamInfo?.tvg?.chno) {
            baseDescription.push(`📺 Canale ${channel.streamInfo.tvg.chno}`);
        }

        if (channel.description) {
            baseDescription.push('', channel.description);
        } else {
            baseDescription.push('', `ID Canale: ${channel.streamInfo?.tvg?.id}`);
        }

        meta.description = baseDescription.join('\n');

        const enrichedMeta = enrichWithDetailedEPG(meta, channel.streamInfo?.tvg?.id, userConfig);

        console.log('✓ Meta handler completato');
        console.log('=== Fine Meta Handler ===\n');
        return { meta: enrichedMeta };
        
    } catch (error) {
        console.error('[MetaHandler] Errore:', error.message);
        console.log('=== Fine Meta Handler con Errore ===\n');
        return { meta: null };
    }
}

function enrichWithDetailedEPG(meta, channelId, userConfig) {
    if (!userConfig.epg_enabled) {
        console.log('❌ EPG non abilitato');
        return meta;
    }

    const normalizedId = normalizeId(channelId);
    const currentProgram = EPGManager.getCurrentProgram(normalizedId);
    const upcomingPrograms = EPGManager.getUpcomingPrograms(normalizedId);

    if (currentProgram) {
        let description = [];
        
        description.push('📺 IN ONDA ORA:', currentProgram.title);
        
        if (currentProgram.description) {
            description.push('', currentProgram.description);
        }

        description.push('', `⏰ ${currentProgram.start} - ${currentProgram.stop}`);

        if (currentProgram.category) {
            description.push(`🏷️ ${currentProgram.category}`);
        }

        if (upcomingPrograms?.length > 0) {
            description.push('', '📅 PROSSIMI PROGRAMMI:');
            upcomingPrograms.forEach(program => {
                description.push(
                    '',
                    `• ${program.start} - ${program.title}`
                );
                if (program.description) {
                    description.push(`  ${program.description}`);
                }
                if (program.category) {
                    description.push(`  🏷️ ${program.category}`);
                }
            });
        }

        meta.description = description.join('\n');
        meta.releaseInfo = `${currentProgram.title} (${currentProgram.start})`;
    }

    return meta;
}

module.exports = {
    catalogHandler,
    streamHandler,
    metaHandler
};
