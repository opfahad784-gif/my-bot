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
let withdrawStates = {}; // উইথড্র স্টেট সেভ করার জন্য
let isWithdrawActive = false; // উইথড্র বাটন কন্ট্রোল করার জন্য

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
        let msg = `💰 **Your Balance:** $${user.balance.toFixed(4)}\n\n💳 **Minimum Withdrawal:** $1.0000`;
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
            bot.editMessageText("📅 **Withdrawal is currently closed.**", {
                chat_id: chatId, message_id: query.message.message_id,
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "main_menu" }]] }
            });
        } else {
            bot.editMessageText("💸 **Click below to start withdrawal:**", {
                chat_id: chatId, message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🏦 Withdraw Now", callback_data: "withdraw_now" }],
                        [{ text: "🔙 Back", callback_data: "main_menu" }]
                    ]
                }
            });
        }
    }
    else if (data === "withdraw_now") {
        const user = users[userId] || { balance: 0 };
        if (user.balance < 1.0000) {
            return bot.answerCallbackQuery(query.id, { text: "❌ Minimum $1.00 required to withdraw!", show_alert: true });
        }
        withdrawStates[userId] = { step: 1 };
        bot.editMessageText("💳 Please enter your **Binance UID**:", {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] }
        });
    }
    else if (data === "confirm_withdraw") {
        const state = withdrawStates[userId];
        if (state && users[userId].balance >= state.amount) {
            users[userId].balance -= state.amount;
            bot.editMessageText(`✅ **Withdrawal request sent!**\n\n💰 Amount: $${state.amount}\n🆔 Binance UID: ${state.binanceId}`, {
                chat_id: chatId, message_id: query.message.message_id,
                reply_markup: { inline_keyboard: [[{ text: "🏠 Menu", callback_data: "main_menu" }]] }
            });
            bot.sendMessage(ADMIN_ID, `🚨 **NEW WITHDRAWAL**\nUser: ${userId}\nUID: ${state.binanceId}\nAmt: $${state.amount}`);
        }
        delete withdrawStates[userId];
    }
    else if (data === "main_menu") {
        delete withdrawStates[userId];
        sendMainMenu(chatId, query.from.username);
    }
    // (বাকি সব callback আগের মতোই থাকবে...)
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const msgText = msg.text || "";
    const userId = msg.from ? msg.from.id : null;
    if (!userId) return;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'Not set' };

    if (msgText === '/start') return sendMainMenu(chatId, msg.from.username);

    // --- ADMIN COMMANDS ---
    if (userId === ADMIN_ID) {
        if (msgText === '/withdrawalon') {
            isWithdrawActive = true;
            return bot.sendMessage(chatId, "✅ Withdrawal system is now **ON**.");
        }
        if (msgText === '/withdrawaloff') {
            isWithdrawActive = false;
            return bot.sendMessage(chatId, "❌ Withdrawal system is now **OFF**.");
        }
        // (অন্যান্য এডমিন কমান্ড...)
    }

    // --- WITHDRAW LOGIC ---
    if (withdrawStates[userId]) {
        const state = withdrawStates[userId];
        if (state.step === 1) {
            state.binanceId = msgText;
            state.step = 2;
            bot.sendMessage(chatId, "💵 Enter the amount you want to withdraw:");
        } else if (state.step === 2) {
            const amount = parseFloat(msgText);
            if (isNaN(amount) || amount < 1.0 || amount > users[userId].balance) {
                return bot.sendMessage(chatId, "❌ Invalid amount! Minimum $1.00 and within your balance.");
            }
            state.amount = amount;
            bot.sendMessage(chatId, `⚠️ Confirm withdraw **$${amount}** to UID: **${state.binanceId}**?`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_withdraw" }, { text: "❌ Cancel", callback_data: "main_menu" }]]
                }
            });
        }
        return;
    }
    // (বাকি সব লজিক আগের মতোই থাকবে...)
});
    
