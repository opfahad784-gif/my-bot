const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const https = require('https');

// --- KEEP ALIVE SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// --- CONFIG ---
const TOKEN = '8413633586:AAHAX5uBc_Dc2H8VrakF3lbLPFkM1F3wpIE';
const ADMIN_ID = 7488161246;

// UPDATED NEXA CONFIG
const NEXA_API_KEY = 'nxa_a0c78ce02c9a7cee35d9886f72d4c42935a63863';
const NEXA_BASE_URL = 'http://185.190.142.81/api/v1/';

const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATABASE ---
let users = {};
let services = {};
let availableNumbers = [];
let assignedNumbers = [];
let manualNumbers = []; // New storage for bulk numbers
let transferStates = {};
let withdrawStates = {};
let isWithdrawActive = false;
let broadcastState = {};
let groupSettingState = {};
let adminActionState = {};
let extraAdmins = [];
let numberLimit = 1; 

// TRAFFIC DATA STORE
let otpTraffic = {}; 
let lastTrafficPostId = null;

// REFERRAL SETTINGS
const REFERRAL_COMMISSION = 0.15; 

let config = {
    otpGroup: "https://t.me/nhotpnumber",
    updateGroup: "https://t.me/otpmethodokk",
    otpUsername: "@nhotpnumber",
    updateUsername: "@otpmethodokk",
    otpButtonText: "Get Number Now",
    otpButtonUrl: "https://t.me/YourBotLink",
    channel1Name: "📢 Join Channel 1",
    channel2Name: "📢 Join Channel 2"
};

// --- DYNAMIC FAKE OTP SETTINGS (Admin Configurable) ---
let fakeIntervalTime = 30000; 
let fakeTimerInstance = null;

let fakeServices = [];
let fakeCountries = [];

function startFakeOtpLoop() {
    if (fakeTimerInstance) clearInterval(fakeTimerInstance);
    
    fakeTimerInstance = setInterval(() => {
        if (fakeServices.length === 0 || fakeCountries.length === 0) return;

        for (let i = 0; i < 2; i++) {
            const randService = fakeServices[Math.floor(Math.random() * fakeServices.length)];
            const randCountry = fakeCountries[Math.floor(Math.random() * fakeCountries.length)];
            
            const randomOtp = Math.floor(100000 + Math.random() * 900000); 
            const randomDigits1 = Math.floor(1000 + Math.random() * 9000);
            const randomDigits2 = Math.floor(10 + Math.random() * 90);
            const maskedNum = `${randCountry.code}${randomDigits1}••••${randomDigits2}`;
            const fakeReward = (0.0020 + Math.random() * 0.0080).toFixed(4);

            otpTraffic[randService.name.toLowerCase()] = (otpTraffic[randService.name.toLowerCase()] || 0) + 1;

            const fakeGroupMsg = `𓆩𓆩.${randCountry.flag}${randService.name}${randService.icon}𝚁𝙴𝙲𝙴𝙸𝚅𝙴𝙳 .𓆪𓆪\n` +
                                 `${randCountry.flag} ᯓ𝙲𝚘𝚞𝚗𝚝𝚛ｙ » ${randCountry.name}\n` +
                                 `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${maskedNum}\`\n` +
                                 `🔐ᯓ𝙾𝚃𝙿 » \`${randomOtp}\`\n` +
                                 `💰 ᯓ𝚁𝙴𝚆𝙰𝚁𝙳 » $${fakeReward}`;

            bot.sendMessage(config.otpUsername, fakeGroupMsg, { 
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [[{ text: config.otpButtonText, url: config.otpButtonUrl }]]
                }
            }).catch(() => {});
        }
    }, fakeIntervalTime);
}

startFakeOtpLoop();

setInterval(async () => {
    let trafficText = "📊 **𝗧𝗥𝗔𝗙𝗙𝗜𝗖 𝗦𝗘𝗥𝗩𝗘𝗥 𝗨𝗣加快**\n\n";
    const serviceKeys = Object.keys(otpTraffic);
    
    if (serviceKeys.length === 0) {
        trafficText += "No traffic recorded yet.";
    } else {
        serviceKeys.forEach(service => {
            trafficText += `🔹 **${service.toUpperCase()}**: ${otpTraffic[service]} OTPs Received\n`;
        });
    }
    trafficText += `\n🕒 Last Updated: ${new Date().toLocaleTimeString()}`;

    try {
        if (lastTrafficPostId) {
            await bot.editMessageText(trafficText, { chat_id: config.otpUsername, message_id: lastTrafficPostId, parse_mode: "Markdown" });
        } else {
            const sentMsg = await bot.sendMessage(config.otpUsername, trafficText, { parse_mode: "Markdown" });
            lastTrafficPostId = sentMsg.message_id;
        }
    } catch (e) {
        const sentMsg = await bot.sendMessage(config.otpUsername, trafficText, { parse_mode: "Markdown" });
        lastTrafficPostId = sentMsg.message_id;
    }
}, 600000); 

const isAdmin = (userId) => {
    return userId === ADMIN_ID || extraAdmins.includes(Number(userId));
};

const checkJoin = async (userId) => {
    try {
        const res1 = await bot.getChatMember(config.otpUsername, userId);
        const res2 = await bot.getChatMember(config.updateUsername, userId);
        const statuses = ['member', 'administrator', 'creator'];
        return statuses.includes(res1.status) && statuses.includes(res2.status);
    } catch (e) { return false; }
};

const findUser = (input) => {
    if (!input) return null;
    if (users[input]) return { id: input, ...users[input] };
    const username = input.replace('@', '').toLowerCase();
    for (const id in users) {
        if (users[id].username && users[id].username.toLowerCase() === username) {
            return { id: id, ...users[id] };
        }
    }
    return null;
};

const getCountryByPattern = (pattern) => {
    const patternMap = {
        "93": "Afghanistan", "355": "Albania", "213": "Algeria", "1684": "American Samoa", "376": "Andorra",
        "244": "Angola", "1264": "Anguilla", "672": "Antarctica", "1268": "Antigua and Barbuda", "54": "Argentina",
        "374": "Armenia", "297": "Aruba", "61": "Australia", "43": "Austria", "994": "Azerbaijan",
        "1242": "Bahamas", "973": "Bahrain", "880": "Bangladesh", "1246": "Barbados", "375": "Belarus",
        "32": "Belgium", "501": "Belize", "229": "Benin", "1441": "Bermuda", "975": "Bhutan",
        "591": "Bolivia", "387": "Bosnia and Herzegovina", "267": "Botswana", "55": "Brazil", "246": "British Indian Ocean Territory",
        "1284": "British Virgin Islands", "673": "Brunei", "359": "Bulgaria", "226": "Burkina Faso", "257": "Burundi",
        "855": "Cambodia", "237": "Cameroon", "1": "USA/Canada", "238": "Cape Verde", "1345": "Cayman Islands",
        "236": "Central African Republic", "235": "Chad", "56": "Chile", "86": "China", "61": "Christmas Island",
        "61": "Cocos Islands", "57": "Colombia", "269": "Comoros", "682": "Cook Islands", "506": "Costa Rica",
        "385": "Croatia", "53": "Cuba", "599": "Curacao", "357": "Cyprus", "420": "Czech Republic",
        "243": "DR Congo", "45": "Denmark", "253": "Djibouti", "1767": "Dominica", "1809": "Dominican Republic",
        "1829": "Dominican Republic", "1849": "Dominican Republic", "670": "East Timor", "593": "Ecuador", "20": "Egypt",
        "503": "El Salvador", "240": "Equatorial Guinea", "291": "Eritrea", "372": "Estonia", "251": "Ethiopia",
        "500": "Falkland Islands", "298": "Faroe Islands", "679": "Fiji", "358": "Finland", "33": "France",
        "689": "French Polynesia", "241": "Gabon", "220": "Gambia", "995": "Georgia", "49": "Germany",
        "233": "Ghana", "350": "Gibraltar", "30": "Greece", "299": "Greenland", "1473": "Grenada",
        "1671": "Guam", "502": "Guatemala", "441481": "Guernsey", "224": "Guinea", "245": "Guinea-Bissau",
        "592": "Guyana", "509": "Haiti", "504": "Honduras", "852": "Hong Kong", "36": "Hungary",
        "354": "Iceland", "91": "India", "62": "Indonesia", "98": "Iran", "964": "Iraq",
        "353": "Ireland", "441624": "Isle of Man", "972": "Israel", "39": "Italy", "225": "Ivory Coast",
        "1876": "Jamaica", "81": "Japan", "441534": "Jersey", "962": "Jordan", "7": "Russia/Kazakhstan",
        "254": "Kenya", "686": "Kiribati", "383": "Kosovo", "965": "Kuwait", "996": "Kyrgyzstan",
        "856": "Laos", "371": "Latvia", "961": "Lebanon", "266": "Lesotho", "231": "Liberia",
        "218": "Libya", "423": "Liechtenstein", "370": "Lithuania", "352": "Luxembourg", "853": "Macau",
        "389": "Macedonia", "261": "Madagascar", "265": "Malawi", "60": "Malaysia", "960": "Maldives",
        "223": "Mali", "356": "Malta", "692": "Marshall Islands", "222": "Mauritania", "230": "Mauritius",
        "262": "Mayotte", "52": "Mexico", "691": "Micronesia", "373": "Moldova", "377": "Monaco",
        "976": "Mongolia", "382": "Montenegro", "1664": "Montserrat", "212": "Morocco", "258": "Mozambique",
        "95": "Myanmar", "264": "Namibia", "674": "Nauru", "977": "Nepal", "31": "Netherlands",
        "687": "New Caledonia", "64": "New Zealand", "505": "Nicaragua", "227": "Niger", "234": "Nigeria",
        "683": "Niue", "672": "Norfolk Island", "850": "North Korea", "1670": "Northern Mariana Islands", "47": "Norway",
        "968": "Oman", "92": "Pakistan", "680": "Palau", "970": "Palestine", "507": "Panama",
        "675": "Papua New Guinea", "595": "Paraguay", "51": "Peru", "63": "Philippines", "48": "Poland",
        "351": "Portugal", "1787": "Puerto Rico", "1939": "Puerto Rico", "974": "Qatar", "242": "Republic of the Congo",
        "262": "Reunion", "40": "Romania", "250": "Rwanda", "590": "Saint Barthelemy", "290": "Saint Helena",
        "1869": "Saint Kitts and Nevis", "1758": "Saint Lucia", "590": "Saint Martin", "508": "Saint Pierre and Miquelon",
        "1784": "Saint Vincent and the Grenadines", "685": "Samoa", "378": "San Marino", "239": "Sao Tome and Principe",
        "966": "Saudi Arabia", "221": "Senegal", "381": "Serbia", "248": "Seychelles", "232": "Sierra Leone",
        "65": "Singapore", "1721": "Sint Maarten", "421": "Slovakia", "386": "Slovenia", "677": "Solomon Islands",
        "252": "Somalia", "27": "South Africa", "82": "South Korea", "211": "South Sudan", "34": "Spain",
        "94": "Sri Lanka", "249": "Sudan", "597": "Suriname", "268": "Swaziland", "46": "Sweden",
        "41": "Switzerland", "963": "Syria", "886": "Taiwan", "992": "Tajikistan", "255": "Tanzania",
        "66": "Thailand", "228": "Togo", "690": "Tokelau", "676": "Tonga", "1868": "Trinidad and Tobago",
        "216": "Tunisia", "90": "Turkey", "993": "Turkmenistan", "1649": "Turks and Caicos Islands", "688": "Tuvalu",
        "1340": "U.S. Virgin Islands", "256": "Uganda", "380": "Ukraine", "971": "UAE", "44": "UK",
        "598": "Uruguay", "998": "Uzbekistan", "678": "Vanuatu", "379": "Vatican", "58": "Venezuela",
        "84": "Vietnam", "681": "Wallis and Futuna", "967": "Yemen", "260": "Zambia", "263": "Zimbabwe"
    };
    
    const cleanPattern = pattern.startsWith('+') ? pattern.substring(1) : pattern;
    const sortedKeys = Object.keys(patternMap).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (cleanPattern.startsWith(key)) return patternMap[key];
    }
    return "Unknown Country";
};

const getFlag = (countryName) => {
    if (!countryName || countryName === "Unknown Country") return "🌎";
    const flags = {
        "afghanistan": "🇦🇫", "albania": "🇦🇱", "algeria": "🇩🇿", "andorra": "🇦🇩",
        "angola": "🇦🇴", "argentina": "🇦🇷", "armenia": "🇦🇲", "australia": "🇦🇺",
        "austria": "🇦🇹", "azerbaijan": "🇦🇿", "bahamas": "🇧🇸", "bahrain": "🇧🇭",
        "bangladesh": "🇧🇩", "barbados": "🇧🇧", "belarus": "🇧🇾", "belgium": "🇧🇪",
        "belize": "🇧🇿", "benin": "🇧🇯", "bhutan": "🇧🇹", "bolivia": "🇧🇴",
        "bosnia and herzegovina": "🇧🇦", "botswana": "🇧🇼", "brazil": "🇧🇷", "brunei": "🇧🇳",
        "bulgaria": "🇧🇬", "burkina faso": "🇧🇫", "burundi": "🇧🇮", "cambodia": "🇰🇭",
        "cameroon": "🇨🇲", "canada": "🇨🇦", "chile": "🇨🇱", "china": "🇨🇳",
        "colombia": "🇨🇴", "congo": "🇨🇬", "costa rica": "🇨🇷", "croatia": "🇭🇷",
        "cuba": "🇨🇺", "cyprus": "🇨🇾", "czech republic": "🇨🇿", "denmark": "🇩🇰",
        "djibouti": "🇩🇯", "dominican republic": "🇩🇴", "ecuador": "🇪🇨", "egypt": "🇪🇬",
        "el salvador": "🇸🇻", "estonia": "🇪🇪", "ethiopia": "🇪🇹", "fiji": "🇫🇯",
        "finland": "🇫🇮", "france": "🇫🇷", "gabon": "🇬🇦", "gambia": "🇬🇲",
        "georgia": "🇬🇪", "germany": "🇩🇪", "ghana": "🇬🇭", "greece": "🇬🇷",
        "guatemala": "🇬🇹", "guinea": "🇬🇳", "haiti": "🇭🇹", "honduras": "🇭🇳",
        "hungary": "🇭🇺", "iceland": "🇮🇸", "india": "🇮🇳", "indonesia": "🇮🇩",
        "iran": "🇮🇷", "iraq": "🇮🇶", "ireland": "🇮🇪", "israel": "🇮🇱",
        "italy": "🇮🇹", "jamaica": "🇮🇲", "japan": "🇯🇵", "jordan": "🇯🇴",
        "kazakhstan": "🇰🇿", "kenya": "🇰🇪", "kuwait": "🇰🇼", "kyrgyzstan": "🇰🇬",
        "laos": "🇱🇦", "latvia": "🇱🇻", "lebanon": "🇱🇧", "libya": "🇱🇾",
        "lithuania": "🇱🇹", "luxembourg": "🇱🇺", "madagascar": "🇲🇬", "malawi": "🇲🇼",
        "malaysia": "🇲🇾", "maldives": "🇲🇻", "mali": "🇲🇱", "malta": "🇲🇹",
        "mauritius": "🇲🇺", "mexico": "🇲🇽", "moldova": "🇲🇩", "mongolia": "🇲🇳",
        "morocco": "🇲🇦", "mozambique": "🇲🇿", "myanmar": "🇲🇲", "namibia": "🇳🇦",
        "nepal": "🇳🇵", "netherlands": "🇳🇱", "new zealand": "🇳🇿", "nicaragua": "🇳🇮",
        "niger": "🇳🇪", "nigeria": "🇳🇬", "norway": "🇳🇴", "oman": "🇴🇲",
        "pakistan": "🇵🇰", "palestine": "🇵🇸", "panama": "🇵🇦", "paraguay": "🇵🇾",
        "peru": "🇵🇪", "philippines": "🇵🇭", "poland": "🇵🇱", "portugal": "🇵🇹",
        "qatar": "🇶🇦", "romania": "🇷🇴", "russia": "🇷🇺", "saudi arabia": "🇸🇦",
        "senegal": "🇸🇳", "serbia": "🇷🇸", "singapore": "🇸🇬", "slovakia": "🇸🇰",
        "slovenia": "🇸🇮", "somalia": "🇸🇴", "south africa": "🇿🇦", "south korea": "🇰🇷",
        "spain": "🇪🇸", "sri lanka": "🇱🇰", "sudan": "🇸🇩", "sweden": "🇸🇪",
        "switzerland": "🇨🇭", "syria": "🇸🇾", "taiwan": "🇹🇼", "tajikistan": "🇹🇯",
        "tanzania": "🇹🇿", "thailand": "🇹🇭", "togo": "🇹🇬", "tunisia": "🇹🇳",
        "turkey": "🇹🇷", "uganda": "🇺🇬", "ukraine": "🇺🇦", "united arab emirates": "🇦🇪",
        "united kingdom": "🇬🇧", "united states": "🇺🇸", "uruguay": "🇺🇾", "uzbekistan": "🇺🇿",
        "venezuela": "🇻🇪", "vietnam": "🇻🇳", "yemen": "🇾🇪", "zambia": "🇿🇲",
        "zimbabwe": "🇿🇼", "usa/canada": "🇺🇸", "uk": "🇬🇧", "uae": "🇦🇪",
        "hong kong": "🇭🇰", "dr congo": "🇨🇩", "russia/kazakhstan": "🇷🇺"
    };
    return flags[countryName.toLowerCase()] || "🌎";
};

// --- UI ---
const sendJoinMessage = (chatId) => {
    const msg = `🚫 **Access Denied!**\n\n⚠️ **You are NOT Verified.**\nYou must join our channels to access this bot.\n\n👇 **Join below then click "Verify Status"**`;
    bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: config.channel1Name, url: config.otpGroup }],
                [{ text: config.channel2Name, url: config.updateGroup }],
                [{ text: "✅ Verify Status", callback_data: "check_join" }]
            ]
        }
    });
};

const sendMainMenu = (chatId, username) => {
    const msg = `⚡ **WELCOME TO PRO SMS SERVER** ⚡\n━━━━━━━━━━━━━━━━━━━━\n👤 **User:** @${username || 'N/A'}\n🆔 **Your ID:** \`${chatId}\`\n\n🔥 _Fastest & Most Secure automated number platform in the industry._`;
    bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "💼 Active Numbers", callback_data: "menu_active" }],
                [{ text: "💰 Balance Profile", callback_data: "menu_balance" }, { text: "💸 Withdraw Cash", callback_data: "menu_withdraw" }],
                [{ text: "🔄 Fund Transfer", callback_data: "menu_transfer" }, { text: "📊 Group Traffic", callback_data: "menu_traffic" }]
            ]
        }
    });
};

const sendAdminPanel = (chatId) => {
    bot.sendMessage(chatId, "🛠 **Welcome to Administrative Matrix**\nConfigure parameters globally below:", {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "📢 Broadcast Msg", callback_data: "admin_broadcast" }, { text: "👥 View Top Users", callback_data: "admin_view_users" }],
                [{ text: "👤 Admin Managers", callback_data: "admin_edit_manager" }, { text: "📊 Check Nexa Range", callback_data: "admin_check_range" }],
                [{ text: "✅ Withdraw ON", callback_data: "admin_withdraw_on" }, { text: "❌ Withdraw OFF", callback_data: "admin_withdraw_off" }],
                [{ text: "⚙️ Edit Force Join", callback_data: "admin_group_settings" }],
                [{ text: "🔘 Edit OTP Button", callback_data: "admin_otp_btn_settings" }],
                [{ text: "🔢 Number Limit", callback_data: "admin_number_limit" }],
                [{ text: "⚙️ Fake OTP Settings", callback_data: "admin_fake_settings" }],
                [{ text: "🏠 Main Menu", callback_data: "main_menu" }]
            ]
        }
    });
};

// --- CALLBACK HANDLING ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    try {
        await bot.answerCallbackQuery(query.id);

        if (users[userId]?.isBanned && !isAdmin(userId)) {
            return bot.sendMessage(chatId, "🚫 **You are banned.**");
        }

        if (data === "check_join") {
            const joined = await checkJoin(userId);
            if (joined) {
                if (!users[userId]) users[userId] = { balance: 0, username: query.from.username || 'User', referrals: 0, earnings: 0, referredBy: null };
                sendMainMenu(chatId, query.from.username);
            } else {
                bot.sendMessage(chatId, "❌ **Verification Failed!** Make sure you joined both channels.");
            }
        } else if (data === "main_menu") {
            sendMainMenu(chatId, query.from.username);
        } else if (data === "admin_panel") {
            if (!isAdmin(userId)) return;
            sendAdminPanel(chatId);
        } else if (data === "admin_fake_settings") {
            if (!isAdmin(userId)) return;
            bot.editMessageText(`⚙️ **Fake OTP Group Delivery Configurations**\n\nCurrent Interval Loop: ${fakeIntervalTime / 1000}s\nServices Loaded: ${fakeServices.length}\nCountries Loaded: ${fakeCountries.length}`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "⏱ Set Interval Loop", callback_data: "fake_set_interval" }],
                        [{ text: "➕ Add Fake Service", callback_data: "fake_add_service" }, { text: "🗑 Clear Services", callback_data: "fake_clear_services" }],
                        [{ text: "➕ Add Fake Country", callback_data: "fake_add_country" }, { text: "🗑 Clear Countries", callback_data: "fake_clear_countries" }],
                        [{ text: "🔙 Back", callback_data: "admin_panel" }]
                    ]
                }
            });
        } else if (data === "fake_set_interval") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'setting_fake_interval';
            bot.sendMessage(chatId, "⏱ Enter interval time in **seconds** (e.g., 30):");
        } else if (data === "fake_add_service") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'adding_fake_service';
            bot.sendMessage(chatId, "➕ Send fake service data format: `ServiceName Flag Emoji` \nExample: `IMO 📱 🟢`", { parse_mode: "Markdown" });
        } else if (data === "fake_clear_services") {
            if (!isAdmin(userId)) return;
            fakeServices = [];
            bot.sendMessage(chatId, "✅ Fake service inventory cleared!");
        } else if (data === "fake_add_country") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'adding_fake_country';
            bot.sendMessage(chatId, "➕ Send fake country data format: `CountryName Flag Code` \nExample: `Singapore 🇸🇬 65`", { parse_mode: "Markdown" });
        } else if (data === "fake_clear_countries") {
            if (!isAdmin(userId)) return;
            fakeCountries = [];
            bot.sendMessage(chatId, "✅ Fake country inventory cleared!");
        } else if (data === "menu_traffic") {
            const serviceKeys = Object.keys(services);
            if (serviceKeys.length === 0) return bot.sendMessage(chatId, "❌ No services available.");
            let buttons = serviceKeys.map(s => [{ text: s, callback_data: `traffic_view_${s}` }]);
            buttons.push([{ text: "🔙 Back to Menu", callback_data: "main_menu" }]);
            bot.editMessageText("📊 **Select a service to view traffic:**", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
        } else if (data.startsWith("traffic_view_")) {
            const sName = data.replace("traffic_view_", "");
            const count = otpTraffic[sName.toLowerCase()] || 0;
            bot.editMessageText(`📊 **Traffic stats for ${sName.toUpperCase()}:**\nTotal OTPs generated: ${count}`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_traffic" }]] }
            });
        } else if (data === "admin_number_limit") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'setting_number_limit';
            bot.sendMessage(chatId, `🔢 **Current Active Number Limit per User:** **${numberLimit}**\n\nPlease send the new limit (e.g., 3):`, { parse_mode: "Markdown" });
        } else if (data === "admin_edit_manager") {
            if (userId !== ADMIN_ID) return;
            bot.editMessageText("👤 **Admin Management**\nChoose an action:", {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "➕ Add Admin", callback_data: "admin_add_new" }, { text: "➖ Remove Admin", callback_data: "admin_remove_old" }],
                        [{ text: "🔙 Back", callback_data: "admin_panel" }]
                    ]
                }
            });
        } else if (data === "admin_add_new") {
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'adding_new_admin';
            bot.sendMessage(chatId, "👤 Send the **User ID** or **Username** to add as Admin:");
        } else if (data === "admin_remove_old") {
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'removing_admin';
            bot.sendMessage(chatId, "👤 Send the **User ID** or **Username** to remove from Admin:");
        } else if (data === "admin_check_range") {
            if (!isAdmin(userId)) return;
            try {
                const res = await axios.get(`${NEXA_BASE_URL}getServices?api_key=${NEXA_API_KEY}`);
                let msg = "📊 **Nexa Server Live Inventory:**\n\n";
                if (res.data && Array.isArray(res.data)) {
                    res.data.slice(0, 25).forEach(s => {
                        msg += `• ${s.name} (ID: ${s.id}) - $${s.price}\n`;
                    });
                } else {
                    msg += "Could not parse or empty responses from gateway.";
                }
                bot.sendMessage(chatId, msg);
            } catch (err) {
                bot.sendMessage(chatId, "❌ Nexus API call dropped context or refused parsing authorization.");
            }
        } else if (data === "admin_view_users") {
            if (!isAdmin(userId)) return;
            const ids = Object.keys(users);
            let list = `📊 **Total Users:** ${ids.length}\n\n`;
            ids.slice(0, 20).forEach((id, i) => {
                list += `${i+1}. @${users[id].username} | \`${id}\` | $${users[id].balance.toFixed(2)} ${users[id].isBanned ? '(BANNED)' : ''}\n`;
            });
            bot.sendMessage(chatId, list, { parse_mode: "Markdown" });
        } else if (data === "admin_broadcast") {
            if (!isAdmin(userId)) return;
            broadcastState[userId] = true;
            bot.sendMessage(chatId, "📢 Send message for broadcast:");
        } else if (data === "admin_withdraw_on") {
            if (!isAdmin(userId)) return;
            isWithdrawActive = true;
            bot.sendMessage(chatId, "✅ Withdrawal system is now ON.");
        } else if (data === "admin_withdraw_off") {
            if (!isAdmin(userId)) return;
            isWithdrawActive = false;
            bot.sendMessage(chatId, "❌ Withdrawal system is now OFF.");
        } else if (data === "admin_group_settings") {
            if (!isAdmin(userId)) return;
            bot.editMessageText(`⚙️ **Group Settings (Force Join)**\n\n1. OTP Group: ${config.otpUsername} (${config.otpGroup})\n   Btn Name: ${config.channel1Name}\n2. Update Channel: ${config.updateUsername} (${config.updateGroup})\n   Btn Name: ${config.channel2Name}`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✏️ Edit OTP Group Username", callback_data: "set_otp_username" }],
                        [{ text: "✏️ Edit OTP Link", callback_data: "set_otp_link" }],
                        [{ text: "✏️ Edit Update Username", callback_data: "set_update_username" }],
                        [{ text: "✏️ Edit Update Link", callback_data: "set_update_link" }],
                        [{ text: "✏️ Edit Btn 1 Name", callback_data: "set_btn1_name" }],
                        [{ text: "✏️ Edit Btn 2 Name", callback_data: "set_btn2_name" }],
                        [{ text: "🔙 Back", callback_data: "admin_panel" }]
                    ]
                }
            });
        } else if (data.startsWith('set_')) {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = `editing_${data}`;
            bot.sendMessage(chatId, `📝 Please send the new value for: ${data.replace('set_', '').replace(/_/g, ' ').toUpperCase()}`);
        } else if (data === "admin_otp_btn_settings") {
            if (!isAdmin(userId)) return;
            bot.editMessageText(`🔘 **OTP Message Channel Inline Button Config**\n\nCurrent Text: ${config.otpButtonText}\nCurrent Target URL: ${config.otpButtonUrl}`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✏️ Edit Button Text", callback_data: "set_otp_btn_text" }],
                        [{ text: "✏️ Edit Button URL", callback_data: "set_otp_btn_url" }],
                        [{ text: "🔙 Back", callback_data: "admin_panel" }]
                    ]
                }
            });
        } else if (data === "menu_balance") {
            const u = users[userId] || { balance: 0, referrals: 0, earnings: 0 };
            const refLink = `https://t.me/${(await bot.getMe()).username}?start=ref_${userId}`;
            const msg = `👤 **Your Profile Dashboard**\n━━━━━━━━━━━━━━━━━━━━\n🆔 **User ID:** \`${userId}\`\n💰 **Available Balance:** $${u.balance.toFixed(4)}\n\n👥 **Total Referrals:** ${u.referrals || 0}\n🎁 **Referral Earnings:** $${(u.earnings || 0).toFixed(4)}\n🔗 **Your Unique Referral Link:**\n\`${refLink}\``;
            bot.editMessageText(msg, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] } });
        } else if (data === "menu_withdraw") {
            if (!isWithdrawActive) {
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const today = days[new Date().getDay()];
                let msg = `📅 **Withdrawal Not Available Today**\n🗓 **Today:** ${today}\n✅ **Withdrawal Day:** Tuesday (12:00 AM - 12:00 PM)\n🎬 **Withdraw Process:** [Watch Video](https://t.me/SureSmsOfficial)\n\n💡 You can only request withdrawals on Tuesday between 12am and 12pm`;
                bot.editMessageText(msg, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] } });
            } else {
                const user = users[userId] || { balance: 0 };
                bot.editMessageText(`💰 **Your Balance:** $${user.balance.toFixed(4)}\n📉 **Minimum:** $1.0000\n\n👇 **Click "Withdraw Now" to start:**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", reply_markup: { inline_keyboard: [ [{ text: "💸 Withdraw Now", callback_data: "withdraw_now" }], [{ text: "🔙 Back to Menu", callback_data: "main_menu" }] ] } });
            }
        } else if (data === "withdraw_now") {
            const user = users[userId] || { balance: 0 };
            if (user.balance < 1.0) return bot.answerCallbackQuery(query.id, { text: "❌ Minimum balance required is $1.00", show_alert: true });
            withdrawStates[userId] = { step: 1 };
            bot.editMessageText(`🏦 *Withdrawal*\n\n💳 Please enter your *Binance UID*:`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "main_menu" }]] } });
        } else if (data === "confirm_withdraw") {
            const state = withdrawStates[userId];
            if (state && users[userId].balance >= state.amount) {
                users[userId].balance -= state.amount;
                bot.editMessageText(`✅ **Withdraw Requested Successfully!**\n\n💰 Amount: $${state.amount.toFixed(4)}\n🆔 UID: \`${state.binanceId}\``, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] } });
                bot.sendMessage(ADMIN_ID, `🚨 **WITHDRAW REQUEST**\n👤 User: \`${userId}\`\n🆔 UID: \`${state.binanceId}\`\n💰 Amt: $${state.amount.toFixed(4)}`, { parse_mode: "Markdown" }).catch(() => {});
            }
            delete withdrawStates[userId];
        } else if (data.startsWith("del_")) {
            const num = data.replace("del_", "");
            const idx = assignedNumbers.findIndex(n => n.number === num && n.userId === userId);
            if (idx !== -1) {
                assignedNumbers.splice(idx, 1);
            }
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendMainMenu(chatId, query.from.username);
        } else if (data === "menu_active") {
            const userNumbers = assignedNumbers.filter(n => n.userId === userId);
            if (userNumbers.length === 0) return bot.sendMessage(chatId, "📱 **You do not have any active temporary virtual numbers context.**");
            let list = "📂 **Your Active Virtual Identity Segments:**\n\n";
            userNumbers.forEach((n, idx) => {
                list += `${idx+1}. \`+${n.number}\` [${n.service.toUpperCase()}] - Waiting Verification SMS...\n`;
            });
            bot.sendMessage(chatId, list, { parse_mode: "Markdown" });
        } else if (data === "menu_transfer") {
            transferStates[userId] = { step: 1 };
            bot.editMessageText(`💵 **Fund Transfer Matrix**\n\nPlease supply target user's **Account ID Num**:`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "main_menu" }]] } });
        } else if (data === "confirm_transfer") {
            const state = transferStates[userId];
            if (state && users[userId].balance >= state.amount) {
                users[userId].balance -= state.amount;
                if (!users[state.targetId]) users[state.targetId] = { balance: 0, username: 'User', isBanned: false, referrals: 0, earnings: 0, referredBy: null };
                users[state.targetId].balance += state.amount;
                bot.editMessageText(`✅ **Transfer Successful!**\n\n💵 Amount: $${state.amount.toFixed(4)}\n🆔 To: \`${state.targetId}\``, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] } });
                bot.sendMessage(state.targetId, `🎁 **You received a transfer!**\n\n💵 Amount: $${state.amount.toFixed(4)}\n👤 From ID: \`${userId}\``, { parse_mode: "Markdown" }).catch(() => {});
            }
            delete transferStates[userId];
        } else if (data === "menu_get_number") {
            const serviceKeys = Object.keys(services);
            if (serviceKeys.length === 0) return bot.answerCallbackQuery(query.id, { text: "❌ System Matrix holds no services locally configured by administration.", show_alert: true });
            let buttons = serviceKeys.map(s => [{ text: `${s.toUpperCase()}`, callback_data: `sel_srv_${s}` }]);
            buttons.push([{ text: "🔙 Back to Menu", callback_data: "main_menu" }]);
            bot.editMessageText("📱 **Select Application Platform Instance Identity:**", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
        } else if (data.startsWith("sel_srv_")) {
            const sName = data.replace("sel_srv_", "");
            const sData = services[sName];
            if (!sData || sData.countries.length === 0) return bot.sendMessage(chatId, "❌ Service variant offline or lacks geographic allocations.");
            let buttons = sData.countries.map(c => [{ text: `${c} ($${sData.rates[c].toFixed(2)})`, callback_data: `buy_${sName}_${c}` }]);
            buttons.push([{ text: "🔙 Back", callback_data: "menu_get_number" }]);
            bot.editMessageText(`🗺 **Select country zone allocation for ${sName.toUpperCase()}:**`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
        } else if (data.startsWith("buy_")) {
            const parts = data.split('_');
            const sName = parts[1];
            const country = parts.slice(2).join('_');
            const user = users[userId] || { balance: 0 };
            const cost = services[sName]?.rates[country] || 999;

            if (user.balance < cost) return bot.sendMessage(chatId, "❌ **Insufficient Balance configuration profiles detected.**");
            const activeCount = assignedNumbers.filter(n => n.userId === userId).length;
            if (activeCount >= numberLimit) return bot.sendMessage(chatId, `❌ **Limit Exceeded!** You can only hold ${numberLimit} numbers context dynamically at once.`);

            // --- LOCAL MANUAL STORAGE MATCH CHECK FIRST ---
            const mIdx = manualNumbers.findIndex(n => n.service === sName.toLowerCase() && n.country === country.toLowerCase() && !n.used);
            if (mIdx !== -1) {
                const matchedNumData = manualNumbers[mIdx];
                matchedNumData.used = true;
                user.balance -= cost;

                const assignedPayload = {
                    number: matchedNumData.number,
                    number_id: matchedNumData.id,
                    service: sName,
                    country: country,
                    userId: userId,
                    reward: cost,
                    messageId: null,
                    isManual: true
                };
                assignedNumbers.push(assignedPayload);

                const flag = getFlag(country);
                const serviceUpper = sName.toUpperCase();
                const initialMsg = await bot.sendMessage(chatId, `🔄 **Allocating requested virtual identity segment locally...**`);
                assignedPayload.messageId = initialMsg.message_id;

                const assignedMsg = `𓆩𓆩.${flag}${serviceUpper}🟢𝚁𝙴𝙲𝙴𝙸𝚅𝙴𝙳 .𓆪𓆪\n` +
                                    `${flag} ᯓ𝙲𝚘𝚞𝚗𝚝𝚛ｙ » ${country}\n` +
                                    `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`${matchedNumData.number}\`\n` +
                                    `⏳ ᯓ𝚂𝚃𝙰𝚃𝚄𝚂 » 𝚆𝚊𝚒𝚝𝚒𝚗𝚐 𝙵𝚘𝚛 𝚂𝙼𝚂...\n` +
                                    `💰 ᯓ𝚁𝙴𝚆𝙰𝚁𝙳 » $${cost.toFixed(4)}`;

                bot.editMessageText(assignedMsg, {
                    chat_id: chatId,
                    message_id: initialMsg.message_id,
                    parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "🗑 Delete", callback_data: `del_${matchedNumData.number}` }]] }
                });
                return;
            }

            // FALLBACK TO NEXA GATEWAY INSTANCE API
            bot.sendMessage(chatId, "⚡ Processing API gateway order payload allocation securely...");
            try {
                const apiRes = await axios.get(`${NEXA_BASE_URL}get_number?api_key=${NEXA_API_KEY}&service=${sName}&country=${country}`).catch(() => null);
                if (apiRes && apiRes.data && apiRes.data.success && apiRes.data.number) {
                    user.balance -= cost;
                    const numData = apiRes.data;
                    const assignedPayload = {
                        number: numData.number,
                        number_id: numData.id,
                        service: sName,
                        country: country,
                        userId: userId,
                        reward: cost,
                        messageId: null,
                        isManual: false
                    };
                    assignedNumbers.push(assignedPayload);

                    const flag = getFlag(country);
                    const serviceUpper = sName.toUpperCase();
                    const initialMsg = await bot.sendMessage(chatId, `🔄 **Allocation verified.** Setting line trackers...`);
                    assignedPayload.messageId = initialMsg.message_id;

                    const assignedMsg = `𓆩𓆩.${flag}${serviceUpper}🟢𝚁𝙴𝙲𝙴𝙸𝚅𝙴𝙳 .𓆪𓆪\n` +
                                        `${flag} ᯓ𝙲𝚘𝚞𝚗𝚝𝚛ｙ » ${country}\n` +
                                        `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`${numData.number}\`\n` +
                                        `⏳ ᯓ𝚂𝚃𝙰𝚃𝚄𝚂 » 𝚆𝚊𝚒𝚝𝚒𝚗𝚐 𝙵𝚘𝚛 𝚂𝙼𝚂...\n` +
                                        `💰 ᯓ𝚁𝙴𝚆𝙰𝚁𝙳 » $${cost.toFixed(4)}`;

                    bot.editMessageText(assignedMsg, {
                        chat_id: chatId,
                        message_id: initialMsg.message_id,
                        parse_mode: "Markdown",
                        reply_markup: { inline_keyboard: [[{ text: "🗑 Delete", callback_data: `del_${numData.number}` }]] }
                    });

                    let checkOTP = setInterval(async () => {
                        try {
                            const otpRes = await axios.get(`${NEXA_BASE_URL}numbers/${numData.number_id}/sms?api_key=${NEXA_API_KEY}`).catch(() => null);
                            if (otpRes && otpRes.data && otpRes.data.success && otpRes.data.otp) {
                                clearInterval(checkOTP);
                                otpTraffic[sName.toLowerCase()] = (otpTraffic[sName.toLowerCase()] || 0) + 1;
                                if (!users[userId]) users[userId] = { balance: 0, username: 'User', isBanned: false };
                                users[userId].balance += cost;

                                if (users[userId].referredBy && users[users[userId].referredBy]) {
                                    const refId = users[userId].referredBy;
                                    const commission = cost * REFERRAL_COMMISSION;
                                    users[refId].balance += commission;
                                    users[refId].earnings = (users[refId].earnings || 0) + commission;
                                    bot.sendMessage(refId, `🎁 **Referral Commission Credit!**\nYou earned $${commission.toFixed(4)} from user \`${userId}\` order.`);
                                }

                                bot.deleteMessage(chatId, numData.messageId).catch(() => {});
                                bot.sendMessage(userId, `🔐 𝙾𝚃𝙿 » ${otpRes.data.otp}\nPlatform validation success recorded! Balance updated.`);

                                const userOtpMsg = `𓆩𓆩.${flag}${serviceUpper}🟢𝚁𝙴𝙲𝙴𝙸𝚅𝙴𝙳 .𓆪𓆪\n` +
                                                   `${flag} ᯓ𝙲𝚘𝚞𝚗𝚝𝚛ｙ » ${country}\n` +
                                                   `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${numData.number}\`\n` +
                                                   `🔐ᯓ𝙾𝚃𝙿 » \`${otpRes.data.otp}\`\n\n` +
                                                   `Your verification code is: ${otpRes.data.otp}. Do not share with anyone.`;
                                bot.sendMessage(userId, userOtpMsg, { parse_mode: "Markdown" });

                                const rawNum = numData.number.toString();
                                let maskedNum = rawNum.length > 8 ? rawNum.substring(0, 4) + "••••" + rawNum.substring(rawNum.length - 4) : "••••" + rawNum.substring(rawNum.length - 2);

                                const groupMsg = `𓆩𓆩.${flag}${serviceUpper}🟢𝚁𝙴𝙲𝙴𝙸𝚅𝙴𝙳 .𓆪𓆪\n` +
                                                 `${flag} ᯓ𝙲𝚘𝚞𝚗𝚝𝚛ｙ » ${country}\n` +
                                                 `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${maskedNum}\`\n` +
                                                 `🔐ᯓ𝙾𝚃𝙿 » \`${otpRes.data.otp}\`\n` +
                                                 `💰 ᯓ𝚁𝙴𝚆𝙰𝚁𝙳 » $${cost.toFixed(4)}`;

                                bot.sendMessage(config.otpUsername, groupMsg, {
                                    parse_mode: "Markdown",
                                    reply_markup: { inline_keyboard: [[{ text: config.otpButtonText, url: config.otpButtonUrl }]] }
                                }).catch(() => {});

                                const idx = assignedNumbers.findIndex(n => n.number === numData.number);
                                if (idx !== -1) assignedNumbers.splice(idx, 1);
                            }
                        } catch (err) { clearInterval(checkOTP); }
                    }, 5000);

                    setTimeout(() => {
                        clearInterval(checkOTP);
                        const idx = assignedNumbers.findIndex(n => n.number === numData.number);
                        if (idx !== -1) {
                            assignedNumbers.splice(idx, 1);
                            bot.sendMessage(userId, `❌ Order expired for segment \`+${numData.number}\`. Core balance returned safe.`);
                            user.balance += cost;
                        }
                    }, 120000);

                } else {
                    bot.sendMessage(chatId, "❌ Nexus server pool reported stock exhaustion or timing latency context error.");
                }
            } catch (err) {
                bot.sendMessage(chatId, "❌ Network operations abstraction cluster failure communicating orders.");
            }
        }
    } catch (e) { console.log(e); }
});

// --- MASSIVE MESSAGE ROUTER LISTENING INTERFACES ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const msgText = msg.text;

    if (!msgText && !msg.document) return;

    if (users[userId]?.isBanned && !isAdmin(userId)) return;

    // --- NEW DYNAMIC TXT FILE OR TEXT /BULK PARSER PIPELINE ---
    if (isAdmin(userId) && msgText && msgText.startsWith('/bulk')) {
        const parts = msgText.split(/\s+/);
        const sName = parts[1];
        const country = parts.slice(2).join(' ');

        if (!sName || !country) {
            return bot.sendMessage(chatId, "❌ **Format error.** Use: `/bulk servicename countryname` (As matching reply parameters configuration).");
        }

        // Check if this command was a reply to a text-document (.txt file attachment verification)
        if (msg.reply_to_message && msg.reply_to_message.document) {
            const doc = msg.reply_to_message.document;
            bot.sendMessage(chatId, "📥 **Processing bulk document data stream directly from attachment file...**");
            
            try {
                const fileUrl = await bot.getFileLink(doc.file_id);
                
                // Fetch file buffer content natively safely without dependencies safely
                https.get(fileUrl, (res) => {
                    let dataBuffer = '';
                    res.on('data', (chunk) => { dataBuffer += chunk; });
                    res.on('end', () => {
                        const lines = dataBuffer.split(/\r?\n/);
                        let countedAdded = 0;

                        lines.forEach(line => {
                            const trimmedLine = line.trim();
                            if (!trimmedLine) return;

                            let parsedNum = "";
                            let parsedId = "";

                            if (trimmedLine.includes(':')) {
                                const segmentParts = trimmedLine.split(':');
                                parsedNum = segmentParts[0].trim();
                                parsedId = segmentParts[1].trim();
                            } else {
                                parsedNum = trimmedLine;
                                parsedId = "m_" + Math.floor(100000 + Math.random() * 900000);
                            }

                            if (parsedNum) {
                                manualNumbers.push({
                                    id: parsedId,
                                    number: parsedNum,
                                    service: sName.toLowerCase(),
                                    country: country.toLowerCase(),
                                    used: false
                                });
                                countedAdded++;
                            }
                        });

                        bot.sendMessage(chatId, `✅ **Added ${countedAdded} numbers for ${sName} (${country}) successfully!**`);
                    });
                }).on('error', (e) => {
                    bot.sendMessage(chatId, "❌ **Error buffering document text segments.** Processing cancelled natively.");
                });
            } catch (err) {
                bot.sendMessage(chatId, "❌ **Failed to extract attachment path stream from Telegram servers.**");
            }
            return;
        }

        // Fallback fallback handling plain active multi-line listening parameters state
        adminActionState[userId] = `bulk_waiting_${sName.toLowerCase()}_${country.toLowerCase()}`;
        return bot.sendMessage(chatId, `🟩 **Mode set for **${sName} (${country})**.**\nNow send the list of numbers (one per line, format: \`number:id\` or text configuration directly):`);
    }

    if (isAdmin(userId) && msgText && msgText.startsWith('/bulkdel')) {
        const parts = msgText.split(/\s+/);
        const sName = parts[1];
        const country = parts.slice(2).join(' ');
        if (!sName || !country) return bot.sendMessage(chatId, "❌ Use: `/bulkdel sName country` to wipe storage tables data.");

        manualNumbers = manualNumbers.filter(n => !(n.service === sName.toLowerCase() && n.country === country.toLowerCase()));
        return bot.sendMessage(chatId, `🧹 Manual data segments tracking tables dropped clean for variant context **${sName}** bound geographically to **${country}**.`);
    }

    // --- NORMAL COMMAND PROCESSORS AS CONFIGURED ---
    if (msgText && msgText.startsWith('/start')) {
        const joined = await checkJoin(userId);
        const parts = msgText.split(' ');
        
        if (parts[1] && parts[1].startsWith('ref_')) {
            const referrerId = parseInt(parts[1].replace('ref_', ''));
            if (!users[userId] && referrerId !== userId) {
                users[userId] = { balance: 0, username: msg.from.username || 'User', referrals: 0, earnings: 0, referredBy: referrerId };
                if (users[referrerId]) {
                    users[referrerId].referrals = (users[referrerId].referrals || 0) + 1;
                    bot.sendMessage(referrerId, `👥 **New Multi-Tier Referral Milestone!** User @${msg.from.username || 'N/A'} registered via your secure channel.`);
                }
            }
        }

        if (!users[userId]) {
            users[userId] = { balance: 0, username: msg.from.username || 'User', referrals: 0, earnings: 0, referredBy: null };
        } else {
            users[userId].username = msg.from.username || 'User';
        }

        if (!joined) return sendJoinMessage(chatId);
        return sendMainMenu(chatId, msg.from.username);
    }

    // LISTENER STATES ROUTERS CORE CAPABILITIES
    if (users[userId] && !users[userId].username) {
        if (msg.from.username) users[userId].username = msg.from.username;
    }

    if (adminActionState[userId]) {
        const action = adminActionState[userId];

        if (action.startsWith('bulk_waiting_')) {
            const meta = action.replace('bulk_waiting_', '').split('_');
            const sName = meta[0];
            const country = meta.slice(1).join('_');

            const lines = msgText.split('\n');
            let counter = 0;
            lines.forEach(line => {
                const clean = line.trim();
                if (!clean) return;
                let num = clean;
                let id = "m_" + Math.floor(100000 + Math.random() * 900000);
                if (clean.includes(':')) {
                    const p = clean.split(':');
                    num = p[0].trim();
                    id = p[1].trim();
                }
                manualNumbers.push({ id: id, number: num, service: sName, country: country, used: false });
                counter++;
            });
            bot.sendMessage(chatId, `✅ **Added ${counter} numbers for ${sName.toUpperCase()} (${country.toUpperCase()}) successfully!**`);
            delete adminActionState[userId];
            return;
        }

        if (action === 'setting_fake_interval') {
            const secs = parseInt(msgText.trim());
            if (!isNaN(secs) && secs > 0) {
                fakeIntervalTime = secs * 1000;
                startFakeOtpLoop();
                bot.sendMessage(chatId, `✅ Fake OTP group delivery system loop set to **${secs} seconds**!`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ Invalid value provided.");
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'adding_fake_service') {
            const parts = msgText.trim().split(/\s+/);
            if (parts.length >= 2) {
                const sName = parts[0].toUpperCase();
                const emojiFlag = parts[1];
                const iconCircle = parts[2] || "🟢";
                fakeServices.push({ name: sName, flag: emojiFlag, icon: iconCircle });
                bot.sendMessage(chatId, `✅ Added fake service: **${sName}** with identifier ${emojiFlag}`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ Invalid format. Use: `ServiceName Flag Emoji` \nExample: `IMO 📱 🟢`", { parse_mode: "Markdown" });
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'adding_fake_country') {
            const parts = msgText.trim().split(/\s+/);
            if (parts.length >= 3) {
                const cName = parts[0];
                const flagEmoji = parts[1];
                const dialCode = parts[2];
                fakeCountries.push({ name: cName, flag: flagEmoji, code: dialCode });
                bot.sendMessage(chatId, `✅ Added fake country config object: **${cName}** (+${dialCode})`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ Invalid format. Use: `CountryName Flag Code` \nExample: `Singapore 🇸🇬 65`", { parse_mode: "Markdown" });
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'setting_number_limit') {
            const lim = parseInt(msgText.trim());
            if (!isNaN(lim) && lim > 0) {
                numberLimit = lim;
                bot.sendMessage(chatId, `✅ Active limit threshold bound per user updated to: **${numberLimit}**`);
            } else {
                bot.sendMessage(chatId, "❌ Prohibited inputs context structure parsed.");
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'adding_new_admin') {
            const target = msgText.trim();
            const u = findUser(target);
            if (u) {
                if (!extraAdmins.includes(Number(u.id))) extraAdmins.push(Number(u.id));
                bot.sendMessage(chatId, `✅ User \`${u.id}\` granted administrative operation override levels context.`);
            } else {
                const numericId = parseInt(target);
                if (!isNaN(numericId)) {
                    if (!extraAdmins.includes(numericId)) extraAdmins.push(numericId);
                    bot.sendMessage(chatId, `✅ Explicit ID raw assignment configured for admin index tracker: \`${numericId}\``);
                } else {
                    bot.sendMessage(chatId, "❌ Matrix user search returned null maps.");
                }
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'removing_admin') {
            const target = msgText.trim();
            const u = findUser(target);
            const idToRem = u ? Number(u.id) : parseInt(target);
            if (!isNaN(idToRem)) {
                extraAdmins = extraAdmins.filter(id => id !== idToRem);
                bot.sendMessage(chatId, `🗑 Admin security profile matching \`${idToRem}\` revoked.`);
            } else {
                bot.sendMessage(chatId, "❌ Security layer execution dropped due to target parsing error.");
            }
            delete adminActionState[userId];
            return;
        }

        if (action.startsWith('editing_editing_set_')) {
            const targetField = action.replace('editing_editing_set_', '');
            const val = msgText.trim();
            if (targetField === 'otp_username') config.otpUsername = val;
            else if (targetField === 'otp_link') config.otpGroup = val;
            else if (targetField === 'update_username') config.updateUsername = val;
            else if (targetField === 'update_link') config.updateGroup = val;
            else if (targetField === 'btn1_name') config.channel1Name = val;
            else if (targetField === 'btn2_name') config.channel2Name = val;
            else if (targetField === 'otp_btn_text') config.otpButtonText = val;
            else if (targetField === 'otp_btn_url') config.otpButtonUrl = val;

            bot.sendMessage(chatId, `⚙️ Parameter mapping updated successfully for key context path: **${targetField.toUpperCase()}**`);
            delete adminActionState[userId];
            return;
        }

        if (action === 'adding_service') {
            const sName = msgText.trim().toLowerCase();
            if (!services[sName]) {
                services[sName] = { countries: [], rates: {} };
                bot.sendMessage(chatId, `✅ Service **${sName}** added.`, { parse_mode: "Markdown" });
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'deleting_service') {
            const sName = msgText.trim().toLowerCase();
            if (services[sName]) {
                delete services[sName];
                bot.sendMessage(chatId, `🗑 Service **${sName}** has been deleted.`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, `❌ Service **${sName}** not found.`);
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'adding_rate') {
            const parts = msgText.split(' ');
            if (parts.length >= 3) {
                const rate = parseFloat(parts.pop());
                const sName = parts[0].toLowerCase();
                const pattern = parts.slice(1).join(' ');
                if (services[sName]) {
                    services[sName].rates[pattern] = rate;
                    if (!services[sName].countries.includes(pattern)) services[sName].countries.push(pattern);
                    bot.sendMessage(chatId, `✅ Rate for **${sName} (Pattern: ${pattern})** set to $${rate.toFixed(4)}`, { parse_mode: "Markdown" });
                } else {
                    bot.sendMessage(chatId, "❌ Service not found. Add service first.");
                }
            } else {
                bot.sendMessage(chatId, "❌ Format text matrix configuration rejected. Use: `service country rate` context.");
            }
            delete adminActionState[userId];
            return;
        }
    }

    if (broadcastState[userId]) {
        delete broadcastState[userId];
        const ids = Object.keys(users);
        let sent = 0;
        bot.sendMessage(chatId, `📢 Broadcast initialization started over user map stack length: ${ids.length}`);
        ids.forEach(id => {
            bot.sendMessage(id, msgText).then(() => { sent++; }).catch(() => {});
        });
        return;
    }

    if (withdrawStates[userId]) {
        const state = withdrawStates[userId];
        if (state.step === 1) {
            state.binanceId = msgText.trim(); state.step = 2;
            bot.sendMessage(chatId, `💰 Enter amount to withdraw:`);
        } else if (state.step === 2) {
            const amt = parseFloat(msgText);
            if (isNaN(amt) || amt < 1.0 || amt > users[userId].balance) return bot.sendMessage(chatId, "❌ Invalid amount.");
            state.amount = amt; state.step = 3;
            bot.sendMessage(chatId, `⚠️ Confirm withdraw $${amt.toFixed(4)}?`, { 
                reply_markup: { inline_keyboard: [[{ text: \"✅ Confirm\", callback_data: \"confirm_withdraw\" }, { text: \"❌ No\", callback_data: \"main_menu\" }]] } 
            });
        }
        return;
    }

    if (transferStates[userId]) {
        const state = transferStates[userId];
        if (state.step === 1) {
            state.targetId = parseInt(msgText.trim()); state.step = 2;
            bot.sendMessage(chatId, `💵 Enter amount to transfer:`);
        } else if (state.step === 2) {
            const amount = parseFloat(msgText.trim());
            if (isNaN(amount) || amount > users[userId].balance) return bot.sendMessage(chatId, "❌ Invalid amount.");
            state.amount = amount; state.step = 3;
            bot.sendMessage(chatId, `⚠️ Confirm transfer $${amount.toFixed(4)} to \\\`${state.targetId}\\\`?`, { 
                reply_markup: { inline_keyboard: [[{ text: \"✅ Confirm\", callback_data: \"confirm_transfer\" }, { text: \"❌ No\", callback_data: \"main_menu\" }]] } 
            });
        }
        return;
    }

    if (isAdmin(userId)) {
        if (msgText === '/admin') return sendAdminPanel(chatId);
        if (msgText && msgText.startsWith('/seeuser')) {
            const parts = msgText.split(' ');
            const target = parts[1];
            if (!target) {
                const ids = Object.keys(users);
                let list = `📊 **Total Users:** ${ids.length}\n\n`;
                ids.forEach((id, i) => {
                    list += `${i+1}. @${users[id].username} | \\\`${id}\\\` | Bal: $${users[id].balance.toFixed(2)} ${users[id].isBanned ? '(BANNED)' : ''}\n`;
                });
                return bot.sendMessage(chatId, list.substring(0, 4000), { parse_mode: "Markdown" });
            }
            const u = findUser(target);
            if (!u) return bot.sendMessage(chatId, "❌ User context tracker not found on active memory segments map.");
            return bot.sendMessage(chatId, `👤 **User Details Map:**\n🆔 ID: \\\`${u.id}\\\`\n👤 User: @${u.username}\n💰 Bal: $${u.balance.toFixed(4)}\n🚫 Banned Status: ${u.isBanned || false}`, { parse_mode: "Markdown" });
        }

        if (msgText && (msgText.startsWith('/baladduser') || msgText.startsWith('/addbaluser'))) {
            const parts = msgText.split(' ');
            const target = parts[1];
            const amount = parseFloat(parts[2]);
            if (!target || isNaN(amount)) return bot.sendMessage(chatId, "❌ Error structure syntax. Use: `/baladduser ID amount` context.");
            const u = findUser(target);
            if (!u) return bot.sendMessage(chatId, "❌ User registry target lookup missed or map allocation invalid.");
            if (!users[u.id]) users[u.id] = { balance: 0, username: u.username, isBanned: false };
            users[u.id].balance += amount;
            bot.sendMessage(u.id, `💰 **Balance Loaded Successfully!**\n\n💵 Amount Added: $${amount.toFixed(4)}\n💎 New Core Balance: $${users[u.id].balance.toFixed(4)}`, { parse_mode: "Markdown" }).catch(() => {});
            return bot.sendMessage(chatId, `✅ Successfully accredited balance stream user asset tracking profiles matching targeting parameters.`);
        }

        if (msgText && msgText.startsWith('/banuser')) {
            const target = msgText.split(' ')[1];
            const u = findUser(target);
            if (!u) return bot.sendMessage(chatId, "❌ Profile locator context mapping failed.");
            if (!users[u.id]) users[u.id] = { balance: 0, username: u.username };
            users[u.id].isBanned = true;
            return bot.sendMessage(chatId, `🚫 User identity mapped index context \`${u.id}\` flagged banned across global active clusters.`);
        }

        if (msgText && msgText.startsWith('/unbanuser')) {
            const target = msgText.split(' ')[1];
            const u = findUser(target);
            if (!u) return bot.sendMessage(chatId, "❌ Cluster registration mapping key failed on target search.");
            if (users[u.id]) users[u.id].isBanned = false;
            return bot.sendMessage(chatId, `✅ Revoked ban states securely for specified context cluster indices.`);
        }

        if (msgText && msgText.startsWith('/addservice')) {
            adminActionState[userId] = 'adding_service';
            return bot.sendMessage(chatId, "📝 Send new **Service Name** profile token identifier (e.g., WhatsApp):");
        }

        if (msgText && msgText.startsWith('/delservice')) {
            adminActionState[userId] = 'deleting_service';
            return bot.sendMessage(chatId, "🗑 Send the target context **Service Name** to safely drop from core database maps:");
        }

        if (msgText && msgText.startsWith('/addrate')) {
            adminActionState[userId] = 'adding_rate';
            return bot.sendMessage(chatId, "➕ Send configuration format values to load custom rate configurations: \n`[Service-Name] [Country-Zone-Pattern] [Cost-Numeric-Float-Value]`\n\nExample: `WhatsApp USA/Canada 0.65`", { parse_mode: "Markdown" });
        }
    }
});
