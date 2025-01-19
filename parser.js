const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const gunzip = promisify(zlib.gunzip);

// Cache for remapping data
const REMAPPING_CACHE = {
    data: null,
    lastRead: 0
};

/**
 * Reads and parses external files (playlist or EPG)
 */
async function readExternalFile(url) {
    try {
        const response = await axios.get(url);
        return response.data.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('Error reading external file:', error);
        throw error;
    }
}

/**
 * Validates tvgId and channelId format
 */
function validateMappingIds(tvgId, channelId) {
    // Basic validation - can be extended based on specific requirements
    return (
        typeof tvgId === 'string' && 
        typeof channelId === 'string' && 
        tvgId.length > 0 && 
        channelId.length > 0 &&
        !tvgId.includes(' ') &&  // No spaces in IDs
        !channelId.includes(' ')
    );
}

/**
 * Loads and parses the remapping configuration file with enhanced error handling and validation
 */
async function loadRemappingFile() {
    const remappingFilePath = path.join(__dirname, 'link.epg.remapping');
    
    try {
        // Check if file exists
        const fileStats = await fs.promises.stat(remappingFilePath);
        
        // Use cached version if file hasn't changed
        if (REMAPPING_CACHE.data && REMAPPING_CACHE.lastRead >= fileStats.mtime.getTime()) {
            return REMAPPING_CACHE.data;
        }

        const data = await fs.promises.readFile(remappingFilePath, 'utf8');
        const remapping = new Map();
        const reverseMapping = new Map();
        const errors = [];
        
        data.split('\n').forEach((line, index) => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            
            const [tvgId, channelId] = line.split('=').map(s => s.trim());
            
            // Validation
            if (!tvgId || !channelId) {
                errors.push(`Line ${index + 1}: Invalid format`);
                return;
            }

            if (!validateMappingIds(tvgId, channelId)) {
                errors.push(`Line ${index + 1}: Invalid ID format`);
                return;
            }
            
            if (remapping.has(tvgId)) {
                errors.push(`Line ${index + 1}: Duplicate mapping for ${tvgId}`);
                return;
            }

            if (reverseMapping.has(channelId)) {
                errors.push(`Line ${index + 1}: Multiple mappings for channel ${channelId}`);
                return;
            }
            
            remapping.set(tvgId, channelId);
            reverseMapping.set(channelId, tvgId);
        });

        if (errors.length > 0) {
            console.warn('Warnings in remapping file:\n' + errors.join('\n'));
        }

        // Update cache
        REMAPPING_CACHE.data = {
            forward: remapping,
            reverse: reverseMapping
        };
        REMAPPING_CACHE.lastRead = Date.now();
        
        return REMAPPING_CACHE.data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No remapping file found - using default mappings');
            return { forward: new Map(), reverse: new Map() };
        }
        console.error('Error loading remapping file:', error);
        throw error;
    }
}

/**
 * Extracts EPG URL from M3U playlist
 */
function extractEPGUrl(m3uContent) {
    try {
        const firstLine = m3uContent.split('\n')[0];
        if (firstLine.includes('url-tvg=')) {
            const match = firstLine.match(/url-tvg="([^"]+)"/);
            return match ? match[1] : null;
        }
        return null;
    } catch (error) {
        console.error('Error extracting EPG URL:', error);
        return null;
    }
}

/**
 * Processes EPG data with enhanced remapping support
 */
function processEPGData(data, remappings) {
    const programmes = new Map();
    
    if (!data.tv || !data.tv.programme) {
        console.warn('No programme data found in EPG');
        return programmes;
    }

    const { forward: remapping, reverse: reverseRemapping } = remappings;
    const unmappedChannels = new Set();

    for (const programme of data.tv.programme) {
        let channelId = programme.$.channel;
        let mappedChannelId = channelId;

        // Try direct mapping
        if (remapping.has(channelId)) {
            mappedChannelId = remapping.get(channelId);
            console.debug(`Applied direct mapping: ${channelId} -> ${mappedChannelId}`);
        }
        // Try reverse mapping
        else if (reverseRemapping.has(channelId)) {
            const originalId = reverseRemapping.get(channelId);
            mappedChannelId = channelId;
            channelId = originalId;
            console.debug(`Applied reverse mapping: ${channelId} -> ${mappedChannelId}`);
        }
        // Track unmapped channels
        else {
            unmappedChannels.add(channelId);
        }

        if (!programmes.has(mappedChannelId)) {
            programmes.set(mappedChannelId, []);
        }

        try {
            const programData = {
                start: new Date(programme.$.start),
                stop: new Date(programme.$.stop),
                title: programme.title?.[0]?._ || programme.title?.[0] || 'No Title',
                description: programme.desc?.[0]?._ || programme.desc?.[0] || '',
                category: programme.category?.[0]?._ || programme.category?.[0] || ''
            };

            // Validate dates
            if (isNaN(programData.start.getTime()) || isNaN(programData.stop.getTime())) {
                console.warn(`Invalid date for program: ${programData.title} on channel ${mappedChannelId}`);
                continue;
            }

            programmes.get(mappedChannelId).push(programData);
        } catch (error) {
            console.error(`Error processing program for channel ${mappedChannelId}:`, error);
        }
    }

    // Sort programmes by start time
    for (const [channelId, programs] of programmes.entries()) {
        programmes.set(channelId, programs.sort((a, b) => a.start - b.start));
    }

    // Log statistics
    console.log(`Processed ${programmes.size} channels with EPG data`);
    if (unmappedChannels.size > 0) {
        console.warn(`Found ${unmappedChannels.size} unmapped channels:`, Array.from(unmappedChannels).join(', '));
    }

    return programmes;
}

/**
 * Parses M3U playlist with enhanced error handling
 */
async function parsePlaylist(url) {
    try {
        const playlistUrls = await readExternalFile(url);
        const allItems = [];
        const allGroups = new Set();
        let epgUrl = null;

        for (const playlistUrl of playlistUrls) {
            console.log(`Processing playlist: ${playlistUrl}`);
            const m3uResponse = await axios.get(playlistUrl);
            const m3uContent = m3uResponse.data;

            // Extract EPG URL from first playlist that has it
            if (!epgUrl) {
                epgUrl = extractEPGUrl(m3uContent);
                if (epgUrl) {
                    console.log('Found EPG URL:', epgUrl);
                }
            }

            const groups = new Set();
            const items = [];
            const lines = m3uContent.split('\n');
            let currentItem = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.startsWith('#EXTINF:')) {
                    try {
                        const metadata = line.substring(8).trim();
                        const tvgData = {};

                        // Extract TVG attributes
                        const tvgMatches = metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || [];
                        tvgMatches.forEach(match => {
                            const [key, value] = match.split('=');
                            const cleanKey = key.replace('tvg-', '');
                            tvgData[cleanKey] = value.replace(/"/g, '');
                        });

                        // Extract group
                        const groupMatch = metadata.match(/group-title="([^"]+)"/);
                        const group = groupMatch ? groupMatch[1] : 'Others';
                        groups.add(group);

                        // Extract channel name
                        const nameParts = metadata.split(',');
                        const name = nameParts[nameParts.length - 1].trim();

                        currentItem = {
                            name: name,
                            url: '',
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
                    } catch (error) {
                        console.error(`Error parsing EXTINF line ${i + 1}:`, error);
                        currentItem = null;
                    }
                } else if (line.startsWith('http')) {
                    if (currentItem) {
                        currentItem.url = line;
                        items.push(currentItem);
                        currentItem = null;
                    }
                }
            }

            // Merge items and groups
            items.forEach(item => {
                if (!allItems.some(existingItem => 
                    existingItem.tvg.id === item.tvg.id || 
                    existingItem.name === item.name)) {
                    allItems.push(item);
                }
            });
            groups.forEach(group => allGroups.add(group));
        }

        const uniqueGroups = Array.from(allGroups).sort();
        console.log('Unique groups found:', uniqueGroups);
        console.log('Total channels loaded:', allItems.length);

        return {
            items: allItems,
            groups: uniqueGroups.map(group => ({
                name: group,
                value: group
            })),
            epgUrl
        };
    } catch (error) {
        console.error('Error parsing playlist:', error);
        throw error;
    }
}

/**
 * Parses EPG with enhanced error handling and remapping support
 */
async function parseEPG(url) {
    try {
        const remappings = await loadRemappingFile();
        const epgUrls = await readExternalFile(url);
        const allProgrammes = new Map();

        for (const epgUrl of epgUrls) {
            console.log('Downloading EPG from:', epgUrl);
            
            try {
                const response = await axios.get(epgUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 30000 // 30 second timeout
                });

                let decompressed;
                try {
                    decompressed = await gunzip(response.data);
                } catch (error) {
                    console.log('Not gzipped, using raw data');
                    decompressed = response.data;
                }

                const xmlData = await parseStringPromise(decompressed.toString());
                const programmes = processEPGData(xmlData, remappings);
                
                // Merge programmes
                programmes.forEach((value, key) => {
                    if (!allProgrammes.has(key)) {
                        allProgrammes.set(key, value);
                    } else {
                        // Merge and deduplicate programmes
                        const existing = allProgrammes.get(key);
                        const merged = [...existing, ...value];
                        const uniqueMerged = Array.from(new Map(
                            merged.map(item => [item.start.getTime(), item])
                        ).values());
                        allProgrammes.set(key, uniqueMerged.sort((a, b) => a.start - b.start));
                    }
                });
            } catch (error) {
                console.error(`Error processing EPG URL ${epgUrl}:`, error);
                // Continue with next URL
            }
        }

        return allProgrammes;
    } catch (error) {
        console.error('Error in EPG parsing:', error);
        throw error;
    }
}

/**
 * Gets channel information from EPG
 */
function getChannelInfo(epgData, channelName) {
    if (!epgData || !channelName) {
        return { icon: null, description: null };
    }

    const channel = epgData.get(channelName);
    if (!channel) {
        return { icon: null, description: null };
    }

    const now = new Date();
    const currentProgram = channel.find(program =>
        program.start <= now && program.stop >= now
    );

    return {
        icon: null, // EPG Italia does not provide icons
        description: currentProgram ?
            `${currentProgram.title}\n${currentProgram.description || ''}` :
            null
    };
}

module.exports = {
    parsePlaylist,
    parseEPG,
    getChannelInfo,
    loadRemappingFile  // Exposed for testing
};
