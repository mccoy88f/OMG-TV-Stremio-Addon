const fs = require('fs');
const path = require('path');

const renderConfigPage = (protocol, host, query, manifest) => {
   // Verifica se il file addon-config.json esiste
   const configPath = path.join(__dirname, 'addon-config.json');
   const m3uDefaultUrl = 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/link.playlist';
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
                           <input type="checkbox" name="epg_enabled" checked ${query.epg_enabled === 'true' ? 'checked' : ''}>
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

                               <label>Intervallo Aggiornamento Playlist:</label>
                               <input type="text" name="update_interval" value="${query.update_interval || '12:00'}" placeholder="HH:MM (predefinito 12:00)">
                               <small style="color: #999;">Formato HH:MM (es. 1:00 o 01:00), predefinito 12:00</small>
                           </div>
                       </div>
                       
                       <input type="submit" value="Genera Configurazione">
                   </form>

                   <div class="bottom-buttons">
                       <button onclick="backupConfig()">BACKUP CONFIGURAZIONE</button>
                       <input type="file" id="restoreFile" accept=".json" style="display:none;" onchange="restoreConfig(event)">
                       <button onclick="document.getElementById('restoreFile').click()">RIPRISTINA CONFIGURAZIONE</button>
                   </div>
               </div>
               
               <div class="config-form" style="margin-top: 30px;">
                    <h2>Genera Playlist con Script Python</h2>
                    <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                        <p><strong>Questa funzione permette di:</strong></p>
                        <ul style="text-align: left;">
                            <li>Scaricare uno script Python da un URL</li>
                            <li>Eseguirlo dentro il container Docker</li>
                            <li>Utilizzare il file M3U generato come sorgente</li>
                        </ul>
                        <p><strong>Nota:</strong> L'URL deve puntare a uno script Python che genera un file M3U.</p>
                    </div>
                    
                    <div id="pythonForm">
                        <label>URL dello Script Python:</label>
                        <input type="url" id="pythonScriptUrl" placeholder="https://example.com/script.py">
                        
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button onclick="downloadPythonScript()" style="flex: 1;">SCARICA SCRIPT</button>
                            <button onclick="executePythonScript()" style="flex: 1;">ESEGUI SCRIPT</button>
                            <button onclick="checkPythonStatus()" style="flex: 1;">CONTROLLA STATO</button>
                        </div>
                        
                        <div style="margin-top: 15px;">
                            <h4>Aggiornamento Automatico</h4>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input type="text" id="updateInterval" placeholder="HH:MM (es. 12:00)" style="flex: 2;">
                                <button onclick="scheduleUpdates()" style="flex: 1;">PIANIFICA</button>
                                <button onclick="stopScheduledUpdates()" style="flex: 1;">FERMA</button>
                            </div>
                            <small style="color: #999; display: block; margin-top: 5px;">
                                Formato: HH:MM (es. 12:00 per 12 ore, 1:00 per 1 ora, 0:30 per 30 minuti)
                            </small>
                        </div>
                        
                        <div id="pythonStatus" style="margin-top: 15px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px; display: none;">
                            <h3>Stato Script Python</h3>
                            <div id="pythonStatusContent"></div>
                        </div>
                        
                        <div id="generatedM3uUrl" style="margin-top: 15px; background: rgba(0,255,0,0.1); padding: 10px; border-radius: 4px; display: none;">
                            <h3>URL Playlist Generata</h3>
                            <div id="m3uUrlContent"></div>
                            <button onclick="useGeneratedM3u()" style="width: 100%; margin-top: 10px;">USA QUESTA PLAYLIST</button>
                        </div>
                    </div>
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
                               <p>Non sono responsabile per l'uso illecito dell'addon.</p>
                               <p>Verifica e rispetta la normativa vigente nel tuo paese!</p>
                           </ul>
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
                   
                   // Funzioni per la gestione dello script Python
                   function showPythonStatus(data) {
                       const statusEl = document.getElementById('pythonStatus');
                       const contentEl = document.getElementById('pythonStatusContent');
                       
                       statusEl.style.display = 'block';
                       
                       let html = '<table style="width: 100%; text-align: left;">';
                       html += '<tr><td><strong>In Esecuzione:</strong></td><td>' + (data.isRunning ? 'Sì' : 'No') + '</td></tr>';
                       html += '<tr><td><strong>Ultima Esecuzione:</strong></td><td>' + data.lastExecution + '</td></tr>';
                       html += '<tr><td><strong>Script Esistente:</strong></td><td>' + (data.scriptExists ? 'Sì' : 'No') + '</td></tr>';
                       html += '<tr><td><strong>File M3U Esistente:</strong></td><td>' + (data.m3uExists ? 'Sì' : 'No') + '</td></tr>';
                       
                       // Aggiungi informazioni sull'aggiornamento pianificato
                       if (data.scheduledUpdates) {
                           html += '<tr><td><strong>Aggiornamento Automatico:</strong></td><td>Attivo ogni ' + data.updateInterval + '</td></tr>';
                       }
                       
                       if (data.scriptUrl) {
                           html += '<tr><td><strong>URL Script:</strong></td><td>' + data.scriptUrl + '</td></tr>';
                       }
                       if (data.lastError) {
                           html += '<tr><td><strong>Ultimo Errore:</strong></td><td style="color: #ff6666;">' + data.lastError + '</td></tr>';
                       }
                       html += '</table>';
                       
                       contentEl.innerHTML = html;
                   }

                   function showM3uUrl(url) {
                       const urlEl = document.getElementById('generatedM3uUrl');
                       const contentEl = document.getElementById('m3uUrlContent');
                       
                       urlEl.style.display = 'block';
                       contentEl.innerHTML = '<code style="word-break: break-all;">' + url + '</code>';
                   }

                   async function downloadPythonScript() {
                       const url = document.getElementById('pythonScriptUrl').value;
                       if (!url) {
                           alert('Inserisci un URL valido per lo script Python');
                           return;
                       }
                       
                       try {
                           const response = await fetch('/api/python-script', {
                               method: 'POST',
                               headers: {
                                   'Content-Type': 'application/json'
                               },
                               body: JSON.stringify({
                                   action: 'download',
                                   url: url
                               })
                           });
                           
                           const data = await response.json();
                           if (data.success) {
                               alert('Script scaricato con successo!');
                           } else {
                               alert('Errore: ' + data.message);
                           }
                           
                           checkPythonStatus();
                       } catch (error) {
                           alert('Errore nella richiesta: ' + error.message);
                       }
                   }

                   async function executePythonScript() {
                       try {
                           const response = await fetch('/api/python-script', {
                               method: 'POST',
                               headers: {
                                   'Content-Type': 'application/json'
                               },
                               body: JSON.stringify({
                                   action: 'execute'
                               })
                           });
                           
                           const data = await response.json();
                           if (data.success) {
                               alert('Script eseguito con successo!');
                               showM3uUrl(data.m3uUrl);
                           } else {
                               alert('Errore: ' + data.message);
                           }
                           
                           checkPythonStatus();
                       } catch (error) {
                           alert('Errore nella richiesta: ' + error.message);
                       }
                   }

                   async function checkPythonStatus() {
                       try {
                           const response = await fetch('/api/python-script', {
                               method: 'POST',
                               headers: {
                                   'Content-Type': 'application/json'
                               },
                               body: JSON.stringify({
                                   action: 'status'
                               })
                           });
                           
                           const data = await response.json();
                           showPythonStatus(data);
                           
                           if (data.m3uExists) {
                               showM3uUrl(window.location.origin + '/generated-m3u');
                           }
                       } catch (error) {
                           alert('Errore nella richiesta: ' + error.message);
                       }
                   }

                   function useGeneratedM3u() {
                       const m3uUrl = window.location.origin + '/generated-m3u';
                       document.querySelector('input[name="m3u"]').value = m3uUrl;
                       alert('URL della playlist generata impostato nel campo M3U URL!');
                   }
                   
                   async function scheduleUpdates() {
                       const interval = document.getElementById('updateInterval').value;
                       if (!interval) {
                           alert('Inserisci un intervallo valido (es. 12:00)');
                           return;
                       }
                       
                       try {
                           const response = await fetch('/api/python-script', {
                               method: 'POST',
                               headers: {
                                   'Content-Type': 'application/json'
                               },
                               body: JSON.stringify({
                                   action: 'schedule',
                                   interval: interval
                               })
                           });
                           
                           const data = await response.json();
                           if (data.success) {
                               alert(data.message);
                           } else {
                               alert('Errore: ' + data.message);
                           }
                           
                           checkPythonStatus();
                       } catch (error) {
                           alert('Errore nella richiesta: ' + error.message);
                       }
                   }

                   async function stopScheduledUpdates() {
                       try {
                           const response = await fetch('/api/python-script', {
                               method: 'POST',
                               headers: {
                                   'Content-Type': 'application/json'
                               },
                               body: JSON.stringify({
                                   action: 'stopSchedule'
                               })
                           });
                           
                           const data = await response.json();
                           alert(data.message);
                           checkPythonStatus();
                       } catch (error) {
                           alert('Errore nella richiesta: ' + error.message);
                       }
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
