const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');

async function generateConfig() {
    try {
        console.log('\n=== Generazione Configurazione Iniziale ===');
        
        // Crea un'istanza del transformer
        const transformer = new PlaylistTransformer();
        
        // Carica e trasforma la playlist usando l'URL dalla configurazione
        const data = await transformer.loadAndTransform(config.M3U_URL);
        console.log(`Trovati ${data.genres.length} generi`);
        console.log('EPG URL configurato:', config.EPG_URL);

        // Crea la configurazione finale
        const finalConfig = {
            ...config,
            manifest: {
                ...config.manifest,
                catalogs: [
                    {
                        ...config.manifest.catalogs[0],
                        extra: [
                            {
                                name: 'genre',
                                isRequired: false,
                                options: data.genres
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
                ]
            }
        };

        console.log('Configurazione generata con i seguenti generi:');
        console.log(data.genres.join(', '));
        if (config.enableEPG) {
            console.log('EPG abilitata, URL:', config.EPG_URL);
        } else {
            console.log('EPG disabilitata');
        }
        console.log('\n=== Fine Generazione Configurazione ===\n');

        return finalConfig;
    } catch (error) {
        console.error('Errore durante la generazione della configurazione:', error);
        throw error;
    }
}

async function startAddon() {
    try {
        // Genera la configurazione dinamicamente
        const generatedConfig = await generateConfig();

        // Create the addon
        const builder = new addonBuilder(generatedConfig.manifest);

        // Define routes
        builder.defineStreamHandler(streamHandler);
        builder.defineCatalogHandler(catalogHandler);
        builder.defineMetaHandler(metaHandler);

        // Initialize the cache manager
        const CacheManager = require('./cache-manager')(generatedConfig);

        // Update cache on startup
        await CacheManager.updateCache(true).catch(error => {
            console.error('Error updating cache on startup:', error);
        });

        // Personalizza la pagina HTML
        const landingTemplate = landing => `
<!DOCTYPE html>
<html style="background: #000">
<head>
    <meta charset="utf-8">
    <title>${landing.name} - Stremio Addon</title>
    <style>
        body {
            background: #000;
            color: #fff;
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
        }
        h1 { color: #fff; }
        .logo {
            width: 150px;
            margin: 0 auto;
            display: block;
        }
        button {
            border: 0;
            outline: 0;
            color: #fff;
            background: #8A5AAB;
            padding: 13px 30px;
            margin: 20px 5px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            border-radius: 5px;
        }
        button:hover {
            background: #9B6BC3;
        }
        .footer {
            margin-top: 50px;
            font-size: 14px;
            color: #666;
        }
        .footer a {
            color: #8A5AAB;
            text-decoration: none;
        }
        .footer a:hover {
            text-decoration: underline;
        }
    </style>
    <script>
        function copyManifestLink() {
            const manifestUrl = window.location.href + 'manifest.json';
            navigator.clipboard.writeText(manifestUrl).then(() => {
                alert('Link del manifest copiato negli appunti!');
            });
        }
    </script>
</head>
<body>
    <img class="logo" src="${landing.logo}" />
    <h1 style="color: white">${landing.name}</h1>
    <h2 style="color: white">${landing.description}</h2>
    <button onclick="window.location = 'stremio://${landing.transportUrl}/manifest.json'">
        Aggiungi a Stremio
    </button>
</body>
</html>`;

        // Create and start the server
        const addonInterface = builder.getInterface();
        const serveHTTP = require('stremio-addon-sdk/src/serveHTTP');

        // Avvia prima il server
        await serveHTTP(addonInterface, { 
            port: generatedConfig.port, 
            landingTemplate 
        });
        
        console.log('Addon attivo su:', `http://localhost:${generatedConfig.port}`);
        console.log('Aggiungi il seguente URL a Stremio:', `http://localhost:${generatedConfig.port}/manifest.json`);

        // Inizializza l'EPG dopo l'avvio del server se è abilitata
        if (generatedConfig.enableEPG) {
            await EPGManager.initializeEPG(generatedConfig.EPG_URL);
        } else {
            console.log('EPG disabilitata, skip inizializzazione');
        }

    } catch (error) {
        console.error('Failed to start addon:', error);
        process.exit(1);
    }
}

// Start the addon
startAddon();
