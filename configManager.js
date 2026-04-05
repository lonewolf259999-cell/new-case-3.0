const { google } = require('googleapis');
const keys = require('./credentials.json');
const CONFIG_SPREADSHEET_ID = '1YV_BIFiilxUM9XrW1cSYZTOgne1JnKoCXtRw7PUCCGs';

async function loadConfigFromSheets() {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: keys.client_email, private_key: keys.private_key },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: CONFIG_SPREADSHEET_ID, range: 'config!A2:B' });
        const rows = response.data.values;

        let config = { CHANNELS: {} };
        if (rows) {
            rows.forEach(row => {
                const key = row[0]?.trim();
                const value = row[1]?.trim();
                if (['TECH2', 'KADEE', 'CAR', 'EXAM'].includes(key)) config.CHANNELS[key] = value;
                else config[key] = value;
            });
        }
        return config;
    } catch (e) {
        console.error('Load config error:', e.message);
        return { CHANNELS: {} };
    }
}

async function updateConfigInSheets(newConfig) {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: keys.client_email, private_key: keys.private_key },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const data = [
            ['SPREADSHEET_ID', newConfig.SPREADSHEET_ID],
            ['SHEET_NAME', newConfig.SHEET_NAME],
            ['TECH2', newConfig.CHANNELS.TECH2],
            ['KADEE', newConfig.CHANNELS.KADEE],
            ['CAR', newConfig.CHANNELS.CAR],
            ['EXAM', newConfig.CHANNELS.EXAM]
        ];
        await sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG_SPREADSHEET_ID,
            range: 'config!A2:B',
            valueInputOption: 'USER_ENTERED',
            resource: { values: data }
        });
    } catch (err) { console.error('Update config error:', err); }
}

module.exports = { loadConfigFromSheets, updateConfigInSheets };