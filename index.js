const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- ⚙️ কনফিগারেশন ---
const TOKEN = '7822711517:AAEpeFSU1XcKIo-uE194SXH9UVJn0kL0e_o';
const ADMIN_ID = 7488161246; // আপনার আইডি
const OTP_GROUP_ID = -1003958220896; 

const bot = new Telegraf(TOKEN);

// --- 🗄️ ডাটাবেস ---
let userBalances = {}; 
let activeNumbers = {}; 
let inventory = []; 
let settings = {
    otpLink: "https://t.me/yoosms_otp",
    updateLink: "https://t.me/A_ToolsX",
    supportLink: "https://t.me/your_actual_support",
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
        buttons.push([Markup.button.callback("🏠 Main Menu", "home")]);
        await ctx.editMessageText("🛠 Select the platform:", Markup.inlineKeyboard(buttons));
    }

    else if (data.startsWith("srv_")) {
        const srv = data.split("_")[1];
        let countries = [...new Set(inventory.filter(i => i.service === srv).map(i => i.country))];
        let buttons = countries.map(c => [Markup.button.callback(c, `get_${srv}_${c}`)]);
        if(buttons.length === 0) buttons.push([Markup.button.callback("❌ No Numbers Available", "menu_get_number")]);
        buttons.push([Markup.button.callback("🔙 Back", "menu_get_number")]);
        await ctx.editMessageText(`🌍 Select country for ${srv}:`, Markup.inlineKeyboard(buttons));
    }

    else if (data.startsWith("get_")) {
        const [_, srv, cty] = data.split("_");
        let idx = inventory.findIndex(i => i.service === srv && i.country === cty);
        if (idx === -1) return ctx.answerCbQuery("❌ Out of stock!", { show_alert: true });

        let item = inventory.splice(idx, 1)[0];
        activeNumbers[item.phone] = { uid, service: srv, country: cty, rate: services[srv] };
        
        const messageText = `✅ **Number Assigned!**\n\n📱 **${srv}** | \`${item.phone}\` | **${cty}**\n\n⏳ Wait, Stay here... OTP Coming Soon!`;
        
        const sentMsg = await ctx.editMessageText(messageText, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback("🗑 Delete Number (10s)", "timer_info")],
                [Markup.button.url("📱 OTP GROUP HERE ↗️", settings.otpLink)]
            ])
        });

        let timeLeft = 10;
        const timer = setInterval(async () => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timer);
                delete activeNumbers[item.phone];
                try {
                    await bot.telegram.deleteMessage(ctx.chat.id, sentMsg.message_id);
                    ctx.reply("❌ Number expired and deleted automatically.");
                } catch (e) {}
            } else {
                try {
                    await bot.telegram.editMessageReplyMarkup(ctx.chat.id, sentMsg.message_id, undefined, Markup.inlineKeyboard([
                        [Markup.button.callback(`🗑 Delete Number (${timeLeft}s)`, "timer_info")],
                        [Markup.button.url("📱 OTP GROUP HERE ↗️", settings.otpLink)]
                    ]).reply_markup);
                } catch (e) {}
            }
        }, 1000);
    }
});

// --- 📡 OTP & ADMIN COMMANDS (Force Join ছাড়া) ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const uid = ctx.from.id;

    // OTP ফরওয়ার্ডিং
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

    // অ্যাডমিন চেক (সরাসরি আপনার আইডি চেক করবে)
    if (uid === ADMIN_ID) {
        if (text.startsWith('/bulk')) {
            try {
                let lines = text.split('\n');
                let info = lines[0].replace('/bulk ', '').split(',').map(s => s.trim());
                let srv = info[0];
                let cty = info[1];
                let nums = lines.slice(1).filter(n => n.length > 5);
                nums.forEach(n => inventory.push({ service: srv, country: cty, phone: n }));
                ctx.reply(`✅ Added ${nums.length} numbers for ${srv}.`);
            } catch (e) { ctx.reply("Format: /bulk Face-Book, Peru +51\n51925155896"); }
        }
    }
});

http.createServer((req, res) => { res.writeHead(200); res.end('OK'); }).listen(process.env.PORT || 3000);
bot.launch({ dropPendingUpdates: true });
