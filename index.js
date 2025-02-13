const express = require('express');
const cors = require('cors');
const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');

async function generateConfig() {
    try {
        console.log('\n=== Generazione Configurazione Iniziale ===');
        
        const transformer = new PlaylistTransformer();
        const data = await transformer.loadAndTransform(config.M3U_URL);
        console.log(`Trovati ${data.genres.length} generi`);
        console.log('EPG URL configurato:', config.EPG_URL);

        const finalConfig = {
            ...config,
            manifest: {
                ...config.manifest,
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

        console.log('Configurazione generata con successo');
        console.log('\n=== Fine Generazione Configurazione ===\n');

        return finalConfig;
    } catch (error) {
        console.error('Errore durante la generazione della configurazione:', error);
        throw error;
    }
}

async function startAddon() {
    try {
        const generatedConfig = await generateConfig();
        const builder = new addonBuilder(generatedConfig.manifest);
        
        builder.defineStreamHandler(streamHandler);
        builder.defineCatalogHandler(catalogHandler);
        builder.defineMetaHandler(metaHandler);

        const addonInterface = builder.getInterface();
        const app = express();
        
        app.use(cors());
        
        app.get('/manifest.json', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.send(addonInterface.manifest);
        });

        app.get('/', (req, res) => {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers['x-forwarded-host'] || req.get('host');
            const manifestUrl = `${protocol}://${host}/manifest.json`;
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${addonInterface.manifest.name} - Stremio Addon</title>
                    <style>
                        body {
                            background: #000;
                            color: #fff;
                            font-family: Arial, sans-serif;
                            text-align: center;
                            padding: 50px;
                            max-width: 800px;
                            margin: 0 auto;
                        }
                        img.logo {
                            width: 150px;
                            margin: 0 auto;
                            display: block;
                        }
                        .buttons {
                            margin: 30px 0;
                        }
                        button {
                            background: #8A5AAB;
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            margin: 0 10px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 16px;
                            transition: background 0.3s;
                        }
                        button:hover {
                            background: #7141A1;
                        }
                        .description {
                            margin: 30px 0;
                            line-height: 1.5;
                        }
                        .manifest-url {
                            background: rgba(255,255,255,0.1);
                            padding: 10px;
                            border-radius: 4px;
                            word-break: break-all;
                            margin: 20px 0;
                        }
                        .toast {
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: #4CAF50;
                            color: white;
                            padding: 15px 30px;
                            border-radius: 4px;
                            display: none;
                            animation: fadeIn 0.3s, fadeOut 0.3s 1.7s;
                        }
                        @keyframes fadeIn {
                            from {opacity: 0;}
                            to {opacity: 1;}
                        }
                        @keyframes fadeOut {
                            from {opacity: 1;}
                            to {opacity: 0;}
                        }
                    </style>
                </head>
                <body>
                    <img class="logo" src="${addonInterface.manifest.logo}" alt="logo">
                    <h1>${addonInterface.manifest.name} v${addonInterface.manifest.version}</h1>
                    <div class="description">
                        ${addonInterface.manifest.description}
                    </div>
                    <div class="manifest-url">
                        ${manifestUrl}
                    </div>
                    <div class="buttons">
                        <button onclick="location.href='stremio://${host}/manifest.json'">
                            INSTALLA SU STREMIO
                        </button>
                        <button onclick="copyManifestUrl()">
                            COPIA URL MANIFEST
                        </button>
                    </div>
                    <div id="toast" class="toast">URL Copiato!</div>
                    
                    <script>
                        function copyManifestUrl() {
                            const manifestUrl = '${manifestUrl}';
                            navigator.clipboard.writeText(manifestUrl).then(() => {
                                const toast = document.getElementById('toast');
                                toast.style.display = 'block';
                                setTimeout(() => {
                                    toast.style.display = 'none';
                                }, 2000);
                            });
                        }
                    </script>
                </body>
                </html>
            `);
        });

        app.get('/:resource/:type/:id/:extra?.json', async (req, res, next) => {
            const { resource, type, id } = req.params;
            const extra = req.params.extra ? JSON.parse(decodeURIComponent(req.params.extra)) : {};
            
            try {
                let result;
                switch (resource) {
                    case 'stream':
                        result = await streamHandler({ type, id });
                        break;
                    case 'catalog':
                        result = await catalogHandler({ type, id, extra });
                        break;
                    case 'meta':
                        result = await metaHandler({ type, id });
                        break;
                    default:
                        next();
                        return;
                }
                
                res.setHeader('Content-Type', 'application/json');
                res.send(result);
            } catch (error) {
                console.error('Error handling request:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        const CacheManager = require('./cache-manager')(generatedConfig);
        await CacheManager.updateCache(true);

        const cachedData = CacheManager.getCachedData();
        const allEpgUrls = [generatedConfig.EPG_URL, ...(cachedData.epgUrls || [])];
        
        if (allEpgUrls.length > 0) {
            await EPGManager.initializeEPG(allEpgUrls.join(','));
            if (generatedConfig.enableEPG) {
                EPGManager.checkMissingEPG(cachedData.channels);
            }
        }

        const port = generatedConfig.port;
        app.listen(port, () => {
            console.log('Addon attivo su:', `http://localhost:${port}`);
            console.log('URL Manifest:', `http://localhost:${port}/manifest.json`);
        });

    } catch (error) {
        console.error('Failed to start addon:', error);
        process.exit(1);
    }
}

startAddon();
