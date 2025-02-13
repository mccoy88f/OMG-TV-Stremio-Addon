const express = require('express');
const cors = require('cors');
const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');

const defaultConfig = {
    M3U_URL: process.env.M3U_URL || 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.playlist',
    EPG_URL: process.env.EPG_URL || 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.epg',
    enableEPG: process.env.ENABLE_EPG === 'false' ? false : true,
    PROXY_URL: process.env.PROXY_URL || null,
    PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
    FORCE_PROXY: process.env.FORCE_PROXY === 'yes',
    ID_SUFFIX: process.env.ID_SUFFIX || ''
};

async function generateConfig(urlParams = {}) {
    try {
        console.log('\n=== Generazione Configurazione Iniziale ===');
        
        const currentConfig = {
            ...defaultConfig,
            M3U_URL: urlParams.m3u || defaultConfig.M3U_URL,
            EPG_URL: urlParams.epg || defaultConfig.EPG_URL,
            enableEPG: urlParams.epg_enabled === 'true' || defaultConfig.enableEPG,
            PROXY_URL: urlParams.proxy || defaultConfig.PROXY_URL,
            PROXY_PASSWORD: urlParams.proxy_pwd || defaultConfig.PROXY_PASSWORD,
            FORCE_PROXY: urlParams.force_proxy === 'true' || defaultConfig.FORCE_PROXY,
            ID_SUFFIX: urlParams.suffix || defaultConfig.ID_SUFFIX
        };

        const transformer = new PlaylistTransformer();
        const data = await transformer.loadAndTransform(currentConfig.M3U_URL);
        
        return {
            ...currentConfig,
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
    } catch (error) {
        console.error('Errore durante la generazione della configurazione:', error);
        throw error;
    }
}

async function startAddon() {
    try {
        const app = express();
        app.use(cors());
        
        app.get('/manifest.json', async (req, res) => {
            const generatedConfig = await generateConfig(req.query);
            const builder = new addonBuilder(generatedConfig.manifest);
            builder.defineCatalogHandler(catalogHandler);
            builder.defineStreamHandler(streamHandler);
            builder.defineMetaHandler(metaHandler);
            const manifest = builder.getInterface().manifest;
            res.setHeader('Content-Type', 'application/json');
            res.send(manifest);
        });

        app.get('/', async (req, res) => {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers['x-forwarded-host'] || req.get('host');
            const currentConfig = {
                m3u: req.query.m3u || defaultConfig.M3U_URL,
                epg: req.query.epg || defaultConfig.EPG_URL,
                epg_enabled: req.query.epg_enabled === 'true' || defaultConfig.enableEPG,
                proxy: req.query.proxy || defaultConfig.PROXY_URL,
                proxy_pwd: req.query.proxy_pwd || defaultConfig.PROXY_PASSWORD,
                force_proxy: req.query.force_proxy === 'true' || defaultConfig.FORCE_PROXY,
                suffix: req.query.suffix || defaultConfig.ID_SUFFIX
            };

            const manifestUrl = `${protocol}://${host}/manifest.json?${new URLSearchParams(currentConfig)}`;
            const configQueryString = new URLSearchParams(currentConfig).toString();
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${config.manifest.name} - Stremio Addon</title>
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
                        .buttons, .config-form {
                            margin: 30px 0;
                        }
                        button, input[type="submit"] {
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
                        button:hover, input[type="submit"]:hover {
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
                        .config-form {
                            text-align: left;
                            background: rgba(255,255,255,0.1);
                            padding: 20px;
                            border-radius: 4px;
                        }
                        .config-form label {
                            display: block;
                            margin: 10px 0 5px;
                        }
                        .config-form input[type="text"],
                        .config-form input[type="url"],
                        .config-form input[type="password"] {
                            width: 100%;
                            padding: 8px;
                            margin-bottom: 10px;
                            border-radius: 4px;
                            border: 1px solid #666;
                            background: #333;
                            color: white;
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
                    <img class="logo" src="${config.manifest.logo}" alt="logo">
                    <h1>${config.manifest.name} v${config.manifest.version}</h1>
                    <div class="description">
                        ${config.manifest.description}
                    </div>
                    <div class="manifest-url">
                        ${manifestUrl}
                    </div>
                    <div class="buttons">
                        <button onclick="installAddon()">
                            INSTALLA SU STREMIO
                        </button>
                        <button onclick="copyManifestUrl()">
                            COPIA URL MANIFEST
                        </button>
                    </div>
                    <div id="toast" class="toast">URL Copiato!</div>

                    <div class="config-form">
                        <h2>Configurazione</h2>
                        <form id="configForm" onsubmit="updateConfig(event)">
                            <label>M3U URL:</label>
                            <input type="url" name="m3u" value="${currentConfig.m3u}">
                            
                            <label>EPG URL:</label>
                            <input type="url" name="epg" value="${currentConfig.epg}">
                            
                            <label>
                                <input type="checkbox" name="epg_enabled" ${currentConfig.epg_enabled ? 'checked' : ''}>
                                Abilita EPG
                            </label>
                            
                            <label>Proxy URL:</label>
                            <input type="url" name="proxy" value="${currentConfig.proxy || ''}">
                            
                            <label>Proxy Password:</label>
                            <input type="password" name="proxy_pwd" value="${currentConfig.proxy_pwd || ''}">
                            
                            <label>
                                <input type="checkbox" name="force_proxy" ${currentConfig.force_proxy ? 'checked' : ''}>
                                Forza Proxy
                            </label>
                            
                            <label>ID Suffix:</label>
                            <input type="text" name="suffix" value="${currentConfig.suffix}">
                            
                            <input type="submit" value="Aggiorna">
                        </form>
                    </div>
                    
                    <script>
                        function getConfigQueryString() {
                            const form = document.getElementById('configForm');
                            const formData = new FormData(form);
                            const params = new URLSearchParams();
                            
                            formData.forEach((value, key) => {
                                if (value) {
                                    if (key === 'epg_enabled' || key === 'force_proxy') {
                                        params.append(key, form.elements[key].checked);
                                    } else {
                                        params.append(key, value);
                                    }
                                }
                            });
                            
                            return params.toString();
                        }

                        function updateConfig(e) {
                            e.preventDefault();
                            const queryString = getConfigQueryString();
                            window.location.href = '/?' + queryString;
                        }

                        function installAddon() {
                            const queryString = getConfigQueryString();
                            window.location.href = 'stremio://${host}/manifest.json?' + queryString;
                        }

                        function copyManifestUrl() {
                            const queryString = getConfigQueryString();
                            const manifestUrl = '${protocol}://${host}/manifest.json?' + queryString;
                            
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
            const generatedConfig = await generateConfig(req.query);
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

        const initialConfig = await generateConfig();
        const CacheManager = require('./cache-manager')(initialConfig);
        await CacheManager.updateCache(true);

        const cachedData = CacheManager.getCachedData();
        const allEpgUrls = [initialConfig.EPG_URL, ...(cachedData.epgUrls || [])];
        
        if (allEpgUrls.length > 0) {
            await EPGManager.initializeEPG(allEpgUrls.join(','));
            if (initialConfig.enableEPG) {
                EPGManager.checkMissingEPG(cachedData.channels);
            }
        }

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
