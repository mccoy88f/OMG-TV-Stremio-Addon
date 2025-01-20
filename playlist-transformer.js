const axios = require('axios');
const fs = require('fs');
const path = require('path');

class PlaylistTransformer {
    constructor() {
        this.remappingRules = new Map();
        this.channelsMap = new Map();
    }

    normalizeId(id) {
        // Solo conversione lowercase, mantiene spazi, punti e trattini
        return id?.toLowerCase() || '';
    }

    async loadRemappingRules() {
        const remappingPath = path.join(__dirname, 'link.epg.remapping');
        console.log('\n=== Caricamento Regole di Remapping ===');
        
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
                    
                    console.log(`✓ Regola caricata:
    Da: "${m3uId}" (normalizzato: "${normalizedM3uId}")
    A:  "${epgId}" (normalizzato: "${normalizedEpgId}")`);

                    this.remappingRules.set(normalizedM3uId, epgId);  // Mantiene il case originale dell'epgId
                    ruleCount++;
                }
            });

            console.log(`✓ Caricate ${ruleCount} regole di remapping`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Errore nel caricamento del file di remapping:', error);
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
        
        // Estrai tutti i tag tvg-*
        const tvgMatches = metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || [];
        tvgMatches.forEach(match => {
            const [key, value] = match.split('=');
            const cleanKey = key.replace('tvg-', '');
            tvgData[cleanKey] = value.replace(/"/g, '');
        });

        // Estrai il gruppo
        const groupMatch = metadata.match(/group-title="([^"]+)"/);
        const group = groupMatch ? groupMatch[1] : 'Altri canali';

        // Estrai il nome
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
            console.log(`✓ Remapping applicato:
  ID Originale: "${originalId}"
  ID Normalizzato: "${normalizedId}"
  ID Remappato: "${remappedId}"`);
            return remappedId;
        }
        
        return originalId; // Mantiene il case originale se non c'è remapping
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
                urls: [], // Array per stream multipli
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
        console.log(`  ✓ Aggiunto stream: ${name}`);
    }

    async parseM3UContent(content) {
        console.log('\n=== Inizio Parsing Contenuto M3U ===');
        const lines = content.split('\n');
        let currentChannel = null;
        let headers = {};
        const genres = new Set(['Altri canali']);
        
        let epgUrl = null;
        if (lines[0].includes('url-tvg=')) {
            const match = lines[0].match(/url-tvg="([^"]+)"/);
            if (match) {
                epgUrl = match[1];
                console.log('EPG URL trovato nella playlist:', epgUrl);
            }
        }
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('#EXTINF:')) {
                // Parse VLC options per gli headers
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
                
                // Parse del canale
                currentChannel = this.parseChannelFromLine(line, headers);
            } else if (line.startsWith('http') && currentChannel) {
                const originalId = currentChannel.tvg?.id || currentChannel.name;
                const remappedId = this.getRemappedId(currentChannel);
                const normalizedId = this.normalizeId(remappedId);
                
                console.log(`\nProcesso canale: ${currentChannel.name}`);
                console.log(`ID Originale: ${originalId}`);
                console.log(`ID Remappato: ${remappedId}`);
                
                if (!this.channelsMap.has(normalizedId)) {
                    console.log(`✓ Creazione nuovo canale con ID: ${remappedId}`);
                    const channelObj = this.createChannelObject(currentChannel, remappedId);
                    this.channelsMap.set(normalizedId, channelObj);
                    genres.add(currentChannel.group);
                } else {
                    console.log(`✓ Aggiunto stream a canale esistente: ${remappedId}`);
                }
                
                const channelObj = this.channelsMap.get(normalizedId);
                this.addStreamToChannel(channelObj, line, currentChannel.name);
                
                currentChannel = null;
            }
        }

        console.log('\n=== Fine Parsing Contenuto M3U ===');
        console.log(`✓ Canali trovati: ${this.channelsMap.size}`);
        console.log(`✓ Generi trovati: ${genres.size}`);

        return {
            genres: Array.from(genres),
            epgUrl
        };
    }

    async loadAndTransform(url) {
        try {
            console.log('\n=== Inizio Caricamento Playlist ===');
            console.log(`URL Sorgente: ${url}`);
            
            await this.loadRemappingRules();
            
            const response = await axios.get(url);
            const content = response.data;
            const playlistUrls = content.startsWith('#EXTM3U') 
                ? [url] 
                : content.split('\n').filter(line => line.trim() && line.startsWith('http'));

            const genres = new Set();
            const epgUrls = new Set();
            
            for (const playlistUrl of playlistUrls) {
                console.log(`\nProcesso playlist: ${playlistUrl}`);
                const playlistResponse = await axios.get(playlistUrl);
                const result = await this.parseM3UContent(playlistResponse.data);
                
                result.genres.forEach(genre => genres.add(genre));
                if (result.epgUrl) {
                    epgUrls.add(result.epgUrl);
                }
            }

            const finalResult = {
                genres: Array.from(genres).sort(),
                channels: Array.from(this.channelsMap.values()),
                epgUrls: Array.from(epgUrls)
            };

            console.log('\n=== Riepilogo Processamento ===');
            console.log(`✓ Totale canali: ${finalResult.channels.length}`);
            console.log(`✓ Totale generi: ${finalResult.genres.length}`);
            console.log(`✓ Totale URL EPG: ${finalResult.epgUrls.length}`);
            console.log(`✓ Totale regole remapping applicate: ${this.remappingRules.size}`);

            // Clear della mappa dei canali dopo l'uso
            this.channelsMap.clear();
            return finalResult;

        } catch (error) {
            console.error('Errore nel caricamento della playlist:', error);
            throw error;
        }
    }
}

module.exports = PlaylistTransformer;
