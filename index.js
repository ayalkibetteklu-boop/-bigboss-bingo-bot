const TelegramBot = require("node-telegram-bot-api");
const http = require("http");

const token = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!token) {
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

const bot = new TelegramBot(token, {
  polling: true
});

// Render web server
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("🎱 BigBoss Bingo Bot is running!");
}).listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

console.log("🎱 BigBoss Bingo Bot is running...");

// ================================
// START
// ================================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Player";

  await bot.sendMessage(
    chatId,
    `🎱 *Welcome to BigBoss Bingo!*\n\n` +
    `Hello ${firstName} 👋\n\n` +
    `Choose an option below:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎮 Join Game", callback_data: "join_game" }
          ],
          [
            { text: "🃏 My Card", callback_data: "my_card" },
            { text: "💰 Wallet", callback_data: "wallet" }
          ],
          [
            { text: "🏆 My Results", callback_data: "results" }
          ]
        ]
      }
    }
  );
});

// ================================
// MY ID
// ================================

bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `🆔 Your Telegram ID is:\n\n\`${msg.from.id}\``,
    { parse_mode: "Markdown" }
  );
});

// ================================
// ADMIN PANEL
// ================================

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;

  if (!ADMIN_ID || String(msg.from.id) !== String(ADMIN_ID)) {
    await bot.sendMessage(
      chatId,
      "⛔ You are not authorized to access the Admin Panel."
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    `👑 *AYU BINGO ADMIN CONTROL CENTER*\n\n` +
    `Choose an action:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "➕ Create Game", callback_data: "admin_create_game" }
          ],
          [
            { text: "▶️ Start Game", callback_data: "admin_start_game" },
            { text: "⏸️ Pause", callback_data: "admin_pause_game" }
          ],
          [
            { text: "🔢 Call Number", callback_data: "admin_call_number" }
          ],
          [
            { text: "👥 Players", callback_data: "admin_players" },
            { text: "🏆 Winners", callback_data: "admin_winners" }
          ],
          [
            { text: "🛑 End Game", callback_data: "admin_end_game" }
          ]
        ]
      }
    }
  );
});

// ================================
// BUTTON ACTIONS
// ================================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  await bot.answerCallbackQuery(query.id);

  // ----------------------------
  // PLAYER
  // ----------------------------

  if (action === "join_game") {
    await bot.sendMessage(
      chatId,
      "🎮 *Join Bingo Game*\n\nThere is currently no active game.",
      { parse_mode: "Markdown" }
    );
  }

  if (action === "my_card") {
    await bot.sendMessage(
      chatId,
      "🃏 You don't have a Bingo card yet.\n\nJoin an active game first."
    );
  }

  if (action === "wallet") {
    await bot.sendMessage(
      chatId,
      "💰 *My Wallet*\n\nBalance: 0.00",
      { parse_mode: "Markdown" }
    );
  }

  if (action === "results") {
    await bot.sendMessage(
      chatId,
      "🏆 *My Results*\n\nNo games played yet.",
      { parse_mode: "Markdown" }
    );
  }

  // ----------------------------
  // ADMIN SECURITY
  // ----------------------------

  if (
    action.startsWith("admin_") &&
    (!ADMIN_ID || String(query.from.id) !== String(ADMIN_ID))
  ) {
    await bot.sendMessage(
      chatId,
      "⛔ Admin access denied."
    );
    return;
  }

  // ----------------------------
  // ADMIN ACTIONS
  // ----------------------------

  if (action === "admin_create_game") {
    await bot.sendMessage(
      chatId,
      "➕ *Create Game*\n\nGame creation system is ready to be connected to the database.",
      { parse_mode: "Markdown" }
    );
  }

  if (action === "admin_start_game") {
    await bot.sendMessage(
      chatId,
      "▶️ *Start Game*\n\nGame start system is ready.",
      { parse_mode: "Markdown" }
    );
  }

  if (action === "admin_pause_game") {
    await bot.sendMessage(
      chatId,
      "⏸️ *Game Paused*",
      { parse_mode: "Markdown" }
    );
  }

  if (action === "admin_call_number") {
    await bot.sendMessage(
      chatId,
      "🔢 *Call Number*\n\nNumber calling system will be connected next.",
      { parse_mode: "Markdown" }
    );
  }

  if (action === "admin_players") {
    await bot.sendMessage(
      chatId,
      "👥 *Players*\n\nPlayer management will be connected to Supabase next.",
      { parse_mode: "Markdown" }
    );
  }

  if (action === "admin_winners") {
    await bot.sendMessage(
      chatId,
      "🏆 *Winners*\n\nWinner verification system will be connected next.",
      { parse_mode: "Markdown" }
    );
  }

  if (action === "admin_end_game") {
    await bot.sendMessage(
      chatId,
      "🛑 *Game Ended*",
      { parse_mode: "Markdown" }
    );
  }
});

// ================================
// ERRORS
// ================================

bot.on("polling_error", (error) => {
  console.error("❌ Telegram polling error:", error.message);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Unexpected error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled rejection:", error);
});
