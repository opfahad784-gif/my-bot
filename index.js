const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- ⚙️ কনফিগারেশন ---
const TOKEN = '7822711517:AAEpeFSU1XcKIo-uE194SXH9UVJn0kL0e_o';
const ADMIN_ID = 7488161246; // আপনার আইডি
const OTP_GROUP_ID = -1003958220896; 
const CHANNEL_ID = '@A_ToolsX'; // আপনার চ্যানেলের ইউজারনেম

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
            [Markup.button.url("🎧 Support", "https://t.me/your_actual_support")]
        ])
    };
}

// --- 🛡️ মেম্বারশিপ চেক ফাংশন (অ্যাডমিন বাদে) ---
async function checkJoin(ctx) {
    if (ctx.from.id === ADMIN_ID) return true; // অ্যাডমিনকে চেক করবে না
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        if (member.status === 'left' || member.status === 'kicked') return false;
        return true;
    } catch (e) { return false; }
}

bot.start(async (ctx) => {
    const joined = await checkJoin(ctx);
    if (!joined) {
        return ctx.reply(`🚀 To use this bot, you must join our channel: https://t.me/A_ToolsX`);
    }
    const menu = getMainMenu(ctx);
    ctx.reply(menu.text, menu.markup);
});

// --- 🔘 বাটন হ্যান্ডলার ---
bot.on('callback_query', async (ctx) => {
    const joined = await checkJoin(ctx);
    if (!joined) return ctx.answerCbQuery("Please join our channel first!", { show_alert: true });

    const data = ctx.callbackQuery.data;
    const uid = ctx.from.id;

    if (data === "menu_get_number") {
        let buttons = Object.keys(services).map(srv => [Markup.button.callback(srv, `srv_${srv}`)]);
        buttons.push([Markup.button.callback("🏠 Main Menu", "home")]);
        await ctx.editMessageText("🛠 Select the platform:", Markup.inlineKeyboard(buttons));
    }
    // ... (অন্যান্য বাটন লজিক একই থাকবে)
});

// --- 📡 অ্যাডমিন কমান্ডস (সরাসরি কাজ করবে) ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const uid = ctx.from.id;

    // অ্যাডমিন কমান্ড চেক (কোনো চ্যানেল চেক ছাড়াই কাজ করবে)
    if (uid === ADMIN_ID && text.startsWith('/bulk')) {
        try {
            let lines = text.split('\n');
            let info = lines[0].replace('/bulk ', '').split(',').map(s => s.trim());
            let srv = info[0];
            let cty = info[1];
            let nums = lines.slice(1).filter(n => n.length > 5);
            nums.forEach(n => inventory.push({ service: srv, country: cty, phone: n }));
            return ctx.reply(`✅ Added ${nums.length} numbers for ${srv}.`);
        } catch (e) { return ctx.reply("Error in format!"); }
    }

    const joined = await checkJoin(ctx);
    if (!joined) return ctx.reply(`🚀 Please join: https://t.me/A_ToolsX`);
});

http.createServer((req, res) => { res.writeHead(200); res.end('OK'); }).listen(process.env.PORT || 3000);
bot.launch({ dropPendingUpdates: true });
