const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error("BOT_TOKEN is missing");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log("🎱 BigBoss Bingo Bot is running...");

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Player";

  bot.sendMessage(
    chatId,
    `🎱 Welcome to BigBoss Bingo, ${firstName}!\n\n` +
      `Ready to play Bingo?`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎮 Join Game", callback_data: "join_game" }],
          [
            { text: "🃏 My Card", callback_data: "my_card" },
            { text: "💰 Wallet", callback_data: "wallet" }
          ],
          [{ text: "🏆 My Results", callback_data: "results" }]
        ]
      }
    }
  );
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  await bot.answerCallbackQuery(query.id);

  if (action === "join_game") {
    bot.sendMessage(
      chatId,
      "🎮 Game joining will be available soon.\n\n" +
        "Please wait for the admin to open a Bingo game."
    );
  }

  if (action === "my_card") {
    bot.sendMessage(
      chatId,
      "🃏 You don't have a Bingo card yet.\n\n" +
        "Join an active game first."
    );
  }

  if (action === "wallet") {
    bot.sendMessage(
      chatId,
      "💰 Wallet\n\nBalance: 0.00"
    );
  }

  if (action === "results") {
    bot.sendMessage(
      chatId,
      "🏆 My Results\n\nNo games played yet."
    );
  }
});

bot.on("polling_error", (error) => {
  console.error("Telegram polling error:", error.message);
});
