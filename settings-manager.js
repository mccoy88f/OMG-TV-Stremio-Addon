const fs = require('fs').promises;
const path = require('path');

class SettingsManager {
    constructor() {
        this.settingsPath = path.join(__dirname, 'settings.json');
        this.defaultSettings = {
            M3U_URL: process.env.M3U_URL || 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.playlist',
            EPG_URL: process.env.EPG_URL || 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.epg',
            enableEPG: process.env.ENABLE_EPG === 'false' ? false : true,
            PROXY_URL: process.env.PROXY_URL || null,
            PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
            FORCE_PROXY: process.env.FORCE_PROXY === 'yes',
            ID_SUFFIX: process.env.ID_SUFFIX || ''
        };
    }

    async loadSettings() {
        try {
            const data = await fs.readFile(this.settingsPath, 'utf8');
            const fileSettings = JSON.parse(data);
            return {
                ...this.defaultSettings,
                ...fileSettings,
                // Le variabili d'ambiente hanno sempre priorità
                M3U_URL: process.env.M3U_URL || fileSettings.M3U_URL || this.defaultSettings.M3U_URL,
                EPG_URL: process.env.EPG_URL || fileSettings.EPG_URL || this.defaultSettings.EPG_URL,
                enableEPG: process.env.ENABLE_EPG === 'false' ? false : (fileSettings.enableEPG ?? this.defaultSettings.enableEPG),
                PROXY_URL: process.env.PROXY_URL || fileSettings.PROXY_URL || this.defaultSettings.PROXY_URL,
                PROXY_PASSWORD: process.env.PROXY_PASSWORD || fileSettings.PROXY_PASSWORD || this.defaultSettings.PROXY_PASSWORD,
                FORCE_PROXY: process.env.FORCE_PROXY === 'yes' || fileSettings.FORCE_PROXY || this.defaultSettings.FORCE_PROXY,
                ID_SUFFIX: process.env.ID_SUFFIX || fileSettings.ID_SUFFIX || this.defaultSettings.ID_SUFFIX
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
        await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2));
        return settings;
    }

    async updateSettings(newSettings) {
        const currentSettings = await this.loadSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };
        return this.saveSettings(updatedSettings);
    }
}

module.exports = new SettingsManager();
