const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- Configuration ---
const TOKEN = '8749050433:AAFaZx9Sd1ZAke9MWjxHYoVrnoo8BKzS27c';
const bot = new Telegraf(TOKEN);
const ADMIN_ID = 7488161246; // Apnar Admin ID
const OTP_GROUP_ID = -1003958220896;

// --- Data Storage ---
let userBalances = {};
let activeNumbers = {};
let allNumbers = [];
let myServices = ["Face-Book"];
let serviceRates = { "Face-Book": 0.0030 }; // Default Rate
let otpGroupLink = "https://t.me/yoosms_otp";
let supportLink = "https://t.me/your_support"; // Support Link

const countryInfo = {
    "Guinea": "Guinea 🇬🇳",
    "Peru": "Peru 🇪🇵",
    "Bangladesh": "Bangladesh 🇧🇩"
};

// --- Dashboard Function (Original UI Preserved) ---
function sendDashboard(ctx) {
    const uid = ctx.from.id;
    if (userBalances[uid] === undefined) userBalances[uid] = 0.00; // New user balance 0

    return ctx.reply(`Welcome! 🤖 @${ctx.from.username || "User"}\n\nClick the Get Number button to receive your number!`,
        Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "platform_menu"), Markup.button.callback("💰 Balance", "show_balance")],
            [Markup.button.callback("📉 Active Number", "active_num"), Markup.button.callback("💸 Withdraw", "withdraw_money")],
            [Markup.button.url("📢 Bot Update Channel", "https://t.me/your_channel")],
            [Markup.button.url("🎧 Support", supportLink)]
        ])
    );
}

bot.start((ctx) => sendDashboard(ctx));

// --- Admin Panel (New Features) ---

// 1. Multi-Number & Rate Setting: /add Service,Country,Price
// Example: /add Face-Book,Bangladesh,0.0050
// Tarpor niche shob number gulo ekbare diben
bot.command('add', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const lines = ctx.message.text.split('\n');
    const config = lines[0].replace('/add ', '').split(',');
    if (config.length < 3) return ctx.reply("❌ Format: /add Service,Country,Price\nThen paste numbers in new lines.");

    const [service, country, price] = config.map(s => s.trim());
    const nums = lines.slice(1).map(n => n.trim()).filter(n => n.length > 5);
    
    serviceRates[service] = parseFloat(price);
    nums.forEach(num => allNumbers.push({ service, country, phone: num }));
    
    if (!myServices.includes(service)) myServices.push(service);
    ctx.reply(`✅ Added ${nums.length} numbers for ${service} (${country}) at $${price}`);
});

// 2. Broadcast: /broadcast Hello Everyone
bot.command('broadcast', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const msg = ctx.message.text.replace('/broadcast ', '');
    Object.keys(userBalances).forEach(uid => {
        bot.telegram.sendMessage(uid, `📢 **IMPORTANT ANNOUNCEMENT**\n\n${msg}`, { parse_mode: 'Markdown' }).catch(e => {});
    });
    ctx.reply("✅ Broadcast sent to all users.");
});

// 3. Set OTP Group: /setgroup https://t.me/...
bot.command('setgroup', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    otpGroupLink = ctx.message.text.replace('/setgroup ', '').trim();
    ctx.reply("✅ OTP Group link updated.");
});

// --- User Actions ---
bot.action('show_balance', (ctx) => {
    const bal = userBalances[ctx.from.id] || 0.00;
    ctx.answerCbQuery(`Balance: ${bal.toFixed(4)} $`, { show_alert: true });
});

bot.action('platform_menu', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    let buttons = myServices.map(s => [Markup.button.callback(`${s} ($${serviceRates[s] || 0})`, `srv_${s}`)]);
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
    const uid = ctx.from.id;
    const price = serviceRates[service] || 0;

    if ((userBalances[uid] || 0) < price) {
        return ctx.answerCbQuery("❌ Insufficient Balance!", { show_alert: true });
    }

    let idx = allNumbers.findIndex(n => n.service === service && n.country === country);
    if (idx === -1) return ctx.answerCbQuery("❌ Out of stock!");

    userBalances[uid] -= price; // Balance deduct
    let selected = allNumbers.splice(idx, 1)[0];
    activeNumbers[selected.phone] = { userId: uid, service: service };

    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(`✅ Number Assigned!\n\n📱 ${service} | ${selected.phone} | ${country}\n💰 Price: $${price}\n\n⏳ OTP-র জন্য গ্রুপ চেক করুন।`,
        Markup.inlineKeyboard([
            [Markup.button.callback("🗑 Delete", "back_to_start"), Markup.button.callback("🔙 Menu", "back_to_start")],
            [Markup.button.url("📑 OTP GROUP", otpGroupLink)]
        ])
    );
});

bot.action('back_to_start', (ctx) => {
    try { ctx.deleteMessage(); } catch (e) {}
    sendDashboard(ctx);
});

// --- OTP Forwarding ---
bot.on('message', (ctx) => {
    if (ctx.chat && ctx.chat.id == OTP_GROUP_ID) {
        const messageText = ctx.message.text || ctx.message.caption;
        if (!messageText) return;
        for (const phone in activeNumbers) {
            if (messageText.includes(phone)) {
                bot.telegram.sendMessage(activeNumbers[phone].userId, `📩 **New OTP Received!**\n\n**Number:** ${phone}\n\n**Message:**\n${messageText}`, { parse_mode: 'Markdown' });
            }
        }
    }
});

// --- Server ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Active');
}).listen(PORT, '0.0.0.0');

bot.launch({ dropPendingUpdates: true }).then(() => console.log("🚀 Bot is live with Admin Features!"));
