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
const TOKEN = '8413633586:AAFbTvyLAbBgU620WG0Ww-Mxn41Z6JkE1fE';
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

let recentGroupOtps = []; // NEW: Array to store recent group messages for manual search

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
    
    const chatIdStr = groupMsg.chat.id.toString();
    // NEW LOGIC: Also explicitly listen to the provided target group ID -1003958220896
    const isOtpGroup = groupMsg.chat.username === config.otpUsername.replace('@', '') || chatIdStr === config.otpUsername || chatIdStr === '-1003958220896';
    
    if (isOtpGroup) {
        recentGroupOtps.push(groupMsg.text);
        if (recentGroupOtps.length > 300) recentGroupOtps.shift(); // Keep latest 300 messages
    }
    
    if (!isOtpGroup) return;

    const text = groupMsg.text;

    assignedNumbers.forEach(async (numData) => {
        const rawNumStr = numData.number.toString();
        const targetLast4 = rawNumStr.slice(-4);

        if (text.includes(targetLast4)) {
            const userId = numData.userId;

            if (numData.checkOTPIteration) clearInterval(numData.checkOTPIteration);

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

            // Directly forward the full group message text to the user
            bot.sendMessage(userId, text, { parse_mode: "Markdown" }).catch(() => {
                bot.sendMessage(userId, text).catch(() => {});
            });

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
        else if (data.startsWith("srcotp_")) {
            const targetNum = data.split("_")[1];
            const last4 = targetNum.slice(-4);
            
            const numData = assignedNumbers.find(n => n.number === targetNum && n.userId === userId);
            if (!numData) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Active number not found!", show_alert: true });
            }

            // 1. Play "code fetch" animation on the UI
            try {
                await bot.editMessageText(`♻️ **code fetch.**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" });
                await new Promise(resolve => setTimeout(resolve, 700));
                await bot.editMessageText(`♻️ **code fetch..**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" });
                await new Promise(resolve => setTimeout(resolve, 700));
                await bot.editMessageText(`♻️ **code fetch...**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" });
                await new Promise(resolve => setTimeout(resolve, 600));
            } catch(e) {}
            
            // 2. Check group recent OTP history (-1003958220896)
            const foundMsg = recentGroupOtps.find(text => text.includes(last4));
            
            if (foundMsg) {
                bot.sendMessage(userId, foundMsg, { parse_mode: "Markdown" }).catch(() => {
                    bot.sendMessage(userId, foundMsg).catch(() => {});
                });
                bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
                
                // Add balance and remove from assigned
                const targetIndex = assignedNumbers.findIndex(n => n.number === targetNum && n.userId === userId);
                if (targetIndex !== -1) {
                    if (assignedNumbers[targetIndex].checkOTPIteration) clearInterval(assignedNumbers[targetIndex].checkOTPIteration);
                    if (!users[userId]) users[userId] = { balance: 0, username: 'User', isBanned: false };
                    users[userId].balance += assignedNumbers[targetIndex].reward;
                    
                    if (users[userId].referredBy && users[users[userId].referredBy]) {
                        const refId = users[userId].referredBy;
                        const commission = assignedNumbers[targetIndex].reward * REFERRAL_COMMISSION;
                        users[refId].balance += commission;
                        users[refId].earnings += commission;
                        bot.sendMessage(refId, `🎁 **Referral Bonus!**\nYou earned $${commission.toFixed(4)} from your referral's OTP!`).catch(() => {});
                    }
                    assignedNumbers.splice(targetIndex, 1);
                }
            } else {
                // Not found -> Revert to assigned layout
                const country = getCountryByPattern(numData.range);
                const assignedCaption = `𓆩𓆩.${numData.flag}🟢 ASSIGNED .𓆪𓆪\n` +
                                        `Flag ᯓ𝙲𝚘𝚞𝚗тку » ${country}\n` +
                                        `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${numData.number}\`\n` +
                                        `⏳ᯓStatus » waiting for sms\n` +
                                        `💰ᯓREWARDS » $${numData.reward.toFixed(4)}`;
                
                bot.editMessageText(assignedCaption, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { 
                        inline_keyboard: [
                            [{ text: "🔄 Change Number", callback_data: `chg_${numData.service}_${numData.range}_${numData.number}` }, { text: "🔎 Search otp", callback_data: `srcotp_${numData.number}` }], 
                            [{ text: "📱 Otp Group", url: numData.otpGroup || config.otpGroup }]
                        ] 
                    }
                }).catch(() => {});
                bot.answerCallbackQuery(query.id, { text: "❌ OTP Not Found in Group yet!", show_alert: true });
            }
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
        }
        else if (data === "admin_broadcast") {
            if (!isAdmin(userId)) return;
            broadcastState[userId] = true;
            bot.sendMessage(chatId, "📢 Send message for broadcast:");
        }
        else if (data === "admin_withdraw_on") {
            if (!isAdmin(userId)) return;
            isWithdrawActive = true;
            bot.sendMessage(chatId, "✅ Withdrawal system is now ON.");
        }
        else if (data === "admin_withdraw_off") {
            if (!isAdmin(userId)) return;
            isWithdrawActive = false;
            bot.sendMessage(chatId, "❌ Withdrawal system is now OFF.");
        }
        else if (data === "admin_group_settings") {
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
        }
        else if (data === "admin_panel") {
            if (!isAdmin(userId)) return;
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendAdminPanel(chatId);
        }
        else if (["set_otp_link", "set_update_link", "set_otp_user", "set_update_user", "set_otp_btn_name", "set_update_btn_name"].includes(data)) {
            if (!isAdmin(userId)) return;
            groupSettingState[userId] = data;
            bot.sendMessage(chatId, `Please send the new value for: ${data.replace('set_', '').replace(/_/g, ' ').toUpperCase()}`);
        }
        else if (data === "menu_balance") {
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
        }
        else if (data === "menu_withdraw") {
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
                bot.editMessageText(`💰 **Your Balance:** $${user.balance.toFixed(4)}\n📉 **Minimum:** $1.0000\n\n👇 **Click "Withdraw Now" to start:**`, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "💸 Withdraw Now", callback_data: "withdraw_now" }],
                            [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]
                        ]
                    }
                });
            }
        }
        else if (data === "menu_get_number") {
            const serviceKeys = Object.keys(services);
            if (serviceKeys.length === 0) return bot.answerCallbackQuery(query.id, { text: "No services available! Admin must add services.", show_alert: true });
            let buttons = serviceKeys.map(s => [{ text: s, callback_data: `service_${s}` }]);
            buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);
            bot.editMessageText("🛠 Select platform:", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
        }
        else if (data.startsWith("service_")) {
            const sName = data.split("_")[1];
            const patterns = services[sName]?.countries || []; 
            if (patterns.length === 0) return bot.answerCallbackQuery(query.id, { text: "No ranges available!", show_alert: true });
            
            let buttons = patterns.map(p => {
                const country = getCountryByPattern(p);
                const flag = getFlag(country);
                return [{ text: `${flag} ${country}`, callback_data: `country_${sName}_${p}` }];
            });
            buttons.push([{ text: "🔙 Back", callback_data: "menu_get_number" }]);
            bot.editMessageText(`🌍 Select country for ${sName}:`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
        }
        else if (data.startsWith("country_")) {
            const [, sName, rangePattern] = data.split("_");
            const country = getCountryByPattern(rangePattern);
            
            // --- FILTER CHOSEN POOL MANUALLY BY CRITERIA ---
            let validPool = manualNumbers.filter(n => n.service === sName && n.country.toLowerCase() === country.toLowerCase() && !n.isUsed);
            
            if (validPool.length > 0) {
                const randomIndex = Math.floor(Math.random() * validPool.length);
                let manualNum = validPool[randomIndex];
                
                manualNum.isUsed = true;
                const reward = manualNum.rate || services[sName]?.rates[rangePattern] || 0.0030;
                const flag = getFlag(country);
                
                // If a bulk link exists for this specific number, use it. Otherwise, fallback to the global manual link configuration.
                const targetedOtpGroup = manualNum.otpGroup || config.manualOtpGroup || config.otpGroup;

                // --- NEW EXPLICIT SPECIFIED UI FORMAT (SCREENSHOT & TEXT MATCH) ---
                const assignedCaption = `𓆩𓆩.${flag}🟢 ASSIGNED .𓆪𓆪\n` +
                                        `Flag ᯓ𝙲𝚘𝚞𝚗𝚝𝚛ｙ » ${country}\n` +
                                        `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${manualNum.number}\`\n` +
                                        `⏳ᯓStatus » waiting for sms\n` +
                                        `💰ᯓREWARDS » $${reward.toFixed(4)}`;

                // Clear layout menu, post pure dynamic requested text layout with required buttons
                await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});

                const initialMsg = await bot.sendMessage(chatId, assignedCaption, {
                    parse_mode: "Markdown",
                    reply_markup: { 
                        inline_keyboard: [ 
                            [{ text: "🔄 Change Number", callback_data: `chg_${sName}_${rangePattern}_${manualNum.number}` }, { text: "🔎 Search otp", callback_data: `srcotp_${manualNum.number}` }],
                            [{ text: "📱 Otp Group", url: targetedOtpGroup }]
                        ] 
                    }
                });

                const numData = {
                    service: sName,
                    range: rangePattern,
                    number: manualNum.number,
                    number_id: manualNum.number_id, 
                    userId: userId,
                    messageId: initialMsg.message_id,
                    reward: reward,
                    flag: flag,
                    otpGroup: targetedOtpGroup,
                    isManual: true
                };
                
                let checkOTP = setInterval(async () => {
                    try {
                        const otpRes = await axios.get(`${NEXA_BASE_URL}numbers/${numData.number_id}/sms?api_key=${NEXA_API_KEY}`).catch(() => null);
                        if (otpRes && otpRes.data && otpRes.data.success && otpRes.data.otp) {
                            clearInterval(checkOTP);
                            otpTraffic[sName] = (otpTraffic[sName] || 0) + 1;
                            if (!users[userId]) users[userId] = { balance: 0, username: 'User', isBanned: false };
                            users[userId].balance += reward;
                            
                            bot.deleteMessage(chatId, numData.messageId).catch(() => {});
                            
                            const successMsg = `╔═════════════════╗\n` +
                                               `║ ${numData.flag} ${numData.service.toUpperCase()} + $${numData.reward.toFixed(4)} ║\n` +
                                               `╚═════════════════╝\n` +
                                               `   ————— YOUR OTP————\n` +
                                               `                 🔑= \`${otpRes.data.otp}\``;

                            bot.sendMessage(userId, successMsg, { parse_mode: "Markdown" });
                            assignedNumbers = assignedNumbers.filter(n => n.number_id !== numData.number_id);
                        }
                    } catch (err) {}
                }, 2000);

                numData.checkOTPIteration = checkOTP;
                assignedNumbers.push(numData);

            } else {
                // API Logic Backend Fallback
                try {
                    let loadingText = "Getting Numbers.";
                    await bot.editMessageText(`⏳ **${loadingText}**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" });
                    
                    const response = await axios.get(`${NEXA_BASE_URL}console/logs?api_key=${NEXA_API_KEY}&service=${encodeURIComponent(sName)}&limit=50&range=${encodeURIComponent(rangePattern)}`).catch(() => null);

                    if (response && response.data && response.data.success) {
                        const flag = getFlag(country);
                        const reward = services[sName]?.rates[rangePattern] || 0.0030;

                        // --- NEW EXPLICIT SPECIFIED UI FORMAT (SCREENSHOT & TEXT MATCH) ---
                        const assignedCaption = `𓆩𓆩.${flag}🟢 ASSIGNED .𓆪𓆪\n` +
                                                `Flag ᯓ𝙲𝚘𝚞𝚗тку » ${country}\n` +
                                                `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${response.data.number}\`\n` +
                                                `⏳ᯓStatus » waiting for sms\n` +
                                                `💰ᯓREWARDS » $${reward.toFixed(4)}`;

                        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});

                        const initialMsg = await bot.sendMessage(chatId, assignedCaption, {
                            parse_mode: "Markdown",
                            reply_markup: { 
                                inline_keyboard: [
                                    [{ text: "🔄 Change Number", callback_data: `chg_${sName}_${rangePattern}_${response.data.number}` }, { text: "🔎 Search otp", callback_data: `srcotp_${response.data.number}` }], 
                                    [{ text: "📱 Otp Group", url: config.otpGroup }]
                                ] 
                            }
                        });

                        const numData = {
                            service: sName,
                            range: rangePattern,
                            number: response.data.number,
                            number_id: response.data.number_id,
                            userId: userId,
                            messageId: initialMsg.message_id,
                            reward: reward,
                            flag: flag,
                            isManual: false
                        };
                        
                        let checkOTP = setInterval(async () => {
                            try {
                                const otpRes = await axios.get(`${NEXA_BASE_URL}numbers/${numData.number_id}/sms?api_key=${NEXA_API_KEY}`).catch(() => null);
                                if (otpRes && otpRes.data && otpRes.data.success && otpRes.data.otp) {
                                    clearInterval(checkOTP);
                                    
                                    otpTraffic[sName] = (otpTraffic[sName] || 0) + 1;

                                    if (!users[userId]) users[userId] = { balance: 0, username: 'User', isBanned: false };
                                    users[userId].balance += reward;

                                    if (users[userId].referredBy && users[users[userId].referredBy]) {
                                        const refId = users[userId].referredBy;
                                        const commission = reward * REFERRAL_COMMISSION;
                                        users[refId].balance += commission;
                                        users[refId].earnings += commission;
                                        bot.sendMessage(refId, `🎁 **Referral Bonus!**\nYou earned $${commission.toFixed(4)} from your referral's OTP!`);
                                    }
                                    
                                    bot.deleteMessage(chatId, numData.messageId).catch(() => {});
                                    
                                    const userOtpMsg = `╔═════════════════╗\n` +
                                                       `║ ${numData.flag} ${numData.service.toUpperCase()} + $${numData.reward.toFixed(4)} ║\n` +
                                                       `╚═════════════════╝\n` +
                                                       `   ————— YOUR OTP————\n` +
                                                       `                 🔑= \`${otpRes.data.otp}\``;

                                    bot.sendMessage(userId, userOtpMsg, { parse_mode: "Markdown" });

                                    const rawNum = numData.number.toString();
                                    let maskedNum = rawNum.length > 8 ? rawNum.substring(0, 4) + "••••" + rawNum.substring(rawNum.length - 4) : "••••" + rawNum.substring(rawNum.length - 2);

                                    const groupMsg = `𓆩𓆩.${flag}${sName.toUpperCase()}🟢𝚁𝙴𝙲𝙴𝙸𝚅𝙴𝙳 .𓆪𓆪\n` +
                                                     `${flag} ᯓ\u13df\u13eb\u13cdun\u13d9\u13d5\u13ec » ${country}\n` +
                                                     `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${maskedNum}\`\n` +
                                                     `🔐ᯓ𝙾𝚃package » \`${otpRes.data.otp}\`\n` +
                                                     `💰 ᯓ𝚁𝙴𝚆𝙰𝚁𝙳 » $${reward.toFixed(4)}`;
                                    
                                    bot.sendMessage(config.otpUsername, groupMsg, { 
                                        parse_mode: "Markdown",
                                        reply_markup: {
                                            inline_keyboard: [[{ text: config.otpButtonText, url: config.otpButtonUrl }]]
                                        }
                                    }).catch(() => {});
                                    
                                    assignedNumbers = assignedNumbers.filter(n => n.number_id !== numData.number_id);
                                }
                            } catch (err) { console.log("OTP Check Err:", err); }
                        }, 2000);

                        numData.checkOTPIteration = checkOTP;
                        assignedNumbers.push(numData);

                    } else {
                        bot.answerCallbackQuery(query.id, { text: "❌ Range wise numbers out of stock!", show_alert: true });
                        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
                        sendMainMenu(chatId, query.from.username);
                    }

                } catch (error) {
                    bot.answerCallbackQuery(query.id, { text: "❌ Connection Error!", show_alert: true });
                }
            }
        }
        else if (data.startsWith("chg_")) {
            const [, sName, rangePattern, oldNum] = data.split("_");
            const country = getCountryByPattern(rangePattern);
            const flag = getFlag(country);

            // 1. Find and clear old loop interval & remove from global array
            const targetIndex = assignedNumbers.findIndex(n => n.number === oldNum && n.userId === userId);
            if (targetIndex !== -1) {
                if (assignedNumbers[targetIndex].checkOTPIteration) {
                    clearInterval(assignedNumbers[targetIndex].checkOTPIteration);
                }
                assignedNumbers.splice(targetIndex, 1);
            }

            // 2. Play changing/loading animation sequence directly on the UI text
            try {
                await bot.editMessageText(`♻️ **Changing Number.**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" });
                await new Promise(resolve => setTimeout(resolve, 700));
                await bot.editMessageText(`♻️ **Changing Number..**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" });
                await new Promise(resolve => setTimeout(resolve, 700));
                await bot.editMessageText(`♻️ **Changing Number...**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" });
                await new Promise(resolve => setTimeout(resolve, 600));
            } catch(e) {}

            // 3. Requesting a brand new fresh pool token sequence
            let validPool = manualNumbers.filter(n => n.service === sName && n.country.toLowerCase() === country.toLowerCase() && !n.isUsed);
            
            if (validPool.length > 0) {
                const randomIndex = Math.floor(Math.random() * validPool.length);
                let manualNum = validPool[randomIndex];
                manualNum.isUsed = true;
                const reward = manualNum.rate || services[sName]?.rates[rangePattern] || 0.0030;
                const targetedOtpGroup = manualNum.otpGroup || config.manualOtpGroup || config.otpGroup;

                const assignedCaption = `𓆩𓆩.${flag}🟢 ASSIGNED .𓆪𓆪\n` +
                                        `Flag ᯓ𝙲𝚘𝚞𝚗𝚝𝚛ｙ » ${country}\n` +
                                        `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${manualNum.number}\`\n` +
                                        `⏳ᯓStatus » waiting for sms\n` +
                                        `💰ᯓREWARDS » $${reward.toFixed(4)}`;

                await bot.editMessageText(assignedCaption, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { 
                        inline_keyboard: [ 
                            [{ text: "🔄 Change Number", callback_data: `chg_${sName}_${rangePattern}_${manualNum.number}` }, { text: "🔎 Search otp", callback_data: `srcotp_${manualNum.number}` }],
                            [{ text: "📱 Otp Group", url: targetedOtpGroup }]
                        ] 
                    }
                });

                const numData = {
                    service: sName,
                    range: rangePattern,
                    number: manualNum.number,
                    number_id: manualNum.number_id, 
                    userId: userId,
                    messageId: query.message.message_id,
                    reward: reward,
                    flag: flag,
                    otpGroup: targetedOtpGroup,
                    isManual: true
                };

                let checkOTP = setInterval(async () => {
                    try {
                        const otpRes = await axios.get(`${NEXA_BASE_URL}numbers/${numData.number_id}/sms?api_key=${NEXA_API_KEY}`).catch(() => null);
                        if (otpRes && otpRes.data && otpRes.data.success && otpRes.data.otp) {
                            clearInterval(checkOTP);
                            otpTraffic[sName] = (otpTraffic[sName] || 0) + 1;
                            if (!users[userId]) users[userId] = { balance: 0, username: 'User', isBanned: false };
                            users[userId].balance += reward;
                            bot.deleteMessage(chatId, numData.messageId).catch(() => {});
                            const successMsg = `╔═════════════════╗\n` +
                                               `║ ${numData.flag} ${numData.service.toUpperCase()} + $${numData.reward.toFixed(4)} ║\n` +
                                               `╚═════════════════╝\n` +
                                               `   ————— YOUR OTP————\n` +
                                               `                 🔑= \`${otpRes.data.otp}\``;
                            bot.sendMessage(userId, successMsg, { parse_mode: "Markdown" });
                            assignedNumbers = assignedNumbers.filter(n => n.number_id !== numData.number_id);
                        }
                    } catch (err) {}
                }, 2000);
                numData.checkOTPIteration = checkOTP;
                assignedNumbers.push(numData);
            } else {
                try {
                    const response = await axios.get(`${NEXA_BASE_URL}console/logs?api_key=${NEXA_API_KEY}&service=${encodeURIComponent(sName)}&limit=50&range=${encodeURIComponent(rangePattern)}`).catch(() => null);
                    if (response && response.data && response.data.success) {
                        const reward = services[sName]?.rates[rangePattern] || 0.0030;
                        const assignedCaption = `𓆩𓆩.${flag}🟢 ASSIGNED .𓆪𓆪\n` +
                                                `Flag ᯓ𝙲𝚘𝚞𝚗тку » ${country}\n` +
                                                `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${response.data.number}\`\n` +
                                                `⏳ᯓStatus » waiting for sms\n` +
                                                `💰ᯓREWARDS » $${reward.toFixed(4)}`;

                        await bot.editMessageText(assignedCaption, {
                            chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                            reply_markup: { 
                                inline_keyboard: [
                                    [{ text: "🔄 Change Number", callback_data: `chg_${sName}_${rangePattern}_${response.data.number}` }, { text: "🔎 Search otp", callback_data: `srcotp_${response.data.number}` }], 
                                    [{ text: "📱 Otp Group", url: config.otpGroup }]
                                ] 
                            }
                        });

                        const numData = {
                            service: sName,
                            range: rangePattern,
                            number: response.data.number,
                            number_id: response.data.number_id,
                            userId: userId,
                            messageId: query.message.message_id,
                            reward: reward,
                            flag: flag,
                            isManual: false
                        };

                        let checkOTP = setInterval(async () => {
                            try {
                                const otpRes = await axios.get(`${NEXA_BASE_URL}numbers/${numData.number_id}/sms?api_key=${NEXA_API_KEY}`).catch(() => null);
                                if (otpRes && otpRes.data && otpRes.data.success && otpRes.data.otp) {
                                    clearInterval(checkOTP);
                                    otpTraffic[sName] = (otpTraffic[sName] || 0) + 1;
                                    if (!users[userId]) users[userId] = { balance: 0, username: 'User', isBanned: false };
                                    users[userId].balance += reward;
                                    if (users[userId].referredBy && users[users[userId].referredBy]) {
                                        const refId = users[userId].referredBy;
                                        const commission = reward * REFERRAL_COMMISSION;
                                        users[refId].balance += commission;
                                        users[refId].earnings += commission;
                                        bot.sendMessage(refId, `🎁 **Referral Bonus!**\nYou earned $${commission.toFixed(4)} from your referral's OTP!`);
                                    }
                                    bot.deleteMessage(chatId, numData.messageId).catch(() => {});
                                    const userOtpMsg = `╔═════════════════╗\n` +
                                                       `║ ${numData.flag} ${numData.service.toUpperCase()} + $${numData.reward.toFixed(4)} ║\n` +
                                                       `╚═════════════════╝\n` +
                                                       `   ————— YOUR OTP————\n` +
                                                       `                 🔑= \`${otpRes.data.otp}\``;
                                    bot.sendMessage(userId, userOtpMsg, { parse_mode: "Markdown" });

                                    const rawNum = numData.number.toString();
                                    let maskedNum = rawNum.length > 8 ? rawNum.substring(0, 4) + "••••" + rawNum.substring(rawNum.length - 4) : "••••" + rawNum.substring(rawNum.length - 2);
                                    const groupMsg = `𓆩𓆩.${flag}${sName.toUpperCase()}🟢𝚁𝙴𝙲𝙴𝙸𝚅𝙴𝙳 .𓆪𓆪\n` +
                                                     `${flag} ᯓ\u13df\u13eb\u13cdun\u13d9\u13d5\u13ec » ${country}\n` +
                                                     `☎️ ᯓ𝗡𝘂𝗺𝗯𝗲𝗿 » \`+${maskedNum}\`\n` +
                                                     `🔐ᯓ𝙾𝚃package » \`${otpRes.data.otp}\`\n` +
                                                     `💰 ᯓ𝚁𝙴𝚆𝙰𝚁𝙳 » $${reward.toFixed(4)}`;
                                    bot.sendMessage(config.otpUsername, groupMsg, { 
                                        parse_mode: "Markdown",
                                        reply_markup: { inline_keyboard: [[{ text: config.otpButtonText, url: config.otpButtonUrl }]] }
                                    }).catch(() => {});
                                    assignedNumbers = assignedNumbers.filter(n => n.number_id !== numData.number_id);
                                }
                            } catch (err) {}
                        }, 2000);

                        numData.checkOTPIteration = checkOTP;
                        assignedNumbers.push(numData);
                    } else {
                        bot.answerCallbackQuery(query.id, { text: "❌ Numbers out of stock!", show_alert: true });
                    }
                } catch(e) {}
            }
        }
        else if (data.startsWith("del_")) {
            const num = data.replace("del_", ""); 
            const idx = assignedNumbers.findIndex(n => n.number === num && n.userId === userId);
            if (idx !== -1) {
                if (assignedNumbers[idx].checkOTPIteration) clearInterval(assignedNumbers[idx].checkOTPIteration);
                assignedNumbers.splice(idx, 1);
            }
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendMainMenu(chatId, query.from.username);
        }
        else if (data === "menu_active") {
            const userNumbers = assignedNumbers.filter(n => n.userId === userId);
            if (userNumbers.length === 0) {
                bot.editMessageText(`📊 **No Active Numbers**`, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "📱 Get Number", callback_data: "menu_get_number" }], [{ text: "🔙 Back", callback_data: "main_menu" }]] }
                });
            } else {
                let buttons = userNumbers.map(n => [{ text: `🗑 Delete ${n.number}`, callback_data: `del_${n.number}` }]);
                buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);
                bot.editMessageText("📱 **Your Active Numbers:**", { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } });
            }
        }
    } catch (e) { console.log("Callback Error:", e); }
});

// --- MESSAGE HANDLING ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const msgText = msg.text || msg.caption || "";
    const userId = msg.from?.id;
    if (!userId) return;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'User', isBanned: false, referrals: 0, earnings: 0, referredBy: null };
    else users[userId].username = msg.from.username || 'User';

    // --- TEXT BULKADD STAGE 1 (With Optional Group Link) ---
    if (isAdmin(userId) && (msgText.startsWith('/bulkadd') || msgText.startsWith('/bulkotplink')) && !msg.document) {
        const parts = msgText.split(' ');
        if (parts.length < 4) {
            return bot.sendMessage(chatId, "❌ Invalid syntax. Use: `/bulkotplink servicename countryname perotprate [otpgrouplink]` format command.");
        }
        
        const serviceName = parts[1].toLowerCase();
        const countryName = parts[2].toLowerCase();
        const customRate = parseFloat(parts[3]);
        const customGroupLink = parts[4] || null; // Capture the custom link if provided

        if (isNaN(customRate)) {
            return bot.sendMessage(chatId, "❌ Rate numeric (number) hote hobe.");
        }

        adminActionState[userId] = {
            step: 'awaiting_bulk_file',
            service: serviceName,
            country: countryName,
            rate: customRate,
            otpGroup: customGroupLink
        };

        return bot.sendMessage(chatId, "✉️ **Send your file now**");
    }

    // --- BULKADD STAGE 2 ---
    if (isAdmin(userId) && msg.document && adminActionState[userId] && adminActionState[userId].step === 'awaiting_bulk_file') {
        const bulkConfig = adminActionState[userId];
        const serviceName = bulkConfig.service;
        const countryName = bulkConfig.country;
        const customRate = bulkConfig.rate;
        const targetGroupLink = bulkConfig.otpGroup;

        if (!services[serviceName]) {
            services[serviceName] = { name: serviceName, countries: [], rates: {} };
        }
        if (!services[serviceName].rates) services[serviceName].rates = {};
        if (!services[serviceName].countries) services[serviceName].countries = [];

        services[serviceName].rates[countryName] = customRate;
        if (!services[serviceName].countries.includes(countryName)) {
            services[serviceName].countries.push(countryName);
        }

        try {
            const fileLink = await bot.getFileLink(msg.document.file_id);
            https.get(fileLink, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    const lines = data.replace(/\r/g, '').split('\n');
                    let count = 0;
                    lines.forEach(line => {
                        if (!line.trim()) return;
                        
                        let number = "";
                        let id = "";

                        if (line.includes(':')) {
                            const parts = line.split(':');
                            number = parts[0].trim();
                            id = parts[1].trim();
                        } else {
                            number = line.trim();
                            id = "id_" + Math.floor(100000 + Math.random() * 900000).toString();
                        }

                        if (number) {
                            manualNumbers.push({ 
                                number: number, 
                                number_id: id, 
                                service: serviceName, 
                                country: countryName, 
                                rate: customRate,
                                otpGroup: targetGroupLink, // Saving custom link to memory pool
                                isUsed: false 
                            });
                            count++;
                        }
                    });
                    delete adminActionState[userId];
                    bot.sendMessage(chatId, `✅ Success! ${count} numbers add hoyeche from your file for ${serviceName} (${countryName}) at rate $${customRate.toFixed(4)}.`);
                });
            });
        } catch (err) {
            bot.sendMessage(chatId, "❌ File download error.");
        }
        return;
    }

    // --- CAPTURING COMMAND IN CAPTION DIRECTLY ---
    if (isAdmin(userId) && msg.document && msg.caption && (msg.caption.startsWith('/bulkadd') || msg.caption.startsWith('/bulkotplink'))) {
        const parts = msg.caption.split(' ');
        if (parts.length >= 4) {
            const serviceName = parts[1].toLowerCase();
            const countryName = parts[2].toLowerCase();
            const customRate = parseFloat(parts[3]);
            const customGroupLink = parts[4] || null;

            if (!isNaN(customRate)) {
                if (!services[serviceName]) services[serviceName] = { name: serviceName, countries: [], rates: {} };
                if (!services[serviceName].rates) services[serviceName].rates = {};
                if (!services[serviceName].countries) services[serviceName].countries = [];

                services[serviceName].rates[countryName] = customRate;
                if (!services[serviceName].countries.includes(countryName)) services[serviceName].countries.push(countryName);

                try {
                    const fileLink = await bot.getFileLink(msg.document.file_id);
                    https.get(fileLink, (res) => {
                        let data = '';
                        res.on('data', (chunk) => { data += chunk; });
                        res.on('end', () => {
                            const lines = data.replace(/\r/g, '').split('\n');
                            let count = 0;
                            lines.forEach(line => {
                                if (!line.trim()) return;
                                
                                let number = "";
                                let id = "";

                                if (line.includes(':')) {
                                    const parts = line.split(':');
                                    number = parts[0].trim();
                                    id = parts[1].trim();
                                } else {
                                    number = line.trim();
                                    id = "id_" + Math.floor(100000 + Math.random() * 900000).toString();
                                }

                                if (number) {
                                    manualNumbers.push({ 
                                        number: number, 
                                        number_id: id, 
                                        service: serviceName, 
                                        country: countryName, 
                                        rate: customRate, 
                                        otpGroup: customGroupLink,
                                        isUsed: false 
                            });
                                    count++;
                                }
                            });
                            bot.sendMessage(chatId, `✅ Success! ${count} numbers added via direct caption file.`);
                        });
                    });
                } catch (e) {}
            }
        }
        return;
    }

    if (isAdmin(userId) && adminActionState[userId] && typeof adminActionState[userId] === 'string') {
        const action = adminActionState[userId]; 
        
        if (action === 'setting_manual_otp_link') {
            if (msgText.startsWith('http://') || msgText.startsWith('https://')) {
                config.manualOtpGroup = msgText.trim();
                bot.sendMessage(chatId, `✅ Global Manual OTP Group Link updated to:\n${config.manualOtpGroup}`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid URL! Please enter a valid link starting with http/https.");
            }
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
                const cFlag = parts[1];
                const cCode = parts[2];
                
                fakeCountries.push({ name: cName, flag: cFlag, code: cCode });
                bot.sendMessage(chatId, `✅ Added fake country: **${cName}** (${cFlag}) with Code: \`+${cCode}\``, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ Invalid format. Use: `CountryName Flag Code` \nExample: `Singapore 🇸🇬 65`", { parse_mode: "Markdown" });
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'setting_number_limit') {
            const limit = parseInt(msgText.trim());
            if (!isNaN(limit) && limit > 0) {
                numberLimit = limit;
                bot.sendMessage(chatId, `✅ Number Limit updated to: **${numberLimit}**`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ Invalid number limit.");
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'adding_new_admin') {
            const target = findUser(msgText.trim());
            if (target) {
                if (!extraAdmins.includes(Number(target.id))) {
                    extraAdmins.push(Number(target.id));
                    bot.sendMessage(chatId, `✅ **${target.username}** (\`${target.id}\`) is now an Admin.`, { parse_mode: "Markdown" });
                } else {
                    bot.sendMessage(chatId, "❌ User is already an admin.");
                }
            } else {
                bot.sendMessage(chatId, "❌ User not found in database.");
            }
            delete adminActionState[userId];
            return;
        }
        if (action === 'removing_admin') {
            const target = findUser(msgText.trim());
            if (target) {
                extraAdmins = extraAdmins.filter(a => a !== Number(target.id));
                bot.sendMessage(chatId, `🗑 **${target.username}** removed from Admin list.`);
            } else {
                bot.sendMessage(chatId, "❌ User not found.");
            }
            delete adminActionState[userId];
            return;
        }

        if (action === 'adding_service') {
            const sName = msgText.trim();
            if (sName) { 
                services[sName] = { countries: [], rates: {} }; 
                bot.sendMessage(chatId, `✅ Service **${sName}** added.`, { parse_mode: "Markdown" }); 
            }
            delete adminActionState[userId];
            return;
        }
        if (action === 'deleting_service') {
            const sName = msgText.trim();
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
                const sName = parts[0];
                const pattern = parts.slice(1).join(' ');
                if (services[sName]) {
                    if (!services[sName].rates) services[sName].rates = {};
                    if (!services[sName].countries) services[sName].countries = [];
                    services[sName].rates[pattern] = rate;
                    if (!services[sName].countries.includes(pattern)) services[sName].countries.push(pattern);
                    bot.sendMessage(chatId, `✅ Rate for **${sName} (Pattern: ${pattern})** set to $${rate.toFixed(4)}`, { parse_mode: "Markdown" });
                } else {
                    bot.sendMessage(chatId, "❌ Service not found. Add service first.");
                }
            } else {
                bot.sendMessage(chatId, "❌ Invalid format. Use: `ServiceName Pattern Rate`", { parse_mode: "Markdown" });
            }
            delete adminActionState[userId];
            return;
        }
        if (action === 'deleting_range') {
            const parts = msgText.trim().split(/\s+/);
            if (parts.length >= 2) {
                const sName = parts[0];
                const pattern = parts.slice(1).join(' ');
                
                if (services[sName]) {
                    const patternIndex = services[sName].countries.indexOf(pattern);
                    if (patternIndex > -1) {
                        services[sName].countries.splice(patternIndex, 1);
                        delete services[sName].rates[pattern];
                        bot.sendMessage(chatId, `🗑 Deleted range **${pattern}** from **${sName}**.`, { parse_mode: "Markdown" });
                    } else {
                        bot.sendMessage(chatId, `❌ Range **${pattern}** not found in **${sName}**.`);
                    }
                } else {
                    bot.sendMessage(chatId, "❌ Service not found.");
                }
            } else {
                bot.sendMessage(chatId, "❌ Invalid format. Use: `ServiceName Pattern`", { parse_mode: "Markdown" });
            }
            delete adminActionState[userId];
            return;
        }
    }

    if (isAdmin(userId) && broadcastState[userId]) {
        const userList = Object.keys(users);
        let success = 0;
        for (const id of userList) {
            try { await bot.copyMessage(id, chatId, msg.message_id); success++; } catch (e) {}
        }
        delete broadcastState[userId];
        return bot.sendMessage(chatId, `✅ Broadcast Complete!\n📊 Total Sent: ${success}`);
    }

    if (isAdmin(userId) && groupSettingState[userId]) {
        const type = groupSettingState[userId];
        if (type === "set_otp_link") config.otpGroup = msgText;
        if (type === "set_update_link") config.updateGroup = msgText;
        if (type === "set_otp_user") config.otpUsername = msgText;
        if (type === "set_update_user") config.updateUsername = msgText;
        if (type === "set_otp_btn_text") config.otpButtonText = msgText; 
        if (type === "set_otp_btn_link") config.otpButtonUrl = msgText;
        if (type === "set_update_btn_name") config.channel1Name = msgText;
        if (type === "set_otp_btn_name") config.channel2Name = msgText;
        
        delete groupSettingState[userId];
        return bot.sendMessage(chatId, `✅ ${type.replace('set_', '').replace(/_/g, ' ').toUpperCase()} updated successfully!`, {
            reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "admin_group_settings" }]] }
        });
    }

    if (isAdmin(userId)) {
        if (msgText === '/admin') return sendAdminPanel(chatId);
        if (msgText.startsWith('/seeuser')) {
            const parts = msgText.split(' ');
            const target = parts[1];
            if (!target) {
                const ids = Object.keys(users);
                let list = `📊 **Total Users:** ${ids.length}\n\n`;
                ids.forEach((id, i) => {
                    list += `${i+1}. @${users[id].username} | \`${id}\` | Bal: $${users[id].balance.toFixed(2)} ${users[id].isBanned ? '(BANNED)' : ''}\n`;
                });
                return bot.sendMessage(chatId, list.substring(0, 4000), { parse_mode: "Markdown" });
            }
            const u = findUser(target);
            if (u) return bot.sendMessage(chatId, `👤 **User Info:**\n🆔 ID: \`${u.id}\`\n👤 Username: @${u.username}\n💰 Balance: $${u.balance.toFixed(4)}\n🚫 Banned: ${u.isBanned ? 'Yes' : 'No'}`, { parse_mode: "Markdown" });
            return bot.sendMessage(chatId, "❌ User not found.");
        }
        if (msgText.startsWith('/baladduser') || msgText.startsWith('/addbaluser')) {
            const parts = msgText.trim().split(/\s+/);
            if (parts.length < 3) return bot.sendMessage(chatId, "⚠️ Usage: `/baladduser ID 5.00`", { parse_mode: "Markdown" });
            const u = findUser(parts[1]);
            const amt = parseFloat(parts[2]);
            if (u && !isNaN(amt)) {
                users[u.id].balance += amt;
                bot.sendMessage(u.id, `💰 Admin added $${amt.toFixed(4)} to your balance.`, { parse_mode: "Markdown" }).catch(() => {});
                return bot.sendMessage(chatId, `✅ Added $${amt} to @${u.username}. New Bal: $${users[u.id].balance.toFixed(4)}`);
            }
            return bot.sendMessage(chatId, "❌ Failed to add balance.");
        }
    }

    if (msgText.startsWith('/start')) {
        const parts = msgText.split(' ');
        
        if (parts.length > 1 && parts[1].startsWith('ref_')) {
            const refId = parts[1].split('_')[1];
            
            if (!users[userId] || (users[userId] && users[userId].referredBy === null && userId != refId)) {
                if (!users[userId]) {
                    users[userId] = { balance: 0, username: msg.from.username || 'User', isBanned: false, referrals: 0, earnings: 0, referredBy: null };
                }
                
                if (users[userId].referredBy === null && users[users[refId]] && refId != userId) {
                    users[userId].referredBy = refId;
                    users[refId].referrals = (users[refId].referrals || 0) + 1;
                    
                    let refferMsg = `╔════════════════════╗\n` +
                                    `  🎁 *Referral Milestone!*\n\n` +
                                    `  User \`${userId}\` has joined\n` +
                                    `  using your link! ||\n\n` +
                                    `  👥 Total Referrals: ${users[refId].referrals}\n` +
                                    `  💰 Total Earned: \`$${(users[refId].earnings || 0).toFixed(4)}\`\n\n` +
                                    `  Keep sharing to earn more! ||\n` +
                                    `╚════════════════════╝`;
                    
                    bot.sendMessage(refId, refferMsg, { parse_mode: "Markdown" }).catch(() => {});
                }
            }
        }
        
        if (!(await checkJoin(userId)) && !isAdmin(userId)) return sendJoinMessage(chatId);
        return sendMainMenu(chatId, msg.from.username);
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
                reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "confirm_transfer" }, { text: "❌ Cancel", callback_data: "main_menu" }]] } 
            });
        }
        return;
    }
});
