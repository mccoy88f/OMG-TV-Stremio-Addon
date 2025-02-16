const express = require('express');
const cors = require('cors');
const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');
const CacheManager = require('./cache-manager')(config);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
   const protocol = req.headers['x-forwarded-proto'] || req.protocol;
   const host = req.headers['x-forwarded-host'] || req.get('host');
   const manifestUrl = `${protocol}://${host}/manifest.json?${new URLSearchParams(req.query)}`;
   
   res.send(`
       <!DOCTYPE html>
       <html>
       <head>
           <meta charset="utf-8">
           <title>${config.manifest.name}</title>
           <style>
               body {
                   margin: 0;
                   padding: 0;
                   height: 100vh;
                   overflow-y: auto; /* Consente lo scroll verticale */
                   font-family: Arial, sans-serif;
                   color: #fff;
                   background: purple; /* Sfondo di backup */
               }
               #background-video {
                   position: fixed;
                   right: 0;
                   bottom: 0;
                   min-width: 100%;
                   min-height: 100%;
                   width: auto;
                   height: auto;
                   z-index: -1000;
                   background: black;
                   object-fit: cover;
                   filter: blur(5px) brightness(0.5); /* Aggiunge blur e riduce luminosità */
               }
               .content {
                   position: relative;
                   z-index: 1;
                   max-width: 800px;
                   margin: 0 auto;
                   text-align: center;
                   padding: 50px 20px;
                   background: rgba(0,0,0,0.6);
                   min-height: 100vh;
                   display: flex;
                   flex-direction: column;
                   justify-content: flex-start; /* Allinea all'inizio invece che al centro */
                   overflow-y: visible; /* Consente lo scroll all'interno del contenuto */
               }

               .logo {
                   width: 150px;
                   margin: 0 auto 20px;
                   display: block;
               }
               .manifest-url {
                   background: rgba(255,255,255,0.1);
                   padding: 10px;
                   border-radius: 4px;
                   word-break: break-all;
                   margin: 20px 0;
                   font-size: 12px;
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
                   color: #fff;
               }
               .config-form input[type="text"],
               .config-form input[type="url"],
               .config-form input[type="password"],
               .config-form input[type="file"] {
                   width: 100%;
                   padding: 8px;
                   margin-bottom: 10px;
                   border-radius: 4px;
                   border: 1px solid #666;
                   background: #333;
                   color: white;
               }
               .buttons {
                   margin: 30px 0;
                   display: flex;
                   justify-content: center;
                   gap: 20px;
               }
               button {
                   background: #8A5AAB;
                   color: white;
                   border: none;
                   padding: 12px 24px;
                   border-radius: 4px;
                   cursor: pointer;
                   font-size: 16px;
               }
               .bottom-buttons {
                   margin-top: 20px;
                   display: flex;
                   justify-content: center;
                   gap: 20px;
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
               }
               input[type="submit"] {
                   background: #8A5AAB;
                   color: white;
                   border: none;
                   padding: 12px 24px;
                   border-radius: 4px;
                   cursor: pointer;
                   font-size: 16px;
                   width: 100%;
                   margin-top: 20px;
               }
           </style>
       </head>
       <body>
           <video autoplay loop muted id="background-video">
               <source src="https://static.vecteezy.com/system/resources/previews/001/803/236/mp4/no-signal-bad-tv-free-video.mp4" type="video/mp4">
               Il tuo browser non supporta il tag video.
           </video>

           <div class="content">
               <img class="logo" src="${config.manifest.logo}" alt="logo">
               <h1>${config.manifest.name}</h1>
               
               <div class="manifest-url">
                   <strong>URL Manifest:</strong><br>
                   ${manifestUrl}
               </div>

               <div class="buttons">
                   <button onclick="copyManifestUrl()">COPIA URL MANIFEST</button>
                   <button onclick="installAddon()">INSTALLA SU STREMIO</button>
               </div>
               
               <div class="config-form">
                   <h2>Genera Configurazione</h2>
                   <form id="configForm" onsubmit="updateConfig(event)">
                       <label>M3U URL:</label>
                       <input type="url" name="m3u" value="${req.query.m3u || ''}" required>
                       
                       <label>EPG URL:</label>
                       <input type="url" name="epg" value="${req.query.epg || ''}">
                       
                       <label>
                           <input type="checkbox" name="epg_enabled" ${req.query.epg_enabled === 'true' ? 'checked' : ''}>
                           Abilita EPG
                       </label>
                       
                       <label>Proxy URL:</label>
                       <input type="url" name="proxy" value="${req.query.proxy || ''}">
                       
                       <label>Proxy Password:</label>
                       <input type="password" name="proxy_pwd" value="${req.query.proxy_pwd || ''}">
                       
                       <label>
                           <input type="checkbox" name="force_proxy" ${req.query.force_proxy === 'true' ? 'checked' : ''}>
                           Forza Proxy
                       </label>

                       <label>ID Suffix:</label>
                       <input type="text" name="id_suffix" value="${req.query.id_suffix || ''}" placeholder="Esempio: it">

                       <label>Percorso file remapper:</label>
                       <input type="text" name="remapper_path" value="${req.query.remapper_path || ''}" placeholder="Esempio: https://raw.githubusercontent.com/...">
                       
                       <input type="submit" value="Genera Configurazione">
                   </form>

                   <div class="bottom-buttons">
                       <button onclick="backupConfig()">BACKUP CONFIGURAZIONE</button>
                       <input type="file" id="restoreFile" accept=".json" style="display:none;" onchange="restoreConfig(event)">
                       <button onclick="document.getElementById('restoreFile').click()">RIPRISTINA CONFIGURAZIONE</button>
                   </div>
               </div>
               
               <div id="toast" class="toast">URL Copiato!</div>
               
               <script>
                   function getConfigQueryString() {
                       const form = document.getElementById('configForm');
                       const formData = new FormData(form);
                       const params = new URLSearchParams();
                       
                       formData.forEach((value, key) => {
                           if (value || key === 'epg_enabled' || key === 'force_proxy') {
                               if (key === 'epg_enabled' || key === 'force_proxy') {
                                   params.append(key, form.elements[key].checked);
                               } else {
                                   params.append(key, value);
                               }
                           }
                       });
                       
                       return params.toString();
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

                   function updateConfig(e) {
                       e.preventDefault();
                       const queryString = getConfigQueryString();
                       const configUrl = '${protocol}://${host}/?' + queryString;
                       
                       if (window.location.href !== configUrl) {
                           window.location.href = configUrl;
                       }
                   }

                   function backupConfig() {
                       const queryString = getConfigQueryString();
                       const params = Object.fromEntries(new URLSearchParams(queryString));
                       
                       params.epg_enabled = params.epg_enabled === 'true';
                       params.force_proxy = params.force_proxy === 'true';

                       const configBlob = new Blob([JSON.stringify(params, null, 2)], {type: 'application/json'});
                       const url = URL.createObjectURL(configBlob);
                       const a = document.createElement('a');
                       a.href = url;
                       a.download = 'omg_tv_config.json';
                       a.click();
                       URL.revokeObjectURL(url);
                   }

                   function restoreConfig(event) {
                       const file = event.target.files[0];
                       if (!file) return;

                       const reader = new FileReader();
                       reader.onload = function(e) {
                           try {
                               const config = JSON.parse(e.target.result);
                               
                               const form = document.getElementById('configForm');
                               for (const [key, value] of Object.entries(config)) {
                                   const input = form.elements[key];
                                   if (input) {
                                       if (input.type === 'checkbox') {
                                           input.checked = value;
                                       } else {
                                           input.value = value;
                                       }
                                   }
                               }

                               const queryString = getConfigQueryString();
                               window.location.href = '${protocol}://${host}/?' + queryString;
                           } catch (error) {
                               alert('Errore nel caricamento del file di configurazione');
                           }
                       };
                       reader.readAsText(file);
                   }
               </script>
           </div>
       </body>
       </html>
   `);
});

app.get('/manifest.json', async (req, res) => {
   try {
       const protocol = req.headers['x-forwarded-proto'] || req.protocol;
       const host = req.headers['x-forwarded-host'] || req.get('host');

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
               configurationURL: `${protocol}://${host}?${new URLSearchParams(req.query)}`,
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
