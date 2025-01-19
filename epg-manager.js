const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const gunzip = promisify(zlib.gunzip);
const cron = require('node-cron');

class EPGManager {
    constructor() {
        this.epgData = null;
        this.programGuide = new Map();
        this.lastUpdate = null;
        this.isUpdating = false;
        this.CHUNK_SIZE = 10000;
        this.remappingCache = null;
        this.validateAndSetTimezone();
    }

    validateAndSetTimezone() {
        const tzRegex = /^[+-]\d{1,2}:\d{2}$/;
        const timeZone = process.env.TIMEZONE_OFFSET || '+1:00';
        
        if (!tzRegex.test(timeZone)) {
            this.timeZoneOffset = '+1:00';
            return;
        }
        
        this.timeZoneOffset = timeZone;
        const [hours, minutes] = this.timeZoneOffset.substring(1).split(':');
        this.offsetMinutes = (parseInt(hours) * 60 + parseInt(minutes)) * 
                           (this.timeZoneOffset.startsWith('+') ? 1 : -1);
    }

    async loadRemappingRules() {
        const remappingPath = path.join(__dirname, 'link.epg.remapping');
        console.log('\n=== Loading EPG Remapping Rules ===');
        console.log('Looking for remapping file at:', remappingPath);
        
        try {
            const content = await fs.promises.readFile(remappingPath, 'utf8');
            const rules = new Map();
            let ruleCount = 0;
            let skippedCount = 0;

            content.split('\n').forEach((line, index) => {
                line = line.trim();
                // Skip empty lines and comments
                if (!line || line.startsWith('#')) return;

                const [epgId, tvgId] = line.split('=').map(s => s.trim());
                if (!epgId || !tvgId) {
                    console.log(`⚠️  Skipping invalid rule at line ${index + 1}`);
                    skippedCount++;
                    return;
                }

                // Store IDs without 'tv|' prefix
                const cleanEpgId = epgId.replace('tv|', '');
                const cleanTvgId = tvgId.replace('tv|', '');
                rules.set(cleanEpgId, cleanTvgId);
                console.log(`Loaded rule: ${cleanEpgId} -> ${cleanTvgId}`);
                ruleCount++;
            });

            console.log(`✓ Loaded ${ruleCount} remapping rules`);
            if (skippedCount > 0) {
                console.log(`⚠️  Skipped ${skippedCount} invalid rules`);
            }
            console.log('=== Remapping Rules Loaded ===\n');
            return rules;

        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('ℹ️  No remapping file found - using direct channel mapping');
                return new Map();
            }
            console.error('❌ Error loading remapping file:', error);
            return new Map();
        }
    }

    formatDateIT(date) {
        if (!date) return '';
        const localDate = new Date(date.getTime() + (this.offsetMinutes * 60000));
        return localDate.toLocaleString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(/\./g, ':');
    }

    parseEPGDate(dateString) {
        if (!dateString) return null;
        try {
            const regex = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})$/;
            const match = dateString.match(regex);
            
            if (!match) return null;
            
            const [_, year, month, day, hour, minute, second, timezone] = match;
            const tzHours = timezone.substring(0, 3);
            const tzMinutes = timezone.substring(3);
            const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}${tzHours}:${tzMinutes}`;
            
            const date = new Date(isoString);
            return isNaN(date.getTime()) ? null : date;
        } catch (error) {
            console.error('Error parsing EPG date:', error);
            return null;
        }
    }

    async initializeEPG(url) {
        if (!this.programGuide.size) {
            await this.startEPGUpdate(url);
        }
        cron.schedule('0 3 * * *', () => this.startEPGUpdate(url));
    }

    async downloadAndProcessEPG(epgUrl) {
        console.log('Downloading EPG from:', epgUrl.trim());
        try {
            const response = await axios.get(epgUrl.trim(), { 
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });

            let xmlString;
            try {
                xmlString = await gunzip(response.data);
                console.log('✓ Successfully decompressed gzipped EPG data');
            } catch (gzipError) {
                try {
                    xmlString = zlib.inflateSync(response.data);
                    console.log('✓ Successfully decompressed inflated EPG data');
                } catch (zlibError) {
                    console.log('ℹ️  Using raw EPG data (not compressed)');
                    xmlString = response.data.toString();
                }
            }

            const xmlData = await parseStringPromise(xmlString);
            await this.processEPGInChunks(xmlData);
            console.log('✓ Successfully processed EPG data');
        } catch (error) {
            console.error(`❌ Error downloading EPG from ${epgUrl}:`, error.message);
        }
    }

    async startEPGUpdate(url) {
        if (this.isUpdating) {
            console.log('⚠️  EPG update already in progress, skipping...');
            return;
        }

        console.log('\n=== Starting EPG Update ===');
        const startTime = Date.now();

        try {
            this.isUpdating = true;
            
            // Load remapping rules
            const remappingRules = await this.loadRemappingRules();
            this.remappingCache = remappingRules;
            
            // Support multiple URLs separated by comma or from file
            const epgUrls = typeof url === 'string' && url.includes(',') 
                ? url.split(',').map(u => u.trim()) 
                : await this.readExternalFile(url);

            // Clear existing program guide
            this.programGuide.clear();

            // Process each EPG URL
            for (const epgUrl of epgUrls) {
                await this.downloadAndProcessEPG(epgUrl);
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n✓ EPG update completed in ${duration} seconds`);
            console.log(`✓ Total channels with EPG data: ${this.programGuide.size}`);
            console.log('=== EPG Update Complete ===\n');

        } catch (error) {
            console.error('❌ EPG update error:', error);
        } finally {
            this.isUpdating = false;
            this.lastUpdate = Date.now();
        }
    }

    async processEPGInChunks(data) {
        if (!data.tv || !data.tv.programme) {
            console.warn('⚠️  No programme data found in EPG');
            return;
        }

        const programmes = data.tv.programme;
        let totalProcessed = 0;
        let remappedCount = 0;
        const unmappedChannels = new Set();
        const remappedLog = new Map(); // To track unique remappings
        
        console.log(`\nProcessing ${programmes.length} EPG entries in chunks of ${this.CHUNK_SIZE}`);
        
        for (let i = 0; i < programmes.length; i += this.CHUNK_SIZE) {
            const chunk = programmes.slice(i, i + this.CHUNK_SIZE);
            
            for (const programme of chunk) {
                let channelId = programme.$.channel;
                // Remove 'tv|' prefix if present for comparison
                channelId = channelId.replace('tv|', '');
                let mappedChannelId = channelId;

                // Apply remapping if available
                if (this.remappingCache && this.remappingCache.has(channelId)) {
                    mappedChannelId = this.remappingCache.get(channelId);
                    remappedCount++;
                    if (!remappedLog.has(channelId)) {
                        remappedLog.set(channelId, mappedChannelId);
                    }
                } else {
                    unmappedChannels.add(channelId);
                }

                // Add 'tv|' prefix back if not present
                if (!mappedChannelId.startsWith('tv|')) {
                    mappedChannelId = `tv|${mappedChannelId}`;
                }

                if (!this.programGuide.has(mappedChannelId)) {
                    this.programGuide.set(mappedChannelId, []);
                }

                const start = this.parseEPGDate(programme.$.start);
                const stop = this.parseEPGDate(programme.$.stop);

                if (!start || !stop) continue;

                const programData = {
                    start,
                    stop,
                    title: programme.title?.[0]?._ || programme.title?.[0]?.$?.text || programme.title?.[0] || 'No Title',
                    description: programme.desc?.[0]?._ || programme.desc?.[0]?.$?.text || programme.desc?.[0] || '',
                    category: programme.category?.[0]?._ || programme.category?.[0]?.$?.text || programme.category?.[0] || ''
                };

                this.programGuide.get(mappedChannelId).push(programData);
                totalProcessed++;
            }

            // Progress update for large datasets
            if ((i + this.CHUNK_SIZE) % 50000 === 0) {
                console.log(`Progress: processed ${i + this.CHUNK_SIZE} entries...`);
            }
        }

        // Sort programs for each channel
        for (const [channelId, programs] of this.programGuide.entries()) {
            this.programGuide.set(channelId, programs.sort((a, b) => a.start - b.start));
        }

        // Log remapping statistics
        console.log('\nEPG Processing Summary:');
        console.log(`✓ Total entries processed: ${totalProcessed}`);
        console.log(`✓ Unique channels remapped: ${remappedLog.size}`);

        if (remappedLog.size > 0) {
            console.log('\nSuccessful Remappings:');
            for (const [from, to] of remappedLog) {
                console.log(`✓ ${from} -> ${to}`);
            }
        }

        if (unmappedChannels.size > 0) {
            console.log(`\nℹ️  Channels without remapping: ${unmappedChannels.size}`);
            if (unmappedChannels.size < 20) {
                console.log('Unmapped channels:');
                for (const channel of unmappedChannels) {
                    console.log(`• ${channel}`);
                }
            }
        }
    }

    async readExternalFile(url) {
        try {
            const response = await axios.get(url.trim());
            return response.data.split('\n')
                .filter(line => line.trim() !== '' && line.startsWith('http'));
        } catch (error) {
            console.error('Error reading external file:', error);
            return [url]; // Return original URL if reading fails
        }
    }

    getCurrentProgram(channelId) {
        const programs = this.programGuide.get(channelId);
        if (!programs?.length) return null;

        const now = new Date();
        const currentProgram = programs.find(program => program.start <= now && program.stop >= now);
        
        if (currentProgram) {
            return {
                ...currentProgram,
                start: this.formatDateIT(currentProgram.start),
                stop: this.formatDateIT(currentProgram.stop)
            };
        }
        
        return null;
    }

    getUpcomingPrograms(channelId) {
        const programs = this.programGuide.get(channelId);
        if (!programs?.length) return [];

        const now = new Date();
        
        return programs
            .filter(program => program.start >= now)
            .slice(0, 2)
            .map(program => ({
                ...program,
                start: this.formatDateIT(program.start),
                stop: this.formatDateIT(program.stop)
            }));
    }

    needsUpdate() {
        if (!this.lastUpdate) return true;
        return (Date.now() - this.lastUpdate) >= (24 * 60 * 60 * 1000);
    }

    isEPGAvailable() {
        return this.programGuide.size > 0 && !this.isUpdating;
    }

    getStatus() {
        return {
            isUpdating: this.isUpdating,
            lastUpdate: this.lastUpdate ? this.formatDateIT(new Date(this.lastUpdate)) : 'Never',
            channelsCount: this.programGuide.size,
            programsCount: Array.from(this.programGuide.values())
                          .reduce((acc, progs) => acc + progs.length, 0),
            timezone: this.timeZoneOffset,
            remappingRules: this.remappingCache ? this.remappingCache.size : 0
        };
    }
}

module.exports = new EPGManager();
