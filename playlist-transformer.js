const axios = require('axios');

class PlaylistTransformer {
    constructor() {
        this.stremioData = {
            genres: new Set(),
            channels: []
        };
    }

    /**
     * Estrae gli headers dalle opzioni VLC
     */
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

    /**
     * Converte un canale nel formato Stremio
     */
    transformChannelToStremio(channel) {
        // Usa tvg-id per l'identificatore se disponibile, altrimenti usa il nome del canale
        const id = `tv|${channel.tvg?.id || channel.name}`;
        
        // Usa tvg-name se disponibile, altrimenti usa il nome originale
        const name = channel.tvg?.name || channel.name;
        
        // Aggiungi il genere alla lista dei generi
        if (channel.group) {
            this.stremioData.genres.add(channel.group);
        }

        const transformedChannel = {
            id,
            type: 'tv',
            name: name,
            genre: channel.group ? [channel.group] : [],
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
                url: channel.url,
                headers: channel.headers,
                tvg: channel.tvg || {}
            }
        };

        return transformedChannel;
    }

    /**
     * Parsa una playlist M3U
     */
    parseM3U(content) {
        console.log('\n=== Inizio Parsing Playlist M3U ===');
        const lines = content.split('\n');
        let currentChannel = null;
        
        // Reset dei dati
        this.stremioData.genres.clear();
        this.stremioData.channels = [];
        
        // Estrai l'URL dell'EPG dall'header della playlist
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
                // Estrai i metadati del canale
                const metadata = line.substring(8).trim();
                const tvgData = {};
                
                // Estrai attributi tvg
                const tvgMatches = metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || [];
                tvgMatches.forEach(match => {
                    const [key, value] = match.split('=');
                    const cleanKey = key.replace('tvg-', '');
                    tvgData[cleanKey] = value.replace(/"/g, '');
                });

                // Estrai il gruppo
                const groupMatch = metadata.match(/group-title="([^"]+)"/);
                const group = groupMatch ? groupMatch[1] : 'Altri';

                // Estrai il nome del canale e puliscilo
                const nameParts = metadata.split(',');
                let name = nameParts[nameParts.length - 1].trim();

                // Controlla se ci sono opzioni VLC nelle righe successive
                const { headers, nextIndex } = this.parseVLCOpts(lines, i + 1);
                i = nextIndex - 1; // Aggiorna l'indice del ciclo

                currentChannel = {
                    name,
                    group,
                    tvg: tvgData,
                    headers: headers
                };
            } else if (line.startsWith('http')) {
                if (currentChannel) {
                    currentChannel.url = line;
                    this.stremioData.channels.push(
                        this.transformChannelToStremio(currentChannel)
                    );
                    currentChannel = null;
                }
            }
        }

        const result = {
            genres: Array.from(this.stremioData.genres),
            channels: this.stremioData.channels,
            epgUrl
        };

        console.log(`[PlaylistTransformer] ✓ Canali processati: ${result.channels.length}`);
        console.log(`[PlaylistTransformer] ✓ Generi trovati: ${result.genres.length}`);
        console.log('=== Fine Parsing Playlist M3U ===\n');

        return result;
    }

    /**
     * Carica e trasforma una playlist da URL
     */
    async loadAndTransform(url) {
        try {
            console.log(`\nCaricamento playlist da: ${url}`);
            const response = await axios.get(url);
            console.log('✓ Playlist scaricata con successo');
            
            return this.parseM3U(response.data);
        } catch (error) {
            console.error('Errore nel caricamento della playlist:', error);
            throw error;
        }
    }
}

module.exports = PlaylistTransformer;
