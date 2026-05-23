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
let manualNumbers = []; // Storage for bulk numbers
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
    channel2Name: "📢 Join Channel 2",
    manualOtpGroup: "https://t.me/nhotpnumber" // New manual group link configuration
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
            const randomDigits2 = Math.floor(1000 + Math.random() * 9000); // 4 Digits for matching simulation
            const maskedNum = `${randCountry.code}${randomDigits1}••••${randomDigits2}`;
            const fakeReward = (0.0020 + Math.random() * 0.0080).toFixed(4);

            otpTraffic[randService.name.toLowerCase()] = (otpTraffic[randService.name.toLowerCase()] || 0) + 1;

            const fakeGroupMsg = `𓆩𓆩.${randCountry.flag}${randService.name}${randService.icon}𝚁𝙴𝙲𝙴𝙸𝚅𝙴𝙳 .𓆪𓆪\n` +
                                 `${randCountry.flag} ᯓ𝙲𝚘𝚞𝚗тку » ${randCountry.name}\n` +
                                 `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${maskedNum}\`\n` +
                                 `🔐ᯓ𝙾𝚃🔑 » \`${randomOtp}\`\n` +
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
    let trafficText = "📊 **𝗧𝗥𝗔𝗙𝗙𝗜𝗖 𝗦𝗘𝗥𝗩𝗘𝗥 𝗨𝗣ডাউন**\n\n";
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
    if(!pattern) return "Unknown Country";
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
        "592": "Guyana", "502": "Guatemala", "509": "Haiti", "504": "Honduras", "852": "Hong Kong", "36": "Hungary",
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
    
    // Check text name directly
    for (const key in patternMap) {
        if (patternMap[key].toLowerCase() === cleanPattern.toLowerCase()) {
            return patternMap[key];
        }
    }

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
        "el salvador": "🇸𝑽", "estonia": "🇪🇪", "ethiopia": "🇪🇹", "fiji": "🇫🇯",
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
        "qatar": "🇶🇦", "romania": "🇷🇴", "russia": "🇷🇺", "rwanda": "🇷🇼",
        "saudi arabia": "🇸🇦", "senegal": "🇸🇳", "serbia": "🇷🇸", "singapore": "🇸🇬",
        "slovakia": "🇸🇰", "slovenia": "🇸🇮", "somalia": "🇸🇴", "south africa": "🇿🇦",
        "south korea": "🇰🇷", "spain": "🇪🇸", "sri lanka": "🇱🇰", "sudan": "🇸🇩",
        "sweden": "🇸🇪", "switzerland": "🇨🇭", "syria": "🇸🇾", "taiwan": "🇹🇼",
        "tajikistan": "🇹🇯", "tanzania": "🇹🇿", "thailand": "🇹🇭", "togo": "🇹🇬",
        "tunisia": "🇹🇳", "turkey": "🇹🇷", "uganda": "🇺🇬", "ukraine": "🇺🇦",
        "united arab emirates": "🇦🇪", "united kingdom": "🇬🇧", "united states": "🇺🇸",
        "uruguay": "🇺🇾", "uzbekistan": "🇺🇿", "venezuela": "🇻🇪", "vietnam": "🇻🇳",
        "yemen": "🇾🇪", "zambia": "🇿🇲", "zimbabwe": "🇿🇼",
        "usa/canada": "🇺🇸", "uk": "🇬🇧", "uae": "🇦🇪", "hong kong": "🇭🇰", "dr congo": "🇨🇩", "russia/kazakhstan": "🇷🇺"
    };
    return flags[countryName.toLowerCase()] || "🌎";
};

// --- UI ---
const sendJoinMessage = (chatId) => {
    const msg = `🚫 **Access Denied!**\n\n⚠️ **You are NOT Verified.**\nYou must join our channels to access this bot.\n\n👇 **Join below then click 'I Have Joined':**`;
    bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: config.channel1Name, url: config.updateGroup }],
                [{ text: config.channel2Name, url: config.otpGroup }],
                [{ text: "✅ I Have Joined", callback_data: "check_join" }]
            ]
        }
    });
};

const sendMainMenu = (chatId, username) => {
    if (users[chatId]?.isBanned) {
        return bot.sendMessage(chatId, "🚫 **You are banned from using this bot.**");
    }
    
    const welcomeMsg = `👋 **Hello @${username || 'User'}!**\n\n` +
                       `🚀 **Welcome to NH NUMBER BOT 🔥⚡ Bot**\n` +
                       `━━━━━━━━━━━━━━━━━━\n` +
                       `💰 **Balance:** $${(users[chatId]?.balance || 0).toFixed(4)}\n` +
                       `📱 **Total Active:** ${assignedNumbers.filter(n => n.userId === chatId).length}\n` +
                       `━━━━━━━━━━━━━━━━━━\n` +
                       `💡 **Click the button below to get a number and start earning!**`;

    bot.sendMessage(chatId, welcomeMsg, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "💰 Balance", callback_data: "menu_balance" }],
                [{ text: "📱 Active Number", callback_data: "menu_active" }, { text: "💸 Withdraw", callback_data: "menu_withdraw" }],
                [{ text: "📊 𝗧𝗥𝗔𝗙𝗙𝗜𝗖 𝗦𝗘𝗥𝗩𝗘𝗥", callback_data: "menu_traffic" }],
                [{ text: "🤝 Referral", callback_data: "menu_referral" }, { text: "🤖 Bot Update Channel", url: config.updateGroup }]
            ]
        }
    });
};

const sendAdminPanel = (chatId) => {
    bot.sendMessage(chatId, "🛠 **Admin Control Panel**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 View Users", callback_data: "admin_view_users" }, { text: "📢 Broadcast", callback_data: "admin_broadcast" }],
                [{ text: "➕ Add Service", callback_data: "admin_add_service" }, { text: "🗑 Delete Service", callback_data: "admin_del_service" }],
                [{ text: "💰 Add Rate", callback_data: "admin_add_rate" }, { text: "🗑 Delete Range", callback_data: "admin_del_num" }],
                [{ text: "🔗 Bulk Add (Set Link)", callback_data: "admin_bulk_add" }],
                [{ text: "🔗 Bulk Add With OTP Link", callback_data: "admin_bulk_otp_link" }],
                [{ text: "🔗 Set Manual OTP Link", callback_data: "admin_set_manual_link" }],
                [{ text: "📊 Check Nexa Range", callback_data: "admin_check_range" }],
                [{ text: "👤 Edit Admin", callback_data: "admin_edit_manager" }], 
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

// --- AUTOMATIC GROUP CHAT OTP LISTENER ---
bot.on('message', async (groupMsg) => {
    if (!groupMsg.text) return;
    
    const isOtpGroup = groupMsg.chat.username === config.otpUsername.replace('@', '') || groupMsg.chat.id.toString() === config.otpUsername;
    if (!isOtpGroup) return;

    const text = groupMsg.text;
    
    let incomingOtp = "";
    let otpMatch = text.match(/(?:𝙾𝚃🔑|𝙾𝚃package)\s*»\s*`?(\d+)/i);
    if (otpMatch) incomingOtp = otpMatch[1];

    if (!incomingOtp) return; 

    assignedNumbers.forEach(async (numData) => {
        const rawNumStr = numData.number.toString();
        
        // --- FEATURE: LAST 4 DIGIT MATCH & DYNAMIC LOGIC ---
        const targetLast4 = rawNumStr.slice(-4);

        if (text.includes(targetLast4)) {
            const userId = numData.userId;

            bot.deleteMessage(userId, numData.messageId).catch(() => {});

            if (!users[userId]) users[userId] = { balance: 0, username: 'User', isBanned: false };
            users[userId].balance += numData.reward;

            if (users[userId].referredBy && users[users[userId].referredBy]) {
                const refId = users[userId].referredBy;
                const commission = numData.reward * REFERRAL_COMMISSION;
                users[refId].balance += commission;
                users[refId].earnings += commission;
                bot.sendMessage(refId, `🎁 **Referral Bonus!**\nYou earned $${commission.toFixed(4)} from your referral's OTP!`).catch(() => {});
            }

            const successMsg = `╔═════════════════╗\n` +
                               `║ ${numData.flag} ${numData.service.toUpperCase()} + $${numData.reward.toFixed(4)} ║\n` +
                               `╚═════════════════╝\n` +
                               `   ————— YOUR OTP————\n` +
                               `                 🔑= \`${incomingOtp}\``;

            bot.sendMessage(userId, successMsg, { parse_mode: "Markdown" });

            assignedNumbers = assignedNumbers.filter(n => n.number !== numData.number);
        }
    });
});

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
                if (!users[userId]) users[userId] = { balance: 0, username: query.from.username || 'User', isBanned: false, referrals: 0, earnings: 0, referredBy: null };
                await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
                return sendMainMenu(chatId, query.from.username);
            } else {
                return bot.answerCallbackQuery(query.id, { text: "❌ Join both channels first!", show_alert: true });
            }
        }

        const isJoined = await checkJoin(userId);
        if (!isJoined && !isAdmin(userId)) {
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            return sendJoinMessage(chatId);
        }

        if (data === "main_menu" || data === "cancel_transfer") {
            delete transferStates[userId];
            delete withdrawStates[userId];
            delete broadcastState[userId];
            delete groupSettingState[userId];
            delete adminActionState[userId];
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendMainMenu(chatId, query.from.username);
        }
        else if (data === "admin_bulk_add" || data === "admin_bulk_otp_link") {
            if (!isAdmin(userId)) return;
            bot.sendMessage(chatId, "📦 **Bulk Add Numbers with Custom OTP Link**\nFormat: Send `/bulkotplink servicename countryname perotprate otpgrouplink` and upload your file.");
        }
        else if (data === "admin_set_manual_link") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'setting_manual_otp_link';
            bot.sendMessage(chatId, "🔗 **Set Global Manual OTP Group Link**\nManual নম্বরের নিচে থাকা OTP Group বাটনের জন্য নতুন লিঙ্কটি পাঠান:");
        }
        else if (data === "admin_fake_settings") {
            if (!isAdmin(userId)) return;
            let currentSrv = fakeServices.map(s => s.name).join(', ') || "None";
            let currentCnt = fakeCountries.map(c => c.name).join(', ') || "None";
            
            let msg = `⚙️ **Fake OTP Configurations**\n\n` +
                      `⏱ **Current Interval:** ${fakeIntervalTime / 1000} seconds\n` +
                      `📦 **Active Fake Services:** \`${currentSrv}\`\n` +
                      `🌍 **Active Fake Countries:** \`${currentCnt}\`\n\n` +
                      `Select action below:`;
                      
            bot.editMessageText(msg, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "⏱ Set Interval (Seconds)", callback_data: "fake_set_interval" }],
                        [{ text: "➕ Add Fake Service", callback_data: "fake_add_service" }, { text: "🗑 Clear Fake Services", callback_data: "fake_clear_services" }],
                        [{ text: "➕ Add Fake Country", callback_data: "fake_add_country" }, { text: "🗑 Clear Fake Countries", callback_data: "fake_clear_countries" }],
                        [{ text: "🔙 Back", callback_data: "admin_panel" }]
                    ]
                }
            });
        }
        else if (data === "fake_set_interval") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'setting_fake_interval';
            bot.sendMessage(chatId, "⏱ Enter interval time in **seconds** (e.g., 30):");
        }
        else if (data === "fake_add_service") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'adding_fake_service';
            bot.sendMessage(chatId, "➕ Send fake service data format: `ServiceName Flag Emoji` \nExample: `IMO 📱 🟢`", { parse_mode: "Markdown" });
        }
        else if (data === "fake_clear_services") {
            if (!isAdmin(userId)) return;
            fakeServices = [];
            bot.sendMessage(chatId, "✅ Fake service inventory cleared!");
        }
        else if (data === "fake_add_country") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'adding_fake_country';
            bot.sendMessage(chatId, "➕ Send fake country data format: `CountryName Flag Code` \nExample: `Singapore 🇸🇬 65`", { parse_mode: "Markdown" });
        }
        else if (data === "fake_clear_countries") {
            if (!isAdmin(userId)) return;
            fakeCountries = [];
            bot.sendMessage(chatId, "✅ Fake country inventory cleared!");
        }
        else if (data === "menu_traffic") {
            const serviceKeys = Object.keys(services);
            if (serviceKeys.length === 0) return bot.sendMessage(chatId, "❌ No services available.");
            
            let buttons = serviceKeys.map(s => [{ text: s, callback_data: `view_traffic_${s}` }]);
            buttons.push([{ text: "🔙 Back", callback_data: "main_menu" }]);
            
            bot.editMessageText("📊 **Kon service er traffic dekte chaiben?**", {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: buttons }
            });
        }
        else if (data.startsWith("view_traffic_")) {
            const sName = data.split("_")[2];
            const count = otpTraffic[sName] || 0;
            bot.editMessageText(`📊 **Traffic for ${sName.toUpperCase()}**\n\n🔥 Total OTPs received: **${count}**\n\n_Note: Group update post every 10 minutes._`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_traffic" }]] }
            });
        }
        else if (data === "menu_referral") {
            const user = users[userId];
            const botInfo = await bot.getMe();
            const refLink = `https://t.me/${botInfo.username}?start=ref_${userId}`;
            
            let refMsg = `╔════════════════════╗\n` +
                         `  🤝 *Referral Program*\n\n` +
                         `  Share your link and earn **${(REFERRAL_COMMISSION * 100).toFixed(1)}%** of\n` +
                         `  every OTP reward your referrals earn! ||\n\n` +
                         `  🔗 \`${refLink}\` ||\n\n` +
                         `  👥 Referrals: ${user.referrals || 0}\n` +
                         `  💰 Total Earned: \`$${(user.earnings || 0).toFixed(4)}\`\n\n` +
                         `  📌 Referred by: ${user.referredBy || "None"}\n\n` +
                         `  📋 Your Referrals:\n` +
                         `  ${user.referrals > 0 ? "Check your stats above" : "No referrals yet"}\n` +
                         `╚════════════════════╝`;

            bot.editMessageText(refMsg, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]]
                }
            });
        }
        else if (data === "admin_number_limit") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'setting_number_limit';
            bot.sendMessage(chatId, `🔢 Current Number Limit: **${numberLimit}**\n\nPlease send the new limit (e.g., 3):`, { parse_mode: "Markdown" });
        }
        else if (data === "admin_edit_manager") {
            if (userId !== ADMIN_ID) return;
            bot.editMessageText("👤 **Admin Management**\nChoose an action:", {
                chat_id: chatId, message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "➕ Add Admin", callback_data: "admin_add_new" }, { text: "➖ Remove Admin", callback_data: "admin_remove_old" }],
                        [{ text: "🔙 Back", callback_data: "admin_panel" }]
                    ]
                }
            });
        }
        else if (data === "admin_add_new") {
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'adding_new_admin';
            bot.sendMessage(chatId, "👤 Send the **User ID** or **Username** to add as Admin:");
        }
        else if (data === "admin_remove_old") {
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'removing_admin';
            bot.sendMessage(chatId, "👤 Send the **User ID** or **Username** to remove from Admin:");
        }
        else if (data === "admin_check_range") {
            if (!isAdmin(userId)) return;
            try {
                const res = await axios.get(`${NEXA_BASE_URL}getServices?api_key=${NEXA_API_KEY}`);
                let msg = "📊 **Nexa Service Inventory:**\n\n";
                const servicesData = res.data; 
                Object.keys(servicesData).slice(0, 20).forEach(s => {
                    msg += `• **${s}**: ${servicesData[s].count || 0} numbers\n`;
                });
                bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            } catch (e) {
                bot.sendMessage(chatId, "❌ Nexa API-te range check kora sombhob hoyni.");
            }
        }
        else if (data === "admin_del_num") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'deleting_range';
            bot.sendMessage(chatId, "🗑 Please send: `ServiceName RangePattern` \nExample: `telegram 992`", { parse_mode: "Markdown" });
        }
        else if (data === "admin_add_service") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'adding_service';
            bot.sendMessage(chatId, "➕ Please send the **Name** of the service (e.g., Telegram):");
        }
        else if (data === "admin_del_service") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'deleting_service';
            bot.sendMessage(chatId, "🗑 Please send the **Name** of the service you want to delete:");
        }
        else if (data === "admin_add_rate") {
            if (!isAdmin(userId)) return;
            adminActionState[userId] = 'adding_rate';
            bot.sendMessage(chatId, "💰 Please send: `ServiceName RangePattern Rate` \nExample: `fb 2376211XXX 0.05`", { parse_mode: "Markdown" });
        }
        else if (data === "admin_otp_btn_settings") {
            if (!isAdmin(userId)) return;
            bot.editMessageText(`🔘 **OTP Button Settings**\n\n1. Text: ${config.otpButtonText}\n2. Link: ${config.otpButtonUrl}\n\nSelect what to update:`, {
                chat_id: chatId, message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Update Button Text", callback_data: "set_otp_btn_text" }],
                        [{ text: "Update Button Link", callback_data: "set_otp_btn_link" }],
                        [{ text: "🔙 Back", callback_data: "admin_panel" }]
                    ]
                }
            }).catch(() => {}); 
        }
        else if (data === "set_otp_btn_text" || data === "set_otp_btn_link") {
            if (!isAdmin(userId)) return;
            groupSettingState[userId] = data;
            bot.sendMessage(chatId, `Please send the new value for: ${data.replace('set_', '').replace(/_/g, ' ').toUpperCase()}`);
        }
        else if (data === "admin_view_users") {
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
            bot.editMessageText(`⚙️ **Group Settings (Force Join)**\n\n1. OTP Group: ${config.otpUsername} (${config.otpGroup})\n   Btn Name: ${config.channel2Name}\n2. Update Group: ${config.updateUsername} (${config.updateGroup})\n   Btn Name: ${config.channel1Name}\n\nSelect what to update:`, {
                chat_id: chatId, message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Update OTP Group Link", callback_data: "set_otp_link" }, { text: "Update OTP Btn Name", callback_data: "set_otp_btn_name" }],
                        [{ text: "Update Update Group Link", callback_data: "set_update_link" }, { text: "Update Update Btn Name", callback_data: "set_update_btn_name" }],
                        [{ text: "Update OTP Username", callback_data: "set_otp_user" }, { text: "Update Update Username", callback_data: "set_update_user" }],
                        [{ text: "🔙 Back", callback_data: "admin_panel" }]
                    ]
                }
            }).catch(() => {});
        } else if (data === "admin_panel") {
            if (!isAdmin(userId)) return;
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendAdminPanel(chatId);
        } else if (["set_otp_link", "set_update_link", "set_otp_user", "set_update_user", "set_otp_btn_name", "set_update_btn_name"].includes(data)) {
            if (!isAdmin(userId)) return;
            groupSettingState[userId] = data;
            bot.sendMessage(chatId, `Please send the new value for: ${data.replace('set_', '').replace(/_/g, ' ').toUpperCase()}`);
        } else if (data === "menu_balance") {
            const user = users[userId] || { balance: 0 };
            let msg = `💰 **Your Balance:** $${user.balance.toFixed(4)}\n\n`;
            msg += `💡 **Earning Rates:**\n`;
            Object.keys(services).forEach(s => {
                const rate = Object.values(services[s].rates)[0] || 0.0030;
                msg += `• ${s}: $${rate.toFixed(4)}\n`;
            });
            msg += `\n💳 **Minimum Withdrawal:** $1.0000`;
            bot.editMessageText(msg, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "💸 Transfer Balance", callback_data: "transfer_bal" }, { text: "🔙 Back to Menu", callback_data: "main_menu" }]
                    ]
                }
            });
        } else if (data === "menu_withdraw") {
            if (!isWithdrawActive) {
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const today = days[new Date().getDay()];
                let msg = `📅 **Withdrawal Not Available Today**\n🗓 **Today:** ${today}\n✅ **Withdrawal Day:** Tuesday (12:00 AM - 12:00 PM)\n🎬 **Withdraw Process:** [Watch Video](https://t.me/SureSmsOfficial)\n\n💡 You can only request withdrawals on Tuesday between 12am and 12pm`;
                bot.editMessageText(msg, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown", disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
                });
            } else {
                const user = users[userId] || { balance: 0 };
                bot.editMessageText(`💰 **Your Balance:** $${user.balance.toFixed(4)}\n📉 **Minimum:** $1.0000\n\nEnter your Binance Pay ID for verification:`, {
                    chat_id: chatId, message_id: query.message.message_id,
                    reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] }
                });
                withdrawStates[userId] = { step: 1 };
            }
        } else if (data === "transfer_bal") {
            bot.editMessageText(`💸 **Balance Transfer System**\n\nEnter the Target Telegram User ID:`, {
                chat_id: chatId, message_id: query.message.message_id,
                reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel_transfer" }]] }
            });
            transferStates[userId] = { step: 1 };
        } else if (data === "confirm_transfer") {
            const state = transferStates[userId];
            if (!state || state.step !== 3) return;
            const tId = state.targetId;
            const amt = state.amount;
            if (users[userId].balance < amt) return bot.sendMessage(chatId, "❌ Insufficient balance.");
            users[userId].balance -= amt;
            if (!users[tId]) users[tId] = { balance: 0, username: 'User', isBanned: false };
            users[tId].balance += amt;
            bot.sendMessage(chatId, `✅ Successfully transferred $${amt.toFixed(4)} to \`${tId}\``, { parse_mode: "Markdown" });
            bot.sendMessage(tId, `💰 Received $${amt.toFixed(4)} from \`${userId}\`!`, { parse_mode: "Markdown" });
            delete transferStates[userId];
        } else if (data === "confirm_withdraw") {
            const state = withdrawStates[userId];
            if (!state || state.step !== 3) return;
            const amt = state.amount;
            if (users[userId].balance < amt) return bot.sendMessage(chatId, "❌ Insufficient balance.");
            users[userId].balance -= amt;
            bot.sendMessage(chatId, `✅ Withdrawal request for $${amt.toFixed(4)} sent successfully!`);
            bot.sendMessage(ADMIN_ID, `🔔 **Withdraw Request!**\nUser: \`${userId}\`\nBinance ID: \`${state.binanceId}\`\nAmount: $${amt.toFixed(4)}`, { parse_mode: "Markdown" });
            delete withdrawStates[userId];
        } else if (data === "menu_active") {
            const active = assignedNumbers.filter(n => n.userId === chatId);
            if (active.length === 0) {
                bot.editMessageText("📱 **No active numbers.**", {
                    chat_id: chatId, message_id: query.message.message_id,
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "main_menu" }]] }
                });
            } else {
                let msg = "📱 **Your Active Numbers:**\n\n";
                let buttons = active.map((n, i) => {
                    msg += `${i+1}. ${n.flag} ${n.service.toUpperCase()}: \`+${n.number}\` ($${n.reward.toFixed(4)})\n`;
                    return [{ text: "Change Number 🔁", callback_data: `change_num_${n.number}` }];
                });
                buttons.push([{ text: "🔙 Back", callback_data: "main_menu" }]);

                bot.editMessageText(msg, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: buttons }
                });
            }
        } 
        // --- FEATURE UPGRADE: CHANGE NUMBER STATE AND RE-POOLING ---
        else if (data.startsWith("change_num_")) {
            const oldNum = data.split("_")[2];
            const numIndex = assignedNumbers.findIndex(n => n.number.toString() === oldNum && n.userId === chatId);
            
            if (numIndex === -1) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Number not found or expired!", show_alert: true });
            }

            const currentNumData = assignedNumbers[numIndex];
            const sName = currentNumData.service;

            // ১. আগের নম্বরটি ডিলিট না করে রিলিজ করা হলো (অন্য যেকোনো ইউজার এটি পুনরায় নিতে পারবে)
            assignedNumbers.splice(numIndex, 1);

            // ২. সরাসরি আরেকটি নতুন নম্বর অ্যাসাইন করে দেওয়ার লজিক
            const matchedManual = manualNumbers.find(m => m.service.toLowerCase() === sName.toLowerCase() && !assignedNumbers.some(a => a.number === m.number));
            if (matchedManual) {
                const flag = getFlag(getCountryByPattern(matchedManual.number.toString()));
                try {
                    await bot.editMessageText(`📌 **Service:** ${sName.toUpperCase()}\n☎️ **Number:** \`+${matchedManual.number}\`\n\n⏱ Waiting for OTP...`, {
                        chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                        reply_markup: { inline_keyboard: [
                            [{ text: "Group Link", url: matchedManual.otpLink || config.manualOtpGroup }],
                            [{ text: "Change Number 🔁", callback_data: `change_num_${matchedManual.number}` }]
                        ] }
                    });
                    assignedNumbers.push({
                        userId: chatId, number: matchedManual.number, service: sName, reward: matchedManual.rate, flag: flag, messageId: query.message.message_id, isManual: true, otpLink: matchedManual.otpLink
                    });
                } catch (e) {
                    const sentMsg = await bot.sendMessage(chatId, `📌 **Service:** ${sName.toUpperCase()}\n☎️ **Number:** \`+${matchedManual.number}\`\n\n⏱ Waiting for OTP...`, {
                        parse_mode: "Markdown",
                        reply_markup: { inline_keyboard: [
                            [{ text: "Group Link", url: matchedManual.otpLink || config.manualOtpGroup }],
                            [{ text: "Change Number 🔁", callback_data: `change_num_${matchedManual.number}` }]
                        ] }
                    });
                    assignedNumbers.push({
                        userId: chatId, number: matchedManual.number, service: sName, reward: matchedManual.rate, flag: flag, messageId: sentMsg.message_id, isManual: true, otpLink: matchedManual.otpLink
                    });
                }
            } else {
                // Nexa API Fallback
                try {
                    const res = await axios.get(`${NEXA_BASE_URL}getNumber?api_key=${NEXA_API_KEY}&service=${sName}`);
                    if (res.data && res.data.number) {
                        const num = res.data.number;
                        const ratesObj = services[sName]?.rates || {};
                        let matchRate = 0.0030;
                        for (const pattern in ratesObj) {
                            if (num.toString().startsWith(pattern)) { matchRate = ratesObj[pattern]; break; }
                        }
                        const flag = getFlag(getCountryByPattern(num.toString()));
                        try {
                            await bot.editMessageText(`📌 **Service:** ${sName.toUpperCase()}\n☎️ **Number:** \`+${num}\`\n\n⏱ Waiting for OTP...`, {
                                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                                reply_markup: { inline_keyboard: [
                                    [{ text: "NH OTP Channel", url: config.otpGroup }],
                                    [{ text: "Change Number 🔁", callback_data: `change_num_${num}` }]
                                ] }
                            });
                            assignedNumbers.push({
                                userId: chatId, number: num, service: sName, reward: matchRate, flag: flag, messageId: query.message.message_id, isManual: false
                            });
                        } catch (e) {
                            const sentMsg = await bot.sendMessage(chatId, `📌 **Service:** ${sName.toUpperCase()}\n☎️ **Number:** \`+${num}\`\n\n⏱ Waiting for OTP...`, {
                                parse_mode: "Markdown",
                                reply_markup: { inline_keyboard: [
                                    [{ text: "NH OTP Channel", url: config.otpGroup }],
                                    [{ text: "Change Number 🔁", callback_data: `change_num_${num}` }]
                                ] }
                            });
                            assignedNumbers.push({
                                userId: chatId, number: num, service: sName, reward: matchRate, flag: flag, messageId: sentMsg.message_id, isManual: false
                            });
                        }
                    } else {
                        bot.sendMessage(chatId, "❌ No numbers available for this service right now.");
                    }
                } catch (e) {
                    bot.sendMessage(chatId, "❌ Service currently out of stock.");
                }
            }
        }
        else if (data === "menu_get_number") {
            const activeCount = assignedNumbers.filter(n => n.userId === chatId).length;
            if (activeCount >= numberLimit) {
                return bot.sendMessage(chatId, `❌ **Limit Exceeded!**\nYou can only have ${numberLimit} active number at a time.`);
            }

            const serviceKeys = Object.keys(services);
            if (serviceKeys.length === 0) return bot.sendMessage(chatId, "❌ No services configured yet.");
            let buttons = serviceKeys.map(s => [{ text: `${s.toUpperCase()}`, callback_data: `get_srv_${s}` }]);
            buttons.push([{ text: "🔙 Back", callback_data: "main_menu" }]);
            bot.editMessageText("👇 **Select a service to get number:**", {
                chat_id: chatId, message_id: query.message.message_id,
                reply_markup: { inline_keyboard: buttons }
            });
        } else if (data.startsWith("get_srv_")) {
            const sName = data.split("_")[2];
            const activeCount = assignedNumbers.filter(n => n.userId === chatId).length;
            if (activeCount >= numberLimit) return bot.sendMessage(chatId, `❌ Limit reached! Max limit: ${numberLimit}`);

            // Logic to fetch number
            const matchedManual = manualNumbers.find(m => m.service.toLowerCase() === sName.toLowerCase() && !assignedNumbers.some(a => a.number === m.number));
            if (matchedManual) {
                // Manual Number Assign
                const flag = getFlag(getCountryByPattern(matchedManual.number.toString()));
                const sentMsg = await bot.sendMessage(chatId, `📌 **Service:** ${sName.toUpperCase()}\n☎️ **Number:** \`+${matchedManual.number}\`\n\n⏱ Waiting for OTP...`, {
                    parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [
                        [{ text: "Group Link", url: matchedManual.otpLink || config.manualOtpGroup }],
                        [{ text: "Change Number 🔁", callback_data: `change_num_${matchedManual.number}` }]
                    ] }
                });
                assignedNumbers.push({
                    userId: chatId, number: matchedManual.number, service: sName, reward: matchedManual.rate, flag: flag, messageId: sentMsg.message_id, isManual: true, otpLink: matchedManual.otpLink
                });
            } else {
                // Nexa API Fallback
                try {
                    const res = await axios.get(`${NEXA_BASE_URL}getNumber?api_key=${NEXA_API_KEY}&service=${sName}`);
                    if (res.data && res.data.number) {
                        const num = res.data.number;
                        const ratesObj = services[sName]?.rates || {};
                        let matchRate = 0.0030;
                        for (const pattern in ratesObj) {
                            if (num.toString().startsWith(pattern)) { matchRate = ratesObj[pattern]; break; }
                        }
                        const flag = getFlag(getCountryByPattern(num.toString()));
                        const sentMsg = await bot.sendMessage(chatId, `📌 **Service:** ${sName.toUpperCase()}\n☎️ **Number:** \`+${num}\`\n\n⏱ Waiting for OTP...`, {
                            parse_mode: "Markdown",
                            reply_markup: { inline_keyboard: [
                                [{ text: "NH OTP Channel", url: config.otpGroup }],
                                [{ text: "Change Number 🔁", callback_data: `change_num_${num}` }]
                            ] }
                        });
                        assignedNumbers.push({
                            userId: chatId, number: num, service: sName, reward: matchRate, flag: flag, messageId: sentMsg.message_id, isManual: false
                        });
                    } else {
                        bot.sendMessage(chatId, "❌ No numbers available for this service.");
                    }
                } catch (e) {
                    bot.sendMessage(chatId, "❌ Service currently out of stock.");
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
});

// --- TEXT HANDLING ---
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const msgText = msg.text;

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
                reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_withdraw" }, { text: "❌ No", callback_data: "main_menu" }]] } 
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
            bot.sendMessage(chatId, `⚠️ Confirm transfer $${amount.toFixed(4)} to \`${state.targetId}\`?`, { 
                reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_transfer" }, { text: "❌ No", callback_data: "main_menu" }]] } 
            });
        }
        return;
    }

    if (broadcastState[userId] && isAdmin(userId)) {
        delete broadcastState[userId];
        const ids = Object.keys(users);
        bot.sendMessage(chatId, `📢 Broadcasting to ${ids.length} users...`);
        ids.forEach(id => {
            bot.sendMessage(id, msgText).catch(() => {});
        });
        return;
    }

    if (groupSettingState[userId] && isAdmin(userId)) {
        const field = groupSettingState[userId];
        delete groupSettingState[userId];
        
        if (field === 'set_otp_link') config.otpGroup = msgText;
        if (field === 'set_update_link') config.updateGroup = msgText;
        if (field === 'set_otp_user') config.otpUsername = msgText;
        if (field === 'set_update_user') config.updateUsername = msgText;
        if (field === 'set_otp_btn_name') config.channel2Name = msgText;
        if (field === 'set_update_btn_name') config.channel1Name = msgText;
        if (field === 'set_otp_btn_text') config.otpButtonText = msgText;
        if (field === 'set_otp_btn_link') config.otpButtonUrl = msgText;

        return bot.sendMessage(chatId, "✅ Settings updated successfully!");
    }

    if (adminActionState[userId] && isAdmin(userId)) {
        const action = adminActionState[userId];
        delete adminActionState[userId];

        if (action === 'setting_manual_otp_link') {
            config.manualOtpGroup = msgText.trim();
            return bot.sendMessage(chatId, `✅ Global Manual OTP Group link set to: \`${config.manualOtpGroup}\``, { parse_mode: "Markdown" });
        }
        if (action === 'setting_fake_interval') {
            const secs = parseInt(msgText.trim());
            if (isNaN(secs)) return bot.sendMessage(chatId, "❌ Invalid seconds value.");
            fakeIntervalTime = secs * 1000;
            startFakeOtpLoop();
            return bot.sendMessage(chatId, `✅ Fake OTP interval updated to **${secs}** seconds.`, { parse_mode: "Markdown" });
        }
        if (action === 'adding_fake_service') {
            const parts = msgText.split(' ');
            const name = parts[0];
            const icon = parts[1] || "📱";
            if (!name) return bot.sendMessage(chatId, "❌ Missing service name.");
            fakeServices.push({ name, icon });
            return bot.sendMessage(chatId, `✅ Fake service \`${name}\` added.`, { parse_mode: "Markdown" });
        }
        if (action === 'adding_fake_country') {
            const parts = msgText.split(' ');
            const name = parts[0];
            const flag = parts[1] || "🌎";
            const code = parts[2] || "1";
            if (!name) return bot.sendMessage(chatId, "❌ Missing country name.");
            fakeCountries.push({ name, flag, code });
            return bot.sendMessage(chatId, `✅ Fake country \`${name}\` added.`, { parse_mode: "Markdown" });
        }
        if (action === 'setting_number_limit') {
            const lim = parseInt(msgText.trim());
            if (isNaN(lim)) return bot.sendMessage(chatId, "❌ Invalid number limit.");
            numberLimit = lim;
            return bot.sendMessage(chatId, `✅ Maximum number limit set to **${numberLimit}**`, { parse_mode: "Markdown" });
        }
        if (action === 'adding_new_admin') {
            const target = findUser(msgText.trim());
            const id = target ? Number(target.id) : Number(msgText.trim());
            if (isNaN(id)) return bot.sendMessage(chatId, "❌ Invalid ID.");
            if (!extraAdmins.includes(id)) extraAdmins.push(id);
            return bot.sendMessage(chatId, `✅ User \`${id}\` added to Manager list!`, { parse_mode: "Markdown" });
        }
        if (action === 'removing_admin') {
            const target = findUser(msgText.trim());
            const id = target ? Number(target.id) : Number(msgText.trim());
            extraAdmins = extraAdmins.filter(a => a !== id);
            return bot.sendMessage(chatId, `✅ User \`${id}\` removed from Manager list!`, { parse_mode: "Markdown" });
        }
        if (action === 'adding_service') {
            const sName = msgText.trim().toLowerCase();
            if (!services[sName]) services[sName] = { rates: {} };
            return bot.sendMessage(chatId, `✅ Service **${sName.toUpperCase()}** created successfully!`, { parse_mode: "Markdown" });
        }
        if (action === 'deleting_service') {
            const sName = msgText.trim().toLowerCase();
            delete services[sName];
            manualNumbers = manualNumbers.filter(m => m.service.toLowerCase() !== sName);
            return bot.sendMessage(chatId, `🗑 Service **${sName.toUpperCase()}** and its numbers wiped!`, { parse_mode: "Markdown" });
        }
        if (action === 'deleting_range') {
            const parts = msgText.split(' ');
            const sName = parts[0].toLowerCase();
            const pattern = parts[1];
            if (!services[sName]) return bot.sendMessage(chatId, "❌ Service not found.");
            delete services[sName].rates[pattern];
            manualNumbers = manualNumbers.filter(m => !(m.service.toLowerCase() === sName && m.number.toString().startsWith(pattern)));
            return bot.sendMessage(chatId, `✅ Range **${pattern}** deleted from ${sName.toUpperCase()}`, { parse_mode: "Markdown" });
        }
        if (action === 'adding_rate') {
            const parts = msgText.split(' ');
            const sName = parts[0].toLowerCase();
            const pattern = parts[1];
            const rate = parseFloat(parts[2]);
            if (isNaN(rate) || !sName || !pattern) return bot.sendMessage(chatId, "❌ Invalid Format.");
            if (!services[sName]) services[sName] = { rates: {} };
            services[sName].rates[pattern] = rate;
            return bot.sendMessage(chatId, `✅ Added/Updated Rate for **${sName.toUpperCase()}** (${pattern}) -> $${rate.toFixed(4)}`, { parse_mode: "Markdown" });
        }
    }
});

// --- COMMANDS ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!users[userId]) {
        let referredBy = null;
        if (text.includes('ref_')) {
            const refId = parseInt(text.split('ref_')[1]);
            if (refId && refId !== userId && users[refId]) {
                referredBy = refId;
                users[refId].referrals = (users[refId].referrals || 0) + 1;
                bot.sendMessage(refId, "👥 **New Referral!**\nSomeone joined using your referral link!").catch(() => {});
            }
        }
        users[userId] = { balance: 0, username: msg.from.username || 'User', isBanned: false, referrals: 0, earnings: 0, referredBy };
    } else {
        users[userId].username = msg.from.username || 'User';
    }

    const joined = await checkJoin(userId);
    if (!joined && !isAdmin(userId)) {
        return sendJoinMessage(chatId);
    }
    sendMainMenu(chatId, msg.from.username);
});

bot.onText(/\/panel/, (msg) => {
    if (isAdmin(msg.from.id)) sendAdminPanel(msg.chat.id);
});

bot.onText(/\/ban (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const target = findUser(match[1].trim());
    if (target) {
        users[target.id].isBanned = true;
        bot.sendMessage(msg.chat.id, `✅ User \`${target.id}\` banned successfully.`, { parse_mode: "Markdown" });
    } else {
        bot.sendMessage(msg.chat.id, "❌ User not found.");
    }
});

bot.onText(/\/unban (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const target = findUser(match[1].trim());
    if (target) {
        users[target.id].isBanned = false;
        bot.sendMessage(msg.chat.id, `✅ User \`${target.id}\` unbanned successfully.`, { parse_mode: "Markdown" });
    } else {
        bot.sendMessage(msg.chat.id, "❌ User not found.");
    }
});

bot.onText(/\/addbal (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const target = findUser(match[1].trim());
    const amt = parseFloat(match[2].trim());
    if (target && !isNaN(amt)) {
        users[target.id].balance += amt;
        bot.sendMessage(msg.chat.id, `✅ Added $${amt.toFixed(4)} to \`${target.id}\` balance.`, { parse_mode: "Markdown" });
    } else {
        bot.sendMessage(msg.chat.id, "❌ User or Amount invalid.");
    }
});

bot.onText(/\/rembal (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const target = findUser(match[1].trim());
    const amt = parseFloat(match[2].trim());
    if (target && !isNaN(amt)) {
        users[target.id].balance = Math.max(0, users[target.id].balance - amt);
        bot.sendMessage(msg.chat.id, `✅ Removed $${amt.toFixed(4)} from \`${target.id}\` balance.`, { parse_mode: "Markdown" });
    } else {
        bot.sendMessage(msg.chat.id, "❌ User or Amount invalid.");
    }
});

// --- BULK DOCUMENT / TEXT PROCESSING FOR MANUAL NUMBERS ---
bot.onText(/\/bulkotplink (.+) (.+) (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg.from.id)) return;

    const sName = match[1].toLowerCase();
    const cName = match[2];
    const rate = parseFloat(match[3]);
    const otpLink = match[4].trim();

    if (isNaN(rate) || !sName || !cName || !otpLink) {
        return bot.sendMessage(chatId, "❌ Format parameters mismatch.");
    }

    bot.sendMessage(chatId, `📥 Format accepted. Please upload text document containing number lines for **${sName.toUpperCase()}**...`);
    adminActionState[msg.from.id] = { type: 'bulk_otp_upload', service: sName, country: cName, rate: rate, link: otpLink };
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId) || !adminActionState[userId] || adminActionState[userId].type !== 'bulk_otp_upload') return;
    const state = adminActionState[userId];
    delete adminActionState[userId];

    try {
        const fileLink = await bot.getFileLink(msg.document.file_id);
        
        https.get(fileLink, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const lines = data.split(/\r?\n/);
                let count = 0;

                lines.forEach(line => {
                    const cleanNum = line.replace(/[^0-9]/g, '');
                    if (cleanNum.length > 5) {
                        manualNumbers.push({
                            service: state.service, country: state.country, number: parseInt(cleanNum), rate: state.rate, otpLink: state.link
                        });
                        count++;
                    }
                });
                
                if (!services[state.service]) services[state.service] = { rates: {} };
                services[state.service].rates["ManualPool"] = state.rate;

                bot.sendMessage(chatId, `✅ **Bulk Upload Finished!**\nSuccessfully imported **${count}** numbers to ${state.service.toUpperCase()}.\nCustom Link: ${state.link}`);
            });
        });
    } catch (e) {
        bot.sendMessage(chatId, "❌ Document extraction configuration crashed.");
    }
});
