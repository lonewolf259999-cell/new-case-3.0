require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { initBot } = require('./systems/bot.js');
const { initCommands } = require('./systems/commands.js');
const { handleInteractions } = require('./interactionHandler.js');
const { loadConfigFromSheets } = require('./configManager.js');
const http = require('http');
const https = require('https');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: ['MESSAGE', 'CHANNEL', 'GUILD_MEMBER'] 
});

async function startApp() {
    // 1. โหลด Config จาก Google Sheets ผ่าน configManager
    const config = await loadConfigFromSheets(); 
    
    // 2. ส่งต่อ Client และ Config ไปยังระบบต่างๆ
    initBot(client, config);
    initCommands(client, config);
    handleInteractions(client, config);

    client.login(process.env.DISCORD_TOKEN);
}

// Keep-alive server สำหรับ Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200); res.end('Police Bot is running!');
}).listen(PORT);

const APP_URL = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
setInterval(() => { https.get(APP_URL, () => {}); }, 5 * 60 * 1000);

startApp();