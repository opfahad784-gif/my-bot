// --- CRITICAL DEPLOYMENT FIXES ---
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const https = require('https');

// --- KEEP ALIVE SERVER ---
const app = express();
app.get('/', (req, res) => res.status(200).send('Bot Active'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

// --- CONFIG ---
const TOKEN = '8413633586:AAE57Su-vUygN74I_vRF40G1HhlIOfsRwok'; 
const ADMIN_ID = 7488161246;
const GROUP_ID = -1003958220896;

// --- DATABASE (GLOBAL) ---
let users = {}; 
let services = {}; 
let availableNumbers = []; 
let assignedNumbers = []; 
let transferStates = {}; 
let withdrawStates = {}; 
let isWithdrawActive = false; 

const config = {
    otpGroup: "https://t.me/yoosms_otp", 
    updateGroup: "https://t.me/yooosmsupdate",
    otpUsername: "@yoosms_otp",
    updateUsername: "@yooosmsupdate"
};

const bot = new TelegramBot(TOKEN, { polling: true });

// --- HELPERS ---
const checkJoin = async (userId) => {
    try {
        const res1 = await bot.getChatMember(config.otpUsername, userId);
        const res2 = await bot.getChatMember(config.updateUsername, userId);
        const statuses = ['member', 'administrator', 'creator'];
        return statuses.includes(res1.status) && statuses.includes(res2.status);
    } catch (e) { return false; }
};

const sendJoinMessage = (chatId) => {
    bot.sendMessage(chatId, `🚫 **Access Denied!**\n\n⚠️ Join our channels to use this bot.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📢 Join Channel 1", url: config.updateGroup }],
                [{ text: "📢 Join Channel 2", url: config.otpGroup }],
                [{ text: "✅ I Have Joined", callback_data: "check_join" }]
            ]
        }
    });
};

const getFlag = (countryName) => {
    const flags = { "syria": "🇸🇾", "india": "🇮🇳", "bangladesh": "🇧🇩", "usa": "🇺🇸", "russia": "🇷🇺" };
    return flags[countryName.toLowerCase()] || "🌍";
};

const sendMainMenu = (chatId, username) => {
    bot.sendMessage(chatId, `Welcome! 👋 @${username || 'User'}\n\nClick the Get Number button to receive your number!`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "💰 Balance", callback_data: "menu_balance" }],
                [{ text: "📱 Active Number", callback_data: "menu_active" }, { text: "💸 Withdraw", callback_data: "menu_withdraw" }],
                [{ text: "🤖 Update Channel", url: config.updateGroup }]
            ]
        }
    });
};

// --- CALLBACKS ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    const isJoined = await checkJoin(userId);
    if (!isJoined && userId !== ADMIN_ID && data !== "check_join") return sendJoinMessage(chatId);

    if (data === "check_join") {
        if (await checkJoin(userId)) sendMainMenu(chatId, query.from.username);
        else bot.answerCallbackQuery(query.id, { text: "❌ Join first!", show_alert: true });
    }
    else if (data === "menu_balance") {
        const user = users[userId] || { balance: 0 };
        bot.editMessageText(`💰 **Balance:** $${user.balance.toFixed(4)}`, {
            chat_id: chatId, message_id: query.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: "💸 Transfer", callback_data: "transfer_bal" }, { text: "🔙 Back", callback_data: "main_menu" }]] }
        });
    }
    // ... (অগের সব callback লজিক এখানে হুবহু থাকবে)
    else if (data === "main_menu") {
        sendMainMenu(chatId, query.from.username);
    }
});

// --- MESSAGES & ADMIN COMMANDS ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from ? msg.from.id : null;
    const msgText = msg.text || "";

    if (!userId) return;

    // ইউজার ডাটা সেভ (নাম সহ)
    if (!users[userId]) {
        users[userId] = { 
            balance: 0, 
            username: msg.from.username || 'N/A', 
            name: msg.from.first_name || 'User' 
        };
    } else {
        users[userId].username = msg.from.username || users[userId].username;
        users[userId].name = msg.from.first_name || users[userId].name;
    }

    if (msgText === '/start') return sendMainMenu(chatId, msg.from.username);
    if (msgText === '/id') return bot.sendMessage(chatId, `🆔 ID: \`${userId}\``, { parse_mode: "Markdown" });

    // --- ADMIN SECTION ---
    if (userId === ADMIN_ID) {
        // নতুন /seeuser: নাম ও ইউজারনেম সহ দেখাবে
        if (msgText === '/seeuser') {
            let list = `👥 **User Database:**\n\n`;
            Object.keys(users).forEach(id => {
                list += `👤 **${users[id].name}**\n🆔 \`${id}\` | @${users[id].username}\n💰 Bal: $${users[id].balance.toFixed(4)}\n\n`;
            });
            return bot.sendMessage(chatId, list, { parse_mode: "Markdown" });
        }

        // /addbal username amount
        if (msgText.startsWith('/addbal')) {
            const parts = msgText.split(' ');
            if (parts.length < 3) return bot.sendMessage(chatId, "Usage: /addbal username amount");
            const targetUser = parts[1].replace('@', '').toLowerCase();
            const amount = parseFloat(parts[2]);
            
            const targetId = Object.keys(users).find(id => users[id].username && users[id].username.toLowerCase() === targetUser);
            if (targetId) {
                users[targetId].balance += amount;
                bot.sendMessage(chatId, `✅ Added $${amount} to @${targetUser}`);
                bot.sendMessage(targetId, `💰 **Admin added $${amount} to your balance!**`);
            } else {
                bot.sendMessage(chatId, "❌ User not found in database.");
            }
        }

        if (msgText === '/withdrawaldayon') { isWithdrawActive = true; bot.sendMessage(chatId, "✅ Withdrawal ON"); }
        if (msgText === '/withdrawaldayoff') { isWithdrawActive = false; bot.sendMessage(chatId, "❌ Withdrawal OFF"); }
        
        // Bulk add logic
        if (msgText.startsWith('/bulk') && msg.document) {
            const parts = msgText.replace('/bulk', '').trim().split(',');
            const sName = parts[0].trim(), cName = parts[1].trim();
            const link = await bot.getFileLink(msg.document.file_id);
            https.get(link, (res) => {
                let d = ''; res.on('data', c => d += c);
                res.on('end', () => {
                    if (!services[sName]) services[sName] = { countries: [], rates: {} };
                    if (!services[sName].countries.includes(cName)) services[sName].countries.push(cName);
                    d.split('\n').forEach(l => {
                        const n = l.replace(/\D/g, '').trim();
                        if (n.length >= 5) availableNumbers.push({ service: sName, country: cName, number: n });
                    });
                    bot.sendMessage(chatId, "✅ Bulk Added Success");
                });
            });
        }
    }

    // --- WITHDRAW & TRANSFER LOGIC (আগের মতোই থাকবে) ---
});

bot.on("polling_error", () => {}); 
