// ===== CARD GAME RULES ENGINE =====
// Card IDs format:
//   Standard: "{rank}{suit}" — e.g. "2H", "10D", "KS", "AH", "AS"
//   Jokers:   "JOK_R" (red joker) | "JOK_B" (black joker)
// Suits: H=Hearts, D=Diamonds, S=Spades, C=Clubs
// Ranks: 2..10, J, Q, K, A (A=Ace)
// Red suits: H, D
// Black suits: S, C

export const SUITS = ["H", "D", "S", "C"] as const;
export type Suit = typeof SUITS[number];

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export type Rank = typeof RANKS[number];

export type CardId = string;

// Build the 54-card deck
export function buildDeck(): CardId[] {
  const deck: CardId[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  deck.push("JOK_R");
  deck.push("JOK_B");
  return deck;
}

// Fisher-Yates shuffle
export function shuffle(deck: CardId[]): CardId[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Parse a card ID into its rank and suit
export function parseCard(cardId: CardId): { rank: string; suit: string | null; isJoker: boolean; isRedJoker: boolean; isBlackJoker: boolean } {
  if (cardId === "JOK_R") return { rank: "JOKER", suit: null, isJoker: true, isRedJoker: true, isBlackJoker: false };
  if (cardId === "JOK_B") return { rank: "JOKER", suit: null, isJoker: true, isRedJoker: false, isBlackJoker: true };

  // rank is everything except last character (the suit)
  const suit = cardId.slice(-1);
  const rank = cardId.slice(0, -1);
  return { rank, suit, isJoker: false, isRedJoker: false, isBlackJoker: false };
}

export function getCardSuit(cardId: CardId): string | null {
  return parseCard(cardId).suit;
}

export function getCardRank(cardId: CardId): string {
  return parseCard(cardId).rank;
}

export function isRedSuit(suit: string): boolean {
  return suit === "H" || suit === "D";
}

export function isBlackSuit(suit: string): boolean {
  return suit === "S" || suit === "C";
}

// === Point values for hand scoring (used for cut eligibility and final score) ===
export function cardPoints(cardId: CardId): number {
  const { rank, isJoker } = parseCard(cardId);
  if (isJoker) return 50;
  switch (rank) {
    case "2": return 20;
    case "3": return 30;
    case "A": return 15; // non-spades ace
    // Ace of spades is also "A" rank, suit "S" — handled below
    case "J": return 11;
    case "Q": return 12;
    case "K": return 13;
    default: return parseInt(rank, 10); // 4-10, 7 = face value
  }
}

export function cardPointsWithContext(cardId: CardId): number {
  if (cardId === "AS") return 60; // Ace of spades
  return cardPoints(cardId);
}

export function handScore(hand: CardId[]): number {
  return hand.reduce((sum, c) => sum + cardPointsWithContext(c), 0);
}

// === Cutting eligibility ===
// A player can play the 7 of the cutter suit if their hand total is < 20
export function canCut(hand: CardId[], cutterSuit: string): boolean {
  // The 7 of the cutter suit must be in hand
  const cutterId = `7${cutterSuit}`;
  if (!hand.includes(cutterId)) return false;

  // Compute hand total EXCLUDING the 7 itself (since we're about to play it)
  const rest = hand.filter(c => c !== cutterId);
  const total = handScore(rest);
  return total < 20;
}

// === Attack card detection ===
export function isAttackCard(cardId: CardId): boolean {
  const { rank, isJoker } = parseCard(cardId);
  return isJoker || rank === "2" || rank === "3";
}

export function attackPenalty(cardId: CardId): number {
  const { rank, isJoker } = parseCard(cardId);
  if (isJoker) return 5;
  if (rank === "2") return 2;
  if (rank === "3") return 3;
  return 0;
}

// === Valid counter check ===
// Returns true if `counter` can counter `attacker`
// Counter must share suit OR rank with attacker, AND be an attack card.
// Special joker color rule: to counter JOK_B, counter must be black suit (or JOK_B).
//   To counter JOK_R, counter must be red suit (or JOK_R).
export function canCounter(counter: CardId, topCard: CardId): boolean {
  if (!isAttackCard(counter)) return false;

  const counterParsed = parseCard(counter);
  const topParsed = parseCard(topCard);

  // Joker-specific color restriction
  if (topParsed.isBlackJoker) {
    // Can only counter with black suit cards or the other joker (JOK_B) — but only one joker per color
    if (counterParsed.isRedJoker) return false; // red joker can't counter black joker
    if (!counterParsed.isJoker && counterParsed.suit && !isBlackSuit(counterParsed.suit)) return false;
    return true;
  }
  if (topParsed.isRedJoker) {
    if (counterParsed.isBlackJoker) return false;
    if (!counterParsed.isJoker && counterParsed.suit && !isRedSuit(counterParsed.suit)) return false;
    return true;
  }

  // 2 or 3 on top — counter must share suit or rank
  if (!topParsed.suit) return false; // shouldn't happen
  
  const sameRank = counterParsed.rank === topParsed.rank;
  const sameSuit = !counterParsed.isJoker && counterParsed.suit === topParsed.suit;
  
  // Red joker can respond to a red-suit 2 or 3
  const jokerColorMatch = counterParsed.isJoker && (
    (isRedSuit(topParsed.suit!) && counterParsed.isRedJoker) ||
    (isBlackSuit(topParsed.suit!) && counterParsed.isBlackJoker)
  );

  return sameRank || sameSuit || jokerColorMatch;
}

// === When counter is "downgrading", calculate penalty picks ===
// If counter value < attacker value, counter player picks the difference
export function counterPenalty(counterCard: CardId, attackerCard: CardId): number {
  const counterVal = attackPenalty(counterCard);
  const attackerVal = attackPenalty(attackerCard);
  if (counterVal < attackerVal) {
    return attackerVal - counterVal;
  }
  return 0;
}

// === Normal play validation ===
// A card can be played on top of the current top card if it shares suit OR rank
// Ace of spades during attack = neutralise (always valid as a counter)
// Ace (non-spades) during normal play = valid (ignores suit/rank requirement)
// Jacks & 8s: must still match suit or rank
export type PlayValidity =
  | { valid: true; type: "normal" }
  | { valid: true; type: "ace_request" }          // ace played, can request suit
  | { valid: true; type: "ace_of_spades_neutralise" } // AoS neutralises attack
  | { valid: true; type: "ace_of_spades_request" }     // AoS during normal play
  | { valid: true; type: "attack" }               // 2/3/joker starting attack
  | { valid: true; type: "counter" }              // counter attack
  | { valid: true; type: "cut" }                  // plays the cutting 7
  | { valid: true; type: "jack_or_8" }            // jack/8 — keeps turn
  | { valid: false; reason: string };

export interface GameState {
  topCard: CardId | null;
  attackPending: { pendingPicks: number; attackerSide: string } | null;
  requestedSuit: string | null;
  cutterSuit: string | null;
  hand: CardId[];
}

export function validatePlay(
  cardId: CardId,
  state: GameState
): PlayValidity {
  const { topCard, attackPending, requestedSuit, cutterSuit, hand } = state;
  const { rank, suit, isJoker, isRedJoker, isBlackJoker } = parseCard(cardId);

  // === ATTACK MODE ===
  if (attackPending) {
    // Ace of spades neutralises any attack
    if (cardId === "AS") {
      return { valid: true, type: "ace_of_spades_neutralise" };
    }

    // Must counter the attack
    if (!topCard) return { valid: false, reason: "No top card to counter" };
    if (canCounter(cardId, topCard)) {
      return { valid: true, type: "counter" };
    }
    return { valid: false, reason: "During an attack you must counter (matching suit/rank attack card) or use Ace of Spades to neutralise" };
  }

  // === NORMAL PLAY ===

  // Ace of spades: can request suit (same as other aces in normal play)
  if (cardId === "AS") {
    if (!topCard) return { valid: true, type: "ace_of_spades_request" };
    // Ace of spades ignores suit/rank requirement — it's always playable in normal mode
    return { valid: true, type: "ace_of_spades_request" };
  }

  // Non-spades aces: can request suit regardless of top card (always playable in normal mode)
  if (rank === "A" && !isJoker) {
    return { valid: true, type: "ace_request" };
  }

  // If no top card yet (first play), anything goes
  if (!topCard) {
    // Check if this would be a cut
    if (rank === "7" && suit === cutterSuit) {
      if (canCut(hand, cutterSuit!)) {
        return { valid: true, type: "cut" };
      }
      return { valid: false, reason: "You can only play the cutting 7 when your hand total (excluding it) is under 20" };
    }
    if (isAttackCard(cardId)) return { valid: true, type: "attack" };
    if (rank === "J" || rank === "8") return { valid: true, type: "jack_or_8" };
    return { valid: true, type: "normal" };
  }

  const topParsed = parseCard(topCard);

  // Check if there's an active suit request
  const requiredSuit = requestedSuit;

  // Cutting card — the 7 of the cutter suit
  if (rank === "7" && suit === cutterSuit) {
    if (canCut(hand, cutterSuit!)) {
      // Must also match suit or number (7) unless there's a request
      if (requiredSuit) {
        if (suit === requiredSuit) return { valid: true, type: "cut" };
        // Can't play mismatched suit under a request unless it's the cutter AND matches
        return { valid: false, reason: `A suit of ${requiredSuit} was requested` };
      }
      // Normal matching
      const matchesSuit = !topParsed.isJoker && topParsed.suit === suit;
      const matchesRank = !topParsed.isJoker && topParsed.rank === "7";
      if (matchesSuit || matchesRank) return { valid: true, type: "cut" };
      return { valid: false, reason: "Card must match the suit or number of the top card" };
    }
    return { valid: false, reason: "You can only play the cutting 7 when your hand total (excluding it) is under 20" };
  }

  // Under a suit request, you must play that suit
  if (requiredSuit) {
    // Aces bypass suit request (already handled above)
    if (!isJoker && suit !== requiredSuit) {
      return { valid: false, reason: `A suit of ${requiredSuit} was requested — you must play a ${requiredSuit} card` };
    }
    // Jokers: follow color rule
    if (isRedJoker && !isRedSuit(requiredSuit)) {
      return { valid: false, reason: `A ${requiredSuit} suit was requested — red joker doesn't match` };
    }
    if (isBlackJoker && !isBlackSuit(requiredSuit)) {
      return { valid: false, reason: `A ${requiredSuit} suit was requested — black joker doesn't match` };
    }
    // Card matches requested suit
    if (isAttackCard(cardId)) return { valid: true, type: "attack" };
    if (rank === "J" || rank === "8") return { valid: true, type: "jack_or_8" };
    return { valid: true, type: "normal" };
  }

  // Standard suit/rank matching
  let matchesSuit = false;
  let matchesRank = false;

  if (!isJoker && !topParsed.isJoker) {
    matchesSuit = suit === topParsed.suit;
    matchesRank = rank === topParsed.rank;
  } else if (isJoker && !topParsed.isJoker) {
    // Joker matches suit via color
    const topSuit = topParsed.suit!;
    matchesSuit = (isRedJoker && isRedSuit(topSuit)) || (isBlackJoker && isBlackSuit(topSuit));
    matchesRank = false; // joker has no numeric rank
  } else if (!isJoker && topParsed.isJoker) {
    // Card played on top of a joker — joker resets, previous requestedSuit handled above
    // In practice after a joker is resolved (picked or neutralised), game resets
    // On a fresh game after AoS neutralise, topCard becomes the AoS, anything valid from there
    matchesSuit = true; // after neutralise, first player plays anything
    matchesRank = true;
  } else {
    // Joker on joker — same color
    matchesSuit = (isRedJoker && topParsed.isRedJoker) || (isBlackJoker && topParsed.isBlackJoker);
  }

  if (!matchesSuit && !matchesRank) {
    return { valid: false, reason: "Card must match the suit or number of the top card" };
  }

  // Valid play — classify type
  if (isAttackCard(cardId)) return { valid: true, type: "attack" };
  if (rank === "J" || rank === "8") return { valid: true, type: "jack_or_8" };
  return { valid: true, type: "normal" };
}

// === Deck reshuffle ===
// When draw pile is empty, take all discard pile cards except the top one, shuffle, return as new draw pile
export function reshuffleDeck(discardPile: CardId[]): { newDrawPile: CardId[]; newDiscardPile: CardId[] } {
  if (discardPile.length <= 1) {
    return { newDrawPile: [], newDiscardPile: discardPile };
  }
  const topCard = discardPile[discardPile.length - 1];
  const toShuffle = discardPile.slice(0, discardPile.length - 1);
  return {
    newDrawPile: shuffle(toShuffle),
    newDiscardPile: [topCard],
  };
}

// === Draw cards from pile (with auto-reshuffle) ===
export function drawCards(
  count: number,
  drawPile: CardId[],
  discardPile: CardId[]
): { drawn: CardId[]; newDrawPile: CardId[]; newDiscardPile: CardId[] } {
  let pile = [...drawPile];
  let discard = [...discardPile];
  const drawn: CardId[] = [];

  for (let i = 0; i < count; i++) {
    if (pile.length === 0) {
      // Reshuffle
      const reshuffled = reshuffleDeck(discard);
      pile = reshuffled.newDrawPile;
      discard = reshuffled.newDiscardPile;
    }
    if (pile.length === 0) break; // deck truly exhausted (rare)
    drawn.push(pile.pop()!);
  }

  return { drawn, newDrawPile: pile, newDiscardPile: discard };
}

// === Coin flip ===
export function coinFlip(): "player1" | "player2" {
  return Math.random() < 0.5 ? "player1" : "player2";
}
