const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, 'addon-config.json');
        this.defaultConfig = {
            port: process.env.PORT || 10000,
            M3U_URL: process.env.M3U_URL || 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.playlist',
            EPG_URL: process.env.EPG_URL || 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.epg',
            enableEPG: process.env.ENABLE_EPG === 'false' ? false : true,
            PROXY_URL: process.env.PROXY_URL || null,
            PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
            FORCE_PROXY: process.env.FORCE_PROXY === 'yes',
            ID_SUFFIX: process.env.ID_SUFFIX || '',
            addonName: 'OMG TV',
            addonId: 'org.mccoy88f.omgtv',
            addonDescription: 'Un add-on per Stremio con playlist di canali M3U predefinita',
            addonVersion: '3.3.0',
            addonLogo: 'https://github.com/mccoy88f/OMG-TV-Stremio-Addon/blob/main/tv.png?raw=true'
        };
    }

    async loadConfig() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            const fileConfig = JSON.parse(data);
            return {
                ...this.defaultConfig,
                ...fileConfig,
                port: process.env.PORT || this.defaultConfig.port,
                M3U_URL: process.env.M3U_URL || fileConfig.M3U_URL || this.defaultConfig.M3U_URL,
                EPG_URL: process.env.EPG_URL || fileConfig.EPG_URL || this.defaultConfig.EPG_URL,
                enableEPG: process.env.ENABLE_EPG === 'false' ? false : (fileConfig.enableEPG ?? this.defaultConfig.enableEPG),
                PROXY_URL: process.env.PROXY_URL || fileConfig.PROXY_URL || this.defaultConfig.PROXY_URL,
                PROXY_PASSWORD: process.env.PROXY_PASSWORD || fileConfig.PROXY_PASSWORD || this.defaultConfig.PROXY_PASSWORD,
                FORCE_PROXY: process.env.FORCE_PROXY === 'yes' || fileConfig.FORCE_PROXY || this.defaultConfig.FORCE_PROXY,
                ID_SUFFIX: process.env.ID_SUFFIX || fileConfig.ID_SUFFIX || this.defaultConfig.ID_SUFFIX
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.saveConfig(this.defaultConfig);
                return this.defaultConfig;
            }
            throw error;
        }
    }

    async saveConfig(config) {
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
        return config;
    }

    async updateConfig(newConfig) {
        const currentConfig = await this.loadConfig();
        const updatedConfig = { ...currentConfig, ...newConfig };
        return this.saveConfig(updatedConfig);
    }
}

module.exports = new ConfigManager();
