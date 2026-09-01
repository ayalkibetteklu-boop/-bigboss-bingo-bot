const TelegramBot = require("node-telegram-bot-api");
const http = require("http");
const { createClient } = require("@supabase/supabase-js");

const token = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token) {
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Supabase environment variables are missing");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

const bot = new TelegramBot(token, {
  polling: true
});

// ================================
// RENDER SERVER
// ================================

const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("🎱 BigBoss Bingo Bot is running!");
}).listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

console.log("🎱 BigBoss Bingo Bot is running...");

// ================================
// PLAYER REGISTRATION
// ================================

async function registerPlayer(msg) {
  const telegramId = String(msg.from.id);
  const username = msg.from.username || null;
  const firstName = msg.from.first_name || "Player";

  const { data: existingPlayer, error: findError } =
    await supabase
      .from("players")
      .select("*")
      .eq("telegram_id", telegramId)
      .maybeSingle();

  if (findError) {
    console.error("Player lookup error:", findError);
    return null;
  }

  if (existingPlayer) {
    return existingPlayer;
  }

  const { data: newPlayer, error: insertError } =
    await supabase
      .from("players")
      .insert({
        telegram_id: telegramId,
        username: username,
        first_name: firstName
      })
      .select()
      .single();

  if (insertError) {
    console.error("Player registration error:", insertError);
    return null;
  }

  // Create wallet
  await supabase
    .from("wallets")
    .insert({
      player_id: newPlayer.id,
      balance: 0
    });

  return newPlayer;
}

// ================================
// START
// ================================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Player";

  await registerPlayer(msg);

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
// MY ID
// ================================

bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `🆔 Your Telegram ID is:\n\n\`${msg.from.id}\``,
    {
      parse_mode: "Markdown"
    }
  );
});

// ================================
// ADMIN PANEL
// ================================

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;

  if (
    !ADMIN_ID ||
    String(msg.from.id) !== String(ADMIN_ID)
  ) {
    await bot.sendMessage(
      chatId,
      "⛔ You are not authorized to access the Admin Panel."
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    `👑 *AYU BINGO ADMIN CONTROL CENTER*\n\nChoose an action:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "➕ Create Game",
              callback_data: "admin_create_game"
            }
          ],
          [
            {
              text: "▶️ Start Game",
              callback_data: "admin_start_game"
            },
            {
              text: "⏸️ Pause",
              callback_data: "admin_pause_game"
            }
          ],
          [
            {
              text: "🔢 Call Number",
              callback_data: "admin_call_number"
            }
          ],
          [
            {
              text: "👥 Players",
              callback_data: "admin_players"
            },
            {
              text: "🏆 Winners",
              callback_data: "admin_winners"
            }
          ],
          [
            {
              text: "🛑 End Game",
              callback_data: "admin_end_game"
            }
          ]
        ]
      }
    }
  );
});

// ================================
// CALLBACK BUTTONS
// ================================

bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    const action = query.data;

    await bot.answerCallbackQuery(query.id);

    // ============================
    // PLAYER - JOIN GAME
    // ============================

    if (action === "join_game") {
      const player = await registerPlayer(query);

      if (!player) {
        await bot.sendMessage(
          chatId,
          "❌ Could not register player."
        );
        return;
      }

      const { data: games, error } =
        await supabase
          .from("games")
          .select("*")
          .in("status", ["waiting", "active"])
          .order("id", { ascending: false })
          .limit(1);

      if (error) {
        console.error(error);

        await bot.sendMessage(
          chatId,
          "❌ Could not load games."
        );
        return;
      }

      if (!games || games.length === 0) {
        await bot.sendMessage(
          chatId,
          "🎮 *Join Bingo Game*\n\nThere is currently no active game.",
          {
            parse_mode: "Markdown"
          }
        );
        return;
      }

      const game = games[0];

      await bot.sendMessage(
        chatId,
        `🎮 *Available Game*\n\n` +
        `🆔 Game: ${game.id}\n` +
        `📌 Status: ${game.status}\n` +
        `💰 Entry Fee: ${game.entry_fee || 0}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Join",
                  callback_data: `join_${game.id}`
                }
              ]
            ]
          }
        }
      );

      return;
    }

    // ============================
    // ACTUAL JOIN
    // ============================

    if (action.startsWith("join_")) {
      const gameId = action.replace("join_", "");

      const player = await registerPlayer(query);

      if (!player) {
        await bot.sendMessage(
          chatId,
          "❌ Player registration failed."
        );
        return;
      }

      const { data: existing } =
        await supabase
          .from("game_players")
          .select("*")
          .eq("game_id", gameId)
          .eq("player_id", player.id)
          .maybeSingle();

      if (existing) {
        await bot.sendMessage(
          chatId,
          "ℹ️ You already joined this game."
        );
        return;
      }

      const { error } =
        await supabase
          .from("game_players")
          .insert({
            game_id: gameId,
            player_id: player.id
          });

      if (error) {
        console.error("Join error:", error);

        await bot.sendMessage(
          chatId,
          "❌ Could not join the game."
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        "✅ *You joined the Bingo game!*\n\n🃏 Your card will be generated next.",
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // MY CARD
    // ============================

    if (action === "my_card") {
      const player = await registerPlayer(query);

      if (!player) return;

      const { data: card } =
        await supabase
          .from("cards")
          .select("*")
          .eq("player_id", player.id)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (!card) {
        await bot.sendMessage(
          chatId,
          "🃏 You don't have a Bingo card yet.\n\nJoin an active game first."
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        `🃏 *Your Bingo Card*\n\n${JSON.stringify(
          card.card_data,
          null,
          2
        )}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // WALLET
    // ============================

    if (action === "wallet") {
      const player = await registerPlayer(query);

      if (!player) return;

      const { data: wallet } =
        await supabase
          .from("wallets")
          .select("*")
          .eq("player_id", player.id)
          .maybeSingle();

      const balance = wallet
        ? wallet.balance
        : 0;

      await bot.sendMessage(
        chatId,
        `💰 *My Wallet*\n\nBalance: ${balance}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // RESULTS
    // ============================

    if (action === "results") {
      const player = await registerPlayer(query);

      if (!player) return;

      const { data: winners } =
        await supabase
          .from("winners")
          .select("*")
          .eq("player_id", player.id)
          .order("id", { ascending: false });

      if (!winners || winners.length === 0) {
        await bot.sendMessage(
          chatId,
          "🏆 *My Results*\n\nNo games won yet.",
          {
            parse_mode: "Markdown"
          }
        );
        return;
      }

      let text = "🏆 *My Results*\n\n";

      winners.forEach((winner, index) => {
        text += `${index + 1}. Game #${winner.game_id}\n`;
      });

      await bot.sendMessage(
        chatId,
        text,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // ADMIN SECURITY
    // ============================

    if (
      action.startsWith("admin_") &&
      (
        !ADMIN_ID ||
        String(query.from.id) !== String(ADMIN_ID)
      )
    ) {
      await bot.sendMessage(
        chatId,
        "⛔ Admin access denied."
      );
      return;
    }

    // ============================
    // CREATE GAME
    // ============================

    if (action === "admin_create_game") {
      const { data: game, error } =
        await supabase
          .from("games")
          .insert({
            status: "waiting",
            entry_fee: 0
          })
          .select()
          .single();

      if (error) {
        console.error("Create game error:", error);

        await bot.sendMessage(
          chatId,
          `❌ Could not create game.\n\n${error.message}`
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        `✅ *Game Created Successfully!*\n\n` +
        `🆔 Game ID: ${game.id}\n` +
        `📌 Status: ${game.status}\n` +
        `💰 Entry Fee: ${game.entry_fee}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // START GAME
    // ============================

    if (action === "admin_start_game") {
      const { data: game } =
        await supabase
          .from("games")
          .select("*")
          .eq("status", "waiting")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (!game) {
        await bot.sendMessage(
          chatId,
          "❌ No waiting game found."
        );
        return;
      }

      const { error } =
        await supabase
          .from("games")
          .update({
            status: "active"
          })
          .eq("id", game.id);

      if (error) {
        await bot.sendMessage(
          chatId,
          "❌ Could not start game."
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        `▶️ *Game Started!*\n\n🆔 Game ID: ${game.id}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // PAUSE GAME
    // ============================

    if (action === "admin_pause_game") {
      const { data: game } =
        await supabase
          .from("games")
          .select("*")
          .eq("status", "active")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (!game) {
        await bot.sendMessage(
          chatId,
          "❌ No active game found."
        );
        return;
      }

      await supabase
        .from("games")
        .update({
          status: "paused"
        })
        .eq("id", game.id);

      await bot.sendMessage(
        chatId,
        "⏸️ *Game Paused*",
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // CALL NUMBER
    // ============================

    if (action === "admin_call_number") {
      await bot.sendMessage(
        chatId,
        "🔢 Number calling system is the next step."
      );
      return;
    }

    // ============================
    // PLAYERS
    // ============================

    if (action === "admin_players") {
      const { count } =
        await supabase
          .from("players")
          .select("*", {
            count: "exact",
            head: true
          });

      await bot.sendMessage(
        chatId,
        `👥 *Players*\n\nTotal registered players: ${count || 0}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // WINNERS
    // ============================

    if (action === "admin_winners") {
      const { count } =
        await supabase
          .from("winners")
          .select("*", {
            count: "exact",
            head: true
          });

      await bot.sendMessage(
        chatId,
        `🏆 *Winners*\n\nTotal winners: ${count || 0}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ============================
    // END GAME
    // ============================

    if (action === "admin_end_game") {
      const { data: game } =
        await supabase
          .from("games")
          .select("*")
          .in("status", ["waiting", "active", "paused"])
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (!game) {
        await bot.sendMessage(
          chatId,
          "❌ No game found."
        );
        return;
      }

      await supabase
        .from("games")
        .update({
          status: "ended"
        })
        .eq("id", game.id);

      await bot.sendMessage(
        chatId,
        `🛑 *Game Ended*\n\nGame #${game.id}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

  } catch (error) {
    console.error("❌ Callback error:", error);

    try {
      await bot.sendMessage(
        query.message.chat.id,
        "❌ Something went wrong. Please try again."
      );
    } catch {}
  }
});

// ================================
// ERRORS
// ================================

bot.on("polling_error", (error) => {
  console.error(
    "❌ Telegram polling error:",
    error.message
  );
});

process.on("uncaughtException", (error) => {
  console.error(
    "❌ Unexpected error:",
    error
  );
});

process.on("unhandledRejection", (error) => {
  console.error(
    "❌ Unhandled rejection:",
    error
  );
});
