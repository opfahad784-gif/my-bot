const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- Bot Configuration ---
const bot = new Telegraf('8749050433:AAFuzv0SdTZAku9WHjxHYvUynoo8BKzS27c');
const ADMIN_ID = 7488161246;
const OTP_GROUP_ID = -1003958220896;

// --- Data Storage ---
let userBalances = {};
let activeNumbers = {};
let allNumbers = [];
let myServices = ["Face-Book"];
let otpGroupLink = "https://t.me/yoosms_otp";

const countryInfo = {
    "Guinea": "Guinea 🇬🇳",
    "Peru": "Peru 🇵🇪",
    "Bangladesh": "Bangladesh 🇧🇩"
};

// --- Dashboard Function ---
function sendDashboard(ctx) {
    const uid = ctx.from.id;
    if (userBalances[uid] === undefined) userBalances[uid] = 0.00;

    return ctx.reply(`Welcome! 👏 @${ctx.from.username || "User"}\n\nClick the Get Number button to receive your number!`,
        Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "platform_menu"), Markup.button.callback("💰 Balance", "show_balance")],
            [Markup.button.callback("📊 Active Number", "active_num"), Markup.button.callback("💸 Withdraw", "withdraw_money")],
            [Markup.button.url("🤖 Bot Update Channel", "https://t.me/your_channel")]
        ])
    );
}

bot.start((ctx) => sendDashboard(ctx));

// --- Actions ---
bot.action('show_balance', (ctx) => {
    const uid = ctx.from.id;
    const bal = userBalances[uid] || 0.00;
    return ctx.answerCbQuery(`আপনার বর্তমান ব্যালেন্স: ${bal.toFixed(4)} $`, { show_alert: true });
});

bot.action('withdraw_money', (ctx) => {
    return ctx.reply("❌ উইথড্র করার জন্য আপনার ব্যালেন্সে অন্তত ৫$ থাকতে হবে।");
});

bot.action('active_num', (ctx) => {
    const uid = ctx.from.id;
    let myActive = [];
    for (const phone in activeNumbers) {
        if (activeNumbers[phone].userId === uid) {
            myActive.push(`📱 ${activeNumbers[phone].service}: ${phone}`);
        }
    }
    if (myActive.length === 0) {
        return ctx.answerCbQuery("আপনার বর্তমানে কোনো একটিভ নাম্বার নেই।", { show_alert: true });
    }
    return ctx.reply("📊 আপনার বর্তমান একটিভ নাম্বারগুলো:\n\n" + myActive.join('\n'));
});

bot.action('platform_menu', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    let buttons = myServices.map(s => [Markup.button.callback(s, `srv_${s}`)]);
    buttons.push([Markup.button.callback("🔙 Back", "back_to_start")]);
    return ctx.reply("📂 Select Platform:", Markup.inlineKeyboard(buttons));
});

bot.action(/^srv_(.+)$/, async (ctx) => {
    const service = ctx.match[1];
    try { await ctx.deleteMessage(); } catch (e) {}
    let countries = [...new Set(allNumbers.filter(n => n.service === service).map(n => n.country))];
    if (countries.length === 0) return ctx.reply("❌ No numbers!", Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "platform_menu")]]));
    let buttons = countries.map(c => [Markup.button.callback(countryInfo[c] || c, `get_${service}_${c}`)]);
    buttons.push([Markup.button.callback("🔙 Back", "platform_menu")]);
    return ctx.reply(`🌍 Select country for ${service}:`, Markup.inlineKeyboard(buttons));
});

bot.action(/^get_(.+)_(.+)$/, async (ctx) => {
    const service = ctx.match[1];
    const country = ctx.match[2];
    let idx = allNumbers.findIndex(n => n.service === service && n.country === country);
    if (idx === -1) return ctx.answerCbQuery("❌ Empty!");
    let selected = allNumbers.splice(idx, 1)[0];
    activeNumbers[selected.phone] = { userId: ctx.from.id, service: service };
    try { await ctx.deleteMessage(); } catch (e) {}
    return ctx.reply(`✅ Number Assigned!\n\n📱 ${service} | ${selected.phone} | ${country}\n\n⏳ Wait for OTP...`,
        Markup.inlineKeyboard([
            [Markup.button.callback("🗑 Delete", "back_to_start"), Markup.button.callback("🔙 Menu", "back_to_start")],
            [Markup.button.url("📑 OTP GROUP", otpGroupLink)]
        ])
    );
});

bot.action('back_to_start', (ctx) => {
    try { ctx.deleteMessage(); } catch (e) {}
    return sendDashboard(ctx);
});

// --- Forwarding ---
bot.on('message', (ctx) => {
    if (ctx.chat.id == OTP_GROUP_ID) {
        const messageText = ctx.message.text || ctx.message.caption;
        if (!messageText) return;
        for (const phone in activeNumbers) {
            if (messageText.includes(phone)) {
                const targetUser = activeNumbers[phone].userId;
                bot.telegram.sendMessage(targetUser, `📩 **নতুন OTP এসেছে!**\n\n**Number:** ${phone}\n\n**Message:**\n${messageText}`, { parse_mode: 'Markdown' });
            }
        }
    }
});

// --- Essential Render Server & Port Binding ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write("Bot is running!");
    res.end();
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Server is listening on port ${PORT}`);
});

bot.launch().then(() => {
    console.log("🚀 Bot Started Successfully!");
});
