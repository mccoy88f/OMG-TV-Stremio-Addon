const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const cron = require('node-cron');

class PythonRunner {
    constructor() {
        this.scriptPath = path.join(__dirname, 'temp_script.py');
        this.m3uOutputPath = path.join(__dirname, 'generated_playlist.m3u');
        this.lastExecution = null;
        this.lastError = null;
        this.isRunning = false;
        this.scriptUrl = null;
        this.cronJob = null;
        this.updateInterval = null;
        
        // Crea la directory temp se non esiste
        if (!fs.existsSync(path.join(__dirname, 'temp'))) {
            fs.mkdirSync(path.join(__dirname, 'temp'));
        }
    }

    /**
     * Scarica lo script Python dall'URL fornito
     * @param {string} url - L'URL dello script Python
     * @returns {Promise<boolean>} - true se il download è avvenuto con successo
     */
    async downloadScript(url) {
        try {
            console.log(`\n=== Download script Python da ${url} ===`);
            this.scriptUrl = url;
            
            const response = await axios.get(url, { responseType: 'text' });
            fs.writeFileSync(this.scriptPath, response.data);
            
            console.log('✓ Script Python scaricato con successo');
            return true;
        } catch (error) {
            console.error('❌ Errore durante il download dello script Python:', error.message);
            this.lastError = `Errore download: ${error.message}`;
            return false;
        }
    }

    /**
     * Esegue lo script Python scaricato
     * @returns {Promise<boolean>} - true se l'esecuzione è avvenuta con successo
     */
    async executeScript() {
        if (this.isRunning) {
            console.log('⚠️ Un\'esecuzione è già in corso, attendere...');
            return false;
        }

        if (!fs.existsSync(this.scriptPath)) {
            console.error('❌ Script Python non trovato. Eseguire prima downloadScript()');
            this.lastError = 'Script Python non trovato';
            return false;
        }

        try {
            this.isRunning = true;
            console.log('\n=== Esecuzione script Python ===');
            
            // Elimina eventuali file M3U esistenti prima dell'esecuzione
            this.cleanupM3UFiles();
            
            // Controlla se Python è installato
            await execAsync('python3 --version').catch(() => 
                execAsync('python --version')
            );
            
            // Esegui lo script Python
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            const { stdout, stderr } = await execAsync(`${pythonCmd} ${this.scriptPath}`);
            
            if (stderr) {
                console.warn('⚠️ Warning durante l\'esecuzione:', stderr);
            }
            
            console.log('Output script:', stdout);
            
            // Cerca qualsiasi file M3U/M3U8 generato e rinominalo
            const foundFiles = this.findAllM3UFiles();
            
            if (foundFiles.length > 0) {
                console.log(`✓ Trovati ${foundFiles.length} file M3U/M3U8`);
                
                // Prendi il primo file trovato e rinominalo
                const sourcePath = foundFiles[0];
                
                // Se il file destinazione esiste già, eliminalo
                if (fs.existsSync(this.m3uOutputPath)) {
                    fs.unlinkSync(this.m3uOutputPath);
                }
                
                // Rinomina o copia il file
                if (sourcePath !== this.m3uOutputPath) {
                    fs.copyFileSync(sourcePath, this.m3uOutputPath);
                    console.log(`✓ File rinominato/copiato da "${sourcePath}" a "${this.m3uOutputPath}"`);
                    
                    // Opzionale: elimina il file originale dopo la copia
                    // fs.unlinkSync(sourcePath);
                }
                
                this.lastExecution = new Date();
                this.lastError = null;
                this.isRunning = false;
                return true;
            } else {
                // Prova a cercare percorsi nel testo dell'output
                const possiblePath = this.findM3UPathFromOutput(stdout);
                if (possiblePath && fs.existsSync(possiblePath)) {
                    fs.copyFileSync(possiblePath, this.m3uOutputPath);
                    console.log(`✓ File M3U trovato in ${possiblePath} e copiato in ${this.m3uOutputPath}`);
                    this.lastExecution = new Date();
                    this.lastError = null;
                    this.isRunning = false;
                    return true;
                }
                
                console.error('❌ Nessun file M3U trovato dopo l\'esecuzione dello script');
                this.lastError = 'File M3U non generato dallo script';
                this.isRunning = false;
                return false;
            }
        } catch (error) {
            console.error('❌ Errore durante l\'esecuzione dello script Python:', error.message);
            this.lastError = `Errore esecuzione: ${error.message}`;
            this.isRunning = false;
            return false;
        }
    }

    /**
     * Imposta un aggiornamento automatico dello script con la pianificazione specificata
     * @param {string} timeFormat - Formato orario "HH:MM" o "H:MM"
     * @returns {boolean} - true se la pianificazione è stata impostata con successo
     */
    scheduleUpdate(timeFormat) {
        // Ferma eventuali pianificazioni esistenti
        this.stopScheduledUpdates();
        
        // Validazione del formato orario
        if (!timeFormat || !/^\d{1,2}:\d{2}$/.test(timeFormat)) {
            console.error('❌ Formato orario non valido. Usa HH:MM o H:MM');
            this.lastError = 'Formato orario non valido. Usa HH:MM o H:MM';
            return false;
        }
        
        try {
            // Estrai ore e minuti
            const [hours, minutes] = timeFormat.split(':').map(Number);
            
            if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                console.error('❌ Orario non valido. Ore: 0-23, Minuti: 0-59');
                this.lastError = 'Orario non valido. Ore: 0-23, Minuti: 0-59';
                return false;
            }
            
            // Crea una pianificazione cron
            // Se è 0:30, esegui ogni 30 minuti
            // Se è 1:00, esegui ogni ora
            // Se è 12:00, esegui ogni 12 ore
            let cronExpression;
            
            if (hours === 0) {
                // Esegui ogni X minuti
                cronExpression = `*/${minutes} * * * *`;
                console.log(`✓ Pianificazione impostata: ogni ${minutes} minuti`);
            } else {
                // Esegui ogni X ore
                cronExpression = `${minutes} */${hours} * * *`;
                console.log(`✓ Pianificazione impostata: ogni ${hours} ore e ${minutes} minuti`);
            }
            
            this.cronJob = cron.schedule(cronExpression, async () => {
                console.log(`\n=== Esecuzione automatica script Python (${new Date().toLocaleString()}) ===`);
                const success = await this.executeScript();
                
                // Dopo l'esecuzione dello script, aggiorna la cache se necessario
                if (success) {
                    try {
                        // Ottieni le istanze necessarie
                        const config = require('./config');
                        const CacheManager = require('./cache-manager')(config);
                        
                        // Usa l'URL attualmente configurato nella cache
                        const currentM3uUrl = CacheManager.cache.m3uUrl;
                        
                        if (currentM3uUrl) {
                            console.log(`\n=== Ricostruzione cache dopo esecuzione automatica dello script ===`);
                            console.log(`Utilizzo l'URL corrente: ${currentM3uUrl}`);
                            await CacheManager.rebuildCache(currentM3uUrl);
                            console.log(`✓ Cache ricostruita con successo dopo esecuzione automatica`);
                        } else {
                            console.log(`❌ Nessun URL M3U configurato nella cache, impossibile ricostruire`);
                        }
                    } catch (cacheError) {
                        console.error(`❌ Errore nella ricostruzione della cache dopo esecuzione automatica:`, cacheError);
                    }
                }
            });
            
            this.updateInterval = timeFormat;
            console.log(`✓ Aggiornamento automatico configurato: ${timeFormat}`);
            return true;
        } catch (error) {
            console.error('❌ Errore nella pianificazione:', error.message);
            this.lastError = `Errore nella pianificazione: ${error.message}`;
            return false;
        }
    }
    
    /**
     * Ferma gli aggiornamenti pianificati
     */
    stopScheduledUpdates() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            this.updateInterval = null;
            console.log('✓ Aggiornamento automatico fermato');
            return true;
        }
        return false;
    }

    /**
     * Elimina eventuali file M3U/M3U8 esistenti
     */

    cleanupM3UFiles() {
        try {
            // Trova tutti i file M3U e M3U8 nella directory
            const dirFiles = fs.readdirSync(__dirname);
            const m3uFiles = dirFiles.filter(file => 
                file.endsWith('.m3u') || file.endsWith('.m3u8')
            );
    
            // Elimina ogni file M3U/M3U8 trovato
            m3uFiles.forEach(file => {
                const fullPath = path.join(__dirname, file);
                try {
                    fs.unlinkSync(fullPath);
                    console.log(`File ${fullPath} eliminato`);
                } catch (e) {
                    console.error(`Errore nell'eliminazione del file ${fullPath}:`, e.message);
                }
            });
    
            console.log(`✓ Eliminati ${m3uFiles.length} file M3U/M3U8`);
        } catch (error) {
            console.error('❌ Errore nella pulizia dei file M3U:', error.message);
        }
    }
    /**
     * Trova tutti i file M3U o M3U8 nella directory
     * @returns {string[]} - Array di percorsi dei file M3U trovati
     */
    findAllM3UFiles() {
        try {
            const dirFiles = fs.readdirSync(__dirname);
            return dirFiles
                .filter(file => file.endsWith('.m3u') || file.endsWith('.m3u8'))
                .map(file => path.join(__dirname, file));
        } catch (error) {
            console.error('Errore nella ricerca dei file M3U:', error.message);
            return [];
        }
    }

    /**
     * Cerca un percorso di file M3U nell'output dello script
     * @param {string} output - L'output dello script Python
     * @returns {string|null} - Il percorso del file M3U o null se non trovato
     */
    findM3UPathFromOutput(output) {
        // Cerca percorsi che terminano con .m3u o .m3u8
        const m3uPathRegex = /[\w\/\\\.]+\.m3u8?\b/g;
        const matches = output.match(m3uPathRegex);
        
        if (matches && matches.length > 0) {
            return matches[0];
        }
        
        return null;
    }

    /**
     * Legge il contenuto del file M3U generato
     * @returns {string|null} - Il contenuto del file M3U o null se non esiste
     */
// Aggiungi questa funzione al file python-runner.js, subito prima di getM3UContent()

/**
 * Aggiunge il canale speciale per la rigenerazione della playlist alla fine del file M3U
 * @returns {boolean} - true se l'operazione è avvenuta con successo
 */
    addRegenerateChannel() {
        try {
            if (!fs.existsSync(this.m3uOutputPath)) {
                console.error('❌ File M3U non trovato, impossibile aggiungere canale di rigenerazione');
                return false;
            }
    
            console.log('Aggiunta canale di rigenerazione al file M3U...');
            
            // Leggi il contenuto attuale del file
            const currentContent = fs.readFileSync(this.m3uOutputPath, 'utf8');
            
            // Prepara l'entry del canale speciale

            const specialChannel = `
#EXTINF:-1 tvg-id="rigeneraplaylistpython" tvg-name="Rigenera Playlist Python" tvg-logo="https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/tv.png" group-title="MANUTENZIONE",Rigenera Playlist Python
http://127.0.0.1/regenerate`;
            
            // Verifica se il canale già esiste nel file
            if (currentContent.includes('tvg-id="rigeneraplaylistpython"')) {
                console.log('Il canale di rigenerazione è già presente nel file M3U');
                return true;
            }
            
            // Aggiungi il canale speciale alla fine del file
            fs.appendFileSync(this.m3uOutputPath, specialChannel);
            console.log('✓ Canale di rigenerazione aggiunto con successo al file M3U');
            
            return true;
        } catch (error) {
            console.error('❌ Errore nell\'aggiunta del canale di rigenerazione:', error.message);
            return false;
        }
    }
    
    // Modifica la funzione executeScript per chiamare addRegenerateChannel
    async executeScript() {
        if (this.isRunning) {
            console.log('⚠️ Un\'esecuzione è già in corso, attendere...');
            return false;
        }
    
        if (!fs.existsSync(this.scriptPath)) {
            console.error('❌ Script Python non trovato. Eseguire prima downloadScript()');
            this.lastError = 'Script Python non trovato';
            return false;
        }
    
        try {
            this.isRunning = true;
            console.log('\n=== Esecuzione script Python ===');
            
            // Elimina eventuali file M3U esistenti prima dell'esecuzione
            this.cleanupM3UFiles();
            
            // Controlla se Python è installato
            await execAsync('python3 --version').catch(() => 
                execAsync('python --version')
            );
            
            // Esegui lo script Python
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            const { stdout, stderr } = await execAsync(`${pythonCmd} ${this.scriptPath}`);
            
            if (stderr) {
                console.warn('⚠️ Warning durante l\'esecuzione:', stderr);
            }
            
            console.log('Output script:', stdout);
            
            // Cerca qualsiasi file M3U/M3U8 generato e rinominalo
            const foundFiles = this.findAllM3UFiles();
            
            if (foundFiles.length > 0) {
                console.log(`✓ Trovati ${foundFiles.length} file M3U/M3U8`);
                
                // Prendi il primo file trovato e rinominalo
                const sourcePath = foundFiles[0];
                
                // Se il file destinazione esiste già, eliminalo
                if (fs.existsSync(this.m3uOutputPath)) {
                    fs.unlinkSync(this.m3uOutputPath);
                }
                
                // Rinomina o copia il file
                if (sourcePath !== this.m3uOutputPath) {
                    fs.copyFileSync(sourcePath, this.m3uOutputPath);
                    console.log(`✓ File rinominato/copiato da "${sourcePath}" a "${this.m3uOutputPath}"`);
                    
                    // Opzionale: elimina il file originale dopo la copia
                    // fs.unlinkSync(sourcePath);
                }
                
                // Aggiungi il canale di rigenerazione
                this.addRegenerateChannel();
                
                this.lastExecution = new Date();
                this.lastError = null;
                this.isRunning = false;
                return true;
            } else {
                // Prova a cercare percorsi nel testo dell'output
                const possiblePath = this.findM3UPathFromOutput(stdout);
                if (possiblePath && fs.existsSync(possiblePath)) {
                    fs.copyFileSync(possiblePath, this.m3uOutputPath);
                    console.log(`✓ File M3U trovato in ${possiblePath} e copiato in ${this.m3uOutputPath}`);
                    
                    // Aggiungi il canale di rigenerazione
                    this.addRegenerateChannel();
                    
                    this.lastExecution = new Date();
                    this.lastError = null;
                    this.isRunning = false;
                    return true;
                }
                
                console.error('❌ Nessun file M3U trovato dopo l\'esecuzione dello script');
                this.lastError = 'File M3U non generato dallo script';
                this.isRunning = false;
                return false;
            }
        } catch (error) {
            console.error('❌ Errore durante l\'esecuzione dello script Python:', error.message);
            this.lastError = `Errore esecuzione: ${error.message}`;
            this.isRunning = false;
            return false;
        }
    }
    
    getM3UContent() {
        try {
            if (fs.existsSync(this.m3uOutputPath)) {
                return fs.readFileSync(this.m3uOutputPath, 'utf8');
            }
            
            // Se il file standard non esiste, cerca altri file M3U
            const files = this.findAllM3UFiles();
            if (files.length > 0) {
                return fs.readFileSync(files[0], 'utf8');
            }
            
            return null;
        } catch (error) {
            console.error('❌ Errore nella lettura del file M3U:', error.message);
            return null;
        }
    }

    /**
     * Restituisce il percorso del file M3U generato
     * @returns {string} - Il percorso del file M3U
     */
    getM3UPath() {
        return this.m3uOutputPath;
    }

    /**
     * Restituisce lo stato attuale
     * @returns {Object} - Lo stato attuale
     */
    getStatus() {
        const m3uFiles = this.findAllM3UFiles();
        
        return {
            isRunning: this.isRunning,
            lastExecution: this.lastExecution ? this.formatDate(this.lastExecution) : 'Mai',
            lastError: this.lastError,
            m3uExists: fs.existsSync(this.m3uOutputPath),
            m3uFiles: m3uFiles.length,
            scriptExists: fs.existsSync(this.scriptPath),
            scriptUrl: this.scriptUrl,
            updateInterval: this.updateInterval,
            scheduledUpdates: this.cronJob !== null
        };
    }

    /**
     * Formatta una data in formato italiano
     * @param {Date} date - La data da formattare
     * @returns {string} - La data formattata
     */
    formatDate(date) {
        return date.toLocaleString('it-IT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

module.exports = new PythonRunner();
