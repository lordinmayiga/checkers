import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  buildDeck, shuffle, parseCard, handScore,
  attackPenalty, counterPenalty,
  validatePlay, drawCards, coinFlip,
} from "./cardGameRules";

// ── helpers ────────────────────────────────────────────────────────────────

function getPlayerSide(game: any, playerName: string): "player1" | "player2" | null {
  if (game.player1 === playerName) return "player1";
  if (game.player2 === playerName) return "player2";
  return null;
}

function getHand(game: any, side: "player1" | "player2"): string[] {
  return side === "player1" ? game.player1Hand : game.player2Hand;
}

function oppositeSide(side: "player1" | "player2"): "player1" | "player2" {
  return side === "player1" ? "player2" : "player1";
}

async function logMsg(ctx: any, gameId: Id<"cardGames">, sender: string, text: string) {
  await ctx.db.insert("cardMessages", { gameId, sender, text, createdAt: Date.now() });
}

// ── create game ─────────────────────────────────────────────────────────────

export const createCardGame = mutation({
  args: { player1: v.string() },
  handler: async (ctx, args) => {
    const gameId = await ctx.db.insert("cardGames", {
      player1: args.player1,
      status: "waiting",
      drawPile: [],
      discardPile: [],
      player1Hand: [],
      player2Hand: [],
      currentTurn: "player1",
      hasPickedThisTurn: false,
    });
    await logMsg(ctx, gameId, "System", `${args.player1} created a Cards game. Waiting for opponent...`);
    return gameId;
  },
});

// ── join game ────────────────────────────────────────────────────────────────

export const joinCardGame = mutation({
  args: {
    gameId: v.optional(v.id("cardGames")),
    matchCode: v.optional(v.string()),
    player2: v.string(),
  },
  handler: async (ctx, args) => {
    let resolvedGameId: Id<"cardGames"> | null = null;

    if (args.gameId) {
      resolvedGameId = args.gameId;
    } else if (args.matchCode) {
      const code = args.matchCode.trim();
      const normalized = ctx.db.normalizeId("cardGames", code);
      if (normalized) {
        resolvedGameId = normalized;
      } else {
        const upper = code.toUpperCase();
        if (upper.length >= 6) {
          const recent = await ctx.db.query("cardGames").order("desc").take(100);
          const found = recent.find(g => g._id.slice(-6).toUpperCase() === upper);
          if (found) resolvedGameId = found._id;
        }
      }
    }

    if (!resolvedGameId) throw new Error("Game not found");

    const game = await ctx.db.get(resolvedGameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Game is not accepting players");
    if (game.player2) throw new Error("Game already has 2 players");
    if (game.player1 === args.player2) throw new Error("Cannot join your own game");

    await ctx.db.patch(resolvedGameId, { player2: args.player2 });
    await logMsg(ctx, resolvedGameId, "System", `${args.player2} joined the game!`);

    return resolvedGameId;
  },
});

// ── start game (deal cards, pick cutter, coin flip) ──────────────────────────

export const startCardGame = mutation({
  args: { gameId: v.id("cardGames"), playerName: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Game already started");
    if (!game.player2) throw new Error("Need two players to start");
    if (game.player1 !== args.playerName) throw new Error("Only the host can start the game");

    // Shuffle deck
    let deck = shuffle(buildDeck());

    // Deal 7 cards to each player
    const p1Hand = deck.splice(0, 7);
    const p2Hand = deck.splice(0, 7);

    // Pick cutter card: first non-7 card from remaining deck
    let cutterIndicatorCard: string | null = null;
    let cutterSuit: string | null = null;
    let cutterIndex = -1;
    for (let i = 0; i < deck.length; i++) {
      const { rank, isJoker } = parseCard(deck[i]);
      if (!isJoker && rank !== "7") {
        cutterIndicatorCard = deck[i];
        cutterSuit = deck[i].slice(-1); // last char is suit
        cutterIndex = i;
        break;
      }
    }
    if (cutterIndex >= 0) {
      deck.splice(cutterIndex, 1); // remove cutter from draw pile
    }

    // Coin flip for first turn
    const firstTurn = coinFlip();

    await ctx.db.patch(args.gameId, {
      status: "active",
      drawPile: deck,
      discardPile: [],
      player1Hand: p1Hand,
      player2Hand: p2Hand,
      cutterIndicatorCard: cutterIndicatorCard ?? undefined,
      cutterSuit: cutterSuit ?? undefined,
      currentTurn: firstTurn,
      hasPickedThisTurn: false,
      attackPending: undefined,
      requestedSuit: undefined,
    });

    const winner = firstTurn === "player1" ? game.player1 : game.player2;
    await logMsg(ctx, args.gameId, "System",
      `Game started! Cutter: ${cutterIndicatorCard} (suit ${cutterSuit}). Coin flip: ${winner} goes first!`);
  },
});

// ── play a card ───────────────────────────────────────────────────────────────

export const playCard = mutation({
  args: {
    gameId: v.id("cardGames"),
    playerName: v.string(),
    cardId: v.string(),
    // For ace plays: optionally request a suit immediately
    requestSuit: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") throw new Error("Game is not active");

    const side = getPlayerSide(game, args.playerName);
    if (!side) throw new Error("You are not a player in this game");
    if (game.currentTurn !== side) throw new Error("It's not your turn");

    const hand = getHand(game, side);
    if (!hand.includes(args.cardId)) throw new Error("You don't have that card");

    const topCard = game.discardPile.length > 0 ? game.discardPile[game.discardPile.length - 1] : null;

    // Validate the play
    const validity = validatePlay(args.cardId, {
      topCard,
      attackPending: game.attackPending ?? null,
      requestedSuit: game.requestedSuit ?? null,
      cutterSuit: game.cutterSuit ?? null,
      hand,
    });

    if (!validity.valid) {
      throw new Error(validity.reason);
    }

    const { rank } = parseCard(args.cardId);

    // Remove card from hand
    const newHand = hand.filter(c => c !== args.cardId);
    const newDiscard = [...game.discardPile, args.cardId];

    // Prepare patch
    const patch: any = {
      discardPile: newDiscard,
      hasPickedThisTurn: false,
      requestedSuit: undefined,
      attackPending: undefined,
    };

    if (side === "player1") {
      patch.player1Hand = newHand;
    } else {
      patch.player2Hand = newHand;
    }

    let logText = `${args.playerName} played ${args.cardId}`;
    let nextTurn = oppositeSide(side);

    // Handle play types
    switch (validity.type) {
      case "cut": {
        // Game ends immediately
        const opponentHand = getHand(game, oppositeSide(side));
        const myScore = handScore(newHand);
        const oppScore = handScore(opponentHand);
        const opponentName = side === "player1" ? game.player2! : game.player1;
        const winner = myScore <= oppScore ? args.playerName : opponentName;

        patch.status = "finished";
        patch.winner = winner;
        patch.player1Score = side === "player1" ? myScore : oppScore;
        patch.player2Score = side === "player1" ? oppScore : myScore;
        patch.currentTurn = nextTurn; // doesn't matter
        patch.lastAction = `CUT! ${args.playerName} (${myScore}pts) vs ${opponentName} (${oppScore}pts). Winner: ${winner}`;

        await ctx.db.patch(args.gameId, patch);
        await logMsg(ctx, args.gameId, "System", patch.lastAction);
        return;
      }

      case "ace_of_spades_neutralise": {
        // Neutralise attack — next player plays anything, requestedSuit cleared, no attack
        logText += " — ACE OF SPADES neutralises the attack! Game reset.";
        patch.attackPending = undefined;
        patch.requestedSuit = undefined;
        patch.currentTurn = nextTurn;
        patch.lastAction = logText;
        break;
      }

      case "ace_of_spades_request":
      case "ace_request": {
        // Request a suit
        const requested = args.requestSuit ?? null;
        patch.requestedSuit = requested ?? undefined;
        logText += requested ? ` — requests ${requested} suit!` : ` — requests a suit (no suit specified yet)`;
        // Turn passes to opponent
        patch.currentTurn = nextTurn;
        patch.lastAction = logText;
        break;
      }

      case "attack": {
        // Start (or escalate) attack chain
        const penalty = attackPenalty(args.cardId);
        patch.attackPending = {
          pendingPicks: penalty,
          attackerSide: side,
        };
        patch.currentTurn = nextTurn;
        logText += ` — ATTACK! Opponent must pick ${penalty} or counter.`;
        patch.lastAction = logText;
        break;
      }

      case "counter": {
        // Counter an existing attack
        if (!game.attackPending || !topCard) throw new Error("No attack to counter");
        const diff = counterPenalty(args.cardId, topCard);
        const newPenalty = attackPenalty(args.cardId);

        if (diff > 0) {
          // Counter player picks `diff` cards as penalty, then attack is reversed
          const { drawn, newDrawPile, newDiscardPile } = drawCards(diff, game.drawPile, newDiscard);
          const penaltyHand = [...newHand, ...drawn];
          if (side === "player1") patch.player1Hand = penaltyHand;
          else patch.player2Hand = penaltyHand;
          patch.drawPile = newDrawPile;
          patch.discardPile = newDiscardPile;

          logText += ` — COUNTER (picked ${diff} penalty). Now attacking with ${newPenalty}.`;
          // Reverse attack: opponent must now counter or pick
          patch.attackPending = { pendingPicks: newPenalty, attackerSide: side };
          patch.currentTurn = nextTurn;
        } else {
          // Counter escalates (3 on 2, joker on anything)
          logText += ` — COUNTER with ${args.cardId}! Opponent must pick ${newPenalty} or counter.`;
          patch.attackPending = { pendingPicks: newPenalty, attackerSide: side };
          patch.currentTurn = nextTurn;
        }
        patch.lastAction = logText;
        break;
      }

      case "jack_or_8": {
        // Player keeps their turn
        logText += ` — ${rank === "J" ? "JACK" : "EIGHT"} played! Your turn again.`;
        patch.currentTurn = side; // keep same player's turn
        patch.lastAction = logText;
        break;
      }

      case "normal": {
        patch.currentTurn = nextTurn;
        patch.lastAction = logText;
        break;
      }
    }

    // Check for winner (empty hand)
    const updatedHand = side === "player1" ? patch.player1Hand : patch.player2Hand;
    if (updatedHand && updatedHand.length === 0 && patch.status !== "finished") {
      patch.status = "finished";
      patch.winner = args.playerName;
      patch.lastAction = `${args.playerName} played their last card and WINS!`;
    }

    // Check if opponent now has 2 cards — "Warning" announcement
    const opponentSide = oppositeSide(side);
    const opponentHand = getHand(game, opponentSide);
    // The opponent's hand hasn't changed — check current length
    if (opponentHand.length === 2 && patch.status !== "finished") {
      await logMsg(ctx, args.gameId, "System", `⚠️ WARNING! ${side === "player1" ? game.player2! : game.player1} has only 2 cards left!`);
    }

    // My updated hand check for 2 cards
    if (updatedHand && updatedHand.length === 2 && patch.status !== "finished") {
      await logMsg(ctx, args.gameId, "System", `⚠️ WARNING! ${args.playerName} has only 2 cards left!`);
    }

    await ctx.db.patch(args.gameId, patch);
    await logMsg(ctx, args.gameId, "System", patch.lastAction ?? logText);
  },
});

// ── request suit (explicit, sent separately for UI flow) ─────────────────────

export const requestSuit = mutation({
  args: {
    gameId: v.id("cardGames"),
    playerName: v.string(),
    suit: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") throw new Error("Game is not active");

    const side = getPlayerSide(game, args.playerName);
    if (!side) throw new Error("You are not a player in this game");
    // The request is made right after an ace play, so currentTurn is now opponent's
    // But we store requestedSuit so their turn is constrained
    // Validate suit
    if (!["H", "D", "S", "C"].includes(args.suit)) throw new Error("Invalid suit");

    // Suit request can be set as long as game is active (the ace was just played)
    await ctx.db.patch(args.gameId, { requestedSuit: args.suit });
    const suitNames: Record<string, string> = { H: "Hearts ♥", D: "Diamonds ♦", S: "Spades ♠", C: "Clubs ♣" };
    await logMsg(ctx, args.gameId, "System", `${args.playerName} requests ${suitNames[args.suit]}!`);
  },
});

// ── pick a card ───────────────────────────────────────────────────────────────

export const pickCard = mutation({
  args: {
    gameId: v.id("cardGames"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") throw new Error("Game is not active");

    const side = getPlayerSide(game, args.playerName);
    if (!side) throw new Error("You are not a player in this game");
    if (game.currentTurn !== side) throw new Error("It's not your turn");

    // Check if already picked voluntarily this turn
    if (!game.attackPending && game.hasPickedThisTurn) {
      throw new Error("You can only pick once per turn voluntarily. Play or pass.");
    }

    const hand = getHand(game, side);

    if (game.attackPending) {
      // Under attack — pick the required number of cards, resolve attack
      const count = game.attackPending.pendingPicks;
      const { drawn, newDrawPile, newDiscardPile } = drawCards(count, game.drawPile, game.discardPile);
      const newHand = [...hand, ...drawn];

      const patch: any = {
        drawPile: newDrawPile,
        discardPile: newDiscardPile,
        attackPending: undefined,
        requestedSuit: undefined,
        hasPickedThisTurn: false,
        // After picking under attack, turn passes to the ATTACKER (original attacker gets to play)
        currentTurn: game.attackPending.attackerSide,
        lastAction: `${args.playerName} picked ${count} card(s) — attack resolved.`,
      };
      if (side === "player1") patch.player1Hand = newHand;
      else patch.player2Hand = newHand;

      // Warning check
      if (newHand.length === 2) {
        await logMsg(ctx, args.gameId, "System", `⚠️ WARNING! ${args.playerName} has only 2 cards left!`);
      }

      await ctx.db.patch(args.gameId, patch);
      await logMsg(ctx, args.gameId, "System", patch.lastAction);
    } else {
      // Voluntary pick — draw 1 card, mark hasPickedThisTurn, stay on current turn
      const { drawn, newDrawPile, newDiscardPile } = drawCards(1, game.drawPile, game.discardPile);
      const newHand = [...hand, ...drawn];

      const patch: any = {
        drawPile: newDrawPile,
        discardPile: newDiscardPile,
        hasPickedThisTurn: true,
        currentTurn: side, // still their turn
        lastAction: `${args.playerName} picked a card.`,
      };
      if (side === "player1") patch.player1Hand = newHand;
      else patch.player2Hand = newHand;

      // Warning check after adding picked card
      if (newHand.length === 2) {
        await logMsg(ctx, args.gameId, "System", `⚠️ WARNING! ${args.playerName} has only 2 cards left!`);
      }

      await ctx.db.patch(args.gameId, patch);
    }
  },
});

// ── pass turn ─────────────────────────────────────────────────────────────────

export const passTurn = mutation({
  args: {
    gameId: v.id("cardGames"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") throw new Error("Game is not active");

    const side = getPlayerSide(game, args.playerName);
    if (!side) throw new Error("You are not a player in this game");
    if (game.currentTurn !== side) throw new Error("It's not your turn");

    // Can only pass after picking
    if (!game.hasPickedThisTurn) throw new Error("You must pick a card before passing");
    if (game.attackPending) throw new Error("You cannot pass while under attack — pick the cards or counter");

    await ctx.db.patch(args.gameId, {
      currentTurn: oppositeSide(side),
      hasPickedThisTurn: false,
      lastAction: `${args.playerName} passed.`,
    });
    await logMsg(ctx, args.gameId, "System", `${args.playerName} passed their turn.`);
  },
});

// ── delete game ───────────────────────────────────────────────────────────────

export const deleteCardGame = mutation({
  args: { gameId: v.id("cardGames") },
  handler: async (ctx, args) => {
    const messages = await ctx.db.query("cardMessages")
      .withIndex("by_gameId", q => q.eq("gameId", args.gameId))
      .collect();
    for (const msg of messages) await ctx.db.delete(msg._id);
    await ctx.db.delete(args.gameId);
  },
});

export const sendCardMessage = mutation({
  args: {
    gameId: v.id("cardGames"),
    sender: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cardMessages", {
      gameId: args.gameId,
      sender: args.sender,
      text: args.text,
      createdAt: Date.now(),
    });
  },
});

// ── queries ───────────────────────────────────────────────────────────────────

export const getCardGame = query({
  args: { gameId: v.id("cardGames") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
  },
});

export const getCardGames = query({
  args: { user: v.string() },
  handler: async (ctx, args) => {
    const asP1 = await ctx.db.query("cardGames")
      .withIndex("by_player1", q => q.eq("player1", args.user))
      .collect();
    const asP2 = await ctx.db.query("cardGames")
      .withIndex("by_player2", q => q.eq("player2", args.user))
      .collect();
    // Merge and deduplicate
    const all = [...asP1];
    for (const g of asP2) {
      if (!all.find(x => x._id === g._id)) all.push(g);
    }
    return all.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const getCardMessages = query({
  args: { gameId: v.id("cardGames") },
  handler: async (ctx, args) => {
    return await ctx.db.query("cardMessages")
      .withIndex("by_gameId", q => q.eq("gameId", args.gameId))
      .order("asc")
      .collect();
  },
});
