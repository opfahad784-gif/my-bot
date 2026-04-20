const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- ⚙️ BOT CONFIGURATION ---
const TOKEN = '8749050433:AAFaZx9Sd1ZAke9MWjxHYvUynoo8BKzS27c';
const bot = new Telegraf(TOKEN);
const ADMIN_ID = 7488161246; 
const OTP_GROUP_ID = -1003958220896; 

// --- 🗄️ DATABASE (In-Memory) ---
let userBalances = {}; // { userId: balance }
let activeNumbers = {}; // { phone: { uid, service, country, rate } }
let inventory = []; // [{ service, country, phone, rate }]

let settings = {
    otpLink: "https://t.me/yoosms_otp",
    updateLink: "https://t.me/your_channel",
    minWithdraw: 1.0000,
    transferMin: 0.50
};

let services = {
    "Face-Book": 0.0030
};

// --- 🎨 UI MENUS ---
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

// --- 🚀 START COMMAND ---
bot.start((ctx) => {
    if (userBalances[ctx.from.id] === undefined) userBalances[ctx.from.id] = 0.00;
    const menu = getMainMenu(ctx);
    ctx.reply(menu.text, menu.markup);
});

// --- 🔘 BUTTON CLICKS (CALLBACKS) ---
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from.id;

    try {
        if (data === "home") {
            const menu = getMainMenu(ctx);
            await ctx.editMessageText(menu.text, menu.markup);
        }
        
        // 1. GET NUMBER MENU
        else if (data === "menu_get_number") {
            let buttons = Object.keys(services).map(srv => [Markup.button.callback(srv, `srv_${srv}`)]);
            buttons.push([Markup.button.callback("🏠 Main Menu", "home"), Markup.button.callback("🔙 Back", "home")]);
            await ctx.editMessageText("🛠 Select the platform you need to access:", Markup.inlineKeyboard(buttons));
        }
        
        // 2. COUNTRY MENU (After selecting service)
        else if (data.startsWith("srv_")) {
            const service = data.split("_")[1];
            // Find available countries for this service
            let availableCountries = [...new Set(inventory.filter(i => i.service === service).map(i => i.country))];
            
            let buttons = [];
            for (let i = 0; i < availableCountries.length; i += 2) {
                let row = [Markup.button.callback(availableCountries[i], `get_${service}_${availableCountries[i]}`)];
                if (availableCountries[i+1]) row.push(Markup.button.callback(availableCountries[i+1], `get_${service}_${availableCountries[i+1]}`));
                buttons.push(row);
            }
            if(buttons.length === 0) buttons.push([Markup.button.callback("❌ No Numbers Available", "menu_get_number")]);
            
            buttons.push([Markup.button.callback("🏠 Main Menu", "home"), Markup.button.callback("🔙 Back", "menu_get_number")]);
            await ctx.editMessageText(`🌍 Select country for ${service}:`, Markup.inlineKeyboard(buttons));
        }

        // 3. ASSIGN NUMBER
        else if (data.startsWith("get_")) {
            const parts = data.split("_");
            const service = parts[1];
            const country = parts.slice(2).join("_"); // handle multi-word countries
            
            let numIndex = inventory.findIndex(i => i.service === service && i.country === country);
            if (numIndex === -1) return ctx.answerCbQuery("❌ Out of stock for this country!", { show_alert: true });
            
            let item = inventory.splice(numIndex, 1)[0];
            activeNumbers[item.phone] = { uid: uid, service: service, country: country, rate: item.rate };

            await ctx.editMessageText(`✅ Number Assigned!\n\n📱 ${service} | ${item.phone} | ${country}\n\n⏳ Wait, Stay here... OTP Coming Soon!`, 
                Markup.inlineKeyboard([
                    [Markup.button.callback("🗑 Delete Number", `del_${item.phone}`), Markup.button.callback("🔙 Back to Menu", "home")],
                    [Markup.button.url("📱 OTP GROUP HERE ↗️", settings.otpLink)]
                ])
            );
        }

        // 4. DELETE NUMBER
        else if (data.startsWith("del_")) {
            const phone = data.replace("del_", "");
            if (activeNumbers[phone]) delete activeNumbers[phone];
            await ctx.answerCbQuery("✅ Number Deleted!");
            const menu = getMainMenu(ctx);
            await ctx.editMessageText(menu.text, menu.markup);
        }

        // 5. BALANCE
        else if (data === "menu_balance") {
            let bal = (userBalances[uid] || 0).toFixed(4);
            let rateText = Object.keys(services).map(s => `• ${s}: $${services[s].toFixed(4)}`).join("\n");
            
            let text = `💰 Your Balance: $${bal}\n\n💡 Earning Rates:\n${rateText}\n\n💳 Minimum Withdrawal: $${settings.minWithdraw.toFixed(4)}`;
            await ctx.editMessageText(text, Markup.inlineKeyboard([
                [Markup.button.callback("💸 Transfer Balance", "err_bal"), Markup.button.callback("🔙 Back to Menu", "home")]
            ]));
        }

        // 6. WITHDRAW MENU
        else if (data === "menu_withdraw") {
            const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
            const today = days[new Date().getDay()];
            let text = `📆 Withdrawal Not Available Today\n\n🗓 Today: ${today}\n✅ Withdrawal Day: Tuesday (12:00 AM - 12:00 PM)\n🎬 Withdraw Process: Watch Video\n\n💡 You can only request withdrawals on Tuesday between 12am and 12pm\n⏰ Next withdrawal day: Tuesday`;
            await ctx.editMessageText(text, Markup.inlineKeyboard([[Markup.button.callback("🔙 Back to Menu", "home")]]));
        }

        // 7. ACTIVE NUMBERS
        else if (data === "menu_active") {
            let myNums = Object.keys(activeNumbers).filter(phone => activeNumbers[phone].uid === uid);
            if (myNums.length === 0) {
                await ctx.editMessageText(`📊 No Active Numbers\n\n💡 You don't have any active numbers. Get a number to start earning!\n\n🔄 Numbers stay active until you delete them!`, 
                    Markup.inlineKeyboard([[Markup.button.callback("📱 Get Number", "menu_get_number"), Markup.button.callback("🔙 Back", "home")]])
                );
            } else {
                let text = "📊 Your Active Numbers:\n\n";
                myNums.forEach(phone => {
                    let d = activeNumbers[phone];
                    text += `📱 ${d.service} | ${phone} | ${d.country}\n`;
                });
                await ctx.editMessageText(text, Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "home")]]));
            }
        }

        // 8. ERROR INSUFFICIENT
        else if (data === "err_bal") {
            let bal = (userBalances[uid] || 0).toFixed(4);
            let text = `❌ Insufficient Balance\n\n💰 Your Balance: $${bal}\n💵 Minimum Required: $${settings.transferMin.toFixed(2)}\n\n💡 You need at least $${settings.transferMin.toFixed(2)} to transfer.`;
            await ctx.editMessageText(text, Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "menu_balance")]]));
        }
    } catch (e) { console.log(e); }
});

// --- 📡 MESSAGES & OTP LOGIC ---
bot.on('text', (ctx) => {
    const text = ctx.message.text;

    // ➡️ USER PASTES A NUMBER TO TRACK (আপনার রিকুয়েস্ট অনুযায়ী)
    if (ctx.chat.type === 'private' && !text.startsWith('/')) {
        let phone = text.trim();
        // যদি ইউজার নিজে নাম্বার পেস্ট করে
        activeNumbers[phone] = { uid: ctx.from.id, service: "Custom", country: "Unknown", rate: 0.005 }; // Default rate for custom
        ctx.reply(`✅ Number ${phone} added to your Active Numbers! Wait for OTP...`);
        return;
    }

    // ➡️ OTP CAPTURING FROM GROUP
    if (ctx.chat.id == OTP_GROUP_ID) {
        for (let phone in activeNumbers) {
            if (text.includes(phone)) {
                let data = activeNumbers[phone];
                // Forward OTP to User
                bot.telegram.sendMessage(data.uid, `✅ **Number Assigned!**\n\n📱 ${data.service} | ${phone}\n💬 **OTP Code:**\n${text}`, { parse_mode: "Markdown" });
                
                // Add Balance (Earning)
                if (data.rate > 0) {
                    userBalances[data.uid] = (userBalances[data.uid] || 0) + data.rate;
                    bot.telegram.sendMessage(data.uid, `🎉 You earned $${data.rate} for this OTP!\n💰 New Balance: $${userBalances[data.uid].toFixed(4)}`);
                }
                
                // Remove from active list after receiving OTP
                delete activeNumbers[phone];
            }
        }
        return;
    }

    // --- 🛠 ADMIN PANEL COMMANDS ---
    if (ctx.from.id !== ADMIN_ID) return;

    if (text.startsWith('/addbal')) {
        let parts = text.split(" ");
        if(parts.length < 3) return ctx.reply("❌ Format: /addbal UserID Amount");
        let targetId = parseInt(parts[1]);
        let amt = parseFloat(parts[2]);
        userBalances[targetId] = (userBalances[targetId] || 0) + amt;
        ctx.reply(`✅ Added $${amt} to User ${targetId}. New Bal: $${userBalances[targetId].toFixed(4)}`);
    }
    else if (text.startsWith('/delbal')) {
        let parts = text.split(" ");
        let targetId = parseInt(parts[1]);
        let amt = parseFloat(parts[2]);
        userBalances[targetId] = Math.max(0, (userBalances[targetId] || 0) - amt);
        ctx.reply(`✅ Removed $${amt} from User ${targetId}. New Bal: $${userBalances[targetId].toFixed(4)}`);
    }
    else if (text.startsWith('/setotplink')) {
        settings.otpLink = text.replace('/setotplink', '').trim();
        ctx.reply(`✅ OTP Group link updated!`);
    }
    else if (text.startsWith('/setupdatelink')) {
        settings.updateLink = text.replace('/setupdatelink', '').trim();
        ctx.reply(`✅ Bot Update link updated!`);
    }
    else if (text.startsWith('/setrate')) {
        let parts = text.split(" ");
        services[parts[1]] = parseFloat(parts[2]);
        ctx.reply(`✅ Rate for ${parts[1]} set to $${parts[2]}`);
    }
    else if (text.startsWith('/bulk')) {
        // Format: /bulk Service, Country +51
        // Number 1
        // Number 2
        try {
            let lines = text.split('\n');
            let info = lines[0].replace('/bulk ', '').split(',');
            let srv = info[0].trim();
            let cty = info[1].trim();
            let rate = services[srv] || 0.0030; // Use existing rate or default
            
            if (!services[srv]) services[srv] = rate; // Add new service if not exist

            let nums = lines.slice(1).map(n => n.trim()).filter(n => n.length > 3);
            nums.forEach(n => inventory.push({ service: srv, country: cty, phone: n, rate: rate }));
            
            ctx.reply(`✅ Added ${nums.length} numbers for ${srv} (${cty})`);
        } catch(e) {
            ctx.reply("❌ Format Error!\nUsage:\n/bulk Face-Book, Peru +51\n1234567\n9876543");
        }
    }
});

// --- 🌍 RENDER SERVER KEEPALIVE ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('OTP Bot is Running Perfectly!'); }).listen(PORT, '0.0.0.0');

// --- 🚀 LAUNCH BOT ---
bot.launch({ dropPendingUpdates: true }).then(() => console.log("🚀 Custom UI Bot is Live!"));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
                                                           
