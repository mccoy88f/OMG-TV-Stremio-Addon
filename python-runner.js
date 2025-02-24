const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class PythonRunner {
    constructor() {
        this.scriptPath = path.join(__dirname, 'temp_script.py');
        this.m3uOutputPath = path.join(__dirname, 'generated_playlist.m3u');
        this.lastExecution = null;
        this.lastError = null;
        this.isRunning = false;
        this.scriptUrl = null;
        
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
     * Elimina eventuali file M3U/M3U8 esistenti
     */
    cleanupM3UFiles() {
        // Elimina solo il file destinazione, non tutti i file M3U nella directory
        if (fs.existsSync(this.m3uOutputPath)) {
            try {
                fs.unlinkSync(this.m3uOutputPath);
                console.log(`File ${this.m3uOutputPath} eliminato`);
            } catch (e) {
                console.error(`Errore nella pulizia del file ${this.m3uOutputPath}:`, e.message);
            }
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
            scriptUrl: this.scriptUrl
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
