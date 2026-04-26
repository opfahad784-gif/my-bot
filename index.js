const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const https = require('https');

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

// --- CLEAN STRING HELPER ---
const cleanStr = (str) => str ? str.replace(/[^\x00-\x7F]/g, '').trim().toLowerCase() : '';

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
    // --- TRANSFER BALANCE LOGIC ---
    else if (data === "transfer_bal") {
        const user = users[userId] || { balance: 0 };
        
        // Check if balance is less than 1 dollar
        if (user.balance < 1.0000) {
            return bot.answerCallbackQuery(query.id, { text: "❌ Not enough money.", show_alert: true });
        }

        transferStates[userId] = { step: 1 };
        
        let msg = `💸 *Transfer Balance - Step 1/3*\n\n`;
        msg += `💰 *Your Balance:* $${user.balance.toFixed(4)}\n\n`;
        msg += `👤 Please enter the *User ID* to transfer to:\n\n`;
        msg += `💡 *Example:* \`123456789\`\n`;
        msg += `ℹ️ *Get ID:* Use /id command to get your User ID`;

        bot.editMessageText(msg, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "cancel_transfer" }]] }
        });
    }
    else if (data === "cancel_transfer") {
        delete transferStates[userId];
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
    else if (data === "confirm_transfer") {
        const state = transferStates[userId];
        if (!state || state.step !== 3) return;
        
        const amount = state.amount;
        const targetId = state.targetId;
        const user = users[userId];
        
        if (user && user.balance >= amount) {
            user.balance -= amount;
            if (!users[targetId]) users[targetId] = { balance: 0, username: 'Not set' };
            users[targetId].balance += amount;
            
            bot.editMessageText(`✅ *Transfer Successful!*\n\n💸 Sent $${amount.toFixed(4)} to User ID: \`${targetId}\``, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
            });
            
            bot.sendMessage(targetId, `💰 *Balance Received!*\n\n💸 You received $${amount.toFixed(4)} from User ID: \`${userId}\``, { parse_mode: "Markdown" }).catch(() => {});
        } else {
            bot.answerCallbackQuery(query.id, { text: "❌ Insufficient balance!", show_alert: true });
        }
        delete transferStates[userId];
    }
    // -------------------------------
    else if (data === "menu_withdraw") {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = days[new Date().getDay()];
        let msg = `📅 **Withdrawal Not Available Today**\n\n`;
        msg += `🗓 **Today:** ${today}\n`;
        msg += `✅ **Withdrawal Day:** Tuesday (12:00 AM - 12:00 PM)\n`;
        msg += `🎬 **Withdraw Process:** [Watch Video](https://t.me/SureSmsOfficial)\n\n`;
        msg += `💡 You can only request withdrawals on Tuesday between 12am and 12pm\n`;
        msg += `⏰ **Next withdrawal day:** Tuesday`;

        bot.editMessageText(msg, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
        });
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
    else if (data === "main_menu") {
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

// --- OTP FORWARDING LOGIC ---
const handleOtpMatch = (chatId, msgTitle, msgText) => {
    if (chatId === GROUP_ID || (msgTitle && msgTitle.toLowerCase().includes("otp"))) {
        const matchIndex = assignedNumbers.findIndex(item => msgText.includes(String(item.number).slice(-4)));
        if (matchIndex !== -1) {
            const item = assignedNumbers[matchIndex];
            const reward = services[item.service]?.rates[item.country] || 0.0030;
            if (!users[item.userId]) users[item.userId] = { balance: 0, username: 'Not set' };
            users[item.userId].balance += reward;

            const otpAlert = `🔔 **OTP RECEIVED!**\n\n🔢 **Number:** \`${item.number}\`\n💬 **Full Message:**\n${msgText}\n\n💰 **Earned:** $${reward.toFixed(4)}`;
            bot.sendMessage(item.userId, otpAlert, { parse_mode: "Markdown" }).catch(() => {});
            assignedNumbers.splice(matchIndex, 1);
        }
        return true;
    }
    return false;
};

bot.on('channel_post', async (msg) => {
    handleOtpMatch(msg.chat.id, msg.chat.title, msg.text || msg.caption || "");
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const msgText = msg.text || msg.caption || "";

    if (handleOtpMatch(chatId, msg.chat.title, msgText)) return;

    const userId = msg.from ? msg.from.id : null;
    if (!userId) return;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'Not set' };
    else if (msg.from.username) users[userId].username = msg.from.username;

    // --- /ID COMMAND ---
    if (msgText === '/id') {
        const uId = msg.from.id;
        const uUsername = msg.from.username ? '@' + msg.from.username : '@Not set';
        const uName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
        const idMsg = `🆔 *Your Telegram ID*\n\n👤 *User ID:* \`${uId}\`\n👤 *Username:* ${uUsername}\n📝 *Name:* ${uName}`;
        return bot.sendMessage(chatId, idMsg, { parse_mode: "Markdown" });
    }

    if (msgText === '/start') {
        delete transferStates[userId];
        const isJoined = await checkJoin(userId);
        if (!isJoined && userId !== ADMIN_ID) return sendJoinMessage(chatId);
        return sendMainMenu(chatId, msg.from.username);
    }

    // --- TRANSFER BALANCE PROCESS ---
    if (transferStates[userId]) {
        const state = transferStates[userId];
        const user = users[userId];
        
        if (msgText.startsWith('/')) {
             delete transferStates[userId]; 
        } else if (state.step === 1) {
            const targetId = parseInt(msgText.trim());
            if (isNaN(targetId)) return bot.sendMessage(chatId, "❌ Invalid User ID.");
            if (targetId === userId) return bot.sendMessage(chatId, "❌ You cannot transfer to yourself.");
            
            state.step = 2;
            state.targetId = targetId;
            const targetUser = users[targetId];
            const targetUsername = targetUser && targetUser.username !== 'Not set' ? '@' + targetUser.username : '@Not set';
            
            let msg2 = `💸 *Transfer Balance - Step 2/3*\n\n`;
            msg2 += `🆔 *User ID:* \`${targetId}\`\n`;
            msg2 += `👤 *Username:* ${targetUsername}\n`;
            msg2 += `💰 *Your Balance:* $${user.balance.toFixed(4)}\n\n`;
            msg2 += `💵 Please enter the *amount* to transfer:\n\n`;
            msg2 += `💡 *Example:* \`10.50\` or \`25\``;
            
            return bot.sendMessage(chatId, msg2, {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "cancel_transfer" }]] }
            });
        } else if (state.step === 2) {
            const amount = parseFloat(msgText.trim());
            if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, "❌ Invalid amount.");
            if (amount > user.balance) return bot.sendMessage(chatId, `❌ Insufficient balance! Your balance is $${user.balance.toFixed(4)}.`);
            
            state.step = 3;
            state.amount = amount;
            const targetUser = users[state.targetId];
            const targetUsername = targetUser && targetUser.username !== 'Not set' ? '@' + targetUser.username : '@Not set';
            
            let msg3 = `💸 *Transfer Balance - Step 3/3*\n\n`;
            msg3 += `🆔 *User ID:* \`${state.targetId}\`\n`;
            msg3 += `👤 *Username:* ${targetUsername}\n`;
            msg3 += `💵 *Amount:* $${amount.toFixed(4)}\n\n`;
            msg3 += `💰 *Your Balance:* $${user.balance.toFixed(4)}\n`;
            msg3 += `📊 *After Transfer:* $${(user.balance - amount).toFixed(4)}\n\n`;
            msg3 += `⚠️ *Please confirm the transfer:*`;
            
            return bot.sendMessage(chatId, msg3, {
                parse_mode: "Markdown",
                reply_markup: { 
                    inline_keyboard: [
                        [{ text: "✅ Confirm", callback_data: "confirm_transfer" }, { text: "❌ Cancel", callback_data: "cancel_transfer" }]
                    ] 
                }
            });
        }
    }

    if (chatId === ADMIN_ID) {
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
        else if (msgText.startsWith('/seenum')) {
            const parts = msgText.replace('/seenum', '').trim().split(' ');
            if (parts.length < 2) return bot.sendMessage(chatId, "Usage: /seenum Service Country");
            const sName = cleanStr(parts[0]);
            const cName = cleanStr(parts.slice(1).join(' '));
            
            const count = availableNumbers.filter(n => cleanStr(n.service) === sName && cleanStr(n.country) === cName).length;
            bot.sendMessage(chatId, `📊 **Stock Check:**\n\n📱 **Service:** ${parts[0]}\n🌍 **Country:** ${parts.slice(1).join(' ')}\n📦 **Available:** ${count}`, { parse_mode: "Markdown" });
        }
        else if (msgText.startsWith('/numdel')) {
            const parts = msgText.replace('/numdel', '').trim().split(' ');
            if (parts.length < 2) return bot.sendMessage(chatId, "Usage: /numdel Service Country");
            const sName = cleanStr(parts[0]);
            const cName = cleanStr(parts.slice(1).join(' '));
            
            const initial = availableNumbers.length;
            availableNumbers = availableNumbers.filter(n => !(cleanStr(n.service) === sName && cleanStr(n.country) === cName));
            bot.sendMessage(chatId, `✅ ${initial - availableNumbers.length} numbers deleted.`);
        }
        else if (msgText.startsWith('/addservice')) {
            const sName = msgText.replace('/addservice', '').trim();
            if (sName && !services[sName]) { services[sName] = { countries: [], rates: {} }; bot.sendMessage(chatId, `✅ Service ${sName} added.`); }
        }
        else if (msgText.startsWith('/baladd')) {
            const parts = msgText.split(' ');
            if (parts.length >= 4) {
                const amount = parseFloat(parts.pop());
                const sName = parts[1];
                const cName = parts.slice(2).join(' ');
                if (services[sName]) { services[sName].rates[cName] = amount; bot.sendMessage(chatId, `✅ Rate set to $${amount.toFixed(4)}`); }
            }
        }
    }
});
                                                               
