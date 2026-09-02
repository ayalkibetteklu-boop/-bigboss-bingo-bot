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

// ==================================================
// REGISTER PLAYER
// ==================================================

async function registerPlayer(user) {
  const telegramId = String(user.id);
  const username = user.username || null;
  const firstName = user.first_name || "Player";

  const { data: existing, error: findError } = await supabase
    .from("players")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (findError) {
    console.error("Player lookup error:", findError);
    return null;
  }

  if (existing) {
    return existing;
  }

  const { data: player, error } = await supabase
    .from("players")
    .insert({
      telegram_id: telegramId,
      username,
      first_name: firstName
    })
    .select()
    .single();

  if (error) {
    console.error("Player insert error:", error);
    return null;
  }

  await supabase
    .from("wallets")
    .insert({
      player_id: player.id,
      balance: 0
    });

  return player;
}

// ==================================================
// GENERATE BINGO CARD
// ==================================================

function generateBingoCard() {
  const columns = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75]
  ];

  const card = [];

  for (let row = 0; row < 5; row++) {
    card.push([]);

    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) {
        card[row].push("FREE");
        continue;
      }

      const [min, max] = columns[col];

      let number;

      do {
        number =
          Math.floor(Math.random() * (max - min + 1)) + min;
      } while (
        card.some(rowData => rowData.includes(number))
      );

      card[row].push(number);
    }
  }

  return card;
}

// ==================================================
// FORMAT BINGO NUMBER
// ==================================================

function getBingoLetter(number) {
  const n = Number(number);

  if (n >= 1 && n <= 15) return "B";
  if (n >= 16 && n <= 30) return "I";
  if (n >= 31 && n <= 45) return "N";
  if (n >= 46 && n <= 60) return "G";
  if (n >= 61 && n <= 75) return "O";

  return "?";
}

// ==================================================
// NORMALIZE CALLED NUMBERS
// ==================================================

function normalizeCalledNumbers(rows) {
  return new Set(
    (rows || [])
      .map(row => Number(row.number))
      .filter(number => Number.isInteger(number) && number >= 1 && number <= 75)
  );
}

// ==================================================
// CHECK BINGO
// ==================================================

function checkBingo(cardData, calledNumbers) {
  if (!Array.isArray(cardData) || cardData.length !== 5) {
    return false;
  }

  const called = calledNumbers instanceof Set
    ? calledNumbers
    : new Set(
        (calledNumbers || [])
          .map(number => Number(number))
          .filter(number => Number.isInteger(number))
      );

  const marked = cardData.map(row => {
    if (!Array.isArray(row) || row.length !== 5) {
      return [false, false, false, false, false];
    }

    return row.map(value => {
      if (String(value).toUpperCase() === "FREE") {
        return true;
      }

      const number = Number(value);

      return Number.isInteger(number) && called.has(number);
    });
  });

  // Rows
  for (let row = 0; row < 5; row++) {
    if (marked[row].every(Boolean)) {
      return true;
    }
  }

  // Columns
  for (let col = 0; col < 5; col++) {
    let complete = true;

    for (let row = 0; row < 5; row++) {
      if (!marked[row][col]) {
        complete = false;
        break;
      }
    }

    if (complete) {
      return true;
    }
  }

  // Main diagonal
  let diagonal1 = true;

  for (let i = 0; i < 5; i++) {
    if (!marked[i][i]) {
      diagonal1 = false;
      break;
    }
  }

  if (diagonal1) {
    return true;
  }

  // Second diagonal
  let diagonal2 = true;

  for (let i = 0; i < 5; i++) {
    if (!marked[i][4 - i]) {
      diagonal2 = false;
      break;
    }
  }

  return diagonal2;
}

// ==================================================
// MARK CARD FOR DISPLAY
// ==================================================

function formatCard(cardData, calledNumbers) {
  const called = calledNumbers instanceof Set
    ? calledNumbers
    : new Set(
        (calledNumbers || [])
          .map(number => Number(number))
          .filter(number => Number.isInteger(number))
      );

  return cardData
    .map(row => {
      return row
        .map(value => {
          if (String(value).toUpperCase() === "FREE") {
            return "🆓";
          }

          const number = Number(value);

          if (Number.isInteger(number) && called.has(number)) {
            return `✅${number}`;
          }

          return String(value);
        })
        .join(" | ");
    })
    .join("\n");
}

// ==================================================
// CHECK ALL PLAYERS FOR BINGO
// ==================================================

async function checkAllPlayersForBingo(gameId) {
  const { data: gamePlayers, error: playersError } = await supabase
    .from("game_players")
    .select("player_id")
    .eq("game_id", gameId);

  if (playersError) {
    console.error("Game players error:", playersError);
    return null;
  }

  if (!gamePlayers || gamePlayers.length === 0) {
    return null;
  }

  const { data: calledRows, error: calledError } = await supabase
    .from("called_numbers")
    .select("number")
    .eq("game_id", gameId);

  if (calledError) {
    console.error("Called numbers error:", calledError);
    return null;
  }

  const calledNumbers = normalizeCalledNumbers(calledRows);

  for (const gamePlayer of gamePlayers) {
    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select("*")
      .eq("game_id", gameId)
      .eq("player_id", gamePlayer.player_id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cardError) {
      console.error("Card lookup error:", cardError);
      continue;
    }

    if (!card || !Array.isArray(card.card_data)) {
      continue;
    }

    if (checkBingo(card.card_data, calledNumbers)) {
      return {
        playerId: gamePlayer.player_id,
        cardId: card.id
      };
    }
  }

  return null;
}

// ==================================================
// ANNOUNCE WINNER
// ==================================================

async function announceWinner(gameId, playerId, cardId) {
  const { data: existingWinner } = await supabase
    .from("winners")
    .select("*")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!existingWinner) {
    const { error } = await supabase
      .from("winners")
      .insert({
        game_id: gameId,
        player_id: playerId,
        card_id: cardId
      });

    if (error) {
      console.error("Winner insert error:", error);
    }
  }

  const { data: player } = await supabase
    .from("players")
    .select("telegram_id, first_name")
    .eq("id", playerId)
    .maybeSingle();

  if (player?.telegram_id) {
    await bot.sendMessage(
      player.telegram_id,
      `🏆 *BINGO!*\n\n` +
      `🎉 Congratulations ${player.first_name || "Player"}!\n\n` +
      `You won Game #${gameId}!`,
      {
        parse_mode: "Markdown"
      }
    );
  }

  await supabase
    .from("games")
    .update({
      status: "ended"
    })
    .eq("id", gameId);

  return true;
}

// ==================================================
// /START
// ==================================================

bot.onText(/\/start/, async (msg) => {
  const player = await registerPlayer(msg.from);

  if (!player) {
    await bot.sendMessage(
      msg.chat.id,
      "❌ Registration failed. Please try again."
    );
    return;
  }

  await bot.sendMessage(
    msg.chat.id,
    `🎱 *Welcome to BigBoss Bingo!*\n\n` +
    `Hello ${msg.from.first_name || "Player"} 👋\n\n` +
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

// ==================================================
// /MYID
// ==================================================

bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `🆔 Your Telegram ID is:\n\n\`${msg.from.id}\``,
    {
      parse_mode: "Markdown"
    }
  );
});

// ==================================================
// /ADMIN
// ==================================================

bot.onText(/\/admin/, async (msg) => {
  if (
    !ADMIN_ID ||
    String(msg.from.id) !== String(ADMIN_ID)
  ) {
    await bot.sendMessage(
      msg.chat.id,
      "⛔ You are not authorized to access the Admin Panel."
    );
    return;
  }

  await bot.sendMessage(
    msg.chat.id,
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

// ==================================================
// CALLBACK BUTTONS
// ==================================================

bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    const action = query.data;

    await bot.answerCallbackQuery(query.id);

    // ==================================================
    // JOIN GAME
    // ==================================================

    if (action === "join_game") {
      const player = await registerPlayer(query.from);

      if (!player) {
        await bot.sendMessage(
          chatId,
          "❌ Player registration failed."
        );
        return;
      }

      const { data: games, error } = await supabase
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
                  callback_data: `join_game_${game.id}`
                }
              ]
            ]
          }
        }
      );

      return;
    }

    // ==================================================
    // JOIN SPECIFIC GAME
    // ==================================================

    if (action.startsWith("join_game_")) {
      const gameId = action.replace("join_game_", "");

      const player = await registerPlayer(query.from);

      if (!player) {
        await bot.sendMessage(
          chatId,
          "❌ Player registration failed."
        );
        return;
      }

      const { data: existing } = await supabase
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

      const { data: game } = await supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

      if (!game) {
        await bot.sendMessage(
          chatId,
          "❌ Game not found."
        );
        return;
      }

      if (!["waiting", "active"].includes(game.status)) {
        await bot.sendMessage(
          chatId,
          "❌ This game is no longer available."
        );
        return;
      }

      const { error: joinError } = await supabase
        .from("game_players")
        .insert({
          game_id: gameId,
          player_id: player.id
        });

      if (joinError) {
        console.error(joinError);

        await bot.sendMessage(
          chatId,
          "❌ Could not join the game."
        );
        return;
      }

      const cardData = generateBingoCard();

      const { error: cardError } = await supabase
        .from("cards")
        .insert({
          game_id: gameId,
          player_id: player.id,
          card_data: cardData
        });

      if (cardError) {
        console.error("Card insert error:", cardError);

        await supabase
          .from("game_players")
          .delete()
          .eq("game_id", gameId)
          .eq("player_id", player.id);

        await bot.sendMessage(
          chatId,
          "❌ Could not create your Bingo card."
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        `✅ *You joined Game #${gameId}!*\n\n` +
        `🃏 Your Bingo card has been generated.\n\n` +
        `Use *My Card* to view it.`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // MY CARD
    // ==================================================

    if (action === "my_card") {
      const player = await registerPlayer(query.from);

      if (!player) return;

      const { data: card, error: cardError } = await supabase
        .from("cards")
        .select("*")
        .eq("player_id", player.id)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cardError) {
        console.error("My Card error:", cardError);

        await bot.sendMessage(
          chatId,
          "❌ Could not load your Bingo card."
        );
        return;
      }

      if (!card) {
        await bot.sendMessage(
          chatId,
          "🃏 You don't have a Bingo card yet.\n\nJoin a game first."
        );
        return;
      }

      const { data: calledRows, error: calledError } = await supabase
        .from("called_numbers")
        .select("number")
        .eq("game_id", card.game_id);

      if (calledError) {
        console.error("Called numbers error:", calledError);

        await bot.sendMessage(
          chatId,
          "❌ Could not load called numbers."
        );
        return;
      }

      const calledNumbers = normalizeCalledNumbers(calledRows);

      const rows = formatCard(
        card.card_data,
        calledNumbers
      );

      await bot.sendMessage(
        chatId,
        `🃏 *YOUR BINGO CARD*\n\n` +
        `B   I   N   G   O\n\n` +
        rows +
        `\n\n` +
        `🟢 = Called number\n` +
        `🆓 = FREE`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // WALLET
    // ==================================================

    if (action === "wallet") {
      const player = await registerPlayer(query.from);

      if (!player) return;

      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("player_id", player.id)
        .maybeSingle();

      await bot.sendMessage(
        chatId,
        `💰 *MY WALLET*\n\nBalance: ${wallet?.balance || 0}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // RESULTS
    // ==================================================

    if (action === "results") {
      const player = await registerPlayer(query.from);

      if (!player) return;

      const { data: winners } = await supabase
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

      let text = "🏆 *MY RESULTS*\n\n";

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

    // ==================================================
    // ADMIN SECURITY
    // ==================================================

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

    // ==================================================
    // CREATE GAME
    // ==================================================

    if (action === "admin_create_game") {
      const { data: game, error } = await supabase
        .from("games")
        .insert({
          status: "waiting",
          entry_fee: 0
        })
        .select()
        .single();

      if (error) {
        console.error(error);

        await bot.sendMessage(
          chatId,
          `❌ Could not create game.\n\n${error.message}`
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        `✅ *GAME CREATED!*\n\n` +
        `🆔 Game ID: ${game.id}\n` +
        `📌 Status: ${game.status}\n` +
        `💰 Entry Fee: ${game.entry_fee}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // START GAME
    // ==================================================

    if (action === "admin_start_game") {
      const { data: game } = await supabase
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

      const { error } = await supabase
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
        `▶️ *GAME STARTED!*\n\nGame #${game.id}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // PAUSE
    // ==================================================

    if (action === "admin_pause_game") {
      const { data: game } = await supabase
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

      const { error } = await supabase
        .from("games")
        .update({
          status: "paused"
        })
        .eq("id", game.id);

      if (error) {
        console.error(error);

        await bot.sendMessage(
          chatId,
          "❌ Could not pause game."
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        `⏸️ *GAME PAUSED*\n\nGame #${game.id}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // CALL NUMBER
    // ==================================================

    if (action === "admin_call_number") {
      const { data: game } = await supabase
        .from("games")
        .select("*")
        .eq("status", "active")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!game) {
        await bot.sendMessage(
          chatId,
          "❌ No active game."
        );
        return;
      }

      const { data: called, error: calledError } = await supabase
        .from("called_numbers")
        .select("number")
        .eq("game_id", game.id);

      if (calledError) {
        console.error("Load called numbers error:", calledError);

        await bot.sendMessage(
          chatId,
          "❌ Could not load called numbers."
        );
        return;
      }

      const usedNumbers = Array.from(
        normalizeCalledNumbers(called)
      );

      if (usedNumbers.length >= 75) {
        await bot.sendMessage(
          chatId,
          "🛑 All 75 numbers have been called."
        );
        return;
      }

      let number;

      do {
        number = Math.floor(Math.random() * 75) + 1;
      } while (usedNumbers.includes(number));

      const { error: insertError } = await supabase
        .from("called_numbers")
        .insert({
          game_id: game.id,
          number
        });

      if (insertError) {
        console.error("Call number insert error:", insertError);

        await bot.sendMessage(
          chatId,
          "❌ Could not call number."
        );
        return;
      }

      const letter = getBingoLetter(number);

      await bot.sendMessage(
        chatId,
        `🔢 *NUMBER CALLED*\n\n🎱 *${letter}-${number}*`,
        {
          parse_mode: "Markdown"
        }
      );

      // Check for Bingo after every called number
      const winner = await checkAllPlayersForBingo(game.id);

      if (winner) {
        await announceWinner(
          game.id,
          winner.playerId,
          winner.cardId
        );

        await bot.sendMessage(
          chatId,
          `🏆 *BINGO WINNER FOUND!*\n\n` +
          `👤 Player ID: ${winner.playerId}\n` +
          `🎮 Game #${game.id}\n\n` +
          `🛑 Game automatically ended.`,
          {
            parse_mode: "Markdown"
          }
        );
      }

      return;
    }

    // ==================================================
    // PLAYERS
    // ==================================================

    if (action === "admin_players") {
      const { count } = await supabase
        .from("players")
        .select("*", {
          count: "exact",
          head: true
        });

      await bot.sendMessage(
        chatId,
        `👥 *PLAYERS*\n\nTotal registered players: ${count || 0}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // WINNERS
    // ==================================================

    if (action === "admin_winners") {
      const { count } = await supabase
        .from("winners")
        .select("*", {
          count: "exact",
          head: true
        });

      await bot.sendMessage(
        chatId,
        `🏆 *WINNERS*\n\nTotal winners: ${count || 0}`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // END GAME
    // ==================================================

    if (action === "admin_end_game") {
      const { data: game } = await supabase
        .from("games")
        .select("*")
        .in("status", [
          "waiting",
          "active",
          "paused"
        ])
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

      const { error } = await supabase
        .from("games")
        .update({
          status: "ended"
        })
        .eq("id", game.id);

      if (error) {
        console.error(error);

        await bot.sendMessage(
          chatId,
          "❌ Could not end game."
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        `🛑 *GAME ENDED*\n\nGame #${game.id}`,
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

// ==================================================
// ERRORS
// ==================================================

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
