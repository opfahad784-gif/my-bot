const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const express = require('express');
const app = express();

// ==========================================
// ১. RENDER PORT FIX (সার্ভার ২৪ ঘণ্টা লাইভ রাখার জন্য)
// ==========================================
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('OTP Forwarder UserBot is Running Fine!'));
app.listen(PORT, () => console.log(`[Render] UserBot web server live on port ${PORT}`));

// ==========================================
// ২. USERBOT CONFIGURATION
// ==========================================
const apiId = 35598399; // আপনার API ID
const apiHash = "681450d8fed29608b00489ac80f7fdb2"; // আপনার দেওয়া আসল সঠিক API Hash
const TARGET_GROUP_ID = "-1003962635987"; // আপনার ওটিপি মেইন গ্রুপের আইডি

// 🎯 আপনার জেনারেট করা সেশন স্ট্রিংটি এখানে পারফেক্টলি বসিয়ে দেওয়া হয়েছে
const userbotSession = new StringSession("1BVtsOJUBu09deEtZA6c7b71MlhqogENxXFZTTtVDesy4n3P1s0bOsgp-hhLQLA5F_ZxzOS6bsM7UfikYJe4Vu7LmETghtXBguK-QcNevaHLxysJ5yhK1sxIKVMjmFOrfagKfx0cCk-IPnWBQwcroXp-JjtKeIzI6jxOI3zVVaYlQ3ZH-00yBmfF5J2PMJDLupL-DibmQWh4xq48Thf0hiZWuZK2tZWD4dQQvaYnYbxE9QigCn8ww6N4ILwATGc0Yt-6uwgGpPoeM1EOkWMaQq1rVnE9xY1x35uu3j11-kBeybLm7CanhO5W8saNBIi-pvbXPNjEfwNeqSnAaq4hQItHFucIlKJU="); 

const userbot = new TelegramClient(userbotSession, apiId, apiHash, {
  connectionRetries: 5,
});

async function startUserBot() {
  console.log("⚡ UserBot ব্যাকগ্রাউন্ডে কানেক্ট হওয়ার চেষ্টা করছে...");
  await userbot.connect();
  console.log("🎯 UserBot সফলভাবে অনলাইন হয়েছে এবং ফরওয়ার্ড করার জন্য প্রস্তুত!");

  // মেসেজ ডিটেকশন ও ফরওয়ার্ড লজিক
  userbot.addEventHandler(async (event) => {
    const message = event.message;
    
    if (message && message.message) {
      const msgText = message.message;

      // লজিক ১: FLEXI SMS বটের ইনবক্স/চ্যানেল থেকে কোনো টেক্সট আসলে তা মেইন গ্রুপে পাঠাবে
      if (String(message.chatId).includes("FLEXI SMS") || String(message.chat?.title).includes("FLEXI SMS")) {
        console.log("📥 FLEXI SMS থেকে নতুন ওটিপি এসেছে! গ্রুপে ফরোয়ার্ড করা হচ্ছে...");
        await userbot.sendMessage(TARGET_GROUP_ID, { message: msgText });
      }

      // লজিক ২: গ্রুপে ওটিপি আসামাত্র ইউজারবট নিজে ওটা সাথে সাথে আরেকবার রিপিট (ডাবল মেসেজ) করবে
      if (String(message.chatId) === String(TARGET_GROUP_ID)) {
        const me = await userbot.getMe();
        
        // বট যাতে নিজের পাঠানো মেসেজ নিজেই বারবার রিপিট করে লুপ না লাগায়, তার চেক
        if (message.senderId && String(message.senderId) !== String(me.id)) {
          if (msgText.includes("OTP") || msgText.includes("verification code") || msgText.includes("FLEXI")) {
            console.log("🔄 একই গ্রুপে মেসেজ সাথে সাথে রিপিট করা হচ্ছে...");
            await userbot.sendMessage(TARGET_GROUP_ID, { message: msgText });
          }
        }
      }
    }
  });
}

// ইউজারবট চালু করা
startUserBot().catch(console.error);
