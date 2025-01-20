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

    parseVLCOpts(lines, currentIndex) {
        const headers = {};
        let i = currentIndex;
        
        while (i < lines.length && lines[i].startsWith('#EXTVLCOPT:')) {
            const opt = lines[i].substring('#EXTVLCOPT:'.length).trim();
            if (opt.startsWith('http-user-agent=')) {
                headers['User-Agent'] = opt.substring('http-user-agent='.length);
            }
            i++;
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
        const group = groupMatch ? groupMatch[1] : 'Altri canali';

        const nameParts = metadata.split(',');
        const name = nameParts[nameParts.length - 1].trim();

        return {
            name,
            group,
            tvg: tvgData,
            headers
        };
    }

    getRemappedId(channel) {
        const originalId = channel.tvg?.id || channel.name;
        const normalizedId = this.normalizeId(originalId);
        const remappedId = this.remappingRules.get(normalizedId);
        
        if (remappedId) {
            console.log(`✓ Remapping: ${originalId} -> ${remappedId}`);
            return remappedId;
        }
        
        return originalId;
    }

    createChannelObject(channel, channelId) {
        const id = `tv|${channelId}`;
        const name = channel.tvg?.name || channel.name;
        
        return {
            id,
            type: 'tv',
            name,
            genre: [channel.group],
            posterShape: 'square',
            poster: channel.tvg?.logo,
            background: channel.tvg?.logo,
            logo: channel.tvg?.logo,
            description: `Canale: ${name}`,
            runtime: 'LIVE',
            behaviorHints: {
                defaultVideoId: id,
                isLive: true
            },
            streamInfo: {
                urls: [],
                headers: channel.headers,
                tvg: {
                    ...channel.tvg,
                    id: channelId,
                    name
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
        let headers = {};
        const genres = ['Altri canali']; // Array invece di Set
        
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
                let nextIndex = i + 1;
                headers = {};
                
                while (nextIndex < lines.length && lines[nextIndex].startsWith('#EXTVLCOPT:')) {
                    const opt = lines[nextIndex].substring('#EXTVLCOPT:'.length).trim();
                    if (opt.startsWith('http-user-agent=')) {
                        headers['User-Agent'] = opt.substring('http-user-agent='.length);
                    }
                    nextIndex++;
                }
                i = nextIndex - 1;
                
                currentChannel = this.parseChannelFromLine(line, headers);
            } else if (line.startsWith('http') && currentChannel) {
                const remappedId = this.getRemappedId(currentChannel);
                const normalizedId = this.normalizeId(remappedId);
                
                if (!this.channelsMap.has(normalizedId)) {
                    const channelObj = this.createChannelObject(currentChannel, remappedId);
                    this.channelsMap.set(normalizedId, channelObj);
                    // Aggiungi il genere solo se non è già presente
                    if (!genres.includes(currentChannel.group)) {
                        genres.push(currentChannel.group);
                    }
                }
                
                const channelObj = this.channelsMap.get(normalizedId);
                this.addStreamToChannel(channelObj, line, currentChannel.name);
                
                currentChannel = null;
            }
        }

        console.log(`✓ Canali processati: ${this.channelsMap.size}`);

        return {
            genres, // Array già nell'ordine corretto
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

            const allGenres = []; // Array invece di Set
            const epgUrls = new Set();
            
            for (const playlistUrl of playlistUrls) {
                console.log(`\nProcesso playlist: ${playlistUrl}`);
                const playlistResponse = await axios.get(playlistUrl);
                const result = await this.parseM3UContent(playlistResponse.data);
                
                // Aggiungi solo i generi non ancora presenti
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
                genres: allGenres, // Non ordiniamo più alfabeticamente
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
