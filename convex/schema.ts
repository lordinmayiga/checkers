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
});
