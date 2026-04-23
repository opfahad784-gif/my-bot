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
    updateGroup: "https://t.me/yooosmsupdate"
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
        const filteredIndices = availableNumbers
            .map((n, i) => (n.service === sName && n.country === cName ? i : -1))
            .filter(i => i !== -1);

        if (filteredIndices.length === 0) return bot.answerCallbackQuery(query.id, { text: "⚠️ No numbers left!", show_alert: true });
        
        const randomIndex = filteredIndices[Math.floor(Math.random() * filteredIndices.length)];
        const numData = availableNumbers.splice(randomIndex, 1)[0];
        
        assignedNumbers.push({ ...numData, userId });
        bot.editMessageText(`✅ *Number Assigned!*\n\n📱 *${sName}* | \`${numData.number}\` | ${cName}\n\n⏳ Wait, Stay here... OTP Coming Soon!`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🗑 Delete Number", callback_data: `del_${numData.number}` }, { text: "🏠 Main Menu", callback_data: "main_menu" }],
                    [{ text: "📱 OTP GROUP HERE", url: config.otpGroup }]
                ]
            }
        });
    }
    else if (data === "menu_active") {
        const active = assignedNumbers.find(n => n.userId === userId);
        if (!active) return bot.answerCallbackQuery(query.id, { text: "You have no active numbers!", show_alert: true });
        bot.editMessageText(`📱 *Active Number Details*\n\n🔹 Platform: ${active.service}\n🔹 Country: ${active.country}\n🔹 Number: \`${active.number}\`\n\n⏳ Waiting for OTP...`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🗑 Delete Number", callback_data: `del_${active.number}` }],
                    [{ text: "📱 OTP GROUP HERE", url: config.otpGroup }],
                    [{ text: "🏠 Main Menu", callback_data: "main_menu" }]
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
        bot.editMessageText(`💸 *Withdrawal Menu*\n\n💰 Your Balance: $${user.balance.toFixed(4)}\n\n⚠️ Minimum withdraw is $1.0000.`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "📤 Send Request", callback_data: "request_withdraw" }], [{ text: "🏠 Main Menu", callback_data: "main_menu" }]] }
        });
    }
    else if (data === "request_withdraw") {
        const user = users[userId] || { balance: 0 };
        if (user.balance < 1.0) return bot.answerCallbackQuery(query.id, { text: "Minimum $1.0000 required!", show_alert: true });
        bot.sendMessage(ADMIN_ID, `🔔 *Withdraw Request!*\n👤 User: \`${userId}\`\n💰 Amount: $${user.balance.toFixed(4)}`);
        bot.answerCallbackQuery(query.id, { text: "Request sent!", show_alert: true });
    }
    else if (data.startsWith("del_")) {
        const num = data.replace("del_", ""); 
        const aIdx = assignedNumbers.findIndex(n => n.number === num && n.userId === userId);
        if (aIdx !== -1) {
            const d = assignedNumbers.splice(aIdx, 1)[0];
            availableNumbers.push({ service: d.service, country: d.country, number: d.number });
            bot.answerCallbackQuery(query.id, { text: "🗑 Number deleted and refunded." });
        } else {
            bot.answerCallbackQuery(query.id, { text: "⚠️ Number already deleted!", show_alert: true });
        }
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
});

// --- MESSAGES & ADMIN COMMANDS ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.text === '/start') {
        if (!users[userId]) users[userId] = { balance: 0 };
        return sendMainMenu(chatId, msg.from.username);
    }

    if (chatId === GROUP_ID || msg.chat.title?.includes("otp")) {
        const msgText = msg.text || msg.caption || "";
        assignedNumbers.forEach((item, index) => {
            const lastFourDigits = item.number.slice(-4);
            if (msgText.includes(lastFourDigits)) {
                const reward = services[item.service]?.rates[item.country] || 0.003;
                if (!users[item.userId]) users[item.userId] = { balance: 0 };
                users[item.userId].balance += reward;
                
                const otpMessage = `🔔 *OTP RECEIVED!*\n\n📱 *Number:* \`${item.number}\`\n💬 *Full Message:*\n${msgText}\n\n💰 *Earned:* $${reward.toFixed(4)}`;
                bot.sendMessage(item.userId, otpMessage, { parse_mode: "Markdown" });
                assignedNumbers.splice(index, 1);
            }
        });
        return;
    }

    if (chatId === ADMIN_ID) {
        const commandText = msg.text || msg.caption;
        if (!commandText) return;

        // --- DELETE NUMBER COMMAND ---
        if (commandText.startsWith('/numdel')) {
            const parts = commandText.replace('/numdel', '').trim().split(' ');
            if (parts.length < 2) return bot.sendMessage(chatId, "Usage: /numdel Service Country");

            const sName = parts[0].trim();
            const cName = parts[1].trim();

            const initialLength = availableNumbers.length;
            availableNumbers = availableNumbers.filter(item => !(item.service === sName && item.country === cName));
            
            const deletedCount = initialLength - availableNumbers.length;
            bot.sendMessage(chatId, `✅ ${deletedCount} ti number delete kora hoyeche (${sName} - ${cName})`);
        }
        
        else if (commandText.startsWith('/bulk')) {
            const header = commandText.replace('/bulk', '').trim().split(',');
            if (header.length < 2) return bot.sendMessage(chatId, "Usage: /bulk Service, Country");
            
            const sName = header[0].trim();
            const cName = header[1].trim();
            const doc = msg.document || msg.reply_to_message?.document;

            if (doc) {
                try {
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
                            bot.sendMessage(chatId, `✅ Added ${count} numbers from file to ${sName} (${cName}).`);
                        });
                    }).on("error", (err) => { bot.sendMessage(chatId, "❌ File download failed."); });
                } catch (e) { bot.sendMessage(chatId, "❌ Error processing file."); }
            } else {
                let numbersText = commandText.split('\n').slice(1).join('\n');
                if (!numbersText.trim()) return bot.sendMessage(chatId, "❌ No numbers found.");
                if (!services[sName]) services[sName] = { countries: [], rates: {} };
                if (!services[sName].countries.includes(cName)) services[sName].countries.push(cName);
                let count = 0;
                numbersText.split('\n').forEach(line => {
                    const cleanNum = line.replace(/\D/g, '').trim();
                    if (cleanNum.length >= 5) { 
                        availableNumbers.push({ service: sName, country: cName, number: cleanNum }); 
                        count++; 
                    }
                });
                bot.sendMessage(chatId, `✅ Added ${count} numbers to ${sName} (${cName}).`);
            }
        }
        else if (commandText.startsWith('/setotpgroup')) {
            const link = commandText.split(' ')[1];
            if (link && link.startsWith('http')) { config.otpGroup = link; bot.sendMessage(chatId, `✅ OTP Group link updated.`); }
        }
        else if (commandText.startsWith('/addservice')) {
            const sName = commandText.replace('/addservice', '').trim();
            if (sName && !services[sName]) { services[sName] = { countries: [], rates: {} }; bot.sendMessage(chatId, `✅ Service '${sName}' added.`); }
        }
        else if (commandText.startsWith('/baladd')) {
            const parts = commandText.split(' ');
            if (parts.length >= 4) {
                const amount = parseFloat(parts.pop());
                const sName = parts[1];
                const cName = parts.slice(2).join(' ');
                if (services[sName]) { services[sName].rates[cName] = amount; bot.sendMessage(chatId, `✅ Rate for ${sName} (${cName}) set to $${amount}`); }
            }
        }
        else if (commandText.startsWith('/edit balance')) {
            const parts = commandText.split(' ');
            if (parts.length >= 4) {
                const targetId = parts[2];
                const amount = parseFloat(parts[3]);
                if (!users[targetId]) users[targetId] = { balance: 0 };
                users[targetId].balance = amount;
                bot.sendMessage(chatId, `✅ User balance updated.`);
            }
        }
        else if (commandText === '/seeuser') { bot.sendMessage(chatId, `👥 Total Users: ${Object.keys(users).length}`); }
        else if (commandText.startsWith('/broadcast')) {
            const bMsg = commandText.replace('/broadcast', '').trim();
            if (bMsg) {
                Object.keys(users).forEach(uId => bot.sendMessage(uId, `📢 *Broadcast:*\n\n${bMsg}`, { parse_mode: "Markdown" }).catch(()=>{}));
                bot.sendMessage(chatId, "✅ Broadcast sent.");
            }
        }
    }
});
                
