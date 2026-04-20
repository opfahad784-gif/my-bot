const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- ⚙️ কনফিগারেশন ---
const TOKEN = '8749050433:AAFaZx9Sd1ZAke9MWjxHYvUynoo8BKzS27c';
const ADMIN_ID = 7488161246; // আপনার আইডি সেট করা হয়েছে
const OTP_GROUP_ID = -1003958220896; 

const bot = new Telegraf(TOKEN);

// --- 🗄️ ডাটাবেস (In-Memory) ---
let userBalances = {}; 
let activeNumbers = {}; 
let inventory = []; 
let settings = {
    otpLink: "https://t.me/yoosms_otp",
    updateLink: "https://t.me/your_channel",
    supportLink: "https://t.me/your_support",
    minWithdraw: 1.0000
};
let services = { "Face-Book": 0.0030 };

// --- 🎨 UI মেনু ডিজাইন ---
function getMainMenu(ctx) {
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    return {
        text: `Welcome! 👋 ${username}\n\nClick the Get Number button to receive your number!`,
        markup: Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "menu_get_number"), Markup.button.callback("💰 Balance", "menu_balance")],
            [Markup.button.callback("📊 Active Number", "menu_active"), Markup.button.callback("💸 Withdraw", "menu_withdraw")],
            [Markup.button.url("🤖 Bot Update Channel ↗️", settings.updateLink)],
            [Markup.button.url("🎧 Support", settings.supportLink)]
        ])
    };
}

bot.start((ctx) => {
    if (userBalances[ctx.from.id] === undefined) userBalances[ctx.from.id] = 0.00;
    const menu = getMainMenu(ctx);
    ctx.reply(menu.text, menu.markup);
});

// --- 🔘 বাটন হ্যান্ডলার ---
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from.id;

    if (data === "home") {
        const menu = getMainMenu(ctx);
        return ctx.editMessageText(menu.text, menu.markup);
    }
    
    if (data === "menu_get_number") {
        let buttons = Object.keys(services).map(srv => [Markup.button.callback(srv, `srv_${srv}`)]);
        buttons.push([Markup.button.callback("🏠 Main Menu", "home"), Markup.button.callback("🔙 Back", "home")]);
        await ctx.editMessageText("🛠 Select the platform you need to access:", Markup.inlineKeyboard(buttons));
    }

    else if (data.startsWith("srv_")) {
        const srv = data.split("_")[1];
        let countries = [...new Set(inventory.filter(i => i.service === srv).map(i => i.country))];
        let buttons = countries.map(c => [Markup.button.callback(c, `get_${srv}_${c}`)]);
        if(buttons.length === 0) buttons.push([Markup.button.callback("❌ No Numbers", "menu_get_number")]);
        buttons.push([Markup.button.callback("🏠 Main Menu", "home"), Markup.button.callback("🔙 Back", "menu_get_number")]);
        await ctx.editMessageText(`🌍 Select country for ${srv}:`, Markup.inlineKeyboard(buttons));
    }

    else if (data.startsWith("get_")) {
        const [_, srv, cty] = data.split("_");
        let idx = inventory.findIndex(i => i.service === srv && i.country === cty);
        if (idx === -1) return ctx.answerCbQuery("❌ Out of stock!", { show_alert: true });

        let item = inventory.splice(idx, 1)[0];
        activeNumbers[item.phone] = { uid, service: srv, country: cty, rate: services[srv] };
        
        await ctx.editMessageText(`✅ Number Assigned!\n\n📱 ${srv} | ${item.phone} | ${cty}\n\n⏳ Wait, Stay here... OTP Coming Soon!`, 
            Markup.inlineKeyboard([
                [Markup.button.callback("🗑 Delete Number", `del_${item.phone}`), Markup.button.callback("🔙 Back to Menu", "home")],
                [Markup.button.url("📱 OTP GROUP HERE ↗️", settings.otpLink)]
            ])
        );
    }

    else if (data === "menu_balance") {
        let bal = (userBalances[uid] || 0).toFixed(4);
        await ctx.editMessageText(`💰 Your Balance: $${bal}\n\n💡 Earning Rates:\n• Face-Book: $0.0030\n\n💳 Minimum Withdrawal: $${settings.minWithdraw.toFixed(4)}`, 
            Markup.inlineKeyboard([[Markup.button.callback("💸 Transfer Balance", "err_bal"), Markup.button.callback("🔙 Back to Menu", "home")]]));
    }

    else if (data === "menu_active") {
        let myNums = Object.keys(activeNumbers).filter(p => activeNumbers[p].uid === uid);
        if (myNums.length === 0) {
            await ctx.editMessageText(`📊 No Active Numbers\n\nYou don't have any active numbers.`, 
                Markup.inlineKeyboard([[Markup.button.callback("📱 Get Number", "menu_get_number"), Markup.button.callback("🔙 Back", "home")]]));
        } else {
            let text = "📊 Your Active Numbers:\n\n" + myNums.map(p => `📱 ${activeNumbers[p].service} | ${p} | ${activeNumbers[p].country}`).join('\n');
            await ctx.editMessageText(text, Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "home")]]));
        }
    }

    else if (data === "menu_withdraw") {
        await ctx.editMessageText(`📆 Withdrawal Not Available Today\n\n🗓 Today: Monday\n✅ Withdrawal Day: Tuesday (12:00 AM - 12:00 PM)`, 
            Markup.inlineKeyboard([[Markup.button.callback("🔙 Back to Menu", "home")]]));
    }
    
    else if (data === "err_bal") {
        ctx.answerCbQuery("❌ Insufficient Balance", { show_alert: true });
    }
});

// --- 📡 OTP ফরওয়ার্ডিং এবং অ্যাডমিন কন্ট্রোল ---
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
        } catch (e) { ctx.reply("Format:\n/bulk Face-Book, Peru +51\n1234567\n9876543"); }
    }
    
    if (text.startsWith('/addbal')) {
        let [_, id, amt] = text.split(' ');
        userBalances[id] = (userBalances[id] || 0) + parseFloat(amt);
        ctx.reply(`✅ Added $${amt} to ${id}`);
    }
});

http.createServer((req, res) => { res.writeHead(200); res.end('Bot Active'); }).listen(process.env.PORT || 3000);
bot.launch({ dropPendingUpdates: true });
