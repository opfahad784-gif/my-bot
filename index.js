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
const TOKEN = '8413633586:AAFKb3aA6XCoYx_E3ricqSoYo2wk5nb_pOU'; 
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
let transferStates = {}; 
let withdrawStates = {}; 
let isWithdrawActive = false; 
let broadcastState = {}; 
let groupSettingState = {};
let adminActionState = {}; 

let config = {
    otpGroup: "https://t.me/yoosms_otp", 
    updateGroup: "https://t.me/yooosmsupdate",
    otpUsername: "@yoosms_otp",
    updateUsername: "@yooosmsupdate",
    otpButtonText: "Get Number Now", 
    otpButtonUrl: "https://t.me/YourBotLink",
    // Force Join Button Names
    channel1Name: "📢 Join Channel 1",
    channel2Name: "📢 Join Channel 2"
};

// --- HELPERS ---
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
        "italy": "🇮🇹", "jamaica": "🇯🇲", "japan": "🇯🇵", "jordan": "🇯🇴",
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
    bot.sendMessage(chatId, `Welcome! 👋 @${username || 'User'}\n\nClick the Get Number button to receive your number!`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Get Number", callback_data: "menu_get_number" }, { text: "💰 Balance", callback_data: "menu_balance" }],
                [{ text: "📱 Active Number", callback_data: "menu_active" }, { text: "💸 Withdraw", callback_data: "menu_withdraw" }],
                [{ text: "🤖 Bot Update Channel", url: config.updateGroup }]
            ]
        }
    });
};

const sendAdminPanel = (chatId) => {
    bot.sendMessage(chatId, "🛠 **Admin Control Panel**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 View Users", callback_data: "admin_view_users" }, { text: "📢 Broadcast", callback_data: "admin_broadcast" }],
                [{ text: "➕ Add Service", callback_data: "admin_add_service" }, { text: "💰 Add Rate", callback_data: "admin_add_rate" }],
                [{ text: "📊 Check Nexa Range", callback_data: "admin_check_range" }, { text: "🗑 Delete Range", callback_data: "admin_del_num" }],
                [{ text: "✅ Withdraw ON", callback_data: "admin_withdraw_on" }, { text: "❌ Withdraw OFF", callback_data: "admin_withdraw_off" }],
                [{ text: "🚫 Ban User", callback_data: "admin_ban_user" }, { text: "✅ Unban User", callback_data: "admin_unban_user" }],
                [{ text: "⚙️ Group Settings", callback_data: "admin_group_settings" }],
                [{ text: "🔘 Edit OTP Button", callback_data: "admin_otp_btn_settings" }],
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

        if (users[userId]?.isBanned && userId !== ADMIN_ID) {
            return bot.sendMessage(chatId, "🚫 **You are banned.**");
        }

        if (data === "check_join") {
            const joined = await checkJoin(userId);
            if (joined) {
                if (!users[userId]) users[userId] = { balance: 0, username: query.from.username || 'User', isBanned: false };
                await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
                return sendMainMenu(chatId, query.from.username);
            } else {
                return bot.answerCallbackQuery(query.id, { text: "❌ Join both channels first!", show_alert: true });
            }
        }

        const isJoined = await checkJoin(userId);
        if (!isJoined && userId !== ADMIN_ID) {
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
        else if (data === "admin_ban_user") {
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'banning_user';
            bot.sendMessage(chatId, "🚫 Send the **User ID** you want to **Ban**:");
        }
        else if (data === "admin_unban_user") {
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'unbanning_user';
            bot.sendMessage(chatId, "✅ Send the **User ID** you want to **Unban**:");
        }
        else if (data === "admin_check_range") {
            if (userId !== ADMIN_ID) return;
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
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'deleting_range';
            bot.sendMessage(chatId, "🗑 Please send: `ServiceName RangePattern` \nExample: `telegram 992`", { parse_mode: "Markdown" });
        }
        else if (data === "admin_add_service") {
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'adding_service';
            bot.sendMessage(chatId, "➕ Please send the **Name** of the service (e.g., Telegram):");
        }
        else if (data === "admin_add_rate") {
            if (userId !== ADMIN_ID) return;
            adminActionState[userId] = 'adding_rate';
            bot.sendMessage(chatId, "💰 Please send: `ServiceName RangePattern Rate` \nExample: `fb 2376211XXX 0.05`", { parse_mode: "Markdown" });
        }
        else if (data === "admin_otp_btn_settings") {
            if (userId !== ADMIN_ID) return;
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
            if (userId !== ADMIN_ID) return;
            groupSettingState[userId] = data;
            bot.sendMessage(chatId, `Please send the new value for: ${data.replace('set_', '').replace(/_/g, ' ').toUpperCase()}`);
        }
        else if (data === "admin_view_users") {
            if (userId !== ADMIN_ID) return;
            const ids = Object.keys(users);
            let list = `📊 **Total Users:** ${ids.length}\n\n`;
            ids.slice(0, 20).forEach((id, i) => {
                list += `${i+1}. @${users[id].username} | \`${id}\` | $${users[id].balance.toFixed(2)} ${users[id].isBanned ? '(BANNED)' : ''}\n`;
            });
            bot.sendMessage(chatId, list, { parse_mode: "Markdown" });
        }
        else if (data === "admin_broadcast") {
            if (userId !== ADMIN_ID) return;
            broadcastState[userId] = true;
            bot.sendMessage(chatId, "📢 Send message for broadcast:");
        }
        else if (data === "admin_withdraw_on") {
            if (userId !== ADMIN_ID) return;
            isWithdrawActive = true;
            bot.sendMessage(chatId, "✅ Withdrawal system is now ON.");
        }
        else if (data === "admin_withdraw_off") {
            if (userId !== ADMIN_ID) return;
            isWithdrawActive = false;
            bot.sendMessage(chatId, "❌ Withdrawal system is now OFF.");
        }
        else if (data === "admin_group_settings") {
            if (userId !== ADMIN_ID) return;
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
            if (userId !== ADMIN_ID) return;
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            sendAdminPanel(chatId);
        }
        else if (["set_otp_link", "set_update_link", "set_otp_user", "set_update_user", "set_otp_btn_name", "set_update_btn_name"].includes(data)) {
            if (userId !== ADMIN_ID) return;
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
            try {
                // Animation - Initial status
                let loadingText = "Getting Number.";
                await bot.editMessageText(`⏳ **${loadingText}**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" });
                
                let animationInterval = setInterval(() => {
                    if (loadingText === "Getting Number....") loadingText = "Getting Number.";
                    else loadingText += ".";
                    bot.editMessageText(`⏳ **${loadingText}**`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" }).catch(() => {});
                }, 800);

                const response = await axios.post(`${NEXA_BASE_URL}numbers/get?api_key=${NEXA_API_KEY}`, {
                    range: rangePattern,
                    format: "normal"
                });

                clearInterval(animationInterval);

                if (response.data && response.data.success) {
                    const numData = {
                        service: sName,
                        range: rangePattern,
                        number: response.data.number,
                        number_id: response.data.number_id,
                        userId: userId,
                        messageId: query.message.message_id
                    };
                    
                    assignedNumbers.push(numData);

                    bot.editMessageText(`✅ *Number Assigned!* \n\n📱 *${sName}* | \`+${numData.number}\` \n\n⏳ Waiting for OTP...`, {
                        chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                        reply_markup: { inline_keyboard: [[{ text: "🗑 Delete Number", callback_data: `del_${numData.number}` }], [{ text: "📱 OTP GROUP HERE", url: config.otpGroup }]] }
                    });

                    let checkOTP = setInterval(async () => {
                        try {
                            const otpRes = await axios.get(`${NEXA_BASE_URL}numbers/${numData.number_id}/sms?api_key=${NEXA_API_KEY}`);
                            if (otpRes.data && otpRes.data.success && otpRes.data.otp) {
                                clearInterval(checkOTP);
                                const reward = services[sName]?.rates[rangePattern] || 0.0030;
                                users[userId].balance += reward;
                                
                                bot.deleteMessage(chatId, numData.messageId).catch(() => {});
                                
                                const rawNum = numData.number.toString();
                                let maskedNum;
                                if (rawNum.length > 8) {
                                    maskedNum = rawNum.substring(0, 4) + "...." + rawNum.substring(rawNum.length - 4);
                                } else {
                                    maskedNum = "...." + rawNum.substring(rawNum.length - 2);
                                }

                                const groupMsg = `🔔 **OTP ARRIVED SUCCESS**\n\n📱 **SERVICE:** ${sName.toUpperCase()}\n🔢 **NUMBER:** \`+${maskedNum}\`\n💬 **OTP:** \`${otpRes.data.otp}\`\n💰 **REWARD:** $${reward.toFixed(4)}`;
                                
                                bot.sendMessage(userId, `🔔 **OTP RECEIVED!**\n🔢 Number: \`+${numData.number}\`\n💬 OTP: \`${otpRes.data.otp}\`\n💰 Earned: $${reward.toFixed(4)}`, { parse_mode: "Markdown" });
                                
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
                } else {
                    bot.editMessageText("⚠️ Number Request Failed! Please try again.", { chat_id: chatId, message_id: query.message.message_id });
                }
            } catch (error) {
                bot.answerCallbackQuery(query.id, { text: "❌ Connection Error!", show_alert: true });
            }
        }
        else if (data === "transfer_bal") {
            transferStates[userId] = { step: 1 };
            bot.editMessageText("💸 **Transfer Balance**\n\n🆔 Please enter the **Recipient ID**:", {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "main_menu" }]] }
            });
        }
        else if (data === "withdraw_now") {
            const user = users[userId] || { balance: 0 };
            if (user.balance < 1.0000) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Not enough balance! Minimum $1.0000", show_alert: true });
            }
            withdrawStates[userId] = { step: 1 };
            bot.editMessageText(`🏦 *Withdrawal*\n\n💳 Please enter your *Binance UID*:`, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "main_menu" }]] }
            });
        }
        else if (data === "confirm_transfer") {
            const state = transferStates[userId];
            if (state && users[userId].balance >= state.amount) {
                users[userId].balance -= state.amount;
                if (!users[state.targetId]) users[state.targetId] = { balance: 0, username: 'User', isBanned: false };
                users[state.targetId].balance += state.amount;
                bot.editMessageText(`✅ **Transfer Successful!**\n\n💵 Amount: $${state.amount.toFixed(4)}\n🆔 To: \`${state.targetId}\``, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] }
                });
                bot.sendMessage(state.targetId, `💰 **You received $${state.amount.toFixed(4)} from \`${userId}\`!**`, { parse_mode: "Markdown" }).catch(() => {});
            }
            delete transferStates[userId];
        }
        else if (data === "confirm_withdraw") {
            const state = withdrawStates[userId];
            if (state && users[userId].balance >= state.amount) {
                users[userId].balance -= state.amount;
                bot.editMessageText(`✅ **Request Sent!**\n\n💵 Amount: $${state.amount.toFixed(4)}\n🆔 UID: \`${state.binanceId}\``, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] }
                });
                bot.sendMessage(ADMIN_ID, `🚨 **WITHDRAW REQUEST**\n👤 User: \`${userId}\`\n🆔 UID: \`${state.binanceId}\`\n💰 Amt: $${state.amount.toFixed(4)}`, { parse_mode: "Markdown" }).catch(() => {});
            }
            delete withdrawStates[userId];
        }
        else if (data.startsWith("del_")) {
            const num = data.replace("del_", ""); 
            const idx = assignedNumbers.findIndex(n => n.number === num && n.userId === userId);
            if (idx !== -1) {
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
    const msgText = msg.text || "";
    const userId = msg.from?.id;
    if (!userId) return;

    if (!users[userId]) users[userId] = { balance: 0, username: msg.from.username || 'User', isBanned: false };
    else users[userId].username = msg.from.username || 'User';

    if (users[userId].isBanned && userId !== ADMIN_ID) {
        return; // Silent ignore for banned users
    }

    if (chatId === ADMIN_ID && adminActionState[userId]) {
        const action = adminActionState[userId];
        if (action === 'banning_user') {
            const targetId = msgText.trim();
            if (users[targetId]) {
                users[targetId].isBanned = true;
                bot.sendMessage(chatId, `✅ User \`${targetId}\` has been **Banned**.`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ User not found in database.");
            }
            delete adminActionState[userId];
            return;
        }
        if (action === 'unbanning_user') {
            const targetId = msgText.trim();
            if (users[targetId]) {
                users[targetId].isBanned = false;
                bot.sendMessage(chatId, `✅ User \`${targetId}\` has been **Unbanned**.`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ User not found in database.");
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
        if (action === 'adding_rate') {
            const parts = msgText.split(' ');
            if (parts.length >= 3) {
                const rate = parseFloat(parts.pop());
                const sName = parts[0];
                const pattern = parts.slice(1).join(' ');
                if (services[sName]) {
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
                const s = parts[0].toLowerCase(), c = parts.slice(1).join(' ').toLowerCase();
                if (services[parts[0]]) {
                    services[parts[0]].countries = services[parts[0]].countries.filter(p => p.toLowerCase() !== c);
                    delete services[parts[0]].rates[parts.slice(1).join(' ')];
                    bot.sendMessage(chatId, `🗑 Deleted range **${c}** from **${parts[0]}**.`, { parse_mode: "Markdown" });
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

    if (chatId === ADMIN_ID && broadcastState[userId]) {
        const userList = Object.keys(users);
        let success = 0;
        for (const id of userList) {
            try { await bot.copyMessage(id, chatId, msg.message_id); success++; } catch (e) {}
        }
        delete broadcastState[userId];
        return bot.sendMessage(chatId, `✅ Broadcast Complete!\n📊 Total Sent: ${success}`);
    }

    if (chatId === ADMIN_ID && groupSettingState[userId]) {
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

    if (chatId === ADMIN_ID) {
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

    if (msgText === '/start') {
        if (!(await checkJoin(userId)) && userId !== ADMIN_ID) return sendJoinMessage(chatId);
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
