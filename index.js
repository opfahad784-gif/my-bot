// --- CRITICAL DEPLOYMENT FIXES (DO NOT REMOVE) ---
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const https = require('https');

// --- KEEP ALIVE SERVER ---
const app = express();
app.get('/', (req, res) => res.status(200).send('Bot Status: Online and Active'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

// --- CONFIG ---
const TOKEN = '8413633586:AAE57Su-vUygN74I_vRF40G1HhlIOfsRwok'; 
const ADMIN_ID = 7488161246;
const GROUP_ID = -1003958220896;

// --- DATABASE (GLOBAL SCOPE) ---
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

// --- INITIALIZE BOT ---
const bot = new TelegramBot(TOKEN, { 
    polling: {
        autoStart: true,
        params: { timeout: 10 }
    } 
});

// --- HELPER FUNCTIONS ---
const checkJoin = async (userId) => {
    try {
        const res1 = await bot.getChatMember(config.otpUsername, userId);
        const res2 = await bot.getChatMember(config.updateUsername, userId);
        const statuses = ['member', 'administrator', 'creator'];
        return statuses.includes(res1.status) && statuses.includes(res2.status);
    } catch (e) { return false; }
};

const sendJoinMessage = (chatId) => {
    const msg = `🚫 **Access Denied!**\n\n⚠️ **You are NOT Verified.**\nYou must join our channels to access this bot.\n\n👇 **Join below then click 'I Have Joined':**`;
    bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
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
    if (!countryName) return "🌍";
    const flags = {
        "syria": "🇸🇾", "india": "🇮🇳", "bangladesh": "🇧🇩", "usa": "🇺🇸", 
        "russia": "🇷🇺", "indonesia": "🇮🇩", "vietnam": "🇻🇳", "thailand": "🇹🇭", "sudan": "🇸🇩"
    };
    return flags[countryName.toLowerCase()] || "🌍";
};

const sendMainMenu = (chatId, username) => {
    bot.sendMessage(chatId, `Welcome! 👋 @${username || 'User'}\n\nClick the Get Number button to receive your number!`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "💰 Balance", callback_data: "menu_balance" }],
                [{ text: "📱 Active Number", callback_data: "menu_active" }, { text: "💸 Withdraw", callback_data: "menu_withdraw" }],
                [{ text: "🤖 Bot Update Channel", url: config.updateGroup }]
            ]
        }
    });
};

// --- CALLBACK QUERIES ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    const isJoined = await checkJoin(userId);
    if (!isJoined && userId !== ADMIN_ID && data !== "check_join") {
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        return sendJoinMessage(chatId);
    }

    if (data === "check_join") {
        const joined = await checkJoin(userId);
        if (joined) {
            if (!users[userId]) users[userId] = { balance: 0, username: query.from.username || 'Not set' };
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendMainMenu(chatId, query.from.username);
        } else {
            bot.answerCallbackQuery(query.id, { text: "❌ Join both channels first!", show_alert: true });
        }
    }
    else if (data === "menu_balance") {
        const user = users[userId] || { balance: 0 };
        let msg = `💰 **Your Balance:** $${user.balance.toFixed(4)}\n\n`;
        msg += `💡 **Earning Rates:**\n`;
        Object.keys(services).forEach(s => {
            const rate = (services[s] && services[s].rates) ? (Object.values(services[s].rates)[0] || 0.0030) : 0.0030;
            msg += `• ${s}: $${rate.toFixed(4)}\n`;
        });
        msg += `\n💳 **Minimum Withdrawal:** $1.0000`;

        bot.editMessageText(msg, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💸 Transfer Balance", callback_data: "transfer_bal" }, { text: "🔙 Back to Menu", callback_data: "main_menu" }]
                ]
            }
        });
    }
    else if (data === "transfer_bal") {
        const user = users[userId] || { balance: 0 };
        if (user.balance < 1.0000) return bot.answerCallbackQuery(query.id, { text: "❌ Not enough money.", show_alert: true });
        transferStates[userId] = { step: 1 };
        bot.editMessageText(`💸 *Transfer Balance - Step 1/3*\n\n💰 *Your Balance:* $${user.balance.toFixed(4)}\n\n👤 Please enter the *User ID* to transfer to:`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "cancel_transfer" }]] }
        });
    }
    else if (data === "confirm_transfer") {
        const state = transferStates[userId];
        if (!state || state.step !== 3) return;
        if (users[userId] && users[userId].balance >= state.amount) {
            users[userId].balance -= state.amount;
            if (!users[state.targetId]) users[state.targetId] = { balance: 0, username: 'Not set' };
            users[state.targetId].balance += state.amount;
            bot.editMessageText(`✅ *Transfer Successful!*\n\n💸 Sent $${state.amount.toFixed(4)} to ID: \`${state.targetId}\``, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
            });
            bot.sendMessage(state.targetId, `💰 *Balance Received!* $${state.amount.toFixed(4)} from \`${userId}\``, { parse_mode: "Markdown" }).catch(() => {});
        }
        delete transferStates[userId];
    }
    else if (data === "menu_withdraw") {
        if (!isWithdrawActive) {
            const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
            bot.editMessageText(`📅 **Withdrawal Not Available Today**\n🗓 **Today:** ${today}\n✅ **Withdrawal Day:** Tuesday (12am-12pm)\n\n💡 You can only withdraw on Tuesdays.`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
            });
        } else {
            const user = users[userId] || { balance: 0 };
            bot.editMessageText(`💰 **Your Balance:** $${user.balance.toFixed(4)}\n📉 **Minimum:** $1.0000\n\n👇 **Click below to start**`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "💸 Withdraw Now", callback_data: "withdraw_now" }], [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
            });
        }
    }
    else if (data === "withdraw_now") {
        const user = users[userId] || { balance: 0 };
        if (user.balance < 1.0000) return bot.answerCallbackQuery(query.id, { text: "❌ Minimum $1.00 required.", show_alert: true });
        withdrawStates[userId] = { step: 1 };
        bot.editMessageText(`🏦 *Withdrawal*\n\n💳 Enter your *Binance UID*:`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "main_menu" }]] } });
    }
    else if (data === "confirm_withdraw") {
        const state = withdrawStates[userId];
        if (state && users[userId].balance >= state.amount) {
            users[userId].balance -= state.amount;
            bot.editMessageText(`✅ **Request Sent!**\n💵 Amount: $${state.amount.toFixed(4)}`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu", callback_data: "main_menu" }]] } });
            bot.sendMessage(ADMIN_ID, `🚨 **WITHDRAWAL**\nID: \`${userId}\`\nUID: \`${state.binanceId}\`\nAmt: $${state.amount.toFixed(4)}`, { parse_mode: "Markdown" });
        }
        delete withdrawStates[userId];
    }
    else if (data === "menu_get_number") {
        const serviceKeys = Object.keys(services);
        if (serviceKeys.length === 0) return bot.answerCallbackQuery(query.id, { text: "No services available!", show_alert: true });
        let buttons = serviceKeys.map(s => [{ text: s, callback_data: `service_${s}` }]);
        buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);
        bot.editMessageText("🛠 Select platform:", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
    }
    else if (data.startsWith("service_")) {
        const sName = data.split("_")[1];
        const countries = services[sName].countries || [];
        let buttons = countries.map(c => [{ text: `${c} ${getFlag(c)}`, callback_data: `country_${sName}_${c}` }]);
        buttons.push([{ text: "🔙 Back", callback_data: "menu_get_number" }]);
        bot.editMessageText(`🌍 Select country for ${sName}:`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
    }
    else if (data.startsWith("country_")) {
        const [, sName, cName] = data.split("_");
        const idx = availableNumbers.findIndex(n => n.service.toLowerCase() === sName.toLowerCase() && n.country.toLowerCase() === cName.toLowerCase());
        if (idx === -1) return bot.answerCallbackQuery(query.id, { text: "⚠️ No numbers!", show_alert: true });
        const numData = availableNumbers.splice(idx, 1)[0];
        assignedNumbers.push({ ...numData, userId });
        bot.editMessageText(`✅ *Number Assigned!*\n📱 *${sName}* | \`${numData.number}\` | ${cName}\n\n⏳ Waiting for OTP...`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🗑 Delete", callback_data: `del_${numData.number}` }], [{ text: "📱 OTP GROUP", url: config.otpGroup }]] }
        });
    }
    else if (data === "main_menu" || data === "cancel_transfer") {
        delete withdrawStates[userId];
        delete transferStates[userId];
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
    else if (data.startsWith("del_")) {
        const num = data.replace("del_", ""); 
        const dIdx = assignedNumbers.findIndex(n => n.number === num && n.userId === userId);
        if (dIdx !== -1) {
            const d = assignedNumbers.splice(dIdx, 1)[0];
            availableNumbers.push({ service: d.service, country: d.country, number: d.number });
        }
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
});

// --- OTP LOGIC ---
const handleOtpMatch = (chatId, msgTitle, msgText) => {
    if (chatId === GROUP_ID || (msgTitle && msgTitle.toLowerCase().includes("otp"))) {
        const matchIndex = assignedNumbers.findIndex(item => msgText.includes(String(item.number).slice(-4)));
        if (matchIndex !== -1) {
            const item = assignedNumbers[matchIndex];
            const reward = (services[item.service] && services[item.service].rates[item.country]) ? services[item.service].rates[item.country] : 0.0030;
            if (!users[item.userId]) users[item.userId] = { balance: 0 };
            users[item.userId].balance += reward;
            bot.sendMessage(item.userId, `🔔 **OTP RECEIVED!**\n🔢 \`${item.number}\`\n💬 Msg: ${msgText}\n💰 Earned: $${reward.toFixed(4)}`, { parse_mode: "Markdown" }).catch(() => {});
            assignedNumbers.splice(matchIndex, 1);
        }
        return true;
    }
    return false;
};

bot.on('channel_post', (msg) => handleOtpMatch(msg.chat.id, msg.chat.title, msg.text || msg.caption || ""));

// --- MESSAGE HANDLER ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const msgText = msg.text || msg.caption || "";
    if (handleOtpMatch(chatId, msg.chat.title, msgText)) return;
    const userId = msg.from ? msg.from.id : null;
    if (!userId) return;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'Not set' };
    if (msg.from.username) users[userId].username = msg.from.username;

    if (msgText === '/id') return bot.sendMessage(chatId, `👤 ID: \`${userId}\``, { parse_mode: "Markdown" });
    if (msgText === '/start') return sendMainMenu(chatId, msg.from.username);

    // --- ADMIN COMMANDS ---
    if (userId === ADMIN_ID) {
        if (msgText === '/withdrawaldayon') { isWithdrawActive = true; return bot.sendMessage(chatId, "✅ Withdrawal ON"); }
        if (msgText === '/withdrawaldayoff') { isWithdrawActive = false; return bot.sendMessage(chatId, "❌ Withdrawal OFF"); }
        if (msgText === '/seeuser') return bot.sendMessage(chatId, `Total: ${Object.keys(users).length}`);
        
        if (msgText.startsWith('/bulk')) {
            const parts = msgText.replace('/bulk', '').trim().split(',');
            if (parts.length >= 2 && msg.document) {
                const sName = parts[0].trim(), cName = parts[1].trim();
                const fileLink = await bot.getFileLink(msg.document.file_id);
                https.get(fileLink, (res) => {
                    let d = ''; res.on('data', chunk => d += chunk);
                    res.on('end', () => {
                        if (!services[sName]) services[sName] = { countries: [], rates: {} };
                        if (!services[sName].countries.includes(cName)) services[sName].countries.push(cName);
                        d.split('\n').forEach(line => {
                            const n = line.replace(/\D/g, '').trim();
                            if (n.length >= 5) availableNumbers.push({ service: sName, country: cName, number: n });
                        });
                        bot.sendMessage(chatId, "✅ Bulk Added");
                    });
                });
            }
        }
        if (msgText.startsWith('/addservice')) {
            const sName = msgText.replace('/addservice', '').trim();
            if (sName) { services[sName] = { countries: [], rates: {} }; bot.sendMessage(chatId, `✅ Added: ${sName}`); }
        }
        if (msgText.startsWith('/baladd')) {
            const p = msgText.split(' ');
            if (p.length >= 4) {
                const amt = parseFloat(p.pop()), s = p[1], c = p.slice(2).join(' ');
                if (services[s]) { services[s].rates[c] = amt; bot.sendMessage(chatId, `✅ Rate: $${amt}`); }
            }
        }
    }

    // --- WITHDRAW STEP LOGIC ---
    if (withdrawStates[userId]) {
        const state = withdrawStates[userId];
        if (state.step === 1) {
            state.binanceId = msgText.trim(); state.step = 2;
            bot.sendMessage(chatId, `💰 Enter amount to withdraw (Min $1.00):`, { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } });
        } else if (state.step === 2) {
            const amt = parseFloat(msgText);
            if (isNaN(amt) || amt < 1.0 || amt > users[userId].balance) return bot.sendMessage(chatId, "❌ Invalid amount.");
            state.amount = amt; state.step = 3;
            bot.sendMessage(chatId, `⚠️ Confirm withdraw $${amt}?`, { reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_withdraw" }, { text: "❌ No", callback_data: "main_menu" }]] } });
        }
        return;
    }

    // --- TRANSFER STEP LOGIC ---
    if (transferStates[userId]) {
        const state = transferStates[userId];
        if (state.step === 1) {
            state.targetId = parseInt(msgText); state.step = 2;
            bot.sendMessage(chatId, `💵 Enter amount:`, { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } });
        } else if (state.step === 2) {
            const amt = parseFloat(msgText);
            if (isNaN(amt) || amt <= 0 || amt > users[userId].balance) return bot.sendMessage(chatId, "❌ Error.");
            state.amount = amt; state.step = 3;
            bot.sendMessage(chatId, `⚠️ Transfer $${amt} to ${state.targetId}?`, { reply_markup: { inline_keyboard: [[{ text: "✅ Yes", callback_data: "confirm_transfer" }, { text: "❌ No", callback_data: "main_menu" }]] } });
        }
        return;
    }
});

// --- SILENT ERROR HANDLING ---
bot.on("polling_error", () => {});
process.on('unhandledRejection', () => {});
    
