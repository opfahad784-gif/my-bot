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

const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATABASE ---
let users = {}; 
let services = {}; 
let availableNumbers = []; 
let assignedNumbers = []; 
let transferStates = {}; 
let withdrawStates = {}; // New state for withdrawal
let config = {
    otpUsername: "@yoosms_otp",
    updateUsername: "@yooosmsupdate",
    updateGroup: "https://t.me/yooosmsupdate",
    otpGroup: "https://t.me/yoosms_otp"
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

// --- MAIN MENU ---
const sendMainMenu = (chatId, username) => {
    bot.sendMessage(chatId, `Welcome! 👋 @${username || 'User'}\n\nClick the Get Number button to receive your number!`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "💰 Balance", callback_data: "menu_balance" }],
                [{ text: "📊 Active Number", callback_data: "menu_active" }, { text: "💸 Withdraw", callback_data: "menu_withdraw" }],
                [{ text: "🤖 Bot Update Channel", url: config.updateGroup }]
            ]
        }
    });
};

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    // --- WITHDRAW LOGIC ---
    if (data === "menu_withdraw") {
        const user = users[userId] || { balance: 0 };
        const msg = `💰 **Your Balance:** $${user.balance.toFixed(4)}\n📉 **Minimum:** $1.0000\n🎥 **Withdraw Process:** [Watch Video](https://t.me/yooosmsupdate)\n\n👇 **Click "Withdraw Now" to start**`;
        
        bot.editMessageText(msg, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💸 Withdraw Now", callback_data: "withdraw_now" }],
                    [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]
                ]
            }
        });
    }
    else if (data === "withdraw_now") {
        const user = users[userId] || { balance: 0 };
        if (user.balance < 1.0) {
            return bot.answerCallbackQuery(query.id, { text: "❌ No Enough Balance! Minimum $1.00 required.", show_alert: true });
        }
        withdrawStates[userId] = { step: 1 };
        bot.editMessageText(`🏦 *Withdrawal - Step 1/3*\n\n💳 Please enter your *Binance UID*:`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "main_menu" }]] }
        });
    }
    else if (data === "confirm_withdraw") {
        const state = withdrawStates[userId];
        if (!state || state.step !== 3) return;
        users[userId].balance -= state.amount;
        bot.editMessageText(`✅ **Withdrawal request sent to admin. Please wait.**\n\n🆔 **Binance UID:** \`${state.binanceId}\`\n💵 **Amount:** $${state.amount.toFixed(4)}\n📉 **Remaining Balance:** $${users[userId].balance.toFixed(4)}\n\n_For faster processing, contact support._`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🆘 Support", url: "https://t.me/yooosms_admin" }, { text: "🏠 Main Menu", callback_data: "main_menu" }]
                ]
            }
        });
        delete withdrawStates[userId];
    }
    // --- BALANCE & TRANSFER LOGIC ---
    else if (data === "menu_balance") {
        const user = users[userId] || { balance: 0 };
        let msg = `💰 **Your Balance:** $${user.balance.toFixed(4)}\n\n📊 **Earning Rates:**\n• Facebook: $0.0030\n\n📉 **Minimum Withdrawal:** $1.0000`;
        bot.editMessageText(msg, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💸 Transfer Balance", callback_data: "transfer_bal" }],
                    [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]
                ]
            }
        });
    }
    else if (data === "transfer_bal") {
        transferStates[userId] = { step: 1 };
        bot.editMessageText(`💸 *Transfer Balance - Step 1/3*\n\n💰 *Your Balance:* $${(users[userId]?.balance || 0).toFixed(4)}\n👤 Please enter the *User ID* to transfer to:\n\n💡 _Get ID: Use /id command to get your User ID_`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "main_menu" }]] }
        });
    }
    else if (data === "confirm_transfer") {
        const state = transferStates[userId];
        if (!state || state.step !== 3) return;
        if (users[userId].balance >= state.amount) {
            users[userId].balance -= state.amount;
            if (!users[state.targetId]) users[state.targetId] = { balance: 0 };
            users[state.targetId].balance += state.amount;
            bot.editMessageText(`✅ *Transfer Successful!*\n\n👤 **Recipient:** \`${state.targetId}\`\n💵 **Amount:** $${state.amount.toFixed(4)}\n💰 **Your New Balance:** $${users[userId].balance.toFixed(4)}`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] }
            });
        }
        delete transferStates[userId];
    }
    else if (data === "main_menu") {
        delete transferStates[userId];
        delete withdrawStates[userId];
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        sendMainMenu(chatId, query.from.username);
    }
    // ... rest of callback handlers (get number etc) stay same ...
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'Not set' };

    if (text === '/start') {
        return sendMainMenu(chatId, msg.from.username);
    }

    if (text === '/id') {
        return bot.sendMessage(chatId, `🆔 **Your Telegram ID**\n\n👤 **User ID:** \`${userId}\`\n🔗 **Username:** @${msg.from.username || 'Not set'}\n📛 **Name:** ${msg.from.first_name}`, { parse_mode: "Markdown" });
    }

    // --- HANDLING STEPS ---
    if (transferStates[userId]) {
        const state = transferStates[userId];
        if (state.step === 1) {
            const targetId = parseInt(text);
            if (isNaN(targetId) || targetId === userId) return bot.sendMessage(chatId, "❌ Invalid User ID.");
            state.targetId = targetId;
            state.step = 2;
            bot.sendMessage(chatId, `💸 *Transfer Balance - Step 2/3*\n\n👤 **User ID:** \`${targetId}\`\n💰 **Your Balance:** $${users[userId].balance.toFixed(4)}\n\n💡 Please enter the amount to transfer:\n_Example: 0.50 or 1.25_`, { parse_mode: "Markdown" });
        } else if (state.step === 2) {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0 || amount > users[userId].balance) return bot.sendMessage(chatId, "❌ Invalid amount or insufficient balance.");
            state.amount = amount;
            state.step = 3;
            bot.sendMessage(chatId, `💸 *Transfer Balance - Step 3/3*\n\n👤 **User ID:** \`${state.targetId}\`\n💵 **Amount:** $${amount.toFixed(4)}\n💰 **Your Balance:** $${users[userId].balance.toFixed(4)}\n📉 **After Transfer:** $${(users[userId].balance - amount).toFixed(4)}\n\n⚠️ *Please confirm the transfer:*`, {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_transfer" }, { text: "❌ Cancel", callback_data: "main_menu" }]] }
            });
        }
        return;
    }

    if (withdrawStates[userId]) {
        const state = withdrawStates[userId];
        if (state.step === 1) {
            state.binanceId = text;
            state.step = 2;
            bot.sendMessage(chatId, `🏦 *Withdrawal - Step 2/3*\n\n🆔 **Binance UID:** \`${text}\`\n💰 **Your Balance:** $${users[userId].balance.toFixed(4)}\n📉 **Minimum Withdrawal:** $1.0000\n\n💡 Please enter the amount you want to withdraw:`, { parse_mode: "Markdown" });
        } else if (state.step === 2) {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount < 1.0 || amount > users[userId].balance) return bot.sendMessage(chatId, "❌ Amount must be at least $1.00 and within your balance.");
            state.amount = amount;
            state.step = 3;
            bot.sendMessage(chatId, `🏦 *Withdrawal - Step 3/3*\n\n🆔 **Binance UID:** \`${state.binanceId}\`\n💳 **Payment Method:** Binance\n💵 **Amount:** $${amount.toFixed(4)}\n💰 **Your Balance:** $${users[userId].balance.toFixed(4)}\n\n❓ *Are you sure you want to withdraw?*`, {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_withdraw" }, { text: "❌ Cancel", callback_data: "main_menu" }]] }
            });
        }
        return;
    }
});
            
