const fs = require('fs');
const path = require('path');

const baseConfig = {
    port: process.env.PORT || 10000,
    cacheSettings: {
        updateInterval: 12 * 60 * 60 * 1000,
        maxAge: 24 * 60 * 60 * 1000,
        retryAttempts: 3,
        retryDelay: 5000
    },
    epgSettings: {
        maxProgramsPerChannel: 50,
        updateInterval: 12 * 60 * 60 * 1000,
        cacheExpiry: 24 * 60 * 60 * 1000
    },
    manifest: {
        id: 'org.mccoy88f.omgtv',
        version: '3.3.0',
        name: 'OMG TV',
        description: 'Un add-on per Stremio con playlist di canali M3U predefinita, senza personalizzazione.',
        logo: 'https://github.com/mccoy88f/OMG-TV-Stremio-Addon/blob/main/tv.png?raw=true',
        resources: ['stream', 'catalog', 'meta'],
        types: ['tv'],
        idPrefixes: ['tv'],
        catalogs: [
            {
                type: 'tv',
                id: 'omg_tv',
                name: 'OMG TV',
                extra: [
                    {
                        name: 'genre',
                        isRequired: false,
                        options: []
                    },
                    {
                        name: 'search',
                        isRequired: false
                    },
                    {
                        name: 'skip',
                        isRequired: false
                    }
                ]
            }
        ],
        behaviorHints: {
            configurationURL: 'http://localhost:10000',
            reloadRequired: true
        }
    }
};

function loadCustomConfig() {
    const configOverridePath = path.join(__dirname, 'addon-config.json');
    
    try {
        const addonConfigExists = fs.existsSync(configOverridePath);

        if (addonConfigExists) {
            const customConfig = JSON.parse(fs.readFileSync(configOverridePath, 'utf8'));
            
            const mergedConfig = {
                ...baseConfig,
                manifest: {
                    ...baseConfig.manifest,
                    id: customConfig.addonId || baseConfig.manifest.id,
                    name: customConfig.addonName || baseConfig.manifest.name,
                    description: customConfig.addonDescription || baseConfig.manifest.description,
                    version: customConfig.addonVersion || baseConfig.manifest.version,
                    logo: customConfig.addonLogo || baseConfig.manifest.logo,
                    catalogs: [{
                        ...baseConfig.manifest.catalogs[0],
                        id: addonConfigExists ? 'omg_plus_tv' : baseConfig.manifest.catalogs[0].id,
                        name: addonConfigExists ? 'OMG+ TV' : baseConfig.manifest.catalogs[0].name
                    }]
                }
            };

            return mergedConfig;
        }
    } catch (error) {
        console.error('Errore nel caricare la configurazione personalizzata:', error);
    }

    return baseConfig;
}

const config = loadCustomConfig();

module.exports = config;
