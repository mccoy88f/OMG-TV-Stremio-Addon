const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const StreamProxyManager = require('./stream-proxy-manager')(config);

function normalizeId(id) {
   return id?.toLowerCase().trim().replace(/\s+/g, '') || '';
}

async function enrichWithEPG(meta, channelId, userConfig) {
   if (!channelId || !userConfig.epg_enabled) return meta;

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

async function catalogHandler({ type, id, extra, config: userConfig }) {
   try {
       if (!userConfig.m3u) {
           console.log('[Handlers] URL M3U mancante nella configurazione');
           return { metas: [], genres: [] };
       }

       // Forza l'aggiornamento della cache con l'URL M3U
       await CacheManager.updateCache(false, userConfig.m3u);

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

       const metas = await Promise.all(paginatedChannels.map(async channel => {
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

           if ((!meta.poster || !meta.background || !meta.logo) && channel.streamInfo?.tvg?.id) {
               const epgIcon = EPGManager.getChannelIcon(channel.streamInfo.tvg.id);
               if (epgIcon) {
                   meta.poster = meta.poster || epgIcon;
                   meta.background = meta.background || epgIcon;
                   meta.logo = meta.logo || epgIcon;
               }
           }

           return await enrichWithEPG(meta, channel.streamInfo?.tvg?.id, userConfig);
       }));

       return {
           metas,
           genres: cachedData.genres
       };

   } catch (error) {
       console.error('[Handlers] Errore nella gestione del catalogo:', error);
       return { metas: [], genres: [] };
   }
}

async function streamHandler({ id, config: userConfig }) {
   try {
       if (!userConfig.m3u) {
           console.log('[Handlers] URL M3U mancante nella configurazione');
           return { streams: [] };
       }

       // Aggiorna sempre la cache con l'URL M3U corrente
       await CacheManager.updateCache(false, userConfig.m3u);

       const channelId = id.split('|')[1];
       const channel = CacheManager.getChannel(channelId);

       if (!channel) {
           console.log('[Handlers] Nessun canale trovato per ID:', channelId);
           return { streams: [] };
       }

       let streams = [];

       if (userConfig.force_proxy === 'true') {
           if (userConfig.proxy_url && userConfig.proxy_pwd) {
               if (channel.streamInfo && channel.streamInfo.urls) {
                   for (const stream of channel.streamInfo.urls) {
                       const streamDetails = {
                           name: stream.name || channel.name,
                           url: stream.url,
                           headers: channel.streamInfo.headers
                       };
                       const proxyStreams = await StreamProxyManager.getProxyStreams(streamDetails, userConfig);
                       streams.push(...proxyStreams);
                   }
               }
           }
       } else {
           if (channel.streamInfo.urls && channel.streamInfo.urls.length > 0) {
               for (const stream of channel.streamInfo.urls) {
                   streams.push({
                       name: stream.name || channel.name,
                       title: stream.name || channel.name,
                       url: stream.url,
                       headers: channel.streamInfo.headers,
                       behaviorHints: {
                           notWebReady: false,
                           bingeGroup: "tv"
                       }
                   });

                   if (userConfig.proxy_url && userConfig.proxy_pwd) {
                       const streamDetails = {
                           name: stream.name || channel.name,
                           url: stream.url,
                           headers: channel.streamInfo.headers
                       };
                       const proxyStreams = await StreamProxyManager.getProxyStreams(streamDetails, userConfig);
                       streams.push(...proxyStreams);
                   }
               }
           }
       }

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

       if ((!meta.poster || !meta.background || !meta.logo) && channel.streamInfo?.tvg?.id) {
           const epgIcon = EPGManager.getChannelIcon(channel.streamInfo.tvg.id);
           if (epgIcon) {
               meta.poster = meta.poster || epgIcon;
               meta.background = meta.background || epgIcon;
               meta.logo = meta.logo || epgIcon;
           }
       }

       const enrichedMeta = await enrichWithEPG(meta, channel.streamInfo?.tvg?.id, userConfig);
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
