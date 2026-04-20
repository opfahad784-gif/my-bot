const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- ⚙️ কনফিগারেশন ---
const TOKEN = '8749050433:AAFaZx9Sd1ZAke9MWjxHYvUynoo8BKzS27c';
const ADMIN_ID = 7488161246; // আপনার আইডি সেট করা হয়েছে
const OTP_GROUP_ID = -1003958220896; 

const bot = new Telegraf(TOKEN);

// --- 🗄️ ডাটাবেস ---
let userBalances = {}; 
let activeNumbers = {}; 
let inventory = []; 
let settings = {
    otpLink: "https://t.me/yoosms_otp",
    updateLink: "https://t.me/your_channel",
    minWithdraw: 1.0000
};
let services = { "Face-Book": 0.0030 };

// --- 🎨 মেইন মেনু UI ---
function getMainMenu(ctx) {
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    return {
        text: `Welcome! 👋 ${username}\n\nClick the Get Number button to receive your number!`,
        markup: Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "menu_get_number"), Markup.button.callback("💰 Balance", "menu_balance")],
            [Markup.button.callback("📊 Active Number", "menu_active"), Markup.button.callback("💸 Withdraw", "menu_withdraw")],
            [Markup.button.url("🤖 Bot Update Channel ↗️", settings.updateLink)]
        ])
    };
}

bot.start((ctx) => {
    if (userBalances[ctx.from.id] === undefined) userBalances[ctx.from.id] = 0.00;
    const menu = getMainMenu(ctx);
    ctx.reply(menu.text, menu.markup);
});

// --- 🔘 বাটন ক্লিক্স ---
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from.id;

    if (data === "home") {
        const menu = getMainMenu(ctx);
        return ctx.editMessageText(menu.text, menu.markup);
    }
    
    if (data === "menu_get_number") {
        let buttons = Object.keys(services).map(srv => [Markup.button.callback(srv, `srv_${srv}`)]);
        buttons.push([Markup.button.callback("🏠 Main Menu", "home")]);
        await ctx.editMessageText("🛠 Select the platform:", Markup.inlineKeyboard(buttons));
    }

    else if (data.startsWith("srv_")) {
        const srv = data.split("_")[1];
        let countries = [...new Set(inventory.filter(i => i.service === srv).map(i => i.country))];
        let buttons = countries.map(c => [Markup.button.callback(c, `get_${srv}_${c}`)]);
        buttons.push([Markup.button.callback("🔙 Back", "menu_get_number")]);
        await ctx.editMessageText(`🌍 Select country for ${srv}:`, Markup.inlineKeyboard(buttons));
    }

    else if (data.startsWith("get_")) {
        const [_, srv, cty] = data.split("_");
        let idx = inventory.findIndex(i => i.service === srv && i.country === cty);
        if (idx === -1) return ctx.answerCbQuery("❌ Out of stock!", { show_alert: true });

        let item = inventory.splice(idx, 1)[0];
        activeNumbers[item.phone] = { uid, service: srv, country: cty, rate: services[srv] || 0.0030 };
        
        await ctx.editMessageText(`✅ Number Assigned!\n\n📱 ${srv} | ${item.phone} | ${cty}\n\n⏳ Wait for OTP...`, 
            Markup.inlineKeyboard([
                [Markup.button.callback("🗑 Delete Number", `del_${item.phone}`)],
                [Markup.button.url("📱 OTP GROUP HERE ↗️", settings.otpLink)]
            ])
        );
    }

    else if (data === "menu_balance") {
        let bal = (userBalances[uid] || 0).toFixed(4);
        await ctx.editMessageText(`💰 Your Balance: $${bal}\n💳 Min Withdraw: $${settings.minWithdraw.toFixed(4)}`, 
            Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "home")]]));
    }

    else if (data === "menu_active") {
        let myNums = Object.keys(activeNumbers).filter(p => activeNumbers[p].uid === uid);
        let text = myNums.length ? "📊 Active Numbers:\n" + myNums.map(p => `• ${p} (${activeNumbers[p].service})`).join('\n') : "📊 No active numbers.";
        await ctx.editMessageText(text, Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "home")]]));
    }

    else if (data.startsWith("del_")) {
        delete activeNumbers[data.replace("del_", "")];
        ctx.answerCbQuery("✅ Deleted");
        const menu = getMainMenu(ctx);
        ctx.editMessageText(menu.text, menu.markup);
    }
});

// --- 📡 OTP & ADMIN ---
bot.on('text', (ctx) => {
    const text = ctx.message.text;
    const uid = ctx.from.id;

    if (ctx.chat.id == OTP_GROUP_ID) {
        for (let phone in activeNumbers) {
            if (text.includes(phone)) {
                let data = activeNumbers[phone];
                bot.telegram.sendMessage(data.uid, `📩 **OTP Received!**\n\nNumber: ${phone}\nCode: ${text}`);
                userBalances[data.uid] = (userBalances[data.uid] || 0) + data.rate;
                delete activeNumbers[phone];
            }
        }
        return;
    }

    if (uid !== ADMIN_ID) return;

    if (text.startsWith('/bulk')) {
        try {
            let lines = text.split('\n');
            let [srv, cty] = lines[0].replace('/bulk ', '').split(',').map(s => s.trim());
            let nums = lines.slice(1).filter(n => n.length > 5);
            nums.forEach(n => inventory.push({ service: srv, country: cty, phone: n }));
            ctx.reply(`✅ Added ${nums.length} numbers for ${srv}.`);
        } catch (e) { ctx.reply("Format: /bulk Service, Country\nNumbers..."); }
    }
    
    if (text.startsWith('/addbal')) {
        let [_, id, amt] = text.split(' ');
        userBalances[id] = (userBalances[id] || 0) + parseFloat(amt);
        ctx.reply(`✅ Added $${amt} to ${id}`);
    }
});

http.createServer((req, res) => { res.write('Bot Active'); res.end(); }).listen(process.env.PORT || 3000);
bot.launch({ dropPendingUpdates: true });
