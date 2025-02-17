const express = require('express');
const cors = require('cors');
const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const { renderConfigPage } = require('./views');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route principale - supporta sia il vecchio che il nuovo sistema
app.get('/', async (req, res) => {
   const protocol = req.headers['x-forwarded-proto'] || req.protocol;
   const host = req.headers['x-forwarded-host'] || req.get('host');
   res.send(renderConfigPage(protocol, host, req.query, config.manifest));
});

// Nuova route per la configurazione codificata
app.get('/:config/configure', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const configString = Buffer.from(req.params.config, 'base64').toString();
        const decodedConfig = Object.fromEntries(new URLSearchParams(configString));
        res.send(renderConfigPage(protocol, host, decodedConfig, config.manifest));
    } catch (error) {
        console.error('Errore nella configurazione:', error);
        res.redirect('/');
    }
});

// Route per il manifest - supporta sia il vecchio che il nuovo sistema
app.get('/manifest.json', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const configUrl = `${protocol}://${host}/?${new URLSearchParams(req.query)}`;

        if (req.query.m3u && CacheManager.cache.m3uUrl !== req.query.m3u) {
            await CacheManager.rebuildCache(req.query.m3u);
        }
        
        const { genres } = CacheManager.getCachedData();
        const manifestConfig = {
            ...config.manifest,
            catalogs: [{
                ...config.manifest.catalogs[0],
                extra: [
                    {
                        name: 'genre',
                        isRequired: false,
                        options: genres
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
            }],
            behaviorHints: {
                configurable: true,
                configurationURL: configUrl,
                reloadRequired: true
            }
        };
        const builder = new addonBuilder(manifestConfig);
        
        if (req.query.epg) {
            await EPGManager.initializeEPG(req.query.epg);
        }
        builder.defineCatalogHandler(async (args) => catalogHandler({ ...args, config: req.query }));
        builder.defineStreamHandler(async (args) => streamHandler({ ...args, config: req.query }));
        builder.defineMetaHandler(async (args) => metaHandler({ ...args, config: req.query }));
        res.setHeader('Content-Type', 'application/json');
        res.send(builder.getInterface().manifest);
    } catch (error) {
        console.error('Error creating manifest:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Nuova route per il manifest con configurazione codificata
app.get('/:config/manifest.json', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const configString = Buffer.from(req.params.config, 'base64').toString();
        const decodedConfig = Object.fromEntries(new URLSearchParams(configString));

        if (decodedConfig.m3u && CacheManager.cache.m3uUrl !== decodedConfig.m3u) {
            await CacheManager.rebuildCache(decodedConfig.m3u);
        }

        const { genres } = CacheManager.getCachedData();
        const manifestConfig = {
            ...config.manifest,
            catalogs: [{
                ...config.manifest.catalogs[0],
                extra: [
                    {
                        name: 'genre',
                        isRequired: false,
                        options: genres
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
            }],
            behaviorHints: {
                configurable: true,
                configurationURL: `${protocol}://${host}/${req.params.config}/configure`,
                reloadRequired: true
            }
        };

        const builder = new addonBuilder(manifestConfig);
        
        if (decodedConfig.epg) {
            await EPGManager.initializeEPG(decodedConfig.epg);
        }
        
        builder.defineCatalogHandler(async (args) => catalogHandler({ ...args, config: decodedConfig }));
        builder.defineStreamHandler(async (args) => streamHandler({ ...args, config: decodedConfig }));
        builder.defineMetaHandler(async (args) => metaHandler({ ...args, config: decodedConfig }));
        
        res.setHeader('Content-Type', 'application/json');
        res.send(builder.getInterface().manifest);
    } catch (error) {
        console.error('Error creating manifest:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Manteniamo la route esistente per gli altri endpoint
app.get('/:resource/:type/:id/:extra?.json', async (req, res, next) => {
    const { resource, type, id } = req.params;
    const extra = req.params.extra 
        ? safeParseExtra(req.params.extra) 
        : {};
    
    try {
        let result;
        switch (resource) {
            case 'stream':
                result = await streamHandler({ type, id, config: req.query });
                break;
            case 'catalog':
                result = await catalogHandler({ type, id, extra, config: req.query });
                break;
            case 'meta':
                result = await metaHandler({ type, id, config: req.query });
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

function safeParseExtra(extraParam) {
    try {
        if (!extraParam) return {};
        
        const decodedExtra = decodeURIComponent(extraParam);
        
        if (decodedExtra.startsWith('skip=')) {
            return { skip: parseInt(decodedExtra.split('=')[1], 10) || 0 };
        }
        
        if (decodedExtra.startsWith('genre=')) {
            return { genre: decodedExtra.split('=')[1] };
        }
        
        if (decodedExtra.startsWith('search=')) {
            return { search: decodedExtra.split('=')[1] };
        }
        
        try {
            return JSON.parse(decodedExtra);
        } catch {
            return {};
        }
    } catch (error) {
        console.error('Error parsing extra:', error);
        return {};
    }
}

async function startAddon() {
   try {
       const port = process.env.PORT || 10000;
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
