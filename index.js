const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- Configuration ---
const TOKEN = '8749050433:AAFuzv0SdTZAku9WHjxHYvUynoo8BKzS27c';
const bot = new Telegraf(TOKEN);
const ADMIN_ID = 7488161246;
const OTP_GROUP_ID = -1003958220896;

// --- Data ---
let userBalances = {};
let activeNumbers = {};
let allNumbers = [];
let myServices = ["Face-Book"];
let otpGroupLink = "https://t.me/yoosms_otp";

// --- Functions ---
function sendDashboard(ctx) {
    const uid = ctx.from.id;
    if (userBalances[uid] === undefined) userBalances[uid] = 0.00;
    return ctx.reply(`Welcome! 👏 @${ctx.from.username || "User"}\n\nClick buttons below:`,
        Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "platform_menu"), Markup.button.callback("💰 Balance", "show_balance")],
            [Markup.button.callback("📊 Active Number", "active_num"), Markup.button.callback("💸 Withdraw", "withdraw_money")],
            [Markup.button.url("🤖 Bot Update Channel", "https://t.me/your_channel")]
        ])
    );
}

// --- Commands & Actions ---
bot.start((ctx) => sendDashboard(ctx));

bot.action('show_balance', (ctx) => {
    const bal = userBalances[ctx.from.id] || 0.00;
    return ctx.answerCbQuery(`Balance: ${bal.toFixed(4)} $`, { show_alert: true });
});

bot.action('withdraw_money', (ctx) => ctx.reply("❌ Minimum 5$ required."));

bot.action('active_num', (ctx) => {
    let myActive = Object.keys(activeNumbers).filter(p => activeNumbers[p].userId === ctx.from.id);
    if (myActive.length === 0) return ctx.answerCbQuery("No active numbers.", { show_alert: true });
    return ctx.reply("📊 Active:\n" + myActive.join('\n'));
});

bot.action('platform_menu', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    let buttons = myServices.map(s => [Markup.button.callback(s, `srv_${s}`)]);
    buttons.push([Markup.button.callback("🔙 Back", "back_to_start")]);
    return ctx.reply("📂 Platforms:", Markup.inlineKeyboard(buttons));
});

bot.action('back_to_start', (ctx) => {
    try { ctx.deleteMessage(); } catch (e) {}
    return sendDashboard(ctx);
});

// --- Forwarding ---
bot.on('message', (ctx) => {
    if (ctx.chat.id == OTP_GROUP_ID) {
        const text = ctx.message.text || ctx.message.caption;
        if (!text) return;
        for (const phone in activeNumbers) {
            if (text.includes(phone)) {
                bot.telegram.sendMessage(activeNumbers[phone].userId, `📩 **New OTP:**\n\n${text}`, { parse_mode: 'Markdown' });
            }
        }
    }
});

// --- Web Server for Render (Must listen on 0.0.0.0) ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is live!');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    bot.launch()
        .then(() => console.log('🚀 Bot started'))
        .catch(err => console.error('Bot launch error:', err));
});

// Graceful stop
process.once('SIGINT', () => { bot.stop('SIGINT'); server.close(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
                    
