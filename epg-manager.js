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
            console.error('Errore nel parsing della data EPG:', error);
            return null;
        }
    }

    async initializeEPG(url) {
        if (!this.programGuide.size) {
            await this.startEPGUpdate(url); // Attendiamo il completamento dell'aggiornamento EPG
        }
        cron.schedule('0 3 * * *', () => this.startEPGUpdate(url)); // Pianifica aggiornamenti futuri
    }

    async downloadAndProcessEPG(epgUrl) {
        console.log('Download EPG da:', epgUrl.trim());
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
                console.log('✓ Dati EPG decompressi con successo');
            } catch (gzipError) {
                try {
                    xmlString = zlib.inflateSync(response.data);
                    console.log('✓ Dati EPG decompressi con successo');
                } catch (zlibError) {
                    console.log('ℹ️  Utilizzo dati EPG non compressi');
                    xmlString = response.data.toString();
                }
            }

            const xmlData = await parseStringPromise(xmlString);
            await this.processEPGInChunks(xmlData);
            console.log('✓ Dati EPG processati con successo');
        } catch (error) {
            console.error(`❌ Errore nel download dell'EPG da ${epgUrl}:`, error.message);
        }
    }

    async startEPGUpdate(url) {
        if (this.isUpdating) {
            console.log('⚠️  Aggiornamento EPG già in corso, skip...');
            return;
        }

        console.log('\n=== Inizio Aggiornamento EPG ===');
        const startTime = Date.now();

        try {
            this.isUpdating = true;
            
            // Supporto per più URL separati da virgola o da file
            const epgUrls = typeof url === 'string' && url.includes(',') 
                ? url.split(',').map(u => u.trim()) 
                : await this.readExternalFile(url);

            // Pulisci la guida programmi esistente
            this.programGuide.clear();

            // Processa ogni URL EPG
            for (const epgUrl of epgUrls) {
                await this.downloadAndProcessEPG(epgUrl);
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n✓ Aggiornamento EPG completato in ${duration} secondi`);
            console.log(`✓ Totale canali con dati EPG: ${this.programGuide.size}`);
            console.log('=== Aggiornamento EPG Completato ===\n');

        } catch (error) {
            console.error('❌ Errore durante l\'aggiornamento EPG:', error);
        } finally {
            this.isUpdating = false;
            this.lastUpdate = Date.now();
        }
    }

    async processEPGInChunks(data) {
        if (!data.tv || !data.tv.programme) {
            console.warn('⚠️  Nessun dato programma trovato nell\'EPG');
            return;
        }

        const programmes = data.tv.programme;
        let totalProcessed = 0;
        
        console.log(`\nProcessamento di ${programmes.length} voci EPG in blocchi di ${this.CHUNK_SIZE}`);
        
        for (let i = 0; i < programmes.length; i += this.CHUNK_SIZE) {
            const chunk = programmes.slice(i, i + this.CHUNK_SIZE);
            
            for (const programme of chunk) {
                const channelId = programme.$.channel;

                if (!this.programGuide.has(channelId)) {
                    this.programGuide.set(channelId, []);
                }

                const start = this.parseEPGDate(programme.$.start);
                const stop = this.parseEPGDate(programme.$.stop);

                if (!start || !stop) continue;

                const programData = {
                    start,
                    stop,
                    title: programme.title?.[0]?._ || programme.title?.[0]?.$?.text || programme.title?.[0] || 'Nessun Titolo',
                    description: programme.desc?.[0]?._ || programme.desc?.[0]?.$?.text || programme.desc?.[0] || '',
                    category: programme.category?.[0]?._ || programme.category?.[0]?.$?.text || programme.category?.[0] || ''
                };

                this.programGuide.get(channelId).push(programData);
                totalProcessed++;
            }

            // Aggiornamento progresso per grandi dataset
            if ((i + this.CHUNK_SIZE) % 50000 === 0) {
                console.log(`Progresso: processate ${i + this.CHUNK_SIZE} voci...`);
            }
        }

        // Ordina i programmi per ogni canale
        for (const [channelId, programs] of this.programGuide.entries()) {
            this.programGuide.set(channelId, programs.sort((a, b) => a.start - b.start));
        }

        console.log('\nRiepilogo Processamento EPG:');
        console.log(`✓ Totale voci processate: ${totalProcessed}`);
    }

    async readExternalFile(url) {
        try {
            const response = await axios.get(url.trim());
            return response.data.split('\n')
                .filter(line => line.trim() !== '' && line.startsWith('http'));
        } catch (error) {
            console.error('Errore nella lettura del file esterno:', error);
            return [url]; // Restituisce l'URL originale se la lettura fallisce
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
            lastUpdate: this.lastUpdate ? this.formatDateIT(new Date(this.lastUpdate)) : 'Mai',
            channelsCount: this.programGuide.size,
            programsCount: Array.from(this.programGuide.values())
                          .reduce((acc, progs) => acc + progs.length, 0),
            timezone: this.timeZoneOffset
        };
    }

    /**
     * Verifica quali canali della playlist non hanno dati EPG associati
     * @param {Array} m3uChannels - Lista dei canali dalla playlist M3U
     */
    checkMissingEPG(m3uChannels) {
        const epgChannels = Array.from(this.programGuide.keys());
        const m3uIds = new Set(m3uChannels.map(ch => ch.streamInfo?.tvg?.id));

        const missingEPG = [];
        m3uChannels.forEach(ch => {
            if (!epgChannels.includes(ch.streamInfo?.tvg?.id)) {
                missingEPG.push(ch);
            }
        });

        if (missingEPG.length > 0) {
            console.log('\n=== Canali M3U senza EPG ===');
            console.log(`✓ Totale canali M3U senza EPG: ${missingEPG.length}`);
            missingEPG.forEach(ch => {
                console.log(`- ${ch.name} (ID: ${ch.streamInfo?.tvg?.id})`);
            });
            console.log('=============================\n');
        }
    }
}

module.exports = new EPGManager();
