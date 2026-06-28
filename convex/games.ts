import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAvailableMoves } from "./checkersRules";

function getSquareNotation(index: number): string {
  const col = String.fromCharCode(65 + (index % 8));
  const row = 8 - Math.floor(index / 8);
  return `${col}${row}`;
}

function createStartingBoard(): (string | null)[] {
  const board = Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const index = r * 8 + c;
      // Playable dark squares are where (r + c) % 2 === 1
      if ((r + c) % 2 === 1) {
        if (r < 3) {
          board[index] = "B";
        } else if (r > 4) {
          board[index] = "W";
        }
      }
    }
  }
  return board;
}

export const createGame = mutation({
  args: { player1: v.string(), player1Color: v.string() },
  handler: async (ctx, args) => {
    const board = createStartingBoard();
    const gameId = await ctx.db.insert("games", {
      player1: args.player1,
      player1Color: args.player1Color,
      board,
      capturedPieces: [],
      turn: "W", // White starts
      status: "waiting", // Starts in waiting status until player 2 joins
    });

    await ctx.db.insert("messages", {
      gameId,
      sender: "System",
      text: `Game created. Waiting for opponent.`,
      createdAt: Date.now(),
    });

    return gameId;
  },
});

import type { Id } from "./_generated/dataModel";

export const joinGame = mutation({
  args: {
    gameId: v.optional(v.id("games")),
    matchCode: v.optional(v.string()),
    player2: v.string(),
  },
  handler: async (ctx, args) => {
    let resolvedGameId: Id<"games"> | null = null;

    if (args.gameId) {
      resolvedGameId = args.gameId;
    } else if (args.matchCode) {
      const code = args.matchCode.trim();
      const normalized = ctx.db.normalizeId("games", code);
      if (normalized) {
        resolvedGameId = normalized;
      } else {
        const upperCode = code.toUpperCase();
        if (upperCode.length >= 6) {
          const recentGames = await ctx.db
            .query("games")
            .order("desc")
            .take(100);
          const found = recentGames.find(
            (g) => g._id.slice(-6).toUpperCase() === upperCode
          );
          if (found) {
            resolvedGameId = found._id;
          }
        }
      }
    }

    if (!resolvedGameId) {
      throw new Error("Game not found. Please verify the Match ID.");
    }

    const game = await ctx.db.get(resolvedGameId);
    if (!game) {
      throw new Error("Game not found");
    }

    if (game.player1 === args.player2) {
      return game._id; // Owner joining their own game
    }

    // Enforce that Lordin can only play against Laura and vice versa
    if (game.player1 === "Lordin" && args.player2 !== "Laura") {
      throw new Error("Only Laura can join Lordin's game");
    }
    if (game.player1 === "Laura" && args.player2 !== "Lordin") {
      throw new Error("Only Lordin can join Laura's game");
    }

    if (game.player2 && game.player2 !== args.player2) {
      throw new Error("Game already has two players");
    }

    if (!game.player2) {
      await ctx.db.patch(resolvedGameId, {
        player2: args.player2,
        status: "playing",
      });

      await ctx.db.insert("messages", {
        gameId: resolvedGameId,
        sender: "System",
        text: `${args.player2} joined the game.`,
        createdAt: Date.now(),
      });
    }

    return game._id;
  },
});

export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
  },
});

export const getGames = query({
  args: { user: v.string() },
  handler: async (ctx, args) => {
    const games1 = await ctx.db
      .query("games")
      .withIndex("by_player1", (q) => q.eq("player1", args.user))
      .collect();

    const games2 = await ctx.db
      .query("games")
      .withIndex("by_player2", (q) => q.eq("player2", args.user))
      .collect();

    // Combine and sort by status / creation time (fallback)
    const allGames = [...games1, ...games2];
    return allGames.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const deleteGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.gameId);

    // Clean up messages
    const messages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
  },
});

export const getMessages = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .order("asc")
      .take(200);
  },
});

export const sendMessage = mutation({
  args: { gameId: v.id("games"), sender: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      gameId: args.gameId,
      sender: args.sender,
      text: args.text,
      createdAt: Date.now(),
    });
  },
});

export const sendSystemMessage = mutation({
  args: { gameId: v.id("games"), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      gameId: args.gameId,
      sender: "System",
      text: args.text,
      createdAt: Date.now(),
    });
  },
});

export const makeMove = mutation({
  args: {
    gameId: v.id("games"),
    startIndex: v.number(),
    endIndex: v.number(),
    user: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    if (game.status !== "playing") {
      throw new Error("Game is not active");
    }

    const { player1, player2, board, turn, pendingCapture } = game;

    // Determine if it is this user's turn
    const isPlayer1 = args.user === player1;
    const isPlayer2 = args.user === player2;

    if (!isPlayer1 && !isPlayer2) {
      throw new Error("You are not a player in this game");
    }

    const currentRole = turn; // "W" or "B"
    const p1Color = game.player1Color ?? "W";
    const expectedUser = currentRole === p1Color ? player1 : player2;

    if (args.user !== expectedUser) {
      throw new Error("It is not your turn");
    }

    // Get all available moves for the current player
    const availableMoves = getAvailableMoves(board, currentRole as "W" | "B", pendingCapture);

    // Check if the requested move is in the list of available moves
    const matchingMove = availableMoves.find(
      (m) => m.start === args.startIndex && m.end === args.endIndex
    );

    if (!matchingMove) {
      throw new Error("Invalid move");
    }

    // Apply the move
    const newBoard = [...board];
    const piece = newBoard[args.startIndex];
    newBoard[args.endIndex] = piece;
    newBoard[args.startIndex] = null;

    let systemMsgText = `${args.user} moved from ${getSquareNotation(args.startIndex)} to ${getSquareNotation(args.endIndex)}`;

    let updatedCaptured = [...(game.capturedPieces ?? [])];
    if (matchingMove.isCapture && matchingMove.capturedPieceIndex !== undefined) {
      const capturedPiece = board[matchingMove.capturedPieceIndex];
      if (capturedPiece !== null) {
        updatedCaptured.push(capturedPiece);
      }
      newBoard[matchingMove.capturedPieceIndex] = null;
      systemMsgText = `${args.user} captured at ${getSquareNotation(matchingMove.capturedPieceIndex)} (jumped ${getSquareNotation(args.startIndex)} -> ${getSquareNotation(args.endIndex)})`;
    }

    // Promotion check: pawn reaching the end row
    let promoted = false;
    const endRow = Math.floor(args.endIndex / 8);
    if (piece === "W" && endRow === 0) {
      newBoard[args.endIndex] = "WK";
      promoted = true;
    } else if (piece === "B" && endRow === 7) {
      newBoard[args.endIndex] = "BK";
      promoted = true;
    }

    if (promoted) {
      systemMsgText += ` & promoted to KING`;
    }

    // Post-move state calculation (turn logic & multi-jumps)
    let nextTurn = turn;
    let nextPendingCapture: number | undefined = undefined;

    if (matchingMove.isCapture) {
      // Check if the moved piece has more captures from its new position (endIndex)
      // Note: we check captures on the *new* board!
      const furtherCaptures = getAvailableMoves(newBoard, currentRole as "W" | "B", args.endIndex);
      if (furtherCaptures.length > 0) {
        // Multi-jump chain continues
        nextPendingCapture = args.endIndex;
        systemMsgText += ` (multi-jump available)`;
      } else {
        // No further captures, turn swaps
        nextTurn = currentRole === "W" ? "B" : "W";
      }
    } else {
      // Normal move, turn swaps
      nextTurn = currentRole === "W" ? "B" : "W";
    }

    // Check for win / block condition for the NEXT player
    let nextStatus = "playing";
    let winner: string | undefined = undefined;

    // Check if the opponent has any valid moves
    const opponentMoves = getAvailableMoves(newBoard, nextTurn as "W" | "B", undefined);
    if (opponentMoves.length === 0) {
      nextStatus = "finished";
      const p1Color = game.player1Color ?? "W";
      winner = currentRole === p1Color ? player1 : (player2 || "Unknown");
      systemMsgText += `. ${winner} wins the game!`;
    }

    // Save game state
    await ctx.db.patch(args.gameId, {
      board: newBoard,
      capturedPieces: updatedCaptured,
      turn: nextTurn,
      pendingCapture: nextPendingCapture,
      status: nextStatus,
      winner,
      lastMoveStart: args.startIndex,
      lastMoveEnd: args.endIndex,
    });

    // Write system log message ONLY for game over events
    if (nextStatus === "finished" && winner) {
      await ctx.db.insert("messages", {
        gameId: args.gameId,
        sender: "System",
        text: `${winner} wins the game!`,
        createdAt: Date.now(),
      });
    }

    return args.gameId;
  }
});

