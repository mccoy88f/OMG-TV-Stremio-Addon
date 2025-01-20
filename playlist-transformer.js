const axios = require('axios');
const fs = require('fs');
const path = require('path');

class PlaylistTransformer {
    constructor() {
        this.remappingRules = new Map();
        this.channelsMap = new Map(); // Mappa principale per tenere traccia di tutti i canali
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

                const [m3uId, epgId] = line.split('=').map(s => s.trim().toLowerCase());
                if (m3uId && epgId) {
                    this.remappingRules.set(m3uId, epgId);
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

    normalizeId(id) {
        return id?.toLowerCase().trim().replace(/\s+/g, '') || '';
    }

    getRemappedId(channel) {
        const originalId = this.normalizeId(channel.tvg?.id || channel.name);
        const remappedId = this.remappingRules.get(originalId);
        
        if (remappedId) {
            console.log(`✓ Remapping applicato: ${originalId} -> ${remappedId}`);
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
                urls: [], // Array vuoto per i flussi
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
        const genres = new Set(['Altri canali']);
        
        console.log('\n=== Inizio Parsing Contenuto M3U ===');
        
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
                const originalId = this.normalizeId(currentChannel.tvg?.id || currentChannel.name);
                const remappedId = this.getRemappedId(currentChannel);
                
                console.log(`Processo canale: ${currentChannel.name}`);
                console.log(`ID Originale: ${originalId}`);
                console.log(`ID Remappato: ${remappedId}`);
                
                // Se l'ID è stato remappato, non creare un nuovo canale con l'ID originale
                const finalId = remappedId;
                
                if (!this.channelsMap.has(finalId)) {
                    console.log(`✓ Creazione nuovo canale con ID: ${finalId}`);
                    const channelObj = this.createChannelObject(currentChannel, finalId);
                    this.channelsMap.set(finalId, channelObj);
                    genres.add(currentChannel.group);
                } else {
                    console.log(`✓ Aggiunto stream a canale esistente: ${finalId}`);
                }
                
                // Aggiungi il flusso al canale remappato
                const channelObj = this.channelsMap.get(finalId);
                this.addStreamToChannel(channelObj, line, currentChannel.name);
                
                currentChannel = null;
            }
        }

        return Array.from(genres);
    }

    async loadAndTransform(url) {
        try {
            console.log('\n=== Inizio Caricamento Playlist ===');
            console.log(`URL Sorgente: ${url}`);
            console.log('\n=== Caricamento Regole Remapping ===');
            await this.loadRemappingRules();
            
            // Leggi l'URL o la lista di URL
            const response = await axios.get(url);
            const content = response.data;
            const playlistUrls = content.startsWith('#EXTM3U') 
                ? [url] 
                : content.split('\n').filter(line => line.trim() && line.startsWith('http'));

            // Processa ogni playlist
            const genres = new Set();
            for (const playlistUrl of playlistUrls) {
                console.log(`\nProcesso playlist: ${playlistUrl}`);
                const playlistResponse = await axios.get(playlistUrl);
                const playlistGenres = await this.parseM3UContent(playlistResponse.data);
                playlistGenres.forEach(genre => genres.add(genre));
            }

            // Prepara il risultato finale
            const result = {
                genres: Array.from(genres).sort(),
                channels: Array.from(this.channelsMap.values())
            };

            // Log del riepilogo
            console.log('\n=== Riepilogo Processamento ===');
            console.log(`✓ Totale canali: ${result.channels.length}`);
            console.log(`✓ Totale generi: ${result.genres.length}`);
            console.log('✓ Totale regole di remapping:', this.remappingRules.size);
            
            // Clear della mappa dei canali dopo l'uso
            this.channelsMap.clear();

            return result;
        } catch (error) {
            console.error('Errore nel caricamento della playlist:', error);
            throw error;
        }
    }
}

module.exports = PlaylistTransformer;
