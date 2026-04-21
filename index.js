const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// --- CONFIG ---
const TOKEN = '8413633586:AAE57Su-vUygN74I_vRF40G1HhlIOfsRwok'; 
const ADMIN_ID = 7488161246;
const GROUP_ID = -1003958220896;

const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATABASE ---
let users = {}; 
let services = {}; 
let availableNumbers = []; 
let assignedNumbers = []; 
let config = {
    otpGroup: "https://t.me/",
    updateGroup: "https://t.me/SureSmsOfficial"
};

// --- UI HELPERS ---
const sendMainMenu = (chatId, username) => {
    const text = `Welcome! 👋 @${username || 'User'}\n\nClick the Get Number button to receive your number!`;
    bot.sendMessage(chatId, text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "💰 Balance", callback_data: "menu_balance" }],
                [{ text: "📱 Active Number", callback_data: "menu_active" }, { text: "💸 Withdraw", callback_data: "menu_withdraw" }],
                [{ text: "🤖 Bot Update Channel", url: config.updateGroup }]
            ]
        }
    });
};

// --- CALLBACK HANDLER ---
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (data === "menu_get_number") {
        const serviceKeys = Object.keys(services);
        if (serviceKeys.length === 0) return bot.answerCallbackQuery(query.id, { text: "No services added yet!", show_alert: true });

        let buttons = serviceKeys.map(s => [{ text: s, callback_data: `service_${s}` }]);
        buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);
        bot.editMessageText("🛠 Select the platform you need to access:", {
            chat_id: chatId, message_id: query.message.message_id,
            reply_markup: { inline_keyboard: buttons }
        });
    }
    else if (data.startsWith("service_")) {
        const sName = data.split("_")[1];
        const countries = services[sName].countries;
        if (!countries || countries.length === 0) return bot.answerCallbackQuery(query.id, { text: "No countries available.", show_alert: true });

        let buttons = countries.map(c => [{ text: c, callback_data: `country_${sName}_${c}` }]);
        buttons.push([{ text: "🔙 Back", callback_data: "menu_get_number" }]);
        bot.editMessageText(`🌍 Select country for ${sName}:`, {
            chat_id: chatId, message_id: query.message.message_id,
            reply_markup: { inline_keyboard: buttons }
        });
    }
    else if (data.startsWith("country_")) {
        const [, sName, cName] = data.split("_");
        const idx = availableNumbers.findIndex(n => n.service === sName && n.country === cName);
        if (idx === -1) return bot.answerCallbackQuery(query.id, { text: "⚠️ No numbers left!", show_alert: true });

        const numData = availableNumbers.splice(idx, 1)[0];
        assignedNumbers.push({ ...numData, userId });

        bot.editMessageText(`✅ *Number Assigned!*\n\n📱 *${sName}* | \`${numData.number}\` | ${cName}\n\n⏳ Wait, Stay here... OTP Coming Soon!`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🗑 Delete Number", callback_data: `del_${numData.number}` }, { text: "🔙 Back to Menu", callback_data: "main_menu" }],
                    [{ text: "📱 OTP GROUP HERE", url: config.otpGroup }]
                ]
            }
        });
    }
    else if (data === "main_menu") {
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
    else if (data === "menu_balance") {
        const user = users[userId] || { balance: 0 };
        bot.editMessageText(`💰 *Your Balance:* $${user.balance.toFixed(4)}\n\n💡 *Minimum Withdrawal:* $1.0000`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
        });
    }
    else if (data === "menu_withdraw") {
        const user = users[userId] || { balance: 0 };
        bot.editMessageText(`💸 *Withdrawal Menu*\n\n💰 Your Balance: $${user.balance.toFixed(4)}\n\n⚠️ Minimum withdraw is $1.0000.\n\nClick the button below to send request to admin.`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📤 Send Withdraw Request", callback_data: "request_withdraw" }],
                    [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]
                ]
            }
        });
    }
    else if (data === "request_withdraw") {
        const user = users[userId] || { balance: 0 };
        if (user.balance < 1.0) {
            return bot.answerCallbackQuery(query.id, { text: "Insufficient balance! Need at least $1.0000", show_alert: true });
        }
        bot.sendMessage(ADMIN_ID, `🔔 *Withdraw Request!*\n\n👤 User: \`${userId}\`\n💰 Amount: $${user.balance.toFixed(4)}`, { parse_mode: "Markdown" });
        bot.answerCallbackQuery(query.id, { text: "Request sent to Admin!", show_alert: true });
    }
    else if (data.startsWith("del_")) {
        const num = data.split("_")[1];
        const aIdx = assignedNumbers.findIndex(n => n.number === num && n.userId === userId);
        if (aIdx !== -1) {
            const d = assignedNumbers.splice(aIdx, 1)[0];
            availableNumbers.push({ service: d.service, country: d.country, number: d.number });
            bot.answerCallbackQuery(query.id, { text: "Number deleted." });
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendMainMenu(chatId, query.from.username);
        }
    }
});

// --- MESSAGES & ADMIN COMMANDS ---
bot.on('message', (msg) => {
    if (!msg.text) return;
    const text = msg.text;
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (text === '/start') {
        if (!users[userId]) users[userId] = { balance: 0 };
        return sendMainMenu(chatId, msg.from.username);
    }

    if (chatId === GROUP_ID) {
        assignedNumbers.forEach((item, index) => {
            if (text.includes(item.number)) {
                const reward = services[item.service]?.rates[item.country] || 0.003;
                if (!users[item.userId]) users[item.userId] = { balance: 0 };
                users[item.userId].balance += reward;
                bot.sendMessage(item.userId, `🔔 *OTP RECEIVED!*\n\n📱 Number: \`${item.number}\`\n💬 Msg: ${text}\n💰 Earned: $${reward}`, { parse_mode: "Markdown" });
                assignedNumbers.splice(index, 1);
            }
        });
        return;
    }

    if (chatId === ADMIN_ID) {
        if (text.startsWith('/bulk')) {
            const lines = text.split('\n');
            const header = lines[0].replace('/bulk', '').trim().split(',');
            if (header.length < 2) return bot.sendMessage(chatId, "Usage: /bulk Service, Country\nNumbers...");

            const sName = header[0].trim();
            const cName = header[1].trim();

            if (!services[sName]) services[sName] = { countries: [], rates: {} };
            if (!services[sName].countries.includes(cName)) services[sName].countries.push(cName);
            if (!services[sName].rates[cName]) services[sName].rates[cName] = 0.003;

            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    availableNumbers.push({ service: sName, country: cName, number: lines[i].trim() });
                    count++;
                }
            }
            bot.sendMessage(chatId, `✅ Successfully added ${count} numbers to ${sName} (${cName}).`);
        }
        else if (text.startsWith('/edit balance')) {
            const parts = text.split(' ');
            if (parts.length >= 4) {
                const targetId = parts[2];
                const amount = parseFloat(parts[3]);
                if (!users[targetId]) users[targetId] = { balance: 0 };
                users[targetId].balance = amount;
                bot.sendMessage(chatId, `✅ User ${targetId} balance updated to $${amount}`);
            }
        }
        else if (text.startsWith('/baladd')) {
            const parts = text.split(' ');
            if (parts.length >= 4) {
                const amount = parseFloat(parts.pop());
                const sName = parts[1];
                const cName = parts.slice(2).join(' ');
                if (services[sName]) {
                    services[sName].rates[cName] = amount;
                    bot.sendMessage(chatId, `✅ Rate for ${sName} (${cName}) set to $${amount}`);
                }
            }
        }
        else if (text === '/seeuser') {
            bot.sendMessage(chatId, `👥 Total Users: ${Object.keys(users).length}`);
        }
        else if (text.startsWith('/broadcast')) {
            const bMsg = text.replace('/broadcast', '').trim();
            if (bMsg) {
                Object.keys(users).forEach(uId => {
                    bot.sendMessage(uId, `📢 *Broadcast:*\n\n${bMsg}`, { parse_mode: "Markdown" }).catch(()=>{});
                });
                bot.sendMessage(chatId, "✅ Broadcast sent.");
            }
        }
        else if (text.startsWith('/setotpgroup')) {
            const link = text.split(' ')[1];
            if (link) { config.otpGroup = link; bot.sendMessage(chatId, "✅ OTP Group set."); }
        }
        else if (text.startsWith('/setupdategroup')) {
            const link = text.split(' ')[1];
            if (link) { config.updateGroup = link; bot.sendMessage(chatId, "✅ Update Group set."); }
        }
    }
});
                    
