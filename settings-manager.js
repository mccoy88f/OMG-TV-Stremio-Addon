const fs = require('fs').promises;
const path = require('path');

class SettingsManager {
    constructor() {
        this.settingsPath = path.join(__dirname, 'settings.json');
        this.defaultSettings = {
            M3U_URL: "",
            EPG_URL: "",
            enableEPG: false,
            PROXY_URL: null,
            PROXY_PASSWORD: null,
            FORCE_PROXY: false,
            ID_SUFFIX: ""
        };
    }

    async loadSettings() {
        try {
            const data = await fs.readFile(this.settingsPath, 'utf8');
            const settings = JSON.parse(data);
            
            // Validazioni
            if (!settings.M3U_URL) {
                settings.M3U_URL = "";
            }
            
            if (!settings.EPG_URL) {
                settings.enableEPG = false;
            }
            
            if (!settings.PROXY_URL || !settings.PROXY_PASSWORD) {
                settings.FORCE_PROXY = false;
                settings.PROXY_URL = null;
                settings.PROXY_PASSWORD = null;
            }

            return {
                ...this.defaultSettings,
                ...settings
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.saveSettings(this.defaultSettings);
                return this.defaultSettings;
            }
            throw error;
        }
    }

    async saveSettings(settings) {
        // Validazioni prima del salvataggio
        if (!settings.EPG_URL) {
            settings.enableEPG = false;
        }
        
        if (!settings.PROXY_URL || !settings.PROXY_PASSWORD) {
            settings.FORCE_PROXY = false;
            settings.PROXY_URL = null;
            settings.PROXY_PASSWORD = null;
        }

        await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2));
        return settings;
    }

    async updateSettings(newSettings) {
        const currentSettings = await this.loadSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };
        return this.saveSettings(updatedSettings);
    }

    async isFirstRun() {
        const settings = await this.loadSettings();
        return !settings.M3U_URL;
    }
}

module.exports = new SettingsManager();
