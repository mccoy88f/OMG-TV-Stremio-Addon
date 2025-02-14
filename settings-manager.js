const fs = require('fs').promises;
const path = require('path');

class SettingsManager {
    constructor() {
        // Usa il percorso relativo alla directory corrente
        this.settingsPath = path.join(process.cwd(), 'data', 'settings.json');
        this.defaultSettings = {
            M3U_URL: "",
            EPG_URL: "",
            enableEPG: false,
            PROXY_URL: null,
            PROXY_PASSWORD: null,
            FORCE_PROXY: false,
            ID_SUFFIX: ""
        };
        console.log('Settings path configurato:', this.settingsPath);
    }

    async ensureSettingsDirectory() {
        const dir = path.dirname(this.settingsPath);
        try {
            await fs.mkdir(dir, { recursive: true, mode: 0o777 });
            console.log('Directory settings creata/verificata:', dir);
        } catch (error) {
            console.error('Errore nella creazione della directory settings:', error);
            throw error;
        }
    }

    async loadSettings() {
        try {
            await this.ensureSettingsDirectory();
            console.log('[Settings] Verifica esistenza file:', this.settingsPath);
            
            try {
                await fs.access(this.settingsPath);
                console.log('[Settings] File esistente, caricamento...');
            } catch {
                console.log('[Settings] File non trovato');
                throw { code: 'ENOENT' };
            }
            
            const data = await fs.readFile(this.settingsPath, 'utf8');
            const settings = JSON.parse(data);
            
            console.log('[Settings] Contenuto file:', settings);
            return { ...this.defaultSettings, ...settings };
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('[Settings] Creazione nuovo file con default settings');
                await this.saveSettings(this.defaultSettings);
                return this.defaultSettings;
            }
            console.error('[Settings] Errore critico:', error);
            throw error;
        }
    }

    async saveSettings(settings) {
        try {
            console.log('Salvataggio settings in:', this.settingsPath);
            await this.ensureSettingsDirectory();
            
            // Merge con i default settings
            const settingsToSave = { ...this.defaultSettings, ...settings };
            
            await fs.writeFile(this.settingsPath, JSON.stringify(settingsToSave, null, 2), { 
                mode: 0o666,
                flag: 'w'
            });
            console.log('Settings salvati con successo:', settingsToSave);
            
            // Verifica del salvataggio
            const savedContent = await fs.readFile(this.settingsPath, 'utf8');
            const parsedContent = JSON.parse(savedContent);
            console.log('Verifica settings salvati:', parsedContent);
            
            return settingsToSave;
        } catch (error) {
            console.error('Errore nel salvataggio settings:', error);
            console.error('Directory corrente:', process.cwd());
            console.error('Percorso settings tentato:', this.settingsPath);
            throw error;
        }
    }

    async updateSettings(newSettings) {
        try {
            console.log('Aggiornamento settings con:', newSettings);
            const currentSettings = await this.loadSettings();
            const updatedSettings = { ...currentSettings, ...newSettings };
            return await this.saveSettings(updatedSettings);
        } catch (error) {
            console.error('Errore nell\'aggiornamento settings:', error);
            throw error;
        }
    }

    async isFirstRun() {
        try {
            const settings = await this.loadSettings();
            const isFirst = !settings.M3U_URL;
            console.log('Controllo primo avvio:', isFirst);
            return isFirst;
        } catch (error) {
            console.error('Errore nel controllo primo avvio:', error);
            return true;
        }
    }
}

module.exports = new SettingsManager();
