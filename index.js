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
let config = {
    otpGroup: "https://t.me/yoosms_otp", 
    updateGroup: "https://t.me/yooosmsupdate",
    otpUsername: "@yoosms_otp",
    updateUsername: "@yooosmsupdate"
};

// --- FLAG HELPER ---
const getFlag = (countryName) => {
    if (!countryName) return "🌍";
    const flags = {
        "syria": "🇸🇾", "india": "🇮🇳", "bangladesh": "🇧🇩", "usa": "🇺🇸", 
        "russia": "🇷🇺", "indonesia": "🇮🇩", "vietnam": "🇻🇳", "thailand": "🇹🇭"
    };
    return flags[countryName.toLowerCase()] || "🌍";
};

// --- JOIN CHECK HELPER ---
const checkJoin = async (userId) => {
    try {
        const res1 = await bot.getChatMember(config.otpUsername, userId);
        const res2 = await bot.getChatMember(config.updateUsername, userId);
        const statuses = ['member', 'administrator', 'creator'];
        return statuses.includes(res1.status) && statuses.includes(res2.status);
    } catch (e) {
        return false;
    }
};

// --- UI HELPERS ---
const sendJoinMessage = (chatId) => {
    bot.sendMessage(chatId, "⚠️ **SureSms Join Needed!**\n\nPlease join SureSms first.", {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "yooosms_update 📢", url: config.updateGroup }],
                [{ text: "otp_group 👥", url: config.otpGroup }],
                [{ text: "✅ Verify", callback_data: "check_join" }]
            ]
        }
    });
};

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

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (data === "check_join") {
        const isJoined = await checkJoin(userId);
        if (isJoined) {
            if (!users[userId]) users[userId] = { balance: 0 };
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendMainMenu(chatId, query.from.username);
        } else {
            bot.answerCallbackQuery(query.id, { text: "❌ Please join both channels first!", show_alert: true });
        }
        return;
    }

    const isJoined = await checkJoin(userId);
    if (!isJoined && userId !== ADMIN_ID) return sendJoinMessage(chatId);

    if (data === "menu_get_number") {
        const serviceKeys = Object.keys(services);
        let buttons = serviceKeys.map(s => [{ text: s, callback_data: `service_${s}` }]);
        buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);
        bot.editMessageText("🛠 Select platform:", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
    }
    else if (data.startsWith("service_")) {
        const sName = data.split("_")[1];
        const countries = services[sName]?.countries || [];
        let buttons = countries.map(c => [{ text: `${c} ${getFlag(c)}`, callback_data: `country_${sName}_${c}` }]);
        buttons.push([{ text: "🔙 Back", callback_data: "menu_get_number" }]);
        bot.editMessageText(`🌍 Country for ${sName}:`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
    }
    else if (data.startsWith("country_")) {
        const [, sName, cName] = data.split("_");
        const filteredIndices = availableNumbers
            .map((n, i) => (n.service.toLowerCase() === sName.toLowerCase() && n.country.toLowerCase() === cName.toLowerCase() ? i : -1))
            .filter(i => i !== -1);

        if (filteredIndices.length === 0) return bot.answerCallbackQuery(query.id, { text: "⚠️ No numbers left!", show_alert: true });
        
        const randomIndex = filteredIndices[Math.floor(Math.random() * filteredIndices.length)];
        const numData = availableNumbers.splice(randomIndex, 1)[0];
        assignedNumbers.push({ ...numData, userId });

        bot.editMessageText(`✅ *Number Assigned!*\n\n📱 *${sName}* | \`${numData.number}\` | ${cName} ${getFlag(cName)}\n\n⏳ Waiting for OTP...`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🗑 Delete Number", callback_data: `del_${numData.number}` }], [{ text: "📱 OTP GROUP", url: config.otpGroup }]] }
        });
    }
    else if (data === "main_menu") {
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.text === '/start') {
        const isJoined = await checkJoin(userId);
        if (!isJoined && userId !== ADMIN_ID) return sendJoinMessage(chatId);
        if (!users[userId]) users[userId] = { balance: 0 };
        return sendMainMenu(chatId, msg.from.username);
    }

    if (chatId === ADMIN_ID) {
        const commandText = msg.text || msg.caption;
        if (!commandText) return;

        if (commandText.startsWith('/seenum')) {
            const parts = commandText.replace('/seenum', '').trim().split(' ');
            if (parts.length < 2) return bot.sendMessage(chatId, "Usage: /seenum Service Country");
            const sNameInput = parts[0].trim();
            const cNameInput = parts[1].trim();
            
            const count = availableNumbers.filter(n => 
                n.service.toLowerCase() === sNameInput.toLowerCase() && 
                n.country.toLowerCase() === cNameInput.toLowerCase()
            ).length;

            bot.sendMessage(chatId, `📊 *Stock Check:*\n\n📱 Service: ${sNameInput}\n🌍 Country: ${cNameInput} ${getFlag(cNameInput)}\n📦 Available: ${count}`, { parse_mode: "Markdown" });
        }

        if (commandText.startsWith('/bulk')) {
            const header = commandText.replace('/bulk', '').trim().split(',');
            if (header.length < 2) return bot.sendMessage(chatId, "Usage: /bulk Service, Country");
            const sName = header[0].trim();
            const cName = header[1].trim();
            const doc = msg.document || msg.reply_to_message?.document;
            if (doc) {
                const fileLink = await bot.getFileLink(doc.file_id);
                https.get(fileLink, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        let count = 0;
                        if (!services[sName]) services[sName] = { countries: [], rates: {} };
                        if (!services[sName].countries.includes(cName)) services[sName].countries.push(cName);
                        data.split('\n').forEach(line => {
                            const cleanNum = line.replace(/\D/g, '').trim(); 
                            if (cleanNum.length >= 5) {
                                availableNumbers.push({ service: sName, country: cName, number: cleanNum }); 
                                count++; 
                            }
                        });
                        bot.sendMessage(chatId, `✅ Added ${count} numbers for ${sName} - ${cName}.`);
                    });
                });
            }
        }
        
        if (commandText.startsWith('/numdel')) {
            const parts = commandText.replace('/numdel', '').trim().split(' ');
            if (parts.length < 2) return bot.sendMessage(chatId, "Usage: /numdel Service Country");
            const sName = parts[0].trim().toLowerCase();
            const cName = parts[1].trim().toLowerCase();
            const initialLength = availableNumbers.length;
            availableNumbers = availableNumbers.filter(item => !(item.service.toLowerCase() === sName && item.country.toLowerCase() === cName));
            bot.sendMessage(chatId, `✅ ${initialLength - availableNumbers.length} ti number delete kora hoyeche.`);
        }
    }
});
            
