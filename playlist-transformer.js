const axios = require('axios');
const path = require('path');
const fs = require('fs');
const config = require('./config');

async function readExternalFile(url) {
  try {
      const response = await axios.get(url);
      const content = response.data;

      if (content.trim().startsWith('#EXTM3U')) {
          console.log('File M3U diretto trovato');
          return [url];
      }

      console.log('File lista URL trovato');
      return content.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
      console.error('Errore nella lettura del file:', error);
      throw error;
  }
}

class PlaylistTransformer {
  constructor() {
      this.remappingRules = new Map();
      this.channelsMap = new Map();
      this.channelsWithoutStreams = [];
  }

  normalizeId(id) {
      return id?.toLowerCase() || '';
  }

  cleanChannelName(name) {
      return name
          .replace(/[\(\[].*?[\)\]]/g, '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '');
  }

  async loadRemappingRules() {
      const remappingPath = path.join(__dirname, 'link.epg.remapping');
      
      try {
          const content = await fs.promises.readFile(remappingPath, 'utf8');
          let ruleCount = 0;

          content.split('\n').forEach(line => {
              line = line.trim();
              if (!line || line.startsWith('#')) return;

              const [m3uId, epgId] = line.split('=').map(s => s.trim());
              if (m3uId && epgId) {
                  const normalizedM3uId = this.normalizeId(m3uId);
                  const normalizedEpgId = this.normalizeId(epgId);
                  this.remappingRules.set(normalizedM3uId, normalizedEpgId);
                  ruleCount++;
              }
          });

          if (ruleCount > 0) {
              console.log(`✓ Caricate ${ruleCount} regole di remapping`);
          }
          
      } catch (error) {
          if (error.code !== 'ENOENT') {
              console.error('❌ Errore remapping:', error.message);
          }
      }
  }

  parseVLCOpts(lines, currentIndex, extinf) {
      let i = currentIndex;
//      console.log('\nParsing headers for:', extinf);
      
      // 1. Headers da EXTINF
      const extinfHeaders = {};
      const extinfopts = extinf.match(/http-[^=]+=["']([^"']+)/g);
      if (extinfopts) {
//          console.log('Headers in EXTINF:', extinfopts);
          extinfopts.forEach(opt => {
              const [key, value] = opt.split('=');
              extinfHeaders[key.replace('http-', '')] = value.replace(/["']/g, '');
          });
      }

      // 2. Headers da EXTVLCOPT
      const vlcHeaders = {};
      while (i < lines.length && lines[i].startsWith('#EXTVLCOPT:')) {
          const opt = lines[i].substring('#EXTVLCOPT:'.length).trim();
//          console.log('EXTVLCOPT line:', opt);
          const [key, ...value] = opt.split('=');
          vlcHeaders[key.replace('http-', '')] = value.join('=');
          i++;
      }

      // 3. Headers da EXTHTTP
      const httpHeaders = {};
      if (i < lines.length && lines[i].startsWith('#EXTHTTP:')) {
          try {
              const parsed = JSON.parse(lines[i].substring('#EXTHTTP:'.length));
//              console.log('EXTHTTP headers:', parsed);
              Object.assign(httpHeaders, parsed);
              i++;
          } catch (e) {
              console.error('Error parsing EXTHTTP:', e);
          }
      }

      // Unifica gli headers con priorità e standardizza User-Agent
      const finalHeaders = {
          ...extinfHeaders,
          ...vlcHeaders,
          ...httpHeaders
      };

      finalHeaders['User-Agent'] = httpHeaders['User-Agent'] || httpHeaders['user-agent'] ||
                                  vlcHeaders['user-agent'] || extinfHeaders['user-agent'] ||
                                  config.defaultUserAgent;

      // Rimuovi duplicati lowercase
      delete finalHeaders['user-agent'];
      delete finalHeaders['referer'];
      if (finalHeaders['Referer']) {
          finalHeaders['referer'] = finalHeaders['Referer'];
          delete finalHeaders['Referer'];
      }
      delete finalHeaders['origin'];
      if (finalHeaders['Origin']) {
          finalHeaders['origin'] = finalHeaders['Origin'];
          delete finalHeaders['Origin'];
      }

//      console.log('Final combined headers:', finalHeaders);
      return { headers: finalHeaders, nextIndex: i };
  }
  
  parseChannelFromLine(line, headers) {
      const metadata = line.substring(8).trim();
      const tvgData = {};
  
      const tvgMatches = metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || [];
      tvgMatches.forEach(match => {
          const [key, value] = match.split('=');
          const cleanKey = key.replace('tvg-', '');
          tvgData[cleanKey] = value.replace(/"/g, '');
      });

      const groupMatch = metadata.match(/group-title="([^"]+)"/);
      const group = groupMatch ? groupMatch[1] : 'Undefined';
      const genres = group.split(';').map(g => g.trim());

      const nameParts = metadata.split(',');
      const name = nameParts[nameParts.length - 1].trim();

      if (!tvgData.id) {
          const suffix = process.env.ID_SUFFIX || '';
          tvgData.id = this.cleanChannelName(name) + (suffix ? `.${suffix}` : '');
      }

      return {
          name,
          group: genres,
          tvg: tvgData,
          headers
      };
  }

  getRemappedId(channel) {
      const originalId = channel.tvg.id;
      const normalizedId = this.normalizeId(originalId);
      const remappedId = this.remappingRules.get(normalizedId);
  
      if (remappedId) {
          console.log(`✓ Remapping: ${originalId} -> ${remappedId}`);
          return this.normalizeId(remappedId);
      }
  
      return this.normalizeId(originalId);
  }

  createChannelObject(channel, channelId) {
      const name = channel.tvg?.name || channel.name;
      const cleanName = name.replace(/\s*\(.*?\)\s*/g, '').trim();

      return {
          id: `tv|${channelId}`,
          type: 'tv',
          name: cleanName,
          genre: channel.group,
          posterShape: 'square',
          poster: channel.tvg?.logo,
          background: channel.tvg?.logo,
          logo: channel.tvg?.logo,
          description: `Canale: ${cleanName} - ID: ${channelId}`,
          runtime: 'LIVE',
          behaviorHints: {
              defaultVideoId: `tv|${channelId}`,
              isLive: true
          },
          streamInfo: {
              urls: [],
              tvg: {
                  ...channel.tvg,
                  id: channelId,
                  name: cleanName
              }
          }
      };
  }

  addStreamToChannel(channel, url, name, genres, headers) {
      if (genres) {
          genres.forEach(newGenre => {
              if (!channel.genre.includes(newGenre)) {
                  channel.genre.push(newGenre);
              }
          });
      }

      if (url === null || url.toLowerCase() === 'null') {
          channel.streamInfo.urls.push({
              url: 'https://static.vecteezy.com/system/resources/previews/001/803/236/mp4/no-signal-bad-tv-free-video.mp4',
              name: 'Nessuno flusso presente nelle playlist m3u',
              headers
          });
      } else {
          channel.streamInfo.urls.push({
              url,
              name,
              headers
          });
      }
  }
  
  async parseM3UContent(content) {
      const lines = content.split('\n');
      let currentChannel = null;
      const genres = new Set(['Undefined']);
  
      let epgUrl = null;
      if (lines[0].includes('url-tvg=')) {
          const match = lines[0].match(/url-tvg="([^"]+)"/);
          if (match) {
              epgUrl = match[1].split(',').map(url => url.trim());
              console.log('URL EPG trovati nella playlist:', epgUrl);
          }
      }
  
      for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
      
          if (line.startsWith('#EXTINF:')) {
              const { headers, nextIndex } = this.parseVLCOpts(lines, i + 1, line);
              i = nextIndex - 1;
              currentChannel = this.parseChannelFromLine(line, headers);

          } else if ((line.startsWith('http') || line.toLowerCase() === 'null') && currentChannel) {
              const remappedId = this.getRemappedId(currentChannel);
              const normalizedId = this.normalizeId(remappedId);

              if (!this.channelsMap.has(normalizedId)) {
                  const channelObj = this.createChannelObject(currentChannel, remappedId);
                  this.channelsMap.set(normalizedId, channelObj);
                  currentChannel.group.forEach(genre => genres.add(genre));
              }

              const channelObj = this.channelsMap.get(normalizedId);
              this.addStreamToChannel(channelObj, line, currentChannel.name, currentChannel.group, currentChannel.headers);
  
              currentChannel = null;
          }
      }

      this.channelsWithoutStreams = [];
      for (const [id, channel] of this.channelsMap.entries()) {
          if (channel.streamInfo.urls.length === 0) {
              this.channelsWithoutStreams.push(channel.name);
          }
      }

      if (this.channelsWithoutStreams.length > 0) {
          console.warn(`⚠️ Canali senza flussi riproducibili: ${this.channelsWithoutStreams.length}`);
          console.log('\n=== Canali senza flussi ===');
          this.channelsWithoutStreams.forEach(name => {
              console.log(`${name}`);
          });
          console.log('========================\n');
      }

      const channelsWithOnlyDummy = [];
      for (const [id, channel] of this.channelsMap.entries()) {
          if (channel.streamInfo.urls.length === 1 && 
              channel.streamInfo.urls[0].name === 'Nessuno flusso presente nelle playlist m3u') {
              channelsWithOnlyDummy.push(channel.name);
          }
      }

      if (channelsWithOnlyDummy.length > 0) {
          console.log('\n=== Canali con solo flusso dummy ===');
          channelsWithOnlyDummy.forEach(name => {
              console.log(`${name}`);
          });
          console.log(`✓ Totale canali con solo flusso dummy: ${channelsWithOnlyDummy.length}`);
          console.log('================================\n');
      }

      return {
          genres: Array.from(genres),
          epgUrl
      };
  }

  async loadAndTransform(url) {
      try {
          await this.loadRemappingRules();
          
          const response = await axios.get(url);
          const content = response.data;
          const playlistUrls = content.startsWith('#EXTM3U') 
              ? [url] 
              : content.split('\n').filter(line => line.trim() && line.startsWith('http'));

          console.log('\n=== Inizio Processamento Playlist ===');
          console.log('Playlist da processare:', playlistUrls.length);

          const allGenres = [];
          const allEpgUrls = new Set();
          
          for (const playlistUrl of playlistUrls) {
              console.log('\nProcesso playlist:', playlistUrl);
              const playlistResponse = await axios.get(playlistUrl);
              const result = await this.parseM3UContent(playlistResponse.data);
              
              result.genres.forEach(genre => {
                  if (!allGenres.includes(genre)) {
                      allGenres.push(genre);
                  }
              });
              
              if (result.epgUrl) {
                  if (Array.isArray(result.epgUrl)) {
                      result.epgUrl.forEach(url => allEpgUrls.add(url));
                  } else {
                      allEpgUrls.add(result.epgUrl);
                  }
              }
          }

          const finalResult = {
              genres: allGenres,
              channels: Array.from(this.channelsMap.values()),
              epgUrls: Array.from(allEpgUrls)
          };

          finalResult.channels.forEach(channel => {
              if (channel.streamInfo.urls.length > 1) {
                  channel.streamInfo.urls = channel.streamInfo.urls.filter(
                      stream => stream.name !== 'Nessuno flusso presente nelle playlist m3u'
                  );
              }
          });

          console.log('\nRiepilogo Processamento:');
          console.log(`✓ Totale canali processati: ${finalResult.channels.length}`);
          console.log(`✓ Totale generi trovati: ${finalResult.genres.length}`);
          if (allEpgUrls.size > 0) {
              console.log(`✓ URL EPG trovati: ${allEpgUrls.size}`);
          }
          console.log('=== Processamento Completato ===\n');

          this.channelsMap.clear();
          this.channelsWithoutStreams = [];
          return finalResult;

      } catch (error) {
          console.error('❌ Errore playlist:', error.message);
          throw error;
      }
  }
}

module.exports = PlaylistTransformer;
