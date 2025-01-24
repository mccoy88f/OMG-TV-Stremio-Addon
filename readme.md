# OMG TV & OMG+ TV - Stremio Addon

An add-on for Stremio to add M3U channel playlists with EPG to the catalog.
FOR THE PLUS VERSION TO INSERT YOUR OWN LIST, visit this repository: https://github.com/mccoy88f/OMG-Plus-TV-Stremio-Addon

## LEGGIMI IN ITALIANO QUI 
https://github.com/mccoy88f/OMG-TV-Stremio-Addon/blob/main/readme.it.md

## 🚀 What's New in This Version

### Key Features
- 🔒 Base Version: **Static Playlist**: Fully hardcoded URL
- 🔒 Plus Version: **Dynamic Playlist**: URL defined via environment variable
- 🛡️ Simplified and more secure configuration
- 📺 Base Version: Always up-to-date Italian TV channels with no setup required

### Playlist Used
- **Fixed multiplaylist URL**: `https://github.com/mccoy88f/OMG-TV-Stremio-Addon/tree/link.playlist`
- **Fixed multiplaylist EPG**: `https://github.com/mccoy88f/OMG-TV-Stremio-Addon/tree/link.epg`
- **Custom multiplaylist URL & EPG** uses the plus version: `https://github.com/mccoy88f/OMG-TV-Stremio-Addon/tree/plus`
  
## 🌟 Features 

### Core
- Channel display by category
- Channel search by name
- Automatic sorting by channel number
- Data caching with automatic updates

### EPG (Electronic Program Guide)
- EPG support with detailed information
- Display of current program
- List of upcoming programs

### Streaming
- Direct support for HLS streams
- Integration with MediaFlow Proxy
- Custom User-Agent management

## 🛠️ Configuration

### Supported Environment Variables

#### ENABLE_EPG
- Enable/disable EPG features
- Values: 
  - `no` to disable 
- Default: enabled
- WARNING: EPG with extracted size greater than 5/7 MB may block servers if hosted on Render.com

#### Timezone Configuration
The EPG (Electronic Program Guide) data is often provided in UTC. To ensure that the program times are displayed correctly in your local timezone, you can configure the timezone offset using the TIMEZONE_OFFSET environment variable.

Setting the Timezone Offset
Format: The TIMEZONE_OFFSET must be in the format ±HH:MM. For example:

+1:00 for Central European Time (CET).
-5:00 for Eastern Standard Time (EST).

Default Value: If the TIMEZONE_OFFSET is not set, the add-on will default to +1:00 (CET).

#### PROXY_URL and PROXY_PASSWORD
- MediaFlow Proxy configuration
- Optional for compatibility with Android and Web

#### FORCE_PROXY
- Forces the use of the proxy if configured, removing direct channels

#### PORT
- Server port
- Default: 10000

## 📦 Installation

### Local Deployment
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the addon:
   ```bash
   npm start
   ```

### Deployment on Render.com
1. Link the repository to Render
2. Configure optional environment variables and proceed with deployment or
3. Automatic deployment via this button (a free Render.com account is required) - Select the plus branch to activate the plus version

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mccoy88f/OMG-TV-Stremio-Addon)

## 🔄 Changelog

### v2.0.0
- 🔒 Updated playlist for the base version with active and updated EPG. Only missing EPG for Rakuten and Samsung TV channels
- 📃 Multiplaylist - multiepg mode (plus version only): instead of directly linking to a playlist or EPG, you can insert in the variables the link to a text file containing multiple links
- 🚀 Improved stability and ease of configuration

## 🤝 Contributing
1. Fork the repository
2. Create a branch for your feature
3. Commit your changes
4. Push the branch
5. Open a Pull Request

## ⚠️ Warnings
- EPG may not work on some free hosting services
- Some streams may require the proxy
- ⚠️ Render.com has a timer that puts the server on standby if not used, slowing down the restart; use [uptime](https://uptimerobot.com/) to solve the issue

## 📋 Requirements
- Node.js 16+
- Internet connection
- Stremio client

## 🔒 Disclaimer
- I am not responsible for any illegal use of this addon
- Content provided by third parties
- No guarantee on channel availability

## 👏 Acknowledgments
- Thanks to FuriousCat for the OMG name idea
- Thanks to the entire team at https://www.reddit.com/r/Stremio_Italia/ for the support, suggestions, and guides for this addon, also available on the Telegram channel https://t.me/Stremio_ITA

## 📜 License
Project released under the MIT license.
