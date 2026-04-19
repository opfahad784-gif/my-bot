import telebot
from telebot import types
import sqlite3
import http.server
import socketserver
import threading
import os

# --- Configuration ---
API_TOKEN = '8749050433:AAFaZx9Sd1ZAke9MWjxHYoVrnoo8BKzS27c'
ADMIN_ID = 7488161246
OTP_GROUP_ID = -1003958220896
bot = telebot.TeleBot(API_TOKEN)

# --- Database Setup ---
def init_db():
    conn = sqlite3.connect('bot_data.db', check_same_thread=False)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users (uid INTEGER PRIMARY KEY, balance REAL DEFAULT 0.0)''')
    c.execute('''CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS numbers (phone TEXT PRIMARY KEY, service TEXT, country TEXT, price REAL)''')
    c.execute("INSERT OR IGNORE INTO settings VALUES ('group_link', 'https://t.me/yoosms_otp')")
    c.execute("INSERT OR IGNORE INTO settings VALUES ('channel_link', 'https://t.me/your_channel')")
    c.execute("INSERT OR IGNORE INTO settings VALUES ('support_link', 'https://t.me/your_support')")
    conn.commit()
    return conn

db_conn = init_db()

# Assignment tracking
active_assignments = {} # {phone: {"uid": 123, "service": "FB", "price": 0.003}}

# --- Helper Functions ---
def get_setting(key):
    res = db_conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return res[0] if res else ""

def get_user_balance(uid):
    res = db_conn.execute("SELECT balance FROM users WHERE uid=?", (uid,)).fetchone()
    if not res:
        db_conn.execute("INSERT INTO users (uid, balance) VALUES (?, 0.0)", (uid,))
        db_conn.commit()
        return 0.0
    return res[0]

# --- UI Layout ---
def main_menu(uid):
    bal = get_user_balance(uid)
    markup = types.InlineKeyboardMarkup(row_width=2)
    markup.add(
        types.InlineKeyboardButton("📱 Get Number", callback_data="get_num"),
        types.InlineKeyboardButton("💰 Balance", callback_data="bal"),
        types.InlineKeyboardButton("📊 Active Number", callback_data="active"),
        types.InlineKeyboardButton("💸 Withdraw", callback_data="withdraw")
    )
    markup.add(types.InlineKeyboardButton("🤖 Bot Update Channel ↗️", url=get_setting('channel_link')))
    markup.add(types.InlineKeyboardButton("🎧 Support", url=get_setting('support_link')))
    return markup

# --- Handlers ---
@bot.message_handler(commands=['start'])
def start(message):
    uid = message.from_user.id
    bot.send_message(message.chat.id, f"Welcome! 🤖 @{message.from_user.username or 'User'}\n\nClick the Get Number button to receive your number!", reply_markup=main_menu(uid))

@bot.callback_query_handler(func=lambda call: True)
def callback_handler(call):
    uid = call.from_user.id
    
    if call.data == "bal":
        bal = get_user_balance(uid)
        bot.answer_callback_query(call.id, f"Balance: ${bal:.4f}", show_alert=True)
    
    elif call.data == "active":
        my_active = [f"📱 {v['service']}: {k}" for k, v in active_assignments.items() if v['uid'] == uid]
        msg = "📊 Active Numbers:\n\n" + "\n".join(my_active) if my_active else "No active numbers."
        bot.send_message(call.message.chat.id, msg)

    elif call.data == "get_num":
        markup = types.InlineKeyboardMarkup()
        # Fetch services from DB
        services = db_conn.execute("SELECT DISTINCT service FROM numbers").fetchall()
        for s in services:
            markup.add(types.InlineKeyboardButton(s[0], callback_data=f"srv_{s[0]}"))
        markup.add(types.InlineKeyboardButton("🏠 Main Menu", callback_data="home"))
        bot.edit_message_text("📂 Select Platform:", call.message.chat.id, call.message.id, reply_markup=markup)

    elif call.data == "home":
        bot.edit_message_text("Main Menu", call.message.chat.id, call.message.id, reply_markup=main_menu(uid))

# --- Admin Features ---
@bot.message_handler(commands=['bulk'])
def bulk_add(message):
    if message.from_user.id != ADMIN_ID: return
    try:
        lines = message.text.split('\n')
        info = lines[0].replace('/bulk ', '').split(',')
        service, country, price = info[0].strip(), info[1].strip(), float(info[2].strip())
        nums = lines[1:]
        for n in nums:
            if n.strip():
                db_conn.execute("INSERT OR REPLACE INTO numbers VALUES (?, ?, ?, ?)", (n.strip(), service, country, price))
        db_conn.commit()
        bot.reply_to(message, f"✅ Added {len(nums)} numbers for {service}.")
    except:
        bot.reply_to(message, "❌ Format: /bulk Service,Country,Price\nNumbers...")

@bot.message_handler(commands=['broadcast'])
def broadcast(message):
    if message.from_user.id != ADMIN_ID: return
    msg = message.text.replace('/broadcast ', '')
    users = db_conn.execute("SELECT uid FROM users").fetchall()
    for u in users:
        try: bot.send_message(u[0], f"📢 **Broadcast**\n\n{msg}", parse_mode='Markdown')
        except: pass

# --- OTP Capturing ---
@bot.message_handler(func=lambda m: m.chat.id == OTP_GROUP_ID)
def handle_otp(message):
    text = message.text or message.caption
    if not text: return
    for phone, data in active_assignments.items():
        if phone in text:
            bot.send_message(data['uid'], f"📩 **New OTP!**\n\n**Number:** {phone}\n**Message:**\n{text}")

# --- Render Web Server (Port Binding) ---
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Bot is Running")

def run_server():
    port = int(os.environ.get("PORT", 3000))
    with socketserver.TCPServer(("0.0.0.0", port), Handler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    threading.Thread(target=run_server, daemon=True).start()
    print("🚀 Bot Started...")
    bot.infinity_polling()
                         
