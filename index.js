const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const https = require('https');

// --- KEEP ALIVE SERVER ---
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
let transferStates = {}; 
let withdrawStates = {}; 
let isWithdrawActive = false; 

let config = {
    otpGroup: "https://t.me/yoosms_otp", 
    updateGroup: "https://t.me/yooosmsupdate",
    otpUsername: "@yoosms_otp",
    updateUsername: "@yooosmsupdate"
};

// --- JOIN CHECK ---
const checkJoin = async (userId) => {
    try {
        const res1 = await bot.getChatMember(config.otpUsername, userId);
        const res2 = await bot.getChatMember(config.updateUsername, userId);
        const statuses = ['member', 'administrator', 'creator'];
        return statuses.includes(res1.status) && statuses.includes(res2.status);
    } catch (e) { return false; }
};

// --- FORCE JOIN UI ---
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

// --- FLAG HELPER ---
const getFlag = (countryName) => {
    if (!countryName) return "🌍";
    const flags = {
        "syria": "🇸🇾", "india": "🇮🇳", "bangladesh": "🇧🇩", "usa": "🇺🇸", 
        "russia": "🇷🇺", "indonesia": "🇮🇩", "vietnam": "🇻🇳", "thailand": "🇹🇭", "sudan": "🇸🇩"
    };
    return flags[countryName.toLowerCase()] || "🌍";
};

// --- MAIN MENU ---
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
            const rate = Object.values(services[s].rates)[0] || 0.0030;
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
    else if (data === "menu_withdraw") {
        if (!isWithdrawActive) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const today = days[new Date().getDay()];
            let msg = `📅 **Withdrawal Not Available Today**\n🗓 **Today:** ${today}\n✅ **Withdrawal Day:** Tuesday (12:00 AM - 12:00 PM)\n🎬 **Withdraw Process:** [Watch Video](https://t.me/SureSmsOfficial)\n\n💡 You can only request withdrawals on Tuesday between 12am and 12pm`;
            bot.editMessageText(msg, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", disable_web_page_preview: true,
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
            });
        } else {
            const user = users[userId] || { balance: 0 };
            bot.editMessageText(`💰 **Your Balance:** $${user.balance.toFixed(4)}\n📉 **Minimum:** $1.0000\n\n👇 **Click "Withdraw Now" to start:**`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "💸 Withdraw Now", callback_data: "withdraw_now" }],
                        [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]
                    ]
                }
            });
        }
    }
    else if (data === "menu_active") {
        const userNumbers = assignedNumbers.filter(n => n.userId === userId);
        if (userNumbers.length === 0) {
            const msg = `📊 **No Active Numbers**\n\n💡 You don't have any active numbers. Get a number to start earning!\n\n🔄 Numbers stay active until you delete them!`;
            bot.editMessageText(msg, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "🔙 Back", callback_data: "main_menu" }]
                    ]
                }
            });
        } else {
            let msg = "📱 **Your Active Numbers:**\n\n";
            let buttons = [];
            userNumbers.forEach(n => {
                msg += `✅ \`${n.number}\` (${n.service})\n`;
                buttons.push([{ text: `🗑 Delete ${n.number}`, callback_data: `del_${n.number}` }]);
            });
            buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);
            bot.editMessageText(msg, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
        }
    }
    else if (data === "withdraw_now") {
        const user = users[userId] || { balance: 0 };
        if (user.balance < 1.0000) {
            return bot.answerCallbackQuery(query.id, { text: "❌ Not enough balance! Minimum $1.00 required.", show_alert: true });
        }
        withdrawStates[userId] = { step: 1 };
        bot.editMessageText(`🏦 *Withdrawal*\n\n💳 Please enter your *Binance UID*:`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "main_menu" }]] }
        });
    }
    else if (data === "confirm_withdraw") {
        const state = withdrawStates[userId];
        if (state && users[userId].balance >= state.amount) {
            users[userId].balance -= state.amount;
            bot.editMessageText(`✅ **Request Sent!**\n\n💵 Amount: $${state.amount.toFixed(4)}\n🆔 UID: \`${state.binanceId}\``, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] }
            });
            bot.sendMessage(ADMIN_ID, `🚨 **WITHDRAW REQUEST**\n👤 User: \`${userId}\`\n🆔 UID: \`${state.binanceId}\`\n💰 Amt: $${state.amount.toFixed(4)}`, { parse_mode: "Markdown" });
        }
        delete withdrawStates[userId];
    }
    else if (data === "menu_get_number") {
        const serviceKeys = Object.keys(services);
        if (serviceKeys.length === 0) return bot.answerCallbackQuery(query.id, { text: "No services!", show_alert: true });
        let buttons = serviceKeys.map(s => [{ text: s, callback_data: `service_${s}` }]);
        buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);
        bot.editMessageText("🛠 Select platform:", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
    }
    else if (data.startsWith("service_")) {
        const sName = data.split("_")[1];
        const countries = services[sName].countries;
        let buttons = countries.map(c => [{ text: `${c} ${getFlag(c)}`, callback_data: `country_${sName}_${c}` }]);
        buttons.push([{ text: "🔙 Back", callback_data: "menu_get_number" }]);
        bot.editMessageText(`🌍 Select country for ${sName}:`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
    }
    else if (data.startsWith("country_")) {
        const [, sName, cName] = data.split("_");
        const filteredIndices = availableNumbers
            .map((n, i) => (n.service.toLowerCase() === sName.toLowerCase() && n.country.toLowerCase() === cName.toLowerCase() ? i : -1))
            .filter(i => i !== -1);
        if (filteredIndices.length === 0) return bot.answerCallbackQuery(query.id, { text: "⚠️ No numbers!", show_alert: true });
        const randomIndex = filteredIndices[Math.floor(Math.random() * filteredIndices.length)];
        const numData = availableNumbers.splice(randomIndex, 1)[0];
        assignedNumbers.push({ ...numData, userId });
        bot.editMessageText(`✅ *Number Assigned!*\n\n📱 *${sName}* | \`${numData.number}\` | ${cName} ${getFlag(cName)}\n\n⏳ Wait, Stay here... OTP Coming Soon!`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🗑 Delete Number", callback_data: `del_${numData.number}` }], [{ text: "📱 OTP GROUP HERE", url: config.otpGroup }]] }
        });
    }
    else if (data === "main_menu" || data === "cancel_transfer") {
        delete transferStates[userId];
        delete withdrawStates[userId];
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
    else if (data.startsWith("del_")) {
        const num = data.replace("del_", ""); 
        const idx = assignedNumbers.findIndex(n => n.number === num && n.userId === userId);
        if (idx !== -1) {
            const d = assignedNumbers.splice(idx, 1)[0];
            availableNumbers.push({ service: d.service, country: d.country, number: d.number });
        }
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
});

// --- UPDATED OTP MATCHING (FORWARDING EXACT MESSAGE) ---
const handleOtpMatch = (chatId, msgTitle, msgText, originalMsg) => {
    if (chatId === GROUP_ID || (msgTitle && msgTitle.toLowerCase().includes("otp"))) {
        const matchIndex = assignedNumbers.findIndex(item => msgText.includes(String(item.number).slice(-4)));
        if (matchIndex !== -1) {
            const item = assignedNumbers[matchIndex];
            const reward = services[item.service]?.rates[item.country] || 0.0030;
            if (!users[item.userId]) users[item.userId] = { balance: 0, username: 'Not set' };
            
            users[item.userId].balance += reward;

            // Forward the original message exactly as it is to the user
            bot.copyMessage(item.userId, chatId, originalMsg.message_id).catch(() => {});
            
            // Send reward notification
            bot.sendMessage(item.userId, `💰 **Balance Updated!**\nEarned: $${reward.toFixed(4)}\nService: ${item.service}`, { parse_mode: "Markdown" }).catch(() => {});
            
            assignedNumbers.splice(matchIndex, 1);
        }
        return true;
    }
    return false;
};

bot.on('channel_post', async (msg) => handleOtpMatch(msg.chat.id, msg.chat.title, msg.text || msg.caption || "", msg));

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const msgText = msg.text || msg.caption || "";
    if (handleOtpMatch(chatId, msg.chat.title, msgText, msg)) return;
    const userId = msg.from ? msg.from.id : null;
    if (!userId) return;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'Not set' };
    else if (msg.from.username) users[userId].username = msg.from.username;

    if (msgText === '/id') {
        return bot.sendMessage(chatId, `🆔 *Your Telegram ID*\n\n👤 *User ID:* \`${msg.from.id}\`\n👤 *Username:* @${msg.from.username || 'Not set'}\n📝 *Name:* ${msg.from.first_name}`, { parse_mode: "Markdown" });
    }

    if (msgText === '/start') {
        delete transferStates[userId];
        delete withdrawStates[userId];
        if (!(await checkJoin(userId)) && userId !== ADMIN_ID) return sendJoinMessage(chatId);
        return sendMainMenu(chatId, msg.from.username);
    }

    if (withdrawStates[userId]) {
        const state = withdrawStates[userId];
        if (msgText.startsWith('/')) delete withdrawStates[userId];
        else if (state.step === 1) {
            state.binanceId = msgText.trim(); state.step = 2;
            bot.sendMessage(chatId, `💰 Enter amount to withdraw (Min $1.00):`, { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } });
        } else if (state.step === 2) {
            const amt = parseFloat(msgText);
            if (isNaN(amt) || amt < 1.0 || amt > users[userId].balance) return bot.sendMessage(chatId, "❌ Invalid amount (Min $1.00).");
            state.amount = amt; state.step = 3;
            bot.sendMessage(chatId, `⚠️ Confirm withdraw $${amt.toFixed(4)} to UID: \`${state.binanceId}\`?`, { 
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_withdraw" }, { text: "❌ No", callback_data: "main_menu" }]] } 
            });
        }
        return;
    }

    if (transferStates[userId]) {
        const state = transferStates[userId], user = users[userId];
        if (msgText.startsWith('/')) delete transferStates[userId];
        else if (state.step === 1) {
            const targetId = parseInt(msgText.trim());
            if (isNaN(targetId) || targetId === userId) return bot.sendMessage(chatId, "❌ Invalid User ID.");
            state.step = 2; state.targetId = targetId;
            bot.sendMessage(chatId, `💸 *Step 2/3*\n🆔 *Target ID:* \`${targetId}\`\n💰 *Your Bal:* $${user.balance.toFixed(4)}\n\n💵 Enter amount to transfer:`, { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "cancel_transfer" }]] } });
        } else if (state.step === 2) {
            const amount = parseFloat(msgText.trim());
            if (isNaN(amount) || amount <= 0 || amount > user.balance) return bot.sendMessage(chatId, "❌ Invalid amount.");
            state.step = 3; state.amount = amount;
            bot.sendMessage(chatId, `💸 *Step 3/3*\n🆔 *Target:* \`${state.targetId}\`\n💵 *Amount:* $${amount.toFixed(4)}\n\n⚠️ Confirm transfer:`, { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_transfer" }, { text: "❌ Cancel", callback_data: "cancel_transfer" }]] } });
        }
        return;
    }

    if (chatId === ADMIN_ID) {
        if (msgText === '/withdrawalon') {
            isWithdrawActive = true;
            return bot.sendMessage(chatId, "✅ Withdrawal system is now **ON**.");
        }
        if (msgText === '/withdrawaloff') {
            isWithdrawActive = false;
            return bot.sendMessage(chatId, "❌ Withdrawal system is now **OFF**.");
        }
        if (msgText === '/seeuser') {
            let userList = `👥 **Total Users:** ${Object.keys(users).length}\n\n`;
            Object.keys(users).forEach(id => {
                userList += `🆔 \`${id}\` - @${users[id].username || 'N/A'}\n`;
            });
            return bot.sendMessage(chatId, userList, { parse_mode: "Markdown" });
        }
        if (msgText.startsWith('/addbaluser')) {
            const parts = msgText.split(' ');
            if (parts.length < 3) return bot.sendMessage(chatId, "Usage: /addbaluser ID/Username amount");
            
            const target = parts[1].replace('@', '').trim();
            const amount = parseFloat(parts[2]);
            if (isNaN(amount)) return bot.sendMessage(chatId, "❌ Invalid amount.");

            let targetId = users[target] ? target : Object.keys(users).find(id => users[id].username && users[id].username.toLowerCase() === target.toLowerCase());
            
            if (targetId && users[targetId]) {
                users[targetId].balance += amount;
                bot.sendMessage(chatId, `✅ Added $${amount.toFixed(4)} to User: \`${target}\``);
                bot.sendMessage(targetId, `💰 **Admin added $${amount.toFixed(4)} to your balance!**`);
            } else {
                bot.sendMessage(chatId, "❌ User not found in database.");
            }
        }
        if (msgText.startsWith('/bulk')) {
            const header = msgText.replace('/bulk', '').trim().split(',');
            if (header.length < 2) return;
            const sName = header[0].trim(), cName = header[1].trim();
            const doc = msg.document || msg.reply_to_message?.document;
            if (doc) {
                const fileLink = await bot.getFileLink(doc.file_id);
                https.get(fileLink, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        if (!services[sName]) services[sName] = { countries: [], rates: {} };
                        if (!services[sName].countries.includes(cName)) services[sName].countries.push(cName);
                        data.split('\n').forEach(line => {
                            const n = line.replace(/\D/g, '').trim();
                            if (n.length >= 5) availableNumbers.push({ service: sName, country: cName, number: n });
                        });
                        bot.sendMessage(chatId, "✅ Added Successfully.");
                    });
                });
            }
        }
        else if (msgText.startsWith('/addservice')) {
            const sName = msgText.replace('/addservice', '').trim();
            if (sName && !services[sName]) { services[sName] = { countries: [], rates: {} }; bot.sendMessage(chatId, `✅ Service ${sName} added.`); }
        }
        else if (msgText.startsWith('/baladd')) {
            const parts = msgText.split(' ');
            if (parts.length >= 4) {
                const amount = parseFloat(parts.pop()), sName = parts[1], cName = parts.slice(2).join(' ');
                if (services[sName]) { services[sName].rates[cName] = amount; bot.sendMessage(chatId, `✅ Rate set to $${amount.toFixed(4)}`); }
     
