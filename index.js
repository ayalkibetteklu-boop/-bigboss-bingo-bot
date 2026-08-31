const TelegramBot = require("node-telegram-bot-api");
const http = require("http");

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

// Telegram Bot
const bot = new TelegramBot(token, {
  polling: true
});

console.log("🎱 BigBoss Bingo Bot is running...");

// Simple web server for Render
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("🎱 BigBoss Bingo Bot is running!");
});

server.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ================================
// /start
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
            {
              text: "🎮 Join Game",
              callback_data: "join_game"
            }
          ],
          [
            {
              text: "🃏 My Card",
              callback_data: "my_card"
            },
            {
              text: "💰 Wallet",
              callback_data: "wallet"
            }
          ],
          [
            {
              text: "🏆 My Results",
              callback_data: "results"
            }
          ]
        ]
      }
    }
  );
});

// ================================
// Button Actions
// ================================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  await bot.answerCallbackQuery(query.id);

  // Join Game
  if (action === "join_game") {
    await bot.sendMessage(
      chatId,
      `🎮 *Join Bingo Game*\n\n` +
      `There is currently no active game.\n\n` +
      `Please wait for the admin to open a game.`,
      {
        parse_mode: "Markdown"
      }
    );
  }

  // My Card
  if (action === "my_card") {
    await bot.sendMessage(
      chatId,
      `🃏 *My Bingo Card*\n\n` +
      `You don't have a Bingo card yet.\n\n` +
      `Join an active game first.`,
      {
        parse_mode: "Markdown"
      }
    );
  }

  // Wallet
  if (action === "wallet") {
    await bot.sendMessage(
      chatId,
      `💰 *My Wallet*\n\n` +
      `Balance: 0.00\n\n` +
      `Wallet system will be connected later.`,
      {
        parse_mode: "Markdown"
      }
    );
  }

  // Results
  if (action === "results") {
    await bot.sendMessage(
      chatId,
      `🏆 *My Results*\n\n` +
      `No games played yet.`,
      {
        parse_mode: "Markdown"
      }
    );
  }
});

// ================================
// Errors
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
