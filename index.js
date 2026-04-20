const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- ⚙️ কনফিগারেশন ---
const TOKEN = '7822711517:AAEpeFSU1XcKIo-uE194SXH9UVJn0kL0e_o'; 
const ADMIN_ID = 7488161246; 
const OTP_GROUP_ID = -1003958220896; 

const bot = new Telegraf(TOKEN);

// --- 🗄️ ডাটাবেস ---
let userBalances = {}; 
let activeNumbers = {}; 
let inventory = []; 
let services = { "Face-Book": 0.0030 };

// --- 🎨 মেইন মেনু UI ---
function getMainMenu(ctx) {
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    return {
        text: `Welcome! 👋 ${username}\n\nClick the Get Number button to receive your number!`,
        markup: Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "menu_get_number"), Markup.button.callback("💰 Balance", "menu_balance")],
            [Markup.button.callback("📊 Active Number", "menu_active"), Markup.button.callback("💸 Withdraw", "menu_withdraw")],
            [Markup.button.url("🤖 Bot Update Channel ↗️", "https://t.me/A_ToolsX")],
            [Markup.button.url("🎧 Support", "https://t.me/A_ToolsX")]
        ])
    };
}

// --- 🚀 স্টার্ট কমান্ড (সরাসরি মেনু আসবে) ---
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
        
        const msg = await ctx.editMessageText(`✅ **Number Assigned!**\n\n📱 **${srv}** | \`${item.phone}\` | **${cty}**\n\n⏳ Wait, Stay here... OTP Coming Soon!`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback("🗑 Delete Number (10s)", "timer_info")],
                [Markup.button.callback("📱 OTP GROUP (Joined)", "timer_info")]
            ])
        });

        let sec = 10;
        const t = setInterval(async () => {
            sec--;
            if (sec <= 0) {
                clearInterval(t);
                delete activeNumbers[item.phone];
                try { await ctx.deleteMessage(msg.message_id); } catch(e){}
            } else {
                try {
                    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
                        [Markup.button.callback(`🗑 Delete Number (${sec}s)`, "timer_info")],
                        [Markup.button.callback("📱 OTP GROUP (Joined)", "timer_info")]
                    ]).reply_markup);
                } catch(e){}
            }
        }, 1000);
    }
});

// --- 📡 কমান্ড ও ওটিপি প্রসেসিং ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const uid = ctx.from.id;

    // ১. অ্যাডমিন বাল্ক কমান্ড (সরাসরি কাজ করবে)
    if (uid === ADMIN_ID && text.startsWith('/bulk')) {
        try {
            let lines = text.split('\n');
            let info = lines[0].replace('/bulk ', '').split(',').map(s => s.trim());
            let srv = info[0], cty = info[1];
            let nums = lines.slice(1).filter(n => n.length > 5);
            nums.forEach(n => inventory.push({ service: srv, country: cty, phone: n }));
            return ctx.reply(`✅ Added ${nums.length} numbers for ${srv}.`);
        } catch (e) { return ctx.reply("Format: /bulk Service, Country\nPhoneNumbers"); }
    }

    // ২. ওটিপি চেক (গ্রুপ আইডি দিয়ে)
    if (ctx.chat.id == OTP_GROUP_ID) {
        for (let phone in activeNumbers) {
            if (text.includes(phone)) {
                let d = activeNumbers[phone];
                bot.telegram.sendMessage(d.uid, `📩 **OTP Received!**\n\nNumber: ${phone}\nCode: ${text}`);
                userBalances[d.uid] = (userBalances[d.uid] || 0) + d.rate;
                delete activeNumbers[phone];
            }
        }
        return;
    }
});

http.createServer((req, res) => { res.writeHead(200); res.end('Bot Running'); }).listen(process.env.PORT || 3000);
bot.launch({ dropPendingUpdates: true });
