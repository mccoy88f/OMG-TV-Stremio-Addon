const axios = require('axios');
const fs = require('fs');
const path = require('path');
const EPGManager = require('./epg-manager'); // Importa l'EPGManager

class PlaylistTransformer {
    constructor() {
        this.stremioData = {
            genres: new Set(),
            channels: []
        };
        this.remappingRules = new Map(); // Mappa per le regole di remapping
    }

    /**
     * Carica le regole di remapping dal file link.epg.remapping
     */
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
                // Ignora linee vuote e commenti
                if (!line || line.startsWith('#')) return;

                const [m3uId, epgId] = line.split('=').map(s => s.trim());
                if (!m3uId || !epgId) {
                    console.log(`⚠️  Ignorata regola non valida alla linea ${index + 1}`);
                    skippedCount++;
                    return;
                }

                // Aggiungi la regola alla mappa
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
        // Usa tvg-id se disponibile, altrimenti genera un ID dal nome del canale
        let channelId = channel.tvg?.id || channel.name.trim();

        // Applica le regole di remapping se disponibili
        if (this.remappingRules.has(channelId)) {
            const remappedId = this.remappingRules.get(channelId);

            // Verifica se il remappedId è già stato utilizzato da un altro canale
            const isConflict = this.stremioData.channels.some(
                ch => ch.streamInfo.tvg.id === remappedId
            );

            if (isConflict) {
                console.warn(
                    `⚠️  Attenzione: conflitto di tvg-id per ${channelId} -> ${remappedId}. ` +
                    `Il tvg-id "${remappedId}" è già stato assegnato a un altro canale.`
                );
            }

            channelId = remappedId;
            console.log(`✓ Applicato remapping: ${channel.tvg?.id || channel.name} -> ${channelId}`);
        }

        const id = `tv|${channelId}`;
        
        // Usa tvg-name se disponibile, altrimenti usa il nome originale
        const name = channel.tvg?.name || channel.name;
        
        // Usa il gruppo se disponibile, altrimenti usa "Altri canali"
        const group = channel.group || "Altri canali";
        
        // Aggiungi il genere alla lista dei generi
        this.stremioData.genres.add(group);

        const transformedChannel = {
            id,
            type: 'tv',
            name: name,
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
                url: channel.url,
                headers: channel.headers,
                tvg: {
                    ...channel.tvg,
                    id: channelId,
                    name: name
                }
            }
        };

        return transformedChannel;
    }

    /**
     * Parsa una playlist M3U
     */
    async parseM3U(content) {
        console.log('\n=== Inizio Parsing Playlist M3U ===');
        const lines = content.split('\n');
        let currentChannel = null;
        
        // Reset dei dati
        this.stremioData.genres.clear();
        this.stremioData.channels = [];

        // Aggiungi "Altri canali" manualmente al Set dei generi
        this.stremioData.genres.add("Altri canali");
        
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
                const group = groupMatch ? groupMatch[1] : 'Altri canali';

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
            await this.loadRemappingRules(); // Carica le regole di remapping
            const playlistUrls = await readExternalFile(url);
            const allChannels = [];
            const allGenres = new Set();
            const allEpgUrls = []; // Array per memorizzare tutti gli URL EPG

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
                
                // Aggiungi l'URL EPG solo se non è già presente
                if (result.epgUrl && !allEpgUrls.includes(result.epgUrl)) {
                    allEpgUrls.push(result.epgUrl);
                    console.log('EPG URL trovato:', result.epgUrl);
                }
            }

            // Unisci tutti gli URL EPG trovati
            const combinedEpgUrl = allEpgUrls.length > 0 ? allEpgUrls.join(',') : null;

            // Inizializza l'EPGManager e scarica i dati EPG
            if (combinedEpgUrl) {
                await EPGManager.initializeEPG(combinedEpgUrl); // Attendiamo il completamento
            }

            // Log dei canali senza EPG (dopo aver scaricato l'EPG)
            EPGManager.logChannelsWithoutEPG(allChannels);

            return {
                genres: Array.from(allGenres),
                channels: allChannels,
                epgUrl: combinedEpgUrl
            };
        } catch (error) {
            console.error('Errore nel caricamento della playlist:', error);
            throw error;
        }
    }
}

// Funzione per leggere un file esterno (playlist o EPG)
async function readExternalFile(url) {
    try {
        const response = await axios.get(url);
        const content = response.data;

        // Verifica se il contenuto inizia con #EXTM3U (indicatore di una playlist M3U diretta)
        if (content.trim().startsWith('#EXTM3U')) {
            console.log('Rilevata playlist M3U diretta');
            return [url]; // Restituisce un array con solo l'URL diretto
        }

        // Altrimenti tratta il contenuto come una lista di URL
        console.log('Rilevato file con lista di URL');
        return content.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('Errore nel leggere il file esterno:', error);
        throw error;
    }
}

module.exports = PlaylistTransformer;
