const { Telegraf, Markup } = require('telegraf');

// Bot Configuration
const bot = new Telegraf('8749050433:AAFaZx9Sd1ZAke9MWjxHYoVrnoo8BKzS27c');
const ADMIN_ID = 7488161246; 
const OTP_GROUP_ID = -1003958220896; 

// Data Storage
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

// --- Dashboard ---
function sendDashboard(ctx) {
    const uid = ctx.from.id;
    allUsers.add(uid);
    if (userBalances[uid] === undefined) userBalances[uid] = 0.00;
    
    ctx.reply(`Welcome! 👋 @${ctx.from.username || "User"}\n\nClick the Get Number button to receive your number!`, 
        Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "platform_menu"), Markup.button.callback("💰 Balance", "show_balance")],
            [Markup.button.callback("📊 Active Number", "active_num"), Markup.button.callback("💸 Withdraw", "withdraw_money")],
            [Markup.button.url("🤖 Bot Update Channel", "https://t.me/your_channel")]
        ])
    );
}

bot.start((ctx) => sendDashboard(ctx));

// --- Admin Commands ---
bot.command('bulk', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const lines = ctx.message.text.split('\n');
    const firstLine = lines[0].replace('/bulk', '').trim();
    if (!firstLine || !firstLine.includes(',')) return ctx.reply("❌ Format: /bulk Service,Country");
    const [service, country] = firstLine.split(',').map(s => s.trim());
    const nums = lines.slice(1).map(n => n.trim()).filter(n => n.length > 5);
    nums.forEach(num => allNumbers.push({ service, country, phone: num }));
    if (!myServices.includes(service)) myServices.push(service);
    ctx.reply(`✅ Added ${nums.length} numbers.`);
});

bot.command('deletenum', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ')[1];
    if (!args || !args.includes(',')) return ctx.reply("❌ Format: /deletenum Service,Country");
    const [service, country] = args.split(',').map(s => s.trim());
    allNumbers = allNumbers.filter(n => !(n.service === service && n.country === country));
    ctx.reply(`✅ Deleted numbers for ${service} (${country}).`);
});

bot.command('broadcast', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const msg = ctx.message.text.replace('/broadcast', '').trim();
    if (!msg) return ctx.reply("❌ Message required.");
    allUsers.forEach(id => bot.telegram.sendMessage(id, `📢 **Update:**\n\n${msg}`).catch(e => {}));
    ctx.reply("✅ Broadcast sent.");
});

// --- User Actions ---
bot.action('platform_menu', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    let buttons = myServices.map(s => [Markup.button.callback(s, `srv_${s}`)]);
    buttons.push([Markup.button.callback("🔙 Back", "back_to_start")]);
    ctx.reply("🛠️ Select Platform:", Markup.inlineKeyboard(buttons));
});

bot.action(/^srv_(.+)$/, async (ctx) => {
    const service = ctx.match[1];
    try { await ctx.deleteMessage(); } catch (e) {}
    let countries = [...new Set(allNumbers.filter(n => n.service === service).map(n => n.country))];
    if (countries.length === 0) return ctx.reply("❌ No numbers!", Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "platform_menu")]]));
    let buttons = countries.map(c => [Markup.button.callback(countryInfo[c] || `${c} 🌍`, `get_${service}_${c}`)]);
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
    ctx.reply(`✅ Number Assigned!\n\n📱 ${service} | ${selected.phone} | ${country} 🌍\n\n⏳ Wait, Stay here... OTP Coming Soon!`, 
        Markup.inlineKeyboard([
            [Markup.button.callback("🗑️ Delete Number", "back_to_start"), Markup.button.callback("🔙 Back to Menu", "back_to_start")],
            [Markup.button.url("📱 OTP GROUP HERE", otpGroupLink)]
        ])
    );
});

bot.action('active_num', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    const uid = ctx.from.id;
    let myActives = Object.entries(activeNumbers).filter(([num, data]) => data.userId === uid);
    if (myActives.length === 0) return ctx.reply("📊 No Active Numbers", Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "back_to_start")]]));
    let msg = "📊 Your Active Numbers:\n\n";
    myActives.forEach(([num, data]) => { msg += `📱 ${data.service}: \`${num}\`\n`; });
    ctx.reply(msg, Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "back_to_start")]]));
});

bot.action('back_to_start', (ctx) => { try { ctx.deleteMessage(); } catch (e) {} sendDashboard(ctx); });
const http = require('http');
http.createServer((req, res) => {
    res.write("Bot is running 24/7!");
    res.end();
}).listen(process.env.PORT || 3000);

bot.on('text', (ctx, next) => {
    if (ctx.message.text === "/") {
        return ctx.reply("Bot is Alive!");
    }
    return next();
});

bot.launch();
console.log("🚀 Bot is running!");
      
