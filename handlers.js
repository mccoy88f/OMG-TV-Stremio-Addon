const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const StreamProxyManager = require('./stream-proxy-manager')(config);

function normalizeId(id) {
  return id?.toLowerCase().replace(/[^\w.]/g, '').trim() || '';
}

async function catalogHandler({ type, id, extra, config: userConfig }) {
  try {
      if (!userConfig.m3u) {
          console.log('[Handlers] URL M3U mancante nella configurazione');
          return { metas: [], genres: [] };
      }

      if (CacheManager.cache.m3uUrl !== userConfig.m3u) {
          await CacheManager.rebuildCache(userConfig.m3u, userConfig);
      }

      if (userConfig.epg) {
          await EPGManager.initializeEPG(userConfig.epg);
      }

      const { search, genre, skip = 0 } = extra || {};
      console.log(`\n=== Inizio Catalog Handler ===`);
      console.log(`Richiesta catalogo: type=${type}, id=${id}, skip=${skip}`);
      console.log(`Extra:`, extra);
      
      const cachedData = CacheManager.getCachedData();
      const ITEMS_PER_PAGE = 100;

      let channels = [];
      if (genre) {
          channels = CacheManager.getChannelsByGenre(genre);
          console.log(`Filtro per genere "${genre}": trovati ${channels.length} canali`);
      } else if (search) {
          channels = CacheManager.searchChannels(search);
          console.log(`Ricerca "${search}": trovati ${channels.length} canali`);
      } else {
          channels = cachedData.channels;
          console.log(`Totale canali disponibili: ${channels.length}`);
      }

      channels.sort((a, b) => {
          const numA = parseInt(a.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
          const numB = parseInt(b.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
          return numA - numB || a.name.localeCompare(b.name);
      });

      const startIdx = parseInt(skip) || 0;
      console.log(`Paginazione: skip=${startIdx}, limit=${ITEMS_PER_PAGE}, totale=${channels.length}`);
      
      const paginatedChannels = channels.slice(startIdx, startIdx + ITEMS_PER_PAGE);
      console.log(`Canali in questa pagina: ${paginatedChannels.length}`);
      
      if (paginatedChannels.length > 0) {
          console.log(`Primo canale in questa pagina: ${paginatedChannels[0].name}`);
          console.log(`Ultimo canale in questa pagina: ${paginatedChannels[paginatedChannels.length-1].name}`);
      }
      
      if (startIdx + ITEMS_PER_PAGE < channels.length) {
          console.log(`Ci sono altre pagine disponibili. Prossimo skip=${startIdx + ITEMS_PER_PAGE}`);
      } else {
          console.log(`Questa è l'ultima pagina.`);
      }

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
      
      console.log(`Metadata generati: ${metas.length}`);
      console.log(`=== Fine Catalog Handler ===\n`);

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
        console.log('Stream request:', { id, userConfig });
        
        if (!userConfig.m3u) {
            console.log('M3U URL mancante');
            return { streams: [] };
        }

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

        console.log('Canale trovato:', {
            id: channel.id,
            name: channel.name,
            tvgInfo: channel.streamInfo?.tvg,
            urls: channel.streamInfo?.urls
        });

        let streams = [];

        if (userConfig.force_proxy === 'true') {
            if (userConfig.proxy && userConfig.proxy_pwd) {
                for (const stream of channel.streamInfo.urls) {
                    const streamDetails = {
                        name: stream.name || channel.name,
                        url: stream.url,
                        headers: stream.headers || { 'User-Agent': config.defaultUserAgent }
                    };
                    // Assicuriamoci che User-Agent sia presente
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
                    // Assicuriamoci che lo header User-Agent sia sempre presente
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
                    console.log('Stream meta:', streamMeta);
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

        console.log('Meta info:', meta);
        console.log('Streams generati:', streams.length);
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
