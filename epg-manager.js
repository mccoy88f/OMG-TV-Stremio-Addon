const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const _7z = require('7zip-min');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
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
            return null;
        }
    }

    async initializeEPG(url) {
        if (!this.programGuide.size) {
            await this.startEPGUpdate(url);
        }
        cron.schedule('0 3 * * *', () => this.startEPGUpdate(url));
    }

    async decompressData(data) {
        try {
            // Crea una directory temporanea
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epg-'));
            const archivePath = path.join(tempDir, 'compressed.7z');
            const extractPath = path.join(tempDir, 'extracted');

            // Scrivi i dati compressi su file temporaneo
            await fs.writeFile(archivePath, data);
            await fs.mkdir(extractPath, { recursive: true });

            // Wrappa il metodo unpack di 7zip-min in una Promise
            return new Promise((resolve, reject) => {
                _7z.unpack(archivePath, extractPath, async (err) => {
                    try {
                        if (err) {
                            console.log('Decompressione fallita:', err);
                            resolve(data.toString('utf8'));
                            return;
                        }

                        console.log('Decompressione completata, cerco file XML...');
                        const files = await fs.readdir(extractPath);
                        const xmlFile = files.find(file => file.toLowerCase().endsWith('.xml'));

                        if (xmlFile) {
                            console.log('Trovato file XML:', xmlFile);
                            console.log('Inizio lettura del file XML...');
                            try {
                                // Impostiamo un timeout di 30 secondi per la lettura
                                const timeoutPromise = new Promise((_, reject) => {
                                    setTimeout(() => reject(new Error('Timeout lettura XML')), 30000);
                                });
                                
                                const readPromise = fs.readFile(path.join(extractPath, xmlFile), 'utf8');
                                const xmlContent = await Promise.race([readPromise, timeoutPromise]);
                                
                                console.log('File XML letto con successo, dimensione:', Math.round(xmlContent.length / 1024), 'KB');
                                resolve(xmlContent);
                            } catch (readError) {
                                console.error('Errore durante la lettura del file XML:', readError.message);
                                resolve(data.toString('utf8'));
                        } else {
                            console.log('Nessun file XML trovato, uso contenuto diretto');
                            resolve(data.toString('utf8'));
                        }
                    } catch (error) {
                        console.log('Errore durante la lettura:', error);
                        resolve(data.toString('utf8'));
                    } finally {
                        // Pulisci i file temporanei
                        fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
                    }
                });
            });
        } catch (error) {
            console.log('Errore nella decompressione:', error);
            return data.toString('utf8');
        }
    }

    async startEPGUpdate(url) {
        if (this.isUpdating) return;
        console.log('\n=== Inizio Aggiornamento EPG ===');
        const startTime = Date.now();

        // Impostiamo un timeout globale di 5 minuti
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout globale aggiornamento EPG')), 300000);
        });

        try {
            this.isUpdating = true;
            console.log('Scaricamento EPG da:', url);

            const response = await axios.get(url, { 
                responseType: 'arraybuffer'
            });

            // Decompressione con 7zip-min e timeout
            let xmlContent = await Promise.race([
                this.decompressData(response.data),
                timeoutPromise
            ]);

            // Pulisci il contenuto XML
            xmlContent = xmlContent
                .replace(/^\uFEFF/, '') // Rimuove BOM
                .replace(/^[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]*/, '') // Rimuove caratteri di controllo
                .trim();

            const xmlData = await parseStringPromise(xmlContent);
            this.programGuide.clear();
            await this.processEPGInChunks(xmlData);
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n✓ Aggiornamento EPG completato in ${duration} secondi`);
            console.log('=== Fine Aggiornamento EPG ===\n');

        } catch (error) {
            console.error('Errore EPG:', error.message);
            console.error('Stack trace:', error.stack);
        } finally {
            this.isUpdating = false;
        }
    }

    async processEPGInChunks(data) {
        if (!data.tv || !data.tv.programme) return;

        const programmes = data.tv.programme;
        
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
                    title: programme.title?.[0]?._ || programme.title?.[0]?.$?.text || programme.title?.[0] || 'Nessun titolo',
                    description: programme.desc?.[0]?._ || programme.desc?.[0]?.$?.text || programme.desc?.[0] || '',
                    category: programme.category?.[0]?._ || programme.category?.[0]?.$?.text || programme.category?.[0] || ''
                };

                this.programGuide.get(channelId).push(programData);
            }
        }

        for (const [channelId, programs] of this.programGuide.entries()) {
            this.programGuide.set(channelId, programs.sort((a, b) => a.start - b.start));
        }

        this.lastUpdate = Date.now();
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
}

module.exports = new EPGManager();
