const renderConfigPage = (protocol, host, query, manifest) => {
   return `
       <!DOCTYPE html>
       <html>
       <head>
           <meta charset="utf-8">
           <title>${manifest.name}</title>
           <style>
               body {
                   margin: 0;
                   padding: 0;
                   height: 100vh;
                   overflow-y: auto;
                   font-family: Arial, sans-serif;
                   color: #fff;
                   background: purple;
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
                   filter: blur(5px) brightness(0.5);
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
                   justify-content: flex-start;
                   overflow-y: visible;
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
               <img class="logo" src="${manifest.logo}" alt="logo">
               <h1>${manifest.name}</h1>
               
               <div class="manifest-url">
                   <strong>URL Manifest:</strong><br>
                   ${protocol}://${host}/manifest.json?${new URLSearchParams(query)}
               </div>

               <div class="buttons">
                   <button onclick="copyManifestUrl()">COPIA URL MANIFEST</button>
                   <button onclick="installAddon()">INSTALLA SU STREMIO</button>
               </div>
               
               <div class="config-form">
                   <h2>Genera Configurazione</h2>
                   <form id="configForm" onsubmit="updateConfig(event)">
                       <label>M3U URL:</label>
                       <input type="url" name="m3u" value="${query.m3u || ''}" required>
                       
                       <label>EPG URL:</label>
                       <input type="url" name="epg" value="${query.epg || ''}">
                       
                       <label>
                           <input type="checkbox" name="epg_enabled" ${query.epg_enabled === 'true' ? 'checked' : ''}>
                           Abilita EPG
                       </label>
                       
                       <label>Proxy URL:</label>
                       <input type="url" name="proxy" value="${query.proxy || ''}">
                       
                       <label>Proxy Password:</label>
                       <input type="password" name="proxy_pwd" value="${query.proxy_pwd || ''}">
                       
                       <label>
                           <input type="checkbox" name="force_proxy" ${query.force_proxy === 'true' ? 'checked' : ''}>
                           Forza Proxy
                       </label>

                       <label>ID Suffix:</label>
                       <input type="text" name="id_suffix" value="${query.id_suffix || ''}" placeholder="Esempio: it">

                       <label>Percorso file remapper:</label>
                       <input type="text" name="remapper_path" value="${query.remapper_path || ''}" placeholder="Esempio: https://raw.githubusercontent.com/...">
                       
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
                       const configQueryString = getConfigQueryString();
                       const configBase64 = btoa(configQueryString);
                       window.location.href = \`stremio://${host}/\${configBase64}/manifest.json\`;
                   }

                   function copyManifestUrl() {
                       const configQueryString = getConfigQueryString();
                       const configBase64 = btoa(configQueryString);
                       const manifestUrl = \`${protocol}://${host}/\${configBase64}/manifest.json\`;
                       
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
                       const configQueryString = getConfigQueryString();
                       const configBase64 = btoa(configQueryString);
                       window.location.href = \`${protocol}://${host}/\${configBase64}/configure\`;
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

                               const configQueryString = getConfigQueryString();
                               const configBase64 = btoa(configQueryString);
                               window.location.href = \`${protocol}://${host}/\${configBase64}/configure\`;
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
   `;
};

module.exports = {
    renderConfigPage
};
