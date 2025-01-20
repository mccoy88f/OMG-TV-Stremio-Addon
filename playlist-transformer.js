const axios = require('axios');
const fs = require('fs');
const path = require('path');
const EPGManager = require('./epg-manager');

class PlaylistTransformer {
    constructor() {
        this.stremioData = {
            genres: new Set(),
            channels: []
        };
        this.remappingRules = new Map();
    }

    async loadRemappingRules() {
        const remappingPath = path.join(__dirname, 'link.epg.remapping');
        console.log('\n=== Caricamento Regole di Remapping ===');
        console.log('Percorso file remapping:', remappingPath);

        try {
            const content = await fs.promises.readFile(remappingPath, 'utf8');
            let ruleCount = 0;
            let skippedCount = 0;

            content.split('\n').forEach((line, index) => {
                line = line.trim();
                if (!line || line.startsWith('#')) return;

                const [m3uId, epgId] = line.split('=').map(s => s.trim().toLowerCase());
                if (!m3uId || !epgId) {
                    console.log(`⚠️  Ignorata regola non valida alla linea ${index + 1}`);
                    skippedCount++;
                    return;
                }

                this.remappingRules.set(m3uId, epgId);
                ruleCount++;
            });

            console.log(`✓ Caricate ${ruleCount} regole di remapping`);
            if (skippedCount > 0) {
                console.log(`⚠️  Ignorate ${skippedCount} regole non valide`);
            }
            console.log('=== Regole di Remapping Caricate ===\n');

        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('ℹ️  Nessun file di remapping trovato - verrà utilizzato il mapping diretto');
            } else {
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

    applyRemapping(channel) {
        let channelId = (channel.tvg?.id || channel.name.trim()).toLowerCase();

        // Applica il remapping se esiste una regola
        if (this.remappingRules.has(channelId)) {
            const remappedId = this.remappingRules.get(channelId).toLowerCase();
            console.log(`✓ Applicato remapping: ${channelId} -> ${remappedId}`);
            channelId = remappedId;
        }

        return channelId;
    }

    transformChannelToStremio(channel) {
        const channelId = this.applyRemapping(channel);

        // Controlla se il canale esiste già
        const existingChannel = this.stremioData.channels.find(ch => 
            ch.streamInfo.tvg.id.toLowerCase() === channelId.toLowerCase()
        );

        if (existingChannel) {
            // Se il canale esiste, aggiungi il nuovo URL alla lista dei flussi
            existingChannel.streamInfo.urls.push({
                url: channel.url,
                name: channel.name // Mantieni il nome specifico del flusso
            });
            console.log(`✓ Aggiunto flusso aggiuntivo per il canale: ${channelId}`);
            return null; // Non creare un nuovo canale
        }

        // Se il canale non esiste, crea un nuovo canale
        const id = `tv|${channelId}`;
        const name = channel.tvg?.name || channel.name; // Usa il nome del tvg-id come nome principale
        const group = channel.group || "Altri canali";
        this.stremioData.genres.add(group);

        const transformedChannel = {
            id,
            type: 'tv',
            name: name, // Nome principale del canale (tvg-id)
            genre: [group],
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
                urls: [{ url: channel.url, name: channel.name }], // Inizializza con il primo URL e il nome specifico
                headers: channel.headers,
                tvg: {
                    ...channel.tvg,
                    id: channelId,
                    name: name
                }
            }
        };

        this.stremioData.channels.push(transformedChannel);
        return transformedChannel;
    }

    async parseM3U(content) {
        console.log('\n=== Inizio Parsing Playlist M3U ===');
        const lines = content.split('\n');
        let currentChannel = null;
        
        this.stremioData.genres.clear();
        this.stremioData.channels = [];
        this.stremioData.genres.add("Altri canali");
        
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
                let name = nameParts[nameParts.length - 1].trim();

                const { headers, nextIndex } = this.parseVLCOpts(lines, i + 1);
                i = nextIndex - 1;

                currentChannel = {
                    name,
                    group,
                    tvg: tvgData,
                    headers: headers
                };
            } else if (line.startsWith('http')) {
                if (currentChannel) {
                    currentChannel.url = line;
                    const transformedChannel = this.transformChannelToStremio(currentChannel);
                    if (transformedChannel) {
                        this.stremioData.channels.push(transformedChannel);
                    }
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

    async loadAndTransform(url) {
        try {
            console.log(`\nCaricamento playlist da: ${url}`);
            await this.loadRemappingRules();
            const playlistUrls = await readExternalFile(url);
            const allChannels = [];
            const allGenres = new Set();
            const allEpgUrls = [];

            for (const playlistUrl of playlistUrls) {
                const response = await axios.get(playlistUrl);
                console.log('✓ Playlist scaricata con successo:', playlistUrl);
                
                const result = await this.parseM3U(response.data);
                result.channels.forEach(channel => {
                    if (!allChannels.some(existingChannel => existingChannel.id === channel.id)) {
                        allChannels.push(channel);
                    }
                });
                result.genres.forEach(genre => allGenres.add(genre));
                
                if (result.epgUrl && !allEpgUrls.includes(result.epgUrl)) {
                    allEpgUrls.push(result.epgUrl);
                    console.log('EPG URL trovato:', result.epgUrl);
                }
            }

            return {
                genres: Array.from(allGenres),
                channels: allChannels,
                epgUrls: allEpgUrls // Restituisci una lista di URL EPG trovati
            };
        } catch (error) {
            console.error('Errore nel caricamento della playlist:', error);
            throw error;
        }
    }
}

async function readExternalFile(url) {
    try {
        const response = await axios.get(url);
        const content = response.data;

        if (content.trim().startsWith('#EXTM3U')) {
            console.log('Rilevata playlist M3U diretta');
            return [url];
        }

        console.log('Rilevato file con lista di URL');
        return content.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('Errore nel leggere il file esterno:', error);
        throw error;
    }
}

module.exports = PlaylistTransformer;
