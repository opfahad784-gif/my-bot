const { Telegraf, Markup } = require('telegraf');

// --- Bot Configuration ---
const bot = new Telegraf('8749050433:AAFuzv0SdTZAku9WHjxHYvUynoo8BKzS27c');
const ADMIN_ID = 7488161246;
const OTP_GROUP_ID = -1003958220896; // আপনার ওটিপি গ্রুপের আইডি

// --- Data Storage ---
let userBalances = {};
let activeNumbers = {};
let allNumbers = [];
let myServices = ["Face-Book"];
let serviceRates = { "Face-Book": 0.0030 };
let otpGroupLink = "https://t.me/yoosms_otp";
let allUsers = new Set();

const countryInfo = {
    "Guinea": "Guinea 🇬🇳",
    "Peru": "Peru 🇵🇪",
    "Bangladesh": "Bangladesh 🇧🇩"
};

// --- Dashboard Function ---
function sendDashboard(ctx) {
    const uid = ctx.from.id;
    allUsers.add(uid);
    if (userBalances[uid] === undefined) userBalances[uid] = 0.00;

    ctx.reply(`Welcome! 🤖 @${ctx.from.username || "User"}\n\nClick the Get Number button to receive your number!`,
        Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "platform_menu"), Markup.button.callback("💰 Balance", "show_balance")],
            [Markup.button.callback("📉 Active Number", "active_num"), Markup.button.callback("💸 Withdraw", "withdraw_money")],
            [Markup.button.url("📢 Bot Update Channel", "https://t.me/your_channel")]
        ])
    );
}

bot.start((ctx) => sendDashboard(ctx));

// --- Admin Commands ---
bot.command('bulk', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const lines = ctx.message.text.split('\n');
    const firstLine = lines[0].replace('/bulk ', '').trim();
    if (!firstLine || !firstLine.includes(',')) return ctx.reply("❌ Format: /bulk Service,Country");
    const [service, country] = firstLine.split(',').map(s => s.trim());
    const nums = lines.slice(1).map(n => n.trim()).filter(n => n.length > 5);
    nums.forEach(num => allNumbers.push({ service, country, phone: num }));
    if (!myServices.includes(service)) myServices.push(service);
    ctx.reply(`✅ Added ${nums.length} numbers.`);
});

// --- User Actions ---
bot.action('platform_menu', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    let buttons = myServices.map(s => [Markup.button.callback(s, `srv_${s}`)]);
    buttons.push([Markup.button.callback("🔙 Back", "back_to_start")]);
    ctx.reply("📂 Select Platform:", Markup.inlineKeyboard(buttons));
});

bot.action(/^srv_(.+)$/, async (ctx) => {
    const service = ctx.match[1];
    try { await ctx.deleteMessage(); } catch (e) {}
    let countries = [...new Set(allNumbers.filter(n => n.service === service).map(n => n.country))];
    if (countries.length === 0) return ctx.reply("❌ No numbers!", Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "platform_menu")]]));
    let buttons = countries.map(c => [Markup.button.callback(countryInfo[c] || c, `get_${service}_${c}`)]);
    buttons.push([Markup.button.callback("🔙 Back", "platform_menu")]);
    ctx.reply(`🌍 Select country for ${service}:`, Markup.inlineKeyboard(buttons));
});

bot.action(/^get_(.+)_(.+)$/, async (ctx) => {
    const service = ctx.match[1];
    const country = ctx.match[2];
    let idx = allNumbers.findIndex(n => n.service === service && n.country === country);
    if (idx === -1) return ctx.answerCbQuery("❌ Empty!");
    let selected = allNumbers.splice(idx, 1)[0];
    activeNumbers[selected.phone] = { userId: ctx.from.id, service: service };
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(`✅ Number Assigned!\n\n📱 ${service} | ${selected.phone} | ${country}\n\n⏳ Wait, Stay here... OTP Coming Soon!`,
        Markup.inlineKeyboard([
            [Markup.button.callback("🗑 Delete Number", "back_to_start"), Markup.button.callback("🔙 Back to Menu", "back_to_start")],
            [Markup.button.url("📑 OTP GROUP HERE", otpGroupLink)]
        ])
    );
});

bot.action('back_to_start', (ctx) => {
    try { ctx.deleteMessage(); } catch (e) {}
    sendDashboard(ctx);
});

// --- OTP Forwarding Logic ---
bot.on('message', (ctx) => {
    if (ctx.chat.id == OTP_GROUP_ID) {
        const messageText = ctx.message.text || ctx.message.caption;
        if (!messageText) return;

        for (const phone in activeNumbers) {
            if (messageText.includes(phone)) {
                const targetUser = activeNumbers[phone].userId;
                const serviceName = activeNumbers[phone].service;
                bot.telegram.sendMessage(targetUser, `📩 **নতুন OTP এসেছে!**\n\n**Service:** ${serviceName}\n**Number:** ${phone}\n\n**Message:**\n${messageText}`, { parse_mode: 'Markdown' });
            }
        }
    }
});

// --- 24/7 Server & Stay Alive Logic ---
const http = require('http');
http.createServer((req, res) => {
    res.write("Bot is running 24/7!");
    res.end();
}).listen(process.env.PORT || 3000);

bot.on('text', (ctx, next) => {
    if (ctx.message.text === "/") return ctx.reply("Bot is Alive!");
    return next();
});

bot.launch();
console.log("🚀 Bot is running with Forwarding & 24/7 Logic!");
