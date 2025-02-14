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

    async ensureSettingsDirectory() {
        const dir = path.dirname(this.settingsPath);
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true, mode: 0o777 });
        }
    }

    async loadSettings() {
        try {
            await this.ensureSettingsDirectory();
            await fs.access(this.settingsPath);
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
        await this.ensureSettingsDirectory();
        await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2), { mode: 0o666 });
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
