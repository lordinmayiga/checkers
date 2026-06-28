# Project Slices: Online Checkers

This document outlines the six vertical slices that cut across both the frontend and backend of the application, ensuring that we develop and test complete, playable pieces of functionality incrementally.

---

## Slice 1: Convex Setup & Two-Account Authentication
* **Goal**: Establish the Convex backend and set up simple, zero-friction local authentication for Lordin and Laura.
* **Backend**:
  * Set up Convex schema and configure initial databases.
  * Define authentication queries/mutations to check session validity.
* **Frontend**:
  * Design a premium, dark-themed login gate.
  * Allow clicking "Log in as Lordin" or "Log in as Laura".
  * Store the active user in `localStorage` and setup Convex providers.

## Slice 2: Lobby, Game Rooms & Link Matchmaking
* **Goal**: Enable players to create a game and invite another player using a shared URL.
* **Backend**:
  * Implement the `games` table in Convex schema:
    * `player1` (string)
    * `player2` (optional string)
    * `board` (flat 64-element array of pieces/null)
    * `turn` (string: "player1" or "player2")
    * `status` (string: "waiting", "playing", "finished")
    * `winner` (optional string)
    * `pendingCapture` (optional number - locking index for mid-jump)
  * Define backend mutations: `createGame`, `joinGame`.
  * Define query: `getGame`.
* **Frontend**:
  * Build a Game Dashboard showing the player's active games.
  * Add a "Create Game" button which redirects to `?gameId=<id>`.
  * Detect the `gameId` in the URL on load and join the opponent to the game automatically.

## Slice 3: Game Board & Basic Movements (Single Moves & Captures)
* **Goal**: Render the board and support normal moves and single captures with server-side validation.
* **Backend**:
  * Validate diagonal moves (pawns move forward only, kings move both ways).
  * Enforce the forced-capture rule (if any captures are available for the current player, normal moves are rejected).
  * Implement the `makeMove` mutation to update the board state.
* **Frontend**:
  * Render an 8x8 checkerboard using a flat 64 array.
  * Highlight valid target squares when a piece is clicked.
  * Support clicking/drag-and-drop actions. Disable input on opponent's turn.

## Slice 4: Flying Kings & Forced Multi-Jump Chains
* **Goal**: Implement long-range flying king movements and lock players mid-jump during multi-captures on the server.
* **Backend**:
  * Update movement validation for Kings: move any distance along a diagonal and jump over an opponent piece to any empty cell behind it.
  * Update capture validation: pawns can jump backwards to capture.
  * Multi-jump logic: After a capture, search if the same piece has more captures available.
    * If yes: Set `pendingCapture` to its new index. Keep the turn with the same player.
    * If no: Clear `pendingCapture` and swap the active turn.
* **Frontend**:
  * Read `pendingCapture` from the game state.
  * If active, disable all pieces except the one at the locked index.
  * Highlight only valid next-jump destinations for that piece.

## Slice 5: Responsive Chat Sidebar & Bottom Drawer
* **Goal**: Build real-time chat with system event logging.
* **Backend**:
  * Define `messages` table schema: `gameId`, `sender`, `text`, `createdAt`.
  * Mutations: `sendMessage`. Query: `getMessages`.
* **Frontend**:
  * Desktop: Collapsible sliding chat sidebar.
  * Mobile: Bottom sheet drawer to save vertical space.
  * Render chat messages and auto-scroll. Include system events (e.g. "Lordin promoted a piece").

## Slice 6: Responsive Layout & Accessibility Polish
* **Goal**: Polish visual aesthetics, performance, and keyboard/screen-reader navigation.
* **Frontend**:
  * Apply board sizing formula: `min(90vw, 90vh - header)`.
  * Implement complete keyboard navigation (arrow keys to move focus, Space/Enter to select and play).
  * Add `aria-live` screen-reader announcements for moves, captures, and turns.
  * Complete premium styling, including dark-mode glow, piece shadows, and smooth transition animations.
