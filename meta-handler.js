const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');

/**
 * Arricchisce i metadati del canale con informazioni EPG dettagliate
 */
function enrichWithDetailedEPG(meta, channelId) {
    if (!config.enableEPG) return meta;

    const currentProgram = EPGManager.getCurrentProgram(channelId);
    const upcomingPrograms = EPGManager.getUpcomingPrograms(channelId);

    if (currentProgram) {
        // Crea la descrizione base
        let description = [];
        
        // Programma corrente
        description.push('📺 IN ONDA ORA:', currentProgram.title);
        
        if (currentProgram.description) {
            description.push('', currentProgram.description);
        }

        description.push('', `⏰ ${currentProgram.start} - ${currentProgram.stop}`);

        if (currentProgram.category) {
            description.push(`🏷️ ${currentProgram.category}`);
        }

        // Prossimi programmi
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

        // Unisci tutto con la descrizione originale
        meta.description = description.join('\n');
        
        // Aggiorna releaseInfo
        meta.releaseInfo = `${currentProgram.title} (${currentProgram.start})`;
    }

    return meta;
}

/**
 * Handler per i metadati dettagliati di un canale
 */
async function metaHandler({ type, id }) {
    try {
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        const channelId = id.split('|')[1];
        const allChannels = CacheManager.getCachedData().channels;
        
        const channel = allChannels.find(ch => 
            ch.id === id || 
            ch.streamInfo?.tvg?.id === channelId ||
            ch.name === channelId
        );

        if (!channel) {
            return { meta: null };
        }

        // Prepara le informazioni base del canale
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

        // Prepara la descrizione base
        let baseDescription = [];
        
        if (channel.streamInfo?.tvg?.chno) {
            baseDescription.push(`📺 Canale ${channel.streamInfo.tvg.chno}`);
        }

        if (channel.description) {
            baseDescription.push('', channel.description);
        }

        meta.description = baseDescription.join('\n');

        // Arricchisci con informazioni EPG
        const enrichedMeta = enrichWithDetailedEPG(meta, channel.streamInfo?.tvg?.id);

        return { meta: enrichedMeta };
    } catch (error) {
        console.error('[MetaHandler] Errore:', error.message);
        return { meta: null };
    }
}

module.exports = metaHandler;
