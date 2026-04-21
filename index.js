const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const TOKEN = '7822711517:AAEzqcB7q5BWmfXIurhTPpDsQua7LKJAnbU'; 
const ADMIN_ID = 7488161246; 
const OTP_GROUP_ID = -1003958220896; 

const bot = new Telegraf(TOKEN);

let userBalances = {}; 
let activeNumbers = {}; 
let inventory = []; 
let services = { "Face-Book": 0.0030 }; 
let allUsers = new Set(); 

function getMainMenu(ctx) {
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    return {
        text: `Welcome! 👋 ${username}\n\nClick the Get Number button to receive your number!`,
        markup: Markup.inlineKeyboard([
            [Markup.button.callback("📱 Get Number", "menu_get_number"), Markup.button.callback("💰 Balance", "menu_balance")],
            [Markup.button.callback("📊 Active Number", "menu_active"), Markup.button.callback("💸 Withdraw", "menu_withdraw")],
            [Markup.button.url("🤖 Bot Update Channel ↗️", "https://t.me/yoosms_otp")],
            [Markup.button.url("🎧 Support", "https://t.me/yooosmsupdate")]
        ])
    };
}

bot.start((ctx) => {
    allUsers.add(ctx.from.id);
    if (userBalances[ctx.from.id] === undefined) userBalances[ctx.from.id] = 0.00;
    const menu = getMainMenu(ctx);
    ctx.reply(menu.text, menu.markup);
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from.id;

    if (data === "home") {
        const menu = getMainMenu(ctx);
        return ctx.editMessageText(menu.text, menu.markup);
    }
    
    // --- 💰 Balance UI ---
    if (data === "menu_balance") {
        let bal = userBalances[uid] || 0.00;
        await ctx.editMessageText(
            `💰 **Your Balance: $${bal.toFixed(4)}**\n\n💡 **Earning Rates:**\n• Face-Book: $0.0030\n\n💳 **Minimum Withdrawal: $1.0000**`,
            { 
                parse_mode: 'Markdown', 
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("💸 Transfer Balance", "menu_withdraw"), Markup.button.callback("🔙 Back to Menu", "home")]
                ]) 
            }
        );
    }

    // --- 💸 Withdraw UI ---
    else if (data === "menu_withdraw") {
        let bal = userBalances[uid] || 0.00;
        if (bal < 0.50) {
            await ctx.editMessageText(
                `❌ **Insufficient Balance**\n\n💰 **Your Balance:** $${bal.toFixed(4)}\n💵 **Minimum Required:** $0.50\n\n💡 You need at least $0.50 to transfer.`,
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "home")]]) }
            );
        } else {
            await ctx.editMessageText(
                `📅 **Withdrawal Not Available Today**\n\n🗓 **Today:** Monday\n✅ **Withdrawal Day:** Tuesday (12:00 AM - 12:00 PM)\n🎬 **Withdraw Process: [Watch Video](https://t.me/A_ToolsX)**\n\n💡 You can only request withdrawals on Tuesday between 12am and 12pm\n⏰ **Next withdrawal day: Tuesday**`,
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Back to Menu", "home")]]) }
            );
        }
    }

    // --- 📊 Active Number UI ---
    else if (data === "menu_active") {
        let myNumbers = Object.keys(activeNumbers).filter(p => activeNumbers[p].uid === uid);
        if (myNumbers.length === 0) {
            return ctx.editMessageText(
                `📊 **No Active Numbers**\n\n💡 You don't have any active numbers.\nGet a number to start earning!\n\n🔄 **Numbers stay active until you delete them!**`,
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback("📱 Get Number", "menu_get_number"), Markup.button.callback("🔙 Back", "home")]]) }
            );
        }
        let list = myNumbers.map(p => `📱 \`${p}\` (${activeNumbers[p].service})`).join('\n');
        await ctx.editMessageText(`📊 **Your Active Numbers**\n\n${list}\n\nWaiting for OTP...`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "home")]]) });
    }

    // --- 📱 Get Number UI ---
    else if (data === "menu_get_number") {
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
        
        // --- ✅ নম্বর শো করার UI (Same to Same as your image) ---
        await ctx.editMessageText(
            `✅ **Number Assigned!**\n\n📱 **${srv}** | \`${item.phone}\` | **${cty}**\n\n⌛ **Wait, Stay here... OTP Coming Soon!**`, 
            { 
                parse_mode: 'Markdown', 
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("🗑 Delete Number", "menu_get_number"), Markup.button.callback("🔙 Back to Menu", "home")],
                    [Markup.button.url("📱 OTP GROUP HERE", "https://t.me/A_ToolsX")]
                ]) 
            }
        );
    }
});

// Admin ও OTP প্রসেসিং আগের মতোই আছে...
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const uid = ctx.from.id;

    if (uid === ADMIN_ID) {
        if (text.startsWith('/broadcast ')) {
            let msg = text.replace('/broadcast ', '');
            allUsers.forEach(user => bot.telegram.sendMessage(user, `📢 **Broadcast:**\n\n${msg}`).catch(e => {}));
            return ctx.reply("✅ Broadcast sent.");
        }
        if (text.startsWith('/addservice ')) {
            let [name, rate] = text.replace('/addservice ', '').split(',').map(s => s.trim());
            services[name] = parseFloat(rate);
            return ctx.reply(`✅ Added ${name}.`);
        }
        if (text.startsWith('/bulk ')) {
            try {
                let lines = text.split('\n');
                let info = lines[0].replace('/bulk ', '').split(',').map(s => s.trim());
                let srv = info[0], cty = info[1];
                let nums = lines.slice(1).filter(n => n.length > 5);
                nums.forEach(n => inventory.push({ service: srv, country: cty, phone: n.trim() }));
                return ctx.reply(`✅ Added ${nums.length} numbers.`);
            } catch (e) { return ctx.reply("Error!"); }
        }
    }

    if (ctx.chat.id == OTP_GROUP_ID) {
        for (let phone in activeNumbers) {
            if (text.includes(phone)) {
                let d = activeNumbers[phone];
                bot.telegram.sendMessage(d.uid, `📩 **OTP Received!**\n\nNumber: ${phone}\nCode: ${text}`);
                userBalances[d.uid] = (userBalances[d.uid] || 0) + d.rate;
                delete activeNumbers[phone];
            }
        }
    }
});

http.createServer((req, res) => { res.writeHead(200); res.end('Alive'); }).listen(process.env.PORT || 3000);
bot.launch({ dropPendingUpdates: true });
            
