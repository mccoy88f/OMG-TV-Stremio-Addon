const PlaylistTransformer = require('./playlist-transformer');
const settingsManager = require('./settings-manager');

async function generateConfig(urlParams = {}, req = null) {
    try {
        console.log('\n=== Generazione Configurazione Iniziale ===');
        
        const settings = await settingsManager.loadSettings();
        const protocol = req ? (req.headers['x-forwarded-proto'] || req.protocol) : 'http';
        const host = req ? (req.headers['x-forwarded-host'] || req.get('host')) : 'localhost:' + config.port;
        
        const currentConfig = {
            ...settings,
            ...urlParams
        };

        if (!currentConfig.M3U_URL) {
            return {
                ...config,
                manifest: {
                    ...config.manifest,
                    behaviorHints: {
                        configurationURL: `${protocol}://${host}`,
                        reloadRequired: true
                    }
                }
            };
        }

        const transformer = new PlaylistTransformer();
        const data = await transformer.loadAndTransform(currentConfig.M3U_URL);
        
        return {
            ...currentConfig,
            manifest: {
                ...config.manifest,
                behaviorHints: {
                    configurationURL: `${protocol}://${host}`,
                    reloadRequired: true
                },
                catalogs: [{
                    ...config.manifest.catalogs[0],
                    extra: [{
                        name: 'genre',
                        isRequired: false,
                        options: data.genres
                    }, {
                        name: 'search',
                        isRequired: false
                    }, {
                        name: 'skip',
                        isRequired: false
                    }]
                }]
            }
        };
    } catch (error) {
        console.error('Errore durante la generazione della configurazione:', error);
        throw error;
    }
}

module.exports = generateConfig;
