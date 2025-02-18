const fs = require('fs');
const path = require('path');

const renderConfigPage = (protocol, host, query, manifest) => {
   // Verifica se il file addon-config.json esiste
   const configPath = path.join(__dirname, 'addon-config.json');
   const m3uDefaultUrl = 'http://inthemix.altervista.org/tv.m3u';
   const m3uIsDisabled = !fs.existsSync(configPath);

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
               .advanced-settings {
                   background: rgba(255,255,255,0.05);
                   border: 1px solid #666;
                   border-radius: 4px;
                   padding: 10px;
                   margin-top: 10px;
               }
               .advanced-settings-header {
                   cursor: pointer;
                   display: flex;
                   justify-content: space-between;
                   align-items: center;
                   color: #fff;
               }
               .advanced-settings-content {
                   display: none;
                   padding-top: 10px;
               }
               .advanced-settings-content.show {
                   display: block;
               }
               #confirmModal {
                   display: none;
                   position: fixed;
                   top: 0;
                   left: 0;
                   width: 100%;
                   height: 100%;
                   background: rgba(0,0,0,0.8);
                   z-index: 1000;
                   justify-content: center;
                   align-items: center;
               }
               #confirmModal > div {
                   background: #333;
                   padding: 30px;
                   border-radius: 10px;
                   text-align: center;
                   color: white;
               }
               #confirmModal button {
                   margin: 0 10px;
               }
               a {
                   color: #8A5AAB;
                   text-decoration: none;
               }
               a:hover {
                   text-decoration: underline;
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
                       <input type="url" name="m3u" 
                              value="${m3uIsDisabled ? m3uDefaultUrl : (query.m3u || '')}" 
                              ${m3uIsDisabled ? 'readonly' : ''} 
                              required>
                       
                       <label>EPG URL:</label>
                       <input type="url" name="epg" value="${query.epg || ''}">
                       
                       <label>
                           <input type="checkbox" name="epg_enabled" ${query.epg_enabled === 'true' ? 'checked' : ''}>
                           Abilita EPG
                       </label>

                       <div class="advanced-settings">
                           <div class="advanced-settings-header" onclick="toggleAdvancedSettings()">
                               <strong>Impostazioni Avanzate</strong>
                               <span id="advanced-settings-toggle">▼</span>
                           </div>
                           <div class="advanced-settings-content" id="advanced-settings-content">
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
                           </div>
                       </div>
                       
                       <input type="submit" value="Genera Configurazione">
                   </form>

                   <div class="bottom-buttons">
                       <button onclick="backupConfig()">BACKUP CONFIGURAZIONE</button>
                       <input type="file" id="restoreFile" accept=".json" style="display:none;" onchange="restoreConfig(event)">
                       <button onclick="document.getElementById('restoreFile').click()">RIPRISTINA CONFIGURAZIONE</button>
                   </div>

                   <div style="margin-top: 30px; text-align: center; font-size: 14px; color: #ccc;">
                       <p>Addon creato con passione da McCoy88f - <a href="https://github.com/mccoy88f/OMG-TV-Stremio-Addon" target="_blank">GitHub Repository</a></p>
                       
                       <h3 style="margin-top: 20px;">Sostieni questo progetto!</h3>
                       
                       <div style="margin-top: 15px;">
                           <a href="https://www.buymeacoffee.com/mccoy88f" target="_blank">
                               <img src="https://img.buymeacoffee.com/button-api/?text=Offrimi una birra&emoji=🍺&slug=mccoy88f&button_colour=FFDD00&font_colour=000000&font_family=Bree&outline_colour=000000&coffee_colour=ffffff" alt="Buy Me a Coffee" style="max-width: 300px; margin: 0 auto;"/>
                           </a>
                       </div>
                       
                       <p style="margin-top: 15px;">
                           <a href="https://paypal.me/mccoy88f?country.x=IT&locale.x=it_IT" target="_blank">Puoi anche offrirmi una birra con PayPal 🍻</a>
                       </p>
                       
                       <div style="margin-top: 30px; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 4px;">
                           <strong>ATTENZIONE!</strong>
                           <ul style="text-align: center; margin-top: 10px;">
                               <li>Non sono responsabile per l'uso illecito dell'addon.</li>
                               <li>Verifica e rispetta la normativa vigente nel tuo paese!</li>
                           </ul>
                       </div>
                   </div>
               </div>
               
               <div id="confirmModal">
                   <div>
                       <h2>Conferma Installazione</h2>
                       <p>Hai già generato la configurazione?</p>
                       <div style="margin-top: 20px;">
                           <button onclick="cancelInstallation()" style="background: #666;">Indietro</button>
                           <button onclick="proceedInstallation()" style="background: #8A5AAB;">Procedi</button>
                       </div>
                   </div>
               </div>
               
               <div id="toast" class="toast">URL Copiato!</div>
               
               <script>
                   function toggleAdvancedSettings() {
                       const content = document.getElementById('advanced-settings-content');
                       const toggle = document.getElementById('advanced-settings-toggle');
                       content.classList.toggle('show');
                       toggle.textContent = content.classList.contains('show') ? '▲' : '▼';
                   }

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

                   function showConfirmModal() {
                       document.getElementById('confirmModal').style.display = 'flex';
                   }

                   function cancelInstallation() {
                       document.getElementById('confirmModal').style.display = 'none';
                   }

                   function proceedInstallation() {
                       const configQueryString = getConfigQueryString();
                       const configBase64 = btoa(configQueryString);
                       window.location.href = \`stremio://${host}/\${configBase64}/manifest.json\`;
                       document.getElementById('confirmModal').style.display = 'none';
                   }

                   function installAddon() {
                       showConfirmModal();
                   }

                   function updateConfig(e) {
                       e.preventDefault();
                       const configQueryString = getConfigQueryString();
                       const configBase64 = btoa(configQueryString);
                       window.location.href = \`${protocol}://${host}/\${configBase64}/configure\`;
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
