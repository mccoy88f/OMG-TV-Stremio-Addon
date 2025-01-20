const axios = require('axios');
const fs = require('fs');

async function readExternalFile(url) {
    try {
        const response = await axios.get(url);
        const content = response.data;

        if (content.trim().startsWith('#EXTM3U')) {
            console.log('Detected direct M3U playlist');
            return [url];
        }

        console.log('Detected URL list file');
        return content.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('Error reading external file:', error);
        throw error;
    }
}

class PlaylistTransformer {
    constructor() {
        this.stremioData = {
            genres: new Set(),
            channels: []
        };
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

    transformChannelToStremio(channel) {
        const channelId = channel.tvg?.id || channel.name.trim();
        const id = `tv|${channelId}`;
        const name = channel.tvg?.name || channel.name;
        const group = channel.group || "Other Channels";
        this.stremioData.genres.add(group);

        return {
            id,
            type: 'tv',
            name: name,
            genre: [group],
            posterShape: 'square',
            poster: channel.tvg?.logo,
            background: channel.tvg?.logo,
            logo: channel.tvg?.logo,
            description: `Channel: ${name}`,
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
    }

    parseM3U(content) {
        console.log('\n=== Starting M3U Playlist Parsing ===');
        const lines = content.split('\n');
        let currentChannel = null;
        
        this.stremioData.genres.clear();
        this.stremioData.channels = [];
        this.stremioData.genres.add("Other Channels");
        
        let epgUrl = null;
        if (lines[0].includes('url-tvg=')) {
            const match = lines[0].match(/url-tvg="([^"]+)"/);
            if (match) {
                epgUrl = match[1];
                console.log('Found EPG URL in playlist:', epgUrl);
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('#EXTINF:')) {
                try {
                    const metadata = line.substring(8).trim();
                    const tvgData = {};
                    
                    const tvgMatches = metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || [];
                    tvgMatches.forEach(match => {
                        const [key, value] = match.split('=');
                        const cleanKey = key.replace('tvg-', '');
                        tvgData[cleanKey] = value.replace(/"/g, '');
                    });

                    const groupMatch = metadata.match(/group-title="([^"]+)"/);
                    const group = groupMatch ? groupMatch[1] : 'Other Channels';

                    const nameParts = metadata.split(',');
                    const name = nameParts[nameParts.length - 1].trim();

                    const { headers, nextIndex } = this.parseVLCOpts(lines, i + 1);
                    i = nextIndex - 1;

                    currentChannel = {
                        name,
                        group,
                        tvg: tvgData,
                        headers: {
                            ...headers,
                            'User-Agent': headers['User-Agent'] || 'HbbTV/1.6.1'
                        }
                    };

                    if (tvgData.id) {
                        console.log(`Found channel: ${name} (tvg-id: ${tvgData.id})`);
                    }
                } catch (error) {
                    console.error(`Error parsing channel at line ${i + 1}:`, error);
                    currentChannel = null;
                }
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

        console.log('M3U Parsing Summary:');
        console.log(`✓ Channels processed: ${result.channels.length}`);
        console.log(`✓ Genres found: ${result.genres.length}`);
        console.log('=== M3U Parsing Complete ===\n');

        return result;
    }

    async loadAndTransform(url) {
        try {
            console.log(`\nLoading playlist from: ${url}`);
            const playlistUrls = await readExternalFile(url);
            const allChannels = [];
            const allGenres = new Set();
            const allEpgUrls = [];

            for (const playlistUrl of playlistUrls) {
                try {
                    const response = await axios.get(playlistUrl);
                    console.log('✓ Successfully downloaded playlist:', playlistUrl);
                    
                    const result = this.parseM3U(response.data);

                    result.channels.forEach(channel => {
                        if (!allChannels.some(existingChannel => existingChannel.id === channel.id)) {
                            allChannels.push(channel);
                        }
                    });

                    result.genres.forEach(genre => allGenres.add(genre));
                    
                    if (result.epgUrl && !allEpgUrls.includes(result.epgUrl)) {
                        allEpgUrls.push(result.epgUrl);
                    }
                } catch (error) {
                    console.error(`Error processing playlist ${playlistUrl}:`, error);
                }
            }

            const combinedEpgUrl = allEpgUrls.length > 0 ? allEpgUrls.join(',') : null;
            const sortedChannels = allChannels.sort((a, b) => {
                const numA = parseInt(a.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
                const numB = parseInt(b.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
                return numA - numB || a.name.localeCompare(b.name);
            });

            console.log('\nPlaylist Processing Complete:');
            console.log(`✓ Total channels: ${sortedChannels.length}`);
            console.log(`✓ Total genres: ${allGenres.size}`);
            if (combinedEpgUrl) {
                console.log(`✓ EPG URLs found: ${allEpgUrls.length}`);
            }

            return {
                genres: Array.from(allGenres).sort(),
                channels: sortedChannels,
                epgUrl: combinedEpgUrl
            };
        } catch (error) {
            console.error('Error loading playlist:', error);
            throw error;
        }
    }
}

module.exports = PlaylistTransformer;
