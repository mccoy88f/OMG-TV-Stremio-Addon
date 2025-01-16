const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

// Funzione per estrarre l'URL EPG dalla playlist M3U
function extractEPGUrl(m3uContent) {
    const firstLine = m3uContent.split('\n')[0];
    if (firstLine.includes('url-tvg=')) {
        const match = firstLine.match(/url-tvg="([^"]+)"/);
        return match ? match[1] : null;
    }
    return null;
}

// Funzione per parsare la playlist M3U
async function parsePlaylist(url) {
    try {
        const m3uResponse = await axios.get(url);
        const m3uContent = m3uResponse.data;

        // Estrai l'URL dell'EPG
        const epgUrl = extractEPGUrl(m3uContent);

        // Estrai i gruppi unici (generi)
        const groups = new Set();
        const items = [];

        // Dividi la playlist in righe
        const lines = m3uContent.split('\n');
        let currentItem = null;

        for (const line of lines) {
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
                groups.add(group);

                // Estrai il nome del canale (ultima parte dopo la virgola)
                const nameParts = metadata.split(',');
                const name = nameParts[nameParts.length - 1].trim();

                // Crea l'oggetto canale
                currentItem = {
                    name: name,
                    url: '', // Sarà impostato nella prossima riga
                    tvg: {
                        id: tvgData.id || null,
                        name: tvgData.name || name,
                        logo: tvgData.logo || null,
                        chno: tvgData.chno ? parseInt(tvgData.chno, 10) : null
                    },
                    group: group,
                    headers: {
                        'User-Agent': 'HbbTV/1.6.1'
                    }
                };
            } else if (line.trim().startsWith('http')) {
                // Imposta l'URL del canale
                if (currentItem) {
                    currentItem.url = line.trim();
                    items.push(currentItem);
                    currentItem = null;
                }
            }
        }

        const uniqueGroups = Array.from(groups).sort();
        console.log('Gruppi unici trovati nel parser:', uniqueGroups);
        console.log('Playlist M3U caricata correttamente. Numero di canali:', items.length);
        
        return { 
            items, 
            groups: uniqueGroups.map(group => ({
                name: group,
                value: group
            })),
            epgUrl
        };
    } catch (error) {
        console.error('Errore nel parsing della playlist:', error);
        throw error;
    }
}

// Funzione per parsare l'EPG
async function parseEPG(url) {
    try {
        console.log('Scaricamento EPG da:', url);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const decompressed = await gunzip(response.data);
        const xmlData = await parseStringPromise(decompressed.toString());
        
        return processEPGData(xmlData);
    } catch (error) {
        console.error('Errore nel parsing dell\'EPG:', error);
        throw error;
    }
}

// Funzione per processare i dati EPG
function processEPGData(data) {
    const programmes = new Map();

    if (!data.tv || !data.tv.programme) {
        return programmes;
    }

    for (const programme of data.tv.programme) {
        const channelId = programme.$.channel;
        if (!programmes.has(channelId)) {
            programmes.set(channelId, []);
        }

        programmes.get(channelId).push({
            start: new Date(programme.$.start),
            stop: new Date(programme.$.stop),
            title: programme.title?.[0]?._,
            description: programme.desc?.[0]?._,
            category: programme.category?.[0]?._
        });
    }

    return programmes;
}

// Funzione per ottenere le informazioni del canale dall'EPG
function getChannelInfo(epgData, channelName) {
    if (!epgData || !channelName) {
        return {
            icon: null,
            description: null
        };
    }

    const channel = epgData.get(channelName);
    if (!channel) {
        return {
            icon: null,
            description: null
        };
    }

    // Trova il programma corrente
    const now = new Date();
    const currentProgram = channel.find(program => 
        program.start <= now && program.stop >= now
    );

    return {
        icon: null, // L'EPG Italia non fornisce icone
        description: currentProgram ? 
            `${currentProgram.title}\n${currentProgram.description || ''}` : 
            null
    };
}

module.exports = {
    parsePlaylist,
    parseEPG,
    getChannelInfo
};
