const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');

function normalizeId(id) {
    return id?.toLowerCase().replace(/[^\w.]/g, '').trim() || '';
}

function enrichWithDetailedEPG(meta, channelId, userConfig) {
    console.log('\n=== Inizio Enrichment EPG ===');
    console.log('Channel ID ricevuto:', channelId);
    
    if (!userConfig.epg_enabled) {
        console.log('❌ EPG non abilitato');
        console.log('=== Fine Enrichment EPG ===\n');
        return meta;
    }

    const normalizedId = normalizeId(channelId);
    console.log('ID normalizzato:', normalizedId);

    const currentProgram = EPGManager.getCurrentProgram(normalizedId);
    console.log('Programma corrente trovato:', currentProgram ? 'Si' : 'No');
    if (currentProgram) {
        console.log('Dettagli programma corrente:', {
            titolo: currentProgram.title,
            inizio: currentProgram.start,
            fine: currentProgram.stop
        });
    }
    
    const upcomingPrograms = EPGManager.getUpcomingPrograms(normalizedId);
    console.log('Programmi futuri trovati:', upcomingPrograms?.length || 0);

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
        console.log('✓ Metadata arricchiti con dati EPG');
    } else {
        console.log('❌ Nessun programma corrente trovato');
    }

    console.log('=== Fine Enrichment EPG ===\n');
    return meta;
}

async function metaHandler({ type, id, config: userConfig }) {
    try {
        console.log('\n=== Inizio Meta Handler ===');
        console.log('ID richiesto:', id);
        
        if (!userConfig.m3u) {
            console.log('❌ URL M3U mancante');
            console.log('=== Fine Meta Handler ===\n');
            return { meta: null };
        }

        if (CacheManager.cache.m3uUrl !== userConfig.m3u) {
            console.log('Cache M3U non aggiornata, ricostruzione...');
            await CacheManager.rebuildCache(userConfig.m3u);
        }

        const channelId = id.split('|')[1];
        console.log('Channel ID estratto:', channelId);
        
        const allChannels = CacheManager.getCachedData().channels;
        
        const channel = allChannels.find(ch => 
            ch.id === id || 
            normalizeId(ch.streamInfo?.tvg?.id) === normalizeId(channelId)
        );

        if (!channel) {
            console.log('❌ Canale non trovato');
            console.log('=== Fine Meta Handler ===\n');
            return { meta: null };
        }

        console.log('✓ Canale trovato:', {
            id: channel.id,
            name: channel.name,
            tvgId: channel.streamInfo?.tvg?.id,
            tvgName: channel.streamInfo?.tvg?.name
        });

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
            console.log('Ricerca icona EPG per:', channel.streamInfo.tvg.id);
            const epgIcon = EPGManager.getChannelIcon(normalizeId(channel.streamInfo.tvg.id));
            if (epgIcon) {
                console.log('✓ Icona EPG trovata');
                meta.poster = meta.poster || epgIcon;
                meta.background = meta.background || epgIcon;
                meta.logo = meta.logo || epgIcon;
            } else {
                console.log('❌ Nessuna icona EPG trovata');
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

        console.log('Richiedo enrichment EPG per:', channel.streamInfo?.tvg?.id);
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

module.exports = metaHandler;
