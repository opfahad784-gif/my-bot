const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- Configuration ---
const TOKEN = '8749050433:AAFaZx9Sd1ZAke9MWjxHYvUynoo8BKzS27c';
const bot = new Telegraf(TOKEN);
const ADMIN_ID = 7488161246;
const OTP_GROUP_ID = -1003958220896;

let userBalances = {};
let activeNumbers = {};
let allNumbers = [];
let myServices = ["Face-Book"];
let serviceRates = { "Face-Book": 0.0030 };
let otpGroupLink = "https://t.me/yoosms_otp";

function sendDashboard(ctx) {
    const uid = ctx.from.id;
    if (userBalances[uid] === undefined) userBalances[uid] = 0.00;
    ctx.reply(`Welcome! 🤖 @${ctx.from.username || "User"}\n\nClick buttons below:`,
        Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "platform_menu"), Markup.button.callback("💰 Balance", "show_balance")],
            [Markup.button.callback("📉 Active Number", "active_num"), Markup.button.callback("💸 Withdraw", "withdraw_money")],
            [Markup.button.url("📢 Bot Update Channel", "https://t.me/your_channel")],
            [Markup.button.url("🎧 Support", "https://t.me/your_support")]
        ])
    );
}

bot.start((ctx) => sendDashboard(ctx));

// Admin commands, OTP Logic... (বাকি লজিকগুলো আগের মতো থাকবে)

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('Active'); }).listen(PORT, '0.0.0.0');

bot.launch({ dropPendingUpdates: true }).then(() => console.log("🚀 Bot is live!"));
