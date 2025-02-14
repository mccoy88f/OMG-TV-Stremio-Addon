const express = require('express');
const cors = require('cors');
const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');
const settingsManager = require('./settings-manager');
const generateConfig = require('./config-generator');

async function startAddon() {
   try {
       const app = express();
       app.use(cors());
       
       app.get('/manifest.json', async (req, res) => {
           const generatedConfig = await generateConfig(req.query, req);
           const builder = new addonBuilder(generatedConfig.manifest);
           builder.defineCatalogHandler(catalogHandler);
           builder.defineStreamHandler(streamHandler);
           builder.defineMetaHandler(metaHandler);
           const manifest = builder.getInterface().manifest;
           res.setHeader('Content-Type', 'application/json');
           res.send(manifest);
       });

       app.get('/', async (req, res) => {
           const isFirstRun = await settingsManager.isFirstRun();
           const protocol = req.headers['x-forwarded-proto'] || req.protocol;
           const host = req.headers['x-forwarded-host'] || req.get('host');
           const settings = await settingsManager.loadSettings();
           
           if (req.query.m3u) {
               await settingsManager.updateSettings({
                   M3U_URL: req.query.m3u,
                   EPG_URL: req.query.epg || '',
                   enableEPG: req.query.epg_enabled === 'true',
                   PROXY_URL: req.query.proxy || null,
                   PROXY_PASSWORD: req.query.proxy_pwd || null,
                   FORCE_PROXY: req.query.force_proxy === 'true',
                   ID_SUFFIX: req.query.suffix || ''
               });
           }

           if (isFirstRun && !req.query.m3u) {
               res.send(`
                   <!DOCTYPE html>
                   <html>
                   <head>
                       <meta charset="utf-8">
                       <title>Configurazione Iniziale - ${config.manifest.name}</title>
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
                           .config-form {
                               text-align: left;
                               background: rgba(255,255,255,0.1);
                               padding: 20px;
                               border-radius: 4px;
                               margin-top: 30px;
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
                           input[type="submit"] {
                               background: #8A5AAB;
                               color: white;
                               border: none;
                               padding: 12px 24px;
                               border-radius: 4px;
                               cursor: pointer;
                               font-size: 16px;
                           }
                       </style>
                   </head>
                   <body>
                       <h1>Configurazione Iniziale Richiesta</h1>
                       <div class="config-form">
                           <form id="configForm" onsubmit="updateConfig(event)">
                               <label>M3U URL: (richiesto)</label>
                               <input type="url" name="m3u" required>
                               
                               <label>EPG URL:</label>
                               <input type="url" name="epg">
                               
                               <label>
                                   <input type="checkbox" name="epg_enabled">
                                   Abilita EPG
                               </label>
                               
                               <label>Proxy URL:</label>
                               <input type="url" name="proxy">
                               
                               <label>Proxy Password:</label>
                               <input type="password" name="proxy_pwd">
                               
                               <label>
                                   <input type="checkbox" name="force_proxy">
                                   Forza Proxy
                               </label>
                               
                               <label>ID Suffix:</label>
                               <input type="text" name="suffix">
                               
                               <input type="submit" value="Salva Configurazione">
                           </form>
                       </div>
                       <script>
                           function updateConfig(e) {
                               e.preventDefault();
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
                               
                               window.location.href = '/?' + params.toString();
                           }
                       </script>
                   </body>
                   </html>
               `);
               return;
           }

           const currentConfig = {
               m3u: settings.M3U_URL,
               epg: settings.EPG_URL,
               epg_enabled: settings.enableEPG,
               proxy: settings.PROXY_URL,
               proxy_pwd: settings.PROXY_PASSWORD,
               force_proxy: settings.FORCE_PROXY,
               suffix: settings.ID_SUFFIX
           };

           const manifestUrl = `${protocol}://${host}/manifest.json?${new URLSearchParams(currentConfig)}`;
           
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
                           <input type="url" name="m3u" value="${currentConfig.m3u}" required>
                           
                           <label>EPG URL:</label>
                           <input type="url" name="epg" value="${currentConfig.epg || ''}">
                           
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
                           
                           <input type="submit" value="Aggiorna Configurazione">
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
                           window.location.href = '/?' + getConfigQueryString();
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
           const generatedConfig = await generateConfig(req.query, req);
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

       const settings = await settingsManager.loadSettings();
       const initialConfig = await generateConfig(settings);
       const CacheManager = require('./cache-manager')(initialConfig);
       await CacheManager.updateCache(true);

       const cachedData = CacheManager.getCachedData();
       
       if (settings.EPG_URL && settings.enableEPG) {
           await EPGManager.initializeEPG(settings.EPG_URL);
           EPGManager.checkMissingEPG(cachedData.channels);
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
