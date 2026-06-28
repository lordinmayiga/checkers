import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
    player1: v.string(), // Name of creator (e.g. "Lordin" or "Laura")
    player2: v.optional(v.string()), // Name of opponent
    player1Color: v.optional(v.string()), // Creator color: "W" or "B"
    board: v.array(v.union(v.null(), v.string())), // 64-length array of "W" | "WK" | "B" | "BK" | null
    capturedPieces: v.optional(v.array(v.string())), // List of pieces captured so far: "W" | "WK" | "B" | "BK"
    turn: v.string(), // "W" or "B"
    status: v.string(), // "waiting" | "playing" | "finished"
    winner: v.optional(v.string()), // Winner's name
    pendingCapture: v.optional(v.number()), // index of piece mid-jump
    lastMoveStart: v.optional(v.number()), // Index of last move start
    lastMoveEnd: v.optional(v.number()), // Index of last move end
  })
    .index("by_player1", ["player1"])
    .index("by_player2", ["player2"]),
  messages: defineTable({
    gameId: v.id("games"),
    sender: v.string(),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_gameId", ["gameId"]),

  // === CARDS GAME ===
  cardGames: defineTable({
    player1: v.string(),       // creator name
    player2: v.optional(v.string()), // joiner name
    status: v.union(v.literal("waiting"), v.literal("active"), v.literal("finished")),

    // Deck state (card IDs like "2H", "KS", "JOK_R", "JOK_B", "AS")
    drawPile: v.array(v.string()),
    discardPile: v.array(v.string()),

    // Cutter setup
    cutterIndicatorCard: v.optional(v.string()), // e.g. "2H" — the card placed sideways
    cutterSuit: v.optional(v.string()),           // "H", "D", "S", "C"

    // Hands
    player1Hand: v.array(v.string()),
    player2Hand: v.array(v.string()),

    // Turn tracking
    currentTurn: v.union(v.literal("player1"), v.literal("player2")),
    hasPickedThisTurn: v.boolean(),

    // Attack chain state
    attackPending: v.optional(v.object({
      pendingPicks: v.number(),     // how many cards the CURRENT player must pick if they can't counter
      attackerSide: v.union(v.literal("player1"), v.literal("player2")), // who initiated
    })),

    // Suit request state (from ace play)
    requestedSuit: v.optional(v.string()), // "H","D","S","C" or null

    // Game result
    winner: v.optional(v.string()),
    player1Score: v.optional(v.number()),
    player2Score: v.optional(v.number()),

    // Last action log for display
    lastAction: v.optional(v.string()),
  })
    .index("by_player1", ["player1"])
    .index("by_player2", ["player2"]),

  cardMessages: defineTable({
    gameId: v.id("cardGames"),
    sender: v.string(),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_gameId", ["gameId"]),
});
