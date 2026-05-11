const { google } = require("googleapis");
const { JWT } = require("google-auth-library");
const https = require("https");
const keys = require("../credentials.json");

// -----------------------------
// Environment tweaks
// -----------------------------
process.env.GOOGLE_API_USE_MTLS_ENDPOINT = "never";
const keepAliveAgent = new https.Agent({ keepAlive: true });
google.options({ httpAgent: keepAliveAgent });

// ✅ ระบบจัดการคิว (Queue Management)
const logQueue = [];
let isProcessing = false;

let _cachedAuthClient = null;
async function getSheetsClientCached() {
    if (_cachedAuthClient) return _cachedAuthClient;
    if (!keys.client_email || !keys.private_key) {
        console.log("❌ Missing credentials in credentials.json");
        return null;
    }
    const client = new JWT({
        email: keys.client_email,
        key: keys.private_key,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    await client.authorize();
    _cachedAuthClient = client;
    return _cachedAuthClient;
}

// -----------------------------
// Helpers: คำนวณเวลา
// -----------------------------
function timeToMinutes(durationStr) {
    if (!durationStr) return 0;
    const [hrs, mins, secs] = durationStr.split(':').map(Number);
    return (hrs * 60) + mins + (secs / 60);
}

function minutesToHHmm(totalMinutes) {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function getColumnByDate(dateStr) {
    if (!dateStr) return null;
    const [d, m, y] = dateStr.split('/').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const day = dateObj.getDay(); 
    const map = { 1: "L", 2: "M", 3: "N", 4: "O", 5: "P", 6: "Q", 0: "R" }; 
    return map[day] || null; 
}

// -----------------------------
// SMART row finder
// -----------------------------
async function findRowSmart(sheets, spreadsheetId, sheetName, name) {
    const range = `${sheetName}!B:C`;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rowData = resp.data.values || []; 
    const lowerCaseName = (name || "").trim().toLowerCase();

    let rowIndexB = rowData.findIndex((r, idx) => 
        idx >= 2 && r[0] && r[0].toLowerCase().includes(lowerCaseName)
    );
    if (rowIndexB !== -1) return { row: rowIndexB + 1 };

    let rowIndexC = rowData.findIndex((r, idx) => 
        idx >= 2 && r[1] && r[1].trim().toLowerCase() === lowerCaseName
    );
    if (rowIndexC !== -1) return { row: rowIndexC + 1 };

    return { row: Math.max(rowData.length, 200) + 1 };
}

// -----------------------------
// Extract Info (เพิ่มการดึง inTime)
// -----------------------------
function extractInfo(text) {
    text = text.replace(/`/g, "").replace(/\*/g, "").replace(/\u200B/g, "");
    const name = (text.match(/รายงานเข้าเวรของ\s*[-–—]\s*(.+)/i) || [])[1]?.trim() || null;
    const inMatch = text.match(/เวลาเข้างาน[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/i);
    const outMatch = text.match(/เวลาออกงาน[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/i);
    const duration = (text.match(/ระยะเวลาที่เข้าเวร\s*\n?\s*(\d{2}:\d{2}:\d{2})/i) || [])[1] || null;
    const id = (text.match(/(steam:\w+)/i) || [])[1] || null;

    return { 
        name, 
        inDate: inMatch ? inMatch[1] : null, 
        inTime: inMatch ? inMatch[2] : null, 
        date: outMatch ? outMatch[1] : null, 
        time: outMatch ? outMatch[2] : null, 
        id, 
        duration 
    };
}

// -----------------------------
// ระบบบวกเวลาสะสม
// -----------------------------
async function accumulateTime(sheets, spreadsheetId, sheetName, col, row, newMinutes) {
    const range = `${sheetName}!${col}${row}`;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    let currentVal = resp.data.values?.[0]?.[0] || "00:00";
    
    let oldMinutes = 0;
    if (currentVal.includes(":")) {
        const [h, m] = currentVal.split(":").map(Number);
        oldMinutes = (h * 60) + m;
    }
    
    const totalMinutes = oldMinutes + newMinutes;
    const timeString = minutesToHHmm(totalMinutes);

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[timeString]] }
    });
    return timeString;
}

// -----------------------------
// ระบบจัดการคิว (Queue Processor)
// -----------------------------
async function processQueue() {
    if (isProcessing || logQueue.length === 0) return;
    
    isProcessing = true;
    const info = logQueue.shift();

    try {
        await saveLog(info);
        await new Promise(resolve => setTimeout(resolve, 800)); // เว้นจังหวะ API
    } catch (err) {
        console.error("❌ Queue Error:", err.message);
    } finally {
        isProcessing = false;
        processQueue();
    }
}

// -----------------------------
// SAVE LOG
// -----------------------------
async function saveLog(info) {
    const { name, inDate, inTime, date, time, id, duration } = info;
    const spreadsheetId = "1GIgLq2Pr0Omne6QH64a_K2Iw2Po8FVjRqnltlw-a5zM";
    const sheetName = "logtime";

    const auth = await getSheetsClientCached();
    const sheets = google.sheets({ version: "v4", auth });
    const { row } = await findRowSmart(sheets, spreadsheetId, sheetName, name);

    const updateData = [
        { range: `${sheetName}!C${row}:E${row}`, values: [[name, date, time]] }
    ];
    if (id) updateData.push({ range: `${sheetName}!G${row}`, values: [[id]] });

    try {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: { valueInputOption: "USER_ENTERED", data: updateData },
        });

        const totalMinutes = timeToMinutes(duration);
        let logDayMsg = "";

        // ✅ คำนวณแยกนาทีตามจริง (Daily Split)
        if (inDate && date && inDate !== date) {
            const [inH, inM, inS] = inTime.split(':').map(Number);
            const minutesInFirstDay = 1440 - ((inH * 60) + inM + (inS / 60));
            const minutesInSecondDay = Math.max(0, totalMinutes - minutesInFirstDay);

            const colStart = getColumnByDate(inDate);
            const colEnd = getColumnByDate(date);

            if (colStart) await accumulateTime(sheets, spreadsheetId, sheetName, colStart, row, minutesInFirstDay);
            if (colEnd) await accumulateTime(sheets, spreadsheetId, sheetName, colEnd, row, minutesInSecondDay);
            logDayMsg = `(แยกจริง: ${inDate}=${Math.round(minutesInFirstDay)}น., ${date}=${Math.round(minutesInSecondDay)}น.)`;
        } else {
            const targetCol = getColumnByDate(date);
            if (targetCol) {
                const newTotal = await accumulateTime(sheets, spreadsheetId, sheetName, targetCol, row, totalMinutes);
                logDayMsg = `(คอลัมน์ ${targetCol}, รวมใหม่: ${newTotal})`;
            }
        }

        console.log(`✔ บันทึกสำเร็จ: ${name} [${duration}] ${logDayMsg}`);
    } catch (err) {
        throw err;
    }
}

// -----------------------------
// Discord listener
// -----------------------------
function initializeLogListener(client) {
    const LOG_CHANNEL = "1445640443986710548";
    client.on("messageCreate", message => {
        if (message.channel.id !== LOG_CHANNEL) return;
        
        const lines = [];
        if (message.content) lines.push(message.content);
        if (message.embeds) {
            message.embeds.forEach(e => {
                lines.push(e.title, e.description);
                e.fields?.forEach(f => lines.push(f.name, f.value));
            });
        }
        const text = lines.filter(Boolean).join("\n");
        const info = extractInfo(text);

        if (info.name && info.date) {
            console.log(`📥 เพิ่มคิว: ${info.name} (รออยู่: ${logQueue.length})`);
            logQueue.push(info);
            processQueue();
        }
    });
}

module.exports = { initializeLogListener };