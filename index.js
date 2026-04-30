const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const https = require('https');

// --- KEEP ALIVE SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// --- CONFIG ---
const TOKEN = '8413633586:AAFKb3aA6XCoYx_E3ricqSoYo2wk5nb_pOU'; 
const ADMIN_ID = 7488161246;

const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATABASE ---
let users = {}; 
let services = {}; 
let availableNumbers = []; 
let assignedNumbers = []; 
let transferStates = {}; 
let withdrawStates = {}; 
let isWithdrawActive = false; 
let broadcastState = {}; 

let config = {
    otpGroup: "https://t.me/yoosms_otp", 
    updateGroup: "https://t.me/yooosmsupdate",
    otpUsername: "@yoosms_otp",
    updateUsername: "@yooosmsupdate"
};

// --- HELPERS ---
const checkJoin = async (userId) => {
    try {
        const res1 = await bot.getChatMember(config.otpUsername, userId);
        const res2 = await bot.getChatMember(config.updateUsername, userId);
        const statuses = ['member', 'administrator', 'creator'];
        return statuses.includes(res1.status) && statuses.includes(res2.status);
    } catch (e) { return false; }
};

const findUser = (input) => {
    if (!input) return null;
    if (users[input]) return { id: input, ...users[input] };
    const username = input.replace('@', '').toLowerCase();
    for (const id in users) {
        if (users[id].username && users[id].username.toLowerCase() === username) {
            return { id: id, ...users[id] };
        }
    }
    return null;
};

const getFlag = (countryName) => {
    if (!countryName) return "ðŸŒ";
    const flags = {
        "syria": "ðŸ‡¸ðŸ‡¾", "india": "ðŸ‡®ðŸ‡³", "bangladesh": "ðŸ‡§ðŸ‡©", "usa": "ðŸ‡ºðŸ‡¸", 
        "russia": "ðŸ‡·ðŸ‡º", "indonesia": "ðŸ‡®ðŸ‡©", "vietnam": "ðŸ‡»ðŸ‡³", "thailand": "ðŸ‡¹ðŸ‡­", "sudan": "ðŸ‡¸ðŸ‡©", "myanmar": "ðŸ‡²ðŸ‡²"
    };
    return flags[countryName.toLowerCase()] || "ðŸŒ";
};

// --- UI ---
const sendJoinMessage = (chatId) => {
    const msg = `ðŸš« **Access Denied!**\n\nâš ï¸ **You are NOT Verified.**\nYou must join our channels to access this bot.\n\nðŸ‘‡ **Join below then click 'I Have Joined':**`;
    bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "ðŸ“¢ Join Channel 1", url: config.updateGroup }],
                [{ text: "ðŸ“¢ Join Channel 2", url: config.otpGroup }],
                [{ text: "âœ… I Have Joined", callback_data: "check_join" }]
            ]
        }
    });
};

const sendMainMenu = (chatId, username) => {
    bot.sendMessage(chatId, `Welcome! ðŸ‘‹ @${username || 'User'}\n\nClick the Get Number button to receive your number!`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "ðŸ“± Get Number", callback_data: "menu_get_number" }, { text: "ðŸ’° Balance", callback_data: "menu_balance" }],
                [{ text: "ðŸ“± Active Number", callback_data: "menu_active" }, { text: "ðŸ’¸ Withdraw", callback_data: "menu_withdraw" }],
                [{ text: "ðŸ¤– Bot Update Channel", url: config.updateGroup }]
            ]
        }
    });
};

// --- CALLBACK HANDLING ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    try {
        await bot.answerCallbackQuery(query.id);

        if (data === "check_join") {
            const joined = await checkJoin(userId);
            if (joined) {
                if (!users[userId]) users[userId] = { balance: 0, username: query.from.username || 'User' };
                await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
                return sendMainMenu(chatId, query.from.username);
            } else {
                return bot.answerCallbackQuery(query.id, { text: "âŒ Join both channels first!", show_alert: true });
            }
        }

        const isJoined = await checkJoin(userId);
        if (!isJoined && userId !== ADMIN_ID) {
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            return sendJoinMessage(chatId);
        }

        if (data === "main_menu" || data === "cancel_transfer") {
            delete transferStates[userId];
            delete withdrawStates[userId];
            delete broadcastState[userId];
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendMainMenu(chatId, query.from.username);
        }
        else if (data === "menu_balance") {
            const user = users[userId] || { balance: 0 };
            let msg = `ðŸ’° **Your Balance:** $${user.balance.toFixed(4)}\n\n`;
            msg += `ðŸ’¡ **Earning Rates:**\n`;
            Object.keys(services).forEach(s => {
                const rate = Object.values(services[s].rates)[0] || 0.0030;
                msg += `â€¢ ${s}: $${rate.toFixed(4)}\n`;
            });
            msg += `\nðŸ’³ **Minimum Withdrawal:** $1.0000`;

            bot.editMessageText(msg, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "ðŸ’¸ Transfer Balance", callback_data: "transfer_bal" }, { text: "ðŸ”™ Back to Menu", callback_data: "main_menu" }]
                    ]
                }
            });
        }
        else if (data === "menu_withdraw") {
            if (!isWithdrawActive) {
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const today = days[new Date().getDay()];
                let msg = `ðŸ“… **Withdrawal Not Available Today**\nðŸ—“ **Today:** ${today}\nâœ… **Withdrawal Day:** Tuesday (12:00 AM - 12:00 PM)\nðŸŽ¬ **Withdraw Process:** [Watch Video](https://t.me/SureSmsOfficial)\n\nðŸ’¡ You can only request withdrawals on Tuesday between 12am and 12pm`;
                bot.editMessageText(msg, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: "ðŸ”™ Back to Menu", callback_data: "main_menu" }]] }
                });
            } else {
                const user = users[userId] || { balance: 0 };
                bot.editMessageText(`ðŸ’° **Your Balance:** $${user.balance.toFixed(4)}\nðŸ“‰ **Minimum:** $1.0000\n\nðŸ‘‡ **Click "Withdraw Now" to start:**`, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "ðŸ’¸ Withdraw Now", callback_data: "withdraw_now" }],
                            [{ text: "ðŸ”™ Back to Menu", callback_data: "main_menu" }]
                        ]
                    }
                });
            }
        }
        else if (data === "menu_get_number") {
            const serviceKeys = Object.keys(services);
            if (serviceKeys.length === 0) return bot.answerCallbackQuery(query.id, { text: "No services available!", show_alert: true });
            let buttons = serviceKeys.map(s => [{ text: s, callback_data: `service_${s}` }]);
            buttons.push([{ text: "ðŸ  Main Menu", callback_data: "main_menu" }]);
            bot.editMessageText("ðŸ›  Select platform:", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
        }
        else if (data.startsWith("service_")) {
            const sName = data.split("_")[1];
            const countries = services[sName]?.countries || [];
            if (countries.length === 0) return bot.answerCallbackQuery(query.id, { text: "No countries available!", show_alert: true });
            let buttons = countries.map(c => [{ text: `${c} ${getFlag(c)}`, callback_data: `country_${sName}_${c}` }]);
            buttons.push([{ text: "ðŸ”™ Back", callback_data: "menu_get_number" }]);
            bot.editMessageText(`ðŸŒ Select country for ${sName}:`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
        }
        else if (data.startsWith("country_")) {
            const [, sName, cName] = data.split("_");
            const filteredIndices = availableNumbers
                .map((n, i) => (n.service.toLowerCase() === sName.toLowerCase() && n.country.toLowerCase() === cName.toLowerCase() ? i : -1))
                .filter(i => i !== -1);
            if (filteredIndices.length === 0) return bot.answerCallbackQuery(query.id, { text: "âš ï¸ No numbers available!", show_alert: true });
            const randomIndex = filteredIndices[Math.floor(Math.random() * filteredIndices.length)];
            const numData = availableNumbers.splice(randomIndex, 1)[0];
            assignedNumbers.push({ ...numData, userId });
            bot.editMessageText(`âœ… *Number Assigned!*\n\nðŸ“± *${sName}* | \`${numData.number}\` | ${cName} ${getFlag(cName)}\n\nâ³ Wait, Stay here... OTP Coming Soon!`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "ðŸ—‘ Delete Number", callback_data: `del_${numData.number}` }], [{ text: "ðŸ“± OTP GROUP HERE", url: config.otpGroup }]] }
            });
        }
        else if (data === "transfer_bal") {
            transferStates[userId] = { step: 1 };
            bot.editMessageText("ðŸ’¸ **Transfer Balance**\n\nðŸ†” Please enter the **Recipient ID**:", {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "ðŸ”™ Cancel", callback_data: "main_menu" }]] }
            });
        }
        else if (data === "withdraw_now") {
            const user = users[userId] || { balance: 0 };
            if (user.balance < 1.0000) return bot.answerCallbackQuery(query.id, { text: "âŒ Not enough balance!", show_alert: true });
            withdrawStates[userId] = { step: 1 };
            bot.editMessageText(`ðŸ¦ *Withdrawal*\n\nðŸ’³ Please enter your *Binance UID*:`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "ðŸ”™ Cancel", callback_data: "main_menu" }]] }
            });
        }
        else if (data === "confirm_transfer") {
            const state = transferStates[userId];
            if (state && users[userId].balance >= state.amount) {
                users[userId].balance -= state.amount;
                if (!users[state.targetId]) users[state.targetId] = { balance: 0, username: 'User' };
                users[state.targetId].balance += state.amount;
                bot.editMessageText(`âœ… **Transfer Successful!**\n\nðŸ’µ Amount: $${state.amount.toFixed(4)}\nðŸ†” To: \`${state.targetId}\``, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "ðŸ  Main Menu", callback_data: "main_menu" }]] }
                });
                bot.sendMessage(state.targetId, `ðŸ’° **You received $${state.amount.toFixed(4)} from \`${userId}\`!**`, { parse_mode: "Markdown" }).catch(() => {});
            }
            delete transferStates[userId];
        }
        else if (data === "confirm_withdraw") {
            const state = withdrawStates[userId];
            if (state && users[userId].balance >= state.amount) {
                users[userId].balance -= state.amount;
                bot.editMessageText(`âœ… **Request Sent!**\n\nðŸ’µ Amount: $${state.amount.toFixed(4)}\nðŸ†” UID: \`${state.binanceId}\``, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "ðŸ  Main Menu", callback_data: "main_menu" }]] }
                });
                bot.sendMessage(ADMIN_ID, `ðŸš¨ **WITHDRAW REQUEST**\nðŸ‘¤ User: \`${userId}\`\nðŸ†” UID: \`${state.binanceId}\`\nðŸ’° Amt: $${state.amount.toFixed(4)}`, { parse_mode: "Markdown" }).catch(() => {});
            }
            delete withdrawStates[userId];
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
    } catch (e) { console.log("Callback Error:", e); }
});

// --- MESSAGE HANDLING ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const msgText = msg.text || "";
    const userId = msg.from?.id;
    if (!userId) return;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'User' };
    else users[userId].username = msg.from.username || 'User';

    // Broadcast logic
    if (chatId === ADMIN_ID && broadcastState[userId]) {
        const userList = Object.keys(users);
        let success = 0;
        for (const id of userList) {
            try { await bot.copyMessage(id, chatId, msg.message_id); success++; } catch (e) {}
        }
        delete broadcastState[userId];
        return bot.sendMessage(chatId, `âœ… Broadcast Complete!\nðŸ“Š Total Sent: ${success}`);
    }

    // --- ADMIN COMMANDS ---
    if (chatId === ADMIN_ID) {
        
        // --- NEW: /seeuser ---
        if (msgText.startsWith('/seeuser')) {
            const parts = msgText.split(' ');
            const target = parts[1];
            if (!target) {
                const ids = Object.keys(users);
                let list = `ðŸ“Š **Total Users:** ${ids.length}\n\n`;
                ids.forEach((id, i) => {
                    list += `${i+1}. @${users[id].username} | \`${id}\` | Bal: $${users[id].balance.toFixed(2)}\n`;
                });
                return bot.sendMessage(chatId, list.substring(0, 4000), { parse_mode: "Markdown" });
            }
            const u = findUser(target);
            if (u) return bot.sendMessage(chatId, `ðŸ‘¤ **User Info:**\nðŸ†” ID: \`${u.id}\`\nðŸ‘¤ Username: @${u.username}\nðŸ’° Balance: $${u.balance.toFixed(4)}`, { parse_mode: "Markdown" });
            return bot.sendMessage(chatId, "âŒ User not found.");
        }

        // --- NEW: /baladduser ---
        if (msgText.startsWith('/baladduser')) {
            const parts = msgText.trim().split(/\s+/);
            if (parts.length < 3) return bot.sendMessage(chatId, "âš ï¸ Usage: `/baladduser ID 5.00`", { parse_mode: "Markdown" });
            const u = findUser(parts[1]);
            const amt = parseFloat(parts[2]);
            if (u && !isNaN(amt)) {
                users[u.id].balance += amt;
                bot.sendMessage(u.id, `ðŸ’° Admin added $${amt.toFixed(4)} to your balance.`, { parse_mode: "Markdown" }).catch(() => {});
                return bot.sendMessage(chatId, `âœ… Added $${amt} to @${u.username}. New Bal: $${users[u.id].balance.toFixed(4)}`);
            }
            return bot.sendMessage(chatId, "âŒ Failed to add balance.");
        }

        if (msgText === '/broadcast') {
            broadcastState[userId] = true;
            return bot.sendMessage(chatId, "ðŸ“¢ Send message for broadcast:");
        }

        if (msgText.startsWith('/delnum')) {
            const params = msgText.replace('/delnum', '').replace(',', ' ').trim().split(/\s+/);
            if (params.length < 2) return bot.sendMessage(chatId, "Usage: `/delnum Service Country`", { parse_mode: "Markdown" });
            const s = params[0].toLowerCase(), c = params.slice(1).join(' ').toLowerCase();
            const oldLen = availableNumbers.length;
            availableNumbers = availableNumbers.filter(n => !(n.service.toLowerCase() === s && n.country.toLowerCase() === c));
            return bot.sendMessage(chatId, `ðŸ—‘ Deleted ${oldLen - availableNumbers.length} numbers.`);
        }

        if (msgText.startsWith('/addservice')) {
            const sName = msgText.replace('/addservice', '').trim();
            if (sName) { services[sName] = { countries: [], rates: {} }; bot.sendMessage(chatId, `âœ… Service ${sName} added.`); }
            return;
        }

        if (msgText.startsWith('/baladd')) {
            const parts = msgText.split(' ');
            if (parts.length >= 4) {
                const amount = parseFloat(parts.pop()), sName = parts[1], cName = parts.slice(2).join(' ');
                if (services[sName]) { 
                    services[sName].rates[cName] = amount; 
                    if(!services[sName].countries.includes(cName)) services[sName].countries.push(cName);
                    bot.sendMessage(chatId, `âœ… Rate set.`); 
                }
            }
            return;
        }

        if (msgText.startsWith('/bulk')) {
            const header = msgText.replace('/bulk', '').trim().split(',');
            if (header.length >= 2 && (msg.document || msg.reply_to_message?.document)) {
                const sName = header[0].trim(), cName = header[1].trim();
                const doc = msg.document || msg.reply_to_message.document;
                const fileLink = await bot.getFileLink(doc.file_id);
                https.get(fileLink, (res) => {
                    let data = ''; res.on('data', d => data += d);
                    res.on('end', () => {
                        if (!services[sName]) services[sName] = { countries: [], rates: {} };
                        if (!services[sName].countries.includes(cName)) services[sName].countries.push(cName);
                        data.split('\n').forEach(line => {
                            const n = line.replace(/\D/g, '').trim();
                            if (n.length >= 5) availableNumbers.push({ service: sName, country: cName, number: n });
                        });
                        bot.sendMessage(chatId, "âœ… Numbers Added.");
                    });
                });
            }
            return;
        }

        if (msgText === '/withdrawalon') { isWithdrawActive = true; bot.sendMessage(chatId, "âœ… Withdrawal ON."); return; }
        if (msgText === '/withdrawaloff') { isWithdrawActive = false; bot.sendMessage(chatId, "âŒ Withdrawal OFF."); return; }
    }

    // --- NORMAL USER FLOW ---
    if (msgText === '/start') {
        if (!(await checkJoin(userId)) && userId !== ADMIN_ID) return sendJoinMessage(chatId);
        return sendMainMenu(chatId, msg.from.username);
    }

    if (withdrawStates[userId]) {
        const state = withdrawStates[userId];
        if (state.step === 1) {
            state.binanceId = msgText.trim(); state.step = 2;
            bot.sendMessage(chatId, `ðŸ’° Enter amount to withdraw:`);
        } else if (state.step === 2) {
            const amt = parseFloat(msgText);
            if (isNaN(amt) || amt < 1.0 || amt > users[userId].balance) return bot.sendMessage(chatId, "âŒ Invalid amount.");
            state.amount = amt; state.step = 3;
            bot.sendMessage(chatId, `âš ï¸ Confirm withdraw $${amt.toFixed(4)}?`, { 
                reply_markup: { inline_keyboard: [[{ text: "âœ… Confirm", callback_data: "confirm_withdraw" }, { text: "âŒ No", callback_data: "main_menu" }]] } 
            });
        }
        return;
    }

    if (transferStates[userId]) {
        const state = transferStates[userId];
        if (state.step === 2) {
            const amount = parseFloat(msgText.trim());
            if (isNaN(amount) || amount > users[userId].balance) return bot.sendMessage(chatId, "âŒ Invalid amount.");
            state.amount = amount; state.step = 3;
            bot.sendMessage(chatId, `âš ï¸ Confirm transfer $${amount.toFixed(4)} to \`${state.targetId}\`?`, { 
                reply_markup: { inline_keyboard: [[{ text: "âœ… Confirm", callback_data: "confirm_transfer" }, { text: "âŒ Cancel", callback_data: "main_menu" }]] } 
            });
        }
        return;
    }
});

// OTP Matching
bot.on('channel_post', (msg) => {
    const text = msg.text || "";
    const idx = assignedNumbers.findIndex(n => text.includes(String(n.number).slice(-4)));
    if (idx !== -1) {
        const item = assignedNumbers.splice(idx, 1)[0];
        const reward = services[item.service]?.rates[item.country] || 0.0030;
        if (!users[item.userId]) users[item.userId] = { balance: 0, username: 'User' };
        users[item.userId].balance += reward;
        bot.sendMessage(item.userId, `ðŸ”” **OTP RECEIVED!**\nðŸ”¢ Number: \`${item.number}\`\nðŸ’° Earned: $${reward.toFixed(4)}`, { parse_mode: "Markdown" });
    }
});
