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
let adminAddState = {}; 
let servicePriceState = {}; 

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
    if (!countryName) return "🌍";
    const flags = {
        "afghanistan": "🇦🇫", "albania": "🇦🇱", "algeria": "🇩🇿", "andorra": "🇦🇩",
        "angola": "🇦🇴", "argentina": "🇦🇷", "armenia": "🇦🇲", "australia": "🇦🇺",
        "austria": "🇦🇹", "azerbaijan": "🇦🇿", "bahamas": "🇧🇸", "bahrain": "🇧🇭",
        "bangladesh": "🇧🇩", "barbados": "🇧🇧", "belarus": "🇧🇾", "belgium": "🇧🇪",
        "belize": "🇧🇿", "benin": "🇧🇯", "bhutan": "🇧🇹", "bolivia": "🇧🇴",
        "bosnia": "🇧🇦", "botswana": "🇧🇼", "brazil": "🇧🇷", "brunei": "🇧🇳",
        "bulgaria": "🇧🇬", "burkina faso": "🇧🇫", "burundi": "🇧🇮", "cambodia": "🇰🇭",
        "cameroon": "🇨🇲", "canada": "🇨🇦", "chile": "🇨🇱", "china": "🇨🇳",
        "colombia": "🇨🇴", "congo": "🇨🇬", "costa rica": "🇨🇷", "croatia": "🇭🇷",
        "cuba": "🇨🇺", "cyprus": "🇨🇾", "czech republic": "🇨🇿", "denmark": "🇩🇰",
        "djibouti": "🇩🇯", "dominican republic": "🇩🇴", "ecuador": "🇪🇨", "egypt": "🇪🇬",
        "el salvador": "🇸🇻", "estonia": "🇪🇪", "ethiopia": "🇪🇹", "fiji": "🇫🇯",
        "finland": "🇫🇮", "france": "🇫🇷", "gabon": "🇬🇦", "gambia": "🇬🇲",
        "georgia": "🇬🇪", "germany": "🇩🇪", "ghana": "🇬🇭", "greece": "🇬🇷",
        "guatemala": "🇬🇹", "guinea": "🇬🇳", "haiti": "🇭🇹", "honduras": "🇭🇳",
        "hungary": "🇭🇺", "iceland": "🇮🇸", "india": "🇮🇳", "indonesia": "🇮🇩",
        "iran": "🇮🇷", "iraq": "🇮🇶", "ireland": "🇮🇪", "israel": "🇮🇱",
        "italy": "🇮🇹", "jamaica": "🇯🇲", "japan": "🇯🇵", "jordan": "🇯🇴",
        "kazakhstan": "🇰🇿", "kenya": "🇰🇪", "kuwait": "🇰🇼", "kyrgyzstan": "🇰🇬",
        "laos": "🇱🇦", "latvia": "🇱🇻", "lebanon": "🇱🇧", "libya": "🇱🇾",
        "lithuania": "🇱🇹", "luxembourg": "🇱🇺", "madagascar": "🇲🇬", "malawi": "🇲🇼",
        "malaysia": "🇲🇾", "maldives": "🇲🇻", "mali": "🇲🇱", "malta": "🇲🇹",
        "mauritius": "🇲🇺", "mexico": "🇲🇽", "moldova": "🇲🇩", "mongolia": "🇲🇳",
        "morocco": "🇲🇦", "mozambique": "🇲🇿", "myanmar": "🇲🇲", "namibia": "🇳🇦",
        "nepal": "🇳🇵", "netherlands": "🇳🇱", "new zealand": "🇳🇿", "nicaragua": "🇳🇮",
        "niger": "🇳🇪", "nigeria": "🇳🇬", "norway": "🇳🇴", "oman": "🇴🇲",
        "pakistan": "🇵🇰", "palestine": "🇵🇸", "panama": "🇵🇦", "paraguay": "🇵🇾",
        "peru": "🇵🇪", "philippines": "🇵🇭", "poland": "🇵🇱", "portugal": "🇵🇹",
        "qatar": "🇶🇦", "romania": "🇷🇴", "russia": "🇷🇺", "rwanda": "🇷🇼",
        "saudi arabia": "🇸🇦", "senegal": "🇸🇳", "serbia": "🇷🇸", "singapore": "🇸🇬",
        "slovakia": "🇸🇰", "slovenia": "🇸🇮", "somalia": "🇸🇴", "south africa": "🇿🇦",
        "south korea": "🇰🇷", "spain": "🇪🇸", "sri lanka": "🇱🇰", "sudan": "🇸🇩",
        "sweden": "🇸🇪", "switzerland": "🇨🇭", "syria": "🇸🇾", "taiwan": "🇹🇼",
        "tajikistan": "🇹🇯", "tanzania": "🇹🇿", "thailand": "🇹🇭", "togo": "🇹🇬",
        "tunisia": "🇹🇳", "turkey": "🇹🇷", "uganda": "🇺🇬", "ukraine": "🇺🇦",
        "united arab emirates": "🇦🇪", "united kingdom": "🇬🇧", "united states": "🇺🇸",
        "uruguay": "🇺🇾", "uzbekistan": "🇺🇿", "venezuela": "🇻🇪", "vietnam": "🇻🇳",
        "yemen": "🇾🇪", "zambia": "🇿🇲", "zimbabwe": "🇿🇼",
        "usa": "🇺🇸", "uk": "🇬🇧", "uae": "🇦🇪", "hong kong": "🇭🇰"
    };
    return flags[countryName.toLowerCase()] || "🌍";
};

// --- UI ---
const sendJoinMessage = (chatId) => {
    const msg = `🚫 **Access Denied!**\n\n⚠️ **You are NOT Verified.**\nYou must join our channels to access this bot.`;
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

// --- CALLBACK HANDLING ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    try {
        await bot.answerCallbackQuery(query.id);

        if (data === "admin_broadcast") {
            broadcastState[userId] = true;
            return bot.sendMessage(chatId, "📢 Send the message you want to broadcast:");
        }
        else if (data === "admin_add_number") {
            adminAddState[userId] = { step: 1 };
            return bot.sendMessage(chatId, "🛠 Enter Service Name (e.g., Face-Book):");
        }
        else if (data === "admin_service_price") {
            servicePriceState[userId] = { step: 1 };
            return bot.sendMessage(chatId, "💰 Enter Service Name to set price:");
        }

        if (data === "check_join") {
            const joined = await checkJoin(userId);
            if (joined) {
                if (!users[userId]) users[userId] = { balance: 0, username: query.from.username || 'User' };
                await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
                return sendMainMenu(chatId, query.from.username);
            } else {
                return bot.answerCallbackQuery(query.id, { text: "❌ Join both channels first!", show_alert: true });
            }
        }

        const isJoined = await checkJoin(userId);
        if (!isJoined && userId !== ADMIN_ID) {
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            return sendJoinMessage(chatId);
        }

        if (data === "main_menu" || data === "cancel_transfer") {
            delete transferStates[userId]; delete withdrawStates[userId];
            delete broadcastState[userId]; delete adminAddState[userId];
            delete servicePriceState[userId];
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendMainMenu(chatId, query.from.username);
        }
        else if (data === "menu_balance") {
            const user = users[userId] || { balance: 0 };
            let msg = `💰 **Your Balance:** $${user.balance.toFixed(4)}\n\n💡 **Earning Rates:**\n`;
            Object.keys(services).forEach(s => {
                const rate = Object.values(services[s].rates)[0] || 0.0030;
                msg += `• ${s}: $${rate.toFixed(4)}\n`;
            });
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
                bot.editMessageText(`📅 **Withdrawal Not Available Today**`, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
                });
            } else {
                bot.editMessageText(`📉 **Minimum:** $1.0000\n\n👇 **Click "Withdraw Now" to start:**`, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "💸 Withdraw Now", callback_data: "withdraw_now" }], [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
                });
            }
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
            const countries = services[sName]?.countries || [];
            let buttons = countries.map(c => [{ text: `${c} ${getFlag(c)}`, callback_data: `country_${sName}_${c}` }]);
            buttons.push([{ text: "🔙 Back", callback_data: "menu_get_number" }]);
            bot.editMessageText(`🌍 Select country for ${sName}:`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
        }
        else if (data.startsWith("country_")) {
            const [, sName, cName] = data.split("_");
            const filteredIndices = availableNumbers.map((n, i) => (n.service.toLowerCase() === sName.toLowerCase() && n.country.toLowerCase() === cName.toLowerCase() ? i : -1)).filter(i => i !== -1);
            if (filteredIndices.length === 0) return bot.answerCallbackQuery(query.id, { text: "⚠️ No numbers available!", show_alert: true });
            const numData = availableNumbers.splice(filteredIndices[0], 1)[0];
            assignedNumbers.push({ ...numData, userId });
            bot.editMessageText(`✅ *Number Assigned!*\n\n📱 *${sName}* | \`${numData.number}\` | ${cName} ${getFlag(cName)}\n\n⏳ Wait for OTP...`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🗑 Delete", callback_data: `del_${numData.number}` }], [{ text: "📱 OTP GROUP", url: config.otpGroup }]] }
            });
        }
        else if (data === "confirm_transfer") {
            const state = transferStates[userId];
            if (state && users[userId].balance >= state.amount) {
                users[userId].balance -= state.amount;
                if (!users[state.targetId]) users[state.targetId] = { balance: 0, username: 'User' };
                users[state.targetId].balance += state.amount;
                bot.editMessageText(`✅ **Transfer Successful!**`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] } });
            }
            delete transferStates[userId];
        }
        else if (data === "confirm_withdraw") {
            const state = withdrawStates[userId];
            if (state && users[userId].balance >= state.amount) {
                users[userId].balance -= state.amount;
                bot.editMessageText(`✅ **Request Sent!**`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] } });
                bot.sendMessage(ADMIN_ID, `🚨 **WITHDRAW:** \`${userId}\` | UID: \`${state.binanceId}\` | $${state.amount}`);
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
        else if (data === "menu_active") {
            const userNumbers = assignedNumbers.filter(n => n.userId === userId);
            if (userNumbers.length === 0) {
                bot.editMessageText(`📊 **No Active Numbers**`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "main_menu" }]] } });
            } else {
                let buttons = userNumbers.map(n => [{ text: `🗑 Delete ${n.number}`, callback_data: `del_${n.number}` }]);
                buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);
                bot.editMessageText("📱 **Active Numbers:**", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
            }
        }
    } catch (e) { console.log(e); }
});

// --- MESSAGE HANDLING ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const msgText = msg.text || "";
    const userId = msg.from?.id;
    if (!userId) return;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'User' };

    // /admin Command
    if (msgText === '/admin' && userId === ADMIN_ID) {
        return bot.sendMessage(chatId, "⚡ **Admin Control Panel**", {
            reply_markup: { 
                inline_keyboard: [
                    [{ text: "📢 Broadcast", callback_data: "admin_broadcast" }], 
                    [{ text: "➕ Add Number", callback_data: "admin_add_number" }],
                    [{ text: "💰 Service Price", callback_data: "admin_service_price" }]
                ] 
            }
        });
    }

    // /seeuser Command Fix
    if (msgText.startsWith('/seeuser') && userId === ADMIN_ID) {
        const input = msgText.split(" ")[1]; 
        if (!input) return bot.sendMessage(chatId, "⚠️ Usage: `/seeuser ID` or `/seeuser @username`", { parse_mode: "Markdown" });

        const targetUser = findUser(input);
        if (targetUser) {
            const info = `👤 **Username:** @${targetUser.username}\n🆔 **User ID:** \`${targetUser.id}\`\n💰 **Balance:** $${targetUser.balance.toFixed(4)}`;
            return bot.sendMessage(chatId, info, { parse_mode: "Markdown" });
        } else {
            return bot.sendMessage(chatId, "❌ User not found!");
        }
    }

    // Service Price Flow Logic
    if (userId === ADMIN_ID && servicePriceState[userId]) {
        const state = servicePriceState[userId];
        if (state.step === 1) {
            state.sName = msgText.trim();
            state.step = 2;
            return bot.sendMessage(chatId, `🌍 Enter Country Name for **${state.sName}**:`);
        } else if (state.step === 2) {
            state.cName = msgText.trim();
            state.step = 3;
            return bot.sendMessage(chatId, `💸 OTP ante parle koto price pabe? (e.g. 0.0050):`);
        } else if (state.step === 3) {
            const price = parseFloat(msgText.trim());
            if (isNaN(price)) return bot.sendMessage(chatId, "❌ Invalid price. Enter again:");
            if (!services[state.sName]) services[state.sName] = { countries: [], rates: {} };
            if (!services[state.sName].countries.includes(state.cName)) services[state.sName].countries.push(state.cName);
            services[state.sName].rates[state.cName] = price;
            bot.sendMessage(chatId, `✅ Price Set: **${state.sName}** - **${state.cName}** -> **$${price.toFixed(4)}**`);
            delete servicePriceState[userId];
            return;
        }
    }

    // Admin Add Number Flow
    if (userId === ADMIN_ID && adminAddState[userId]) {
        const state = adminAddState[userId];
        if (state.step === 1) { state.sName = msgText.trim(); state.step = 2; return bot.sendMessage(chatId, `🌍 Enter Country:`); }
        else if (state.step === 2) { state.cName = msgText.trim(); state.step = 3; return bot.sendMessage(chatId, `📂 Send .txt file:`); }
    }

    // File Handling
    if (userId === ADMIN_ID && (msg.document || msg.reply_to_message?.document)) {
        const state = adminAddState[userId];
        if (state && state.step === 3) {
            const doc = msg.document || msg.reply_to_message.document;
            const fileLink = await bot.getFileLink(doc.file_id);
            https.get(fileLink, (res) => {
                let data = ''; res.on('data', d => data += d);
                res.on('end', () => {
                    if (!services[state.sName]) services[state.sName] = { countries: [], rates: {} };
                    if (!services[state.sName].countries.includes(state.cName)) services[state.sName].countries.push(state.cName);
                    data.split('\n').forEach(line => {
                        const n = line.replace(/\D/g, '').trim();
                        if (n.length >= 5) availableNumbers.push({ service: state.sName, country: state.cName, number: n });
                    });
                    bot.sendMessage(chatId, `✅ Numbers added.`);
                    delete adminAddState[userId];
                });
            });
            return;
        }
    }

    if (msgText === '/start') {
        if (!(await checkJoin(userId)) && userId !== ADMIN_ID) return sendJoinMessage(chatId);
        return sendMainMenu(chatId, msg.from.username);
    }
});

// OTP Matching Logic
bot.on('channel_post', async (msg) => {
    const text = msg.text || msg.caption || "";
    const matchedIdx = assignedNumbers.findIndex(n => text.includes(String(n.number).slice(-4)));
    if (matchedIdx !== -1) {
        const item = assignedNumbers.splice(matchedIdx, 1)[0];
        const reward = services[item.service]?.rates[item.country] || 0.0030;
        if (!users[item.userId]) users[item.userId] = { balance: 0 };
        users[item.userId].balance += reward;
        await bot.sendMessage(item.userId, `🔔 **OTP RECEIVED!**\n🔢 Number: \`${item.number}\`\n💰 Earned: $${reward.toFixed(4)}`);
        bot.forwardMessage(item.userId, msg.chat.id, msg.message_id).catch(() => bot.sendMessage(item.userId, text));
    }
});
