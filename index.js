const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// --- RENDER PORT SETUP ---
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// --- BOT CONFIGURATION ---
const TOKEN = '8413633586:AAG6-j20MwwfcYNpxqHAxeLGYqRNxylsz4E';
const ADMIN_ID = 7488161246;
const GROUP_ID = -1003958220896;

const bot = new TelegramBot(TOKEN, { polling: true });

// --- IN-MEMORY DATABASE ---
let users = {}; 
let services = {}; // Format: { "Face-Book": { countries: ["Peru", "Myanmar"], rates: { "Peru": 0.03 } } }
let availableNumbers = []; // Format: { service, country, number }
let assignedNumbers = []; // Format: { service, country, number, userId, assignedAt }
let config = {
    otpGroup: "https://t.me/your_otp_group",
    updateGroup: "https://t.me/your_update_group"
};

// --- HELPER FUNCTIONS ---
const getUser = (id) => {
    if (!users[id]) users[id] = { balance: 0, activeNumbers: [] };
    return users[id];
};

const sendMainMenu = (chatId, username) => {
    const text = `Welcome! 👋 @${username || 'User'}\n\nClick the Get Number button to receive your number!`;
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "💰 Balance", callback_data: "menu_balance" }],
                [{ text: "📱 Active Number", callback_data: "menu_active" }, { text: "💸 Withdraw", callback_data: "menu_withdraw" }],
                [{ text: "🤖 Bot Update Channel", url: config.updateGroup }]
            ]
        }
    };
    bot.sendMessage(chatId, text, options);
};

// --- USER COMMANDS & CALLBACKS ---
bot.onText(/\/start/, (msg) => {
    getUser(msg.from.id); // Initialize user
    sendMainMenu(msg.chat.id, msg.from.username);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id;
    const user = getUser(userId);

    if (data === "menu_get_number") {
        let buttons = Object.keys(services).map(s => [{ text: s, callback_data: `service_${s}` }]);
        buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }, { text: "🔙 Back", callback_data: "main_menu" }]);
        bot.editMessageText("🛠 Select the platform you need to access:", {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: buttons }
        });
    } 
    else if (data.startsWith("service_")) {
        const serviceName = data.split("_")[1];
        if (!services[serviceName] || services[serviceName].countries.length === 0) {
            return bot.answerCallbackQuery(query.id, { text: "No countries available for this service.", show_alert: true });
        }
        let buttons = services[serviceName].countries.map(c => [{ text: `${c}`, callback_data: `country_${serviceName}_${c}` }]);
        buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }, { text: "🔙 Back", callback_data: "menu_get_number" }]);
        bot.editMessageText(`🌍 Select country for ${serviceName}:`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: buttons }
        });
    }
    else if (data.startsWith("country_")) {
        const [, service, country] = data.split("_");
        // Find available number
        const numIndex = availableNumbers.findIndex(n => n.service === service && n.country === country);
        if (numIndex === -1) {
            return bot.answerCallbackQuery(query.id, { text: "⚠️ No numbers available for this country right now.", show_alert: true });
        }
        
        const numberData = availableNumbers.splice(numIndex, 1)[0];
        assignedNumbers.push({ ...numberData, userId, assignedAt: Date.now() });

        const text = `✅ *Number Assigned!*\n\n📱 *${service}* | \`${numberData.number}\` | ${country}\n\n⏳ Wait, Stay here... OTP Coming Soon!`;
        const options = {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🗑 Delete Number", callback_data: `delete_${numberData.number}` }, { text: "🔙 Back to Menu", callback_data: "main_menu" }],
                    [{ text: "📱 OTP GROUP HERE", url: config.otpGroup }]
                ]
            }
        };
        bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, ...options });
    }
    else if (data.startsWith("delete_")) {
        const number = data.split("_")[1];
        const assignedIdx = assignedNumbers.findIndex(n => n.number === number && n.userId === userId);
        if (assignedIdx !== -1) {
            const numData = assignedNumbers.splice(assignedIdx, 1)[0];
            availableNumbers.push({ service: numData.service, country: numData.country, number: numData.number });
            bot.editMessageText("🗑 Number Deleted Successfully!", {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] }
            });
        }
    }
    else if (data === "menu_balance") {
        const text = `💰 *Your Balance:* $${user.balance.toFixed(4)}\n\n💡 *Minimum Withdrawal:* $1.0000`;
        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
        });
    }
    else if (data === "main_menu") {
        bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
        sendMainMenu(chatId, query.from.username);
    }
});

// --- ADMIN COMMANDS ---
bot.on('message', (msg) => {
    if (!msg.text) return;
    const text = msg.text;
    const chatId = msg.chat.id;

    // --- OTP LISTENER (Runs if message is in the specific Group) ---
    if (chatId == GROUP_ID) {
        // Check if any assigned number is mentioned in the group message
        assignedNumbers.forEach((assigned, index) => {
            if (text.includes(assigned.number)) {
                // Number found in OTP group! Forward to user and give money
                const rate = services[assigned.service]?.rates[assigned.country] || 0.05; // Default 0.05 if not set
                users[assigned.userId].balance += rate;
                
                bot.sendMessage(assigned.userId, `🔔 *OTP RECEIVED!*\n\n📱 Number: \`${assigned.number}\`\n💬 Message: \n${text}\n\n💰 Earned: $${rate}`, { parse_mode: "Markdown" });
                
                // Remove from assigned list
                assignedNumbers.splice(index, 1);
            }
        });
        return; 
    }

    // Only Admin can run the commands below
    if (chatId != ADMIN_ID) return;

    if (text.startsWith('/bulk')) {
        // Format: /bulk Face-Book, Syria \n number1 \n number2
        const lines = text.split('\n');
        const firstLine = lines[0].replace('/bulk', '').trim().split(',');
        if (firstLine.length < 2) return bot.sendMessage(chatId, "⚠️ Format error. Use:\n/bulk Service, Country\nnum1\nnum2");
        
        const service = firstLine[0].trim();
        const country = firstLine[1].trim();
        let added = 0;

        for (let i = 1; i < lines.length; i++) {
            const num = lines[i].trim();
            if (num) {
                availableNumbers.push({ service, country, number: num });
                added++;
            }
        }
        bot.sendMessage(chatId, `✅ Successfully added ${added} numbers to ${service} (${country}).`);
    }
    else if (text.startsWith('/setotpgroup')) {
        const link = text.split(' ')[1];
        if (link) { config.otpGroup = link; bot.sendMessage(chatId, "✅ OTP Group URL updated!"); }
    }
    else if (text.startsWith('/setupdategroup')) {
        const link = text.split(' ')[1];
        if (link) { config.updateGroup = link; bot.sendMessage(chatId, "✅ Update Group URL updated!"); }
    }
    else if (text.startsWith('/seeuser')) {
        const total = Object.keys(users).length;
        bot.sendMessage(chatId, `👥 Total Users: ${total}`);
    }
    else if (text.startsWith('/edit balance')) {
        // Format: /edit balance userid amount
        const parts = text.split(' ');
        if (parts.length >= 4) {
            const targetId = parts[2];
            const amount = parseFloat(parts[3]);
            if (users[targetId]) {
                users[targetId].balance = amount;
                bot.sendMessage(chatId, `✅ User ${targetId} balance updated to $${amount}`);
            } else {
                bot.sendMessage(chatId, "⚠️ User not found.");
            }
        }
    }
    else if (text.startsWith('/addservice')) {
        // Format: /addservice Face-Book
        const serviceName = text.replace('/addservice', '').trim();
        if (serviceName) {
            if (!services[serviceName]) services[serviceName] = { countries: [], rates: {} };
            bot.sendMessage(chatId, `✅ Service ${serviceName} added!`);
        }
    }
    else if (text.startsWith('/addcountry')) {
        // Format: /addcountry Face-Book Syria
        const parts = text.split(' ');
        if (parts.length >= 3) {
            const service = parts[1];
            const country = parts.slice(2).join(' '); // In case country has spaces
            if (services[service]) {
                if (!services[service].countries.includes(country)) services[service].countries.push(country);
                bot.sendMessage(chatId, `✅ Country ${country} added to ${service}!`);
            } else bot.sendMessage(chatId, "⚠️ Service not found.");
        }
    }
    else if (text.startsWith('/baladd')) {
        // Format: /baladd Face-Book Syria 0.5
        const parts = text.split(' ');
        if (parts.length >= 4) {
            const service = parts[1];
            const amount = parseFloat(parts.pop());
            const country = parts.slice(2).join(' ');
            
            if (services[service]) {
                services[service].rates[country] = amount;
                bot.sendMessage(chatId, `✅ Earning rate for ${service} (${country}) set to $${amount}`);
            }
        }
    }
    else if (text.startsWith('/broadcast')) {
        const bMsg = text.replace('/broadcast', '').trim();
        if (bMsg) {
            Object.keys(users).forEach(uId => {
                bot.sendMessage(uId, `📢 *Broadcast:*\n\n${bMsg}`, { parse_mode: "Markdown" }).catch(()=>{});
            });
            bot.sendMessage(chatId, "✅ Broadcast sent to all active users!");
        }
    }
});

console.log("Bot started successfully!");
            
