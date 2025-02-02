const axios = require('axios');
const fs = require('fs');
const path = require('path');

class PlaylistTransformer {
    constructor() {
        this.remappingRules = new Map();
        this.channelsMap = new Map();
    }

    normalizeId(id) {
        return id?.toLowerCase() || '';
    }

    cleanChannelName(name) {
        return name
            .replace(/[\(\[].*?[\)\]]/g, '') // Rimuove contenuto tra parentesi
            .trim()                          // Rimuove spazi iniziali e finali
            .toLowerCase()                    // Converte in minuscolo
            .replace(/\s+/g, '');            // Rimuove tutti gli spazi
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
                    this.remappingRules.set(normalizedM3uId, epgId);
                    ruleCount++;
                }
            });

            console.log(`✓ Caricate ${ruleCount} regole di remapping`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Errore remapping:', error.message);
            }
        }
    }

    parseVLCOpts(lines, currentIndex, extinf) {
        const headers = {};
        let i = currentIndex;
        
        while (i < lines.length) {
            const line = lines[i].trim();
            
            if (line.startsWith('#EXTHTTP:')) {
                try {
                    const httpHeaders = JSON.parse(line.substring('#EXTHTTP:'.length));
                    Object.assign(headers, httpHeaders);
                } catch (e) {
                    console.error('Errore parsing EXTHTTP:', e);
                }
                i++;
            } 
            else if (line.startsWith('#EXTVLCOPT:')) {
                const opt = line.substring('#EXTVLCOPT:'.length).trim();
                if (!headers['User-Agent'] && opt.startsWith('http-user-agent=')) {
                    headers['User-Agent'] = opt.split('=')[1];
                }
                else if (!headers['Referer'] && opt.startsWith('http-referrer=')) {
                    headers['Referer'] = opt.split('=')[1];
                }
                else if (!headers['Origin'] && opt.startsWith('http-origin=')) {
                    headers['Origin'] = opt.split('=')[1];
                }
                i++;
            }
            else {
                break;
            }
        }

        if ((!headers['User-Agent'] || !headers['Referer']) && extinf) {
            const userAgent = extinf.match(/http-user-agent="([^"]+)"/);
            const referrer = extinf.match(/http-referrer="([^"]+)"/);
            
            if (!headers['User-Agent'] && userAgent) {
                headers['User-Agent'] = userAgent[1];
            }
            if (!headers['Referer'] && referrer) {
                headers['Referer'] = referrer[1];
            }
        }

        if (!headers['User-Agent']) {
            headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
        }
        if (!headers['Referer']) {
            headers['Referer'] = 'https://streamtape.com/';
        }
        if (!headers['Origin']) {
            headers['Origin'] = 'https://streamtape.com';
        }
        
        return { headers, nextIndex: i };
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

        // Genera tvg.id se non presente
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
            return remappedId;
        }
        
        return originalId;
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
                headers: channel.headers,
                tvg: {
                    ...channel.tvg,
                    id: channelId,
                    name: cleanName
                }
            }
        };
    }

    addStreamToChannel(channel, url, name) {
        channel.streamInfo.urls.push({
            url,
            name
        });
    }

    async parseM3UContent(content) {
        const lines = content.split('\n');
        let currentChannel = null;
        const genres = new Set(['Undefined']);
    
        let epgUrl = null;
        if (lines[0].includes('url-tvg=')) {
            const match = lines[0].match(/url-tvg="([^"]+)"/);
            if (match) {
                epgUrl = match[1];
                console.log('✓ EPG URL trovato:', epgUrl);
            }
        }
    
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
        
            if (line.startsWith('#EXTINF:')) {
                const { headers, nextIndex } = this.parseVLCOpts(lines, i + 1, line);
                i = nextIndex - 1;
                currentChannel = this.parseChannelFromLine(line, headers);
            } else if (line.startsWith('http') && currentChannel) {
                const remappedId = this.getRemappedId(currentChannel);
                const normalizedId = this.normalizeId(remappedId);
            
                if (!this.channelsMap.has(normalizedId)) {
                    const channelObj = this.createChannelObject(currentChannel, remappedId);
                    this.channelsMap.set(normalizedId, channelObj);
                    currentChannel.group.forEach(genre => genres.add(genre));
                }
            
                const channelObj = this.channelsMap.get(normalizedId);
                this.addStreamToChannel(channelObj, line, currentChannel.name);
                
                currentChannel = null;
            }
        }

        console.log(`✓ Canali processati: ${this.channelsMap.size}`);

        return {
            genres: Array.from(genres),
            epgUrl
        };
    }

    async loadAndTransform(url) {
        try {
            console.log('=== Inizio Processamento Playlist ===');
            console.log(`URL: ${url}`);
            
            await this.loadRemappingRules();
            
            const response = await axios.get(url);
            const content = response.data;
            const playlistUrls = content.startsWith('#EXTM3U') 
                ? [url] 
                : content.split('\n').filter(line => line.trim() && line.startsWith('http'));

            const allGenres = [];
            const epgUrls = new Set();
            
            for (const playlistUrl of playlistUrls) {
                console.log(`\nProcesso playlist: ${playlistUrl}`);
                const playlistResponse = await axios.get(playlistUrl);
                const result = await this.parseM3UContent(playlistResponse.data);
                
                result.genres.forEach(genre => {
                    if (!allGenres.includes(genre)) {
                        allGenres.push(genre);
                    }
                });
                
                if (result.epgUrl) {
                    epgUrls.add(result.epgUrl);
                }
            }

            const finalResult = {
                genres: allGenres,
                channels: Array.from(this.channelsMap.values()),
                epgUrls: Array.from(epgUrls)
            };

            console.log('\n=== Riepilogo ===');
            console.log(`✓ Canali: ${finalResult.channels.length}`);
            console.log(`✓ Generi: ${finalResult.genres.length}`);
            console.log(`✓ URL EPG: ${finalResult.epgUrls.length}`);

            this.channelsMap.clear();
            return finalResult;

        } catch (error) {
            console.error('❌ Errore playlist:', error.message);
            throw error;
        }
    }
}

module.exports = PlaylistTransformer;
