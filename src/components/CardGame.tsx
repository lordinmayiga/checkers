import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { PlayingCard, CutterIndicatorCard } from "./PlayingCard";
import { handScore, validatePlay } from "../../convex/cardGameRules";
import { soundManager } from "../utils/sound";

interface CardGameProps {
  user: string;
  gameId: string;
  onLeave: () => void;
}

const SUIT_NAMES: Record<string, string> = { H: "Hearts ♥", D: "Diamonds ♦", S: "Spades ♠", C: "Clubs ♣" };
const SUIT_COLORS: Record<string, string> = { H: "#e74c3c", D: "#e74c3c", S: "#a0b0ff", C: "#a0b0ff" };

function parseCardId(cardId: string) {
  if (cardId === "JOK_R") return { rank: "JOKER", suit: null, isJoker: true, isRed: true };
  if (cardId === "JOK_B") return { rank: "JOKER", suit: null, isJoker: true, isRed: false };
  const suit = cardId.slice(-1);
  const rank = cardId.slice(0, -1);
  return { rank, suit, isJoker: false, isRed: suit === "H" || suit === "D" };
}

export const CardGame: React.FC<CardGameProps> = ({ user, gameId, onLeave }) => {
  const game = useQuery(api.cardGame.getCardGame, { gameId: gameId as any });
  const messages = useQuery(api.cardGame.getCardMessages, { gameId: gameId as any });

  const startGame = useMutation(api.cardGame.startCardGame);
  const playCardMutation = useMutation(api.cardGame.playCard);
  const pickCardMutation = useMutation(api.cardGame.pickCard);
  const passTurnMutation = useMutation(api.cardGame.passTurn);
  const requestSuitMutation = useMutation(api.cardGame.requestSuit);
  const deleteGame = useMutation(api.cardGame.deleteCardGame);
  const sendCardMessage = useMutation(api.cardGame.sendCardMessage);

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [showSuitPicker, setShowSuitPicker] = useState(false);
  const [pendingAceCard, setPendingAceCard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [chatText, setChatText] = useState("");

  const toastRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loggedMsgIdsRef = useRef<Set<string>>(new Set());

  // Intercept and print system game logs to console
  useEffect(() => {
    if (!messages) return;
    messages.forEach(msg => {
      if (msg.sender === "System" && !loggedMsgIdsRef.current.has(msg._id)) {
        console.log(`[Game Log] ${msg.text}`);
        loggedMsgIdsRef.current.add(msg._id);
      }
    });
  }, [messages]);

  const chatMessages = messages?.filter(msg => msg.sender !== "System") ?? [];

  const prevChatLengthRef = useRef<number>(0);

  // Chat alert sound trigger
  useEffect(() => {
    if (chatMessages.length > prevChatLengthRef.current) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg && lastMsg.sender !== user) {
        soundManager.playMessage();
      }
    }
    prevChatLengthRef.current = chatMessages.length;
  }, [chatMessages.length, user]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    try {
      await sendCardMessage({
        gameId: gameId as any,
        sender: user,
        text: chatText.trim(),
      });
      setChatText("");
    } catch (err) {
      triggerError("Failed to send message");
    }
  };

  // Animation tracking state
  const [animatingCards, setAnimatingCards] = useState<Record<string, {
    cardId: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    width: number;
    height: number;
    faceDown: boolean;
    target: "mine" | "opponent" | "discard";
    index: number;
  }>>({});

  // Bounding box refs for clicked cards
  const lastPlayedCardRectRef = useRef<DOMRect | null>(null);
  const lastPlayedCardIdRef = useRef<string | null>(null);

  // Hand state refs
  const isFirstRender = useRef(true);
  const prevStatusRef = useRef<string>("waiting");
  const prevDiscardPileRef = useRef<string[]>([]);
  const prevMyHandRef = useRef<string[]>([]);
  const prevOpponentHandRef = useRef<string[]>([]);

  useEffect(() => {
    if (game?.status === "finished") {
      setTimeout(() => setShowResult(true), 300);
    }
  }, [game?.status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Animation controller effect
  useEffect(() => {
    if (!game) return;

    const currentStatus = game.status;
    const currentDiscardPile = game.discardPile;
    const currentMyHand = game.player1 === user ? game.player1Hand : game.player2Hand;
    const currentOpponentHand = game.player1 === user ? game.player2Hand : game.player1Hand;

    // Initialize refs on first render/reload to prevent layout animations from running on load
    if (isFirstRender.current) {
      prevStatusRef.current = currentStatus;
      prevDiscardPileRef.current = currentDiscardPile;
      prevMyHandRef.current = currentMyHand;
      prevOpponentHandRef.current = currentOpponentHand;
      isFirstRender.current = false;
      return;
    }

    const prevStatus = prevStatusRef.current;
    const prevDiscardPile = prevDiscardPileRef.current;
    const prevMyHand = prevMyHandRef.current;
    const prevOpponentHand = prevOpponentHandRef.current;

    // Update tracking refs immediately for subsequent updates
    prevStatusRef.current = currentStatus;
    prevDiscardPileRef.current = currentDiscardPile;
    prevMyHandRef.current = currentMyHand;
    prevOpponentHandRef.current = currentOpponentHand;

    // Reset animating cards when game goes back to lobby or resets
    if (currentStatus === "waiting") {
      setAnimatingCards({});
      return;
    }

    if (currentStatus !== "active") return;

    const drawStackEl = document.getElementById("draw-pile");
    const discardPileEl = document.getElementById("discard-pile");

    // Helper for deal and pick animations (from draw-pile to hand)
    const triggerFlyToHand = (target: "mine" | "opponent", indices: number[]) => {
      if (!drawStackEl) return;
      const drawRect = drawStackEl.getBoundingClientRect();

      indices.forEach((index, idx) => {
        const elementId = target === "mine" ? `my-card-${index}` : `opponent-card-${index}`;
        const cardId = target === "mine" ? currentMyHand[index] : "BACK";

        setTimeout(() => {
          soundManager.playCardDeal(); // Deal card sound effect
          const targetEl = document.getElementById(elementId);
          if (!targetEl) return;
          const targetRect = targetEl.getBoundingClientRect();
          const animKey = `${target}-${index}-${Date.now()}-${idx}`;

          setAnimatingCards(prev => ({
            ...prev,
            [animKey]: {
              cardId,
              startX: drawRect.left,
              startY: drawRect.top,
              endX: targetRect.left,
              endY: targetRect.top,
              width: targetRect.width || (target === "mine" ? 90 : 60),
              height: targetRect.height || (target === "mine" ? 126 : 84),
              faceDown: target === "opponent",
              target,
              index,
            }
          }));

          setTimeout(() => {
            setAnimatingCards(prev => {
              const next = { ...prev };
              delete next[animKey];
              return next;
            });
          }, 550); // Matches CSS keyframe duration (550ms)
        }, idx * 100); // 100ms stagger
      });
    };

    // Helper for play animations (from hand to discard-pile)
    const triggerPlayToDiscard = (sender: "mine" | "opponent", cardId: string) => {
      if (!discardPileEl) return;
      const discardRect = discardPileEl.getBoundingClientRect();

      let startX = window.innerWidth / 2;
      let startY = sender === "mine" ? window.innerHeight - 150 : 150;

      if (sender === "mine") {
        if (lastPlayedCardRectRef.current && lastPlayedCardIdRef.current === cardId) {
          startX = lastPlayedCardRectRef.current.left;
          startY = lastPlayedCardRectRef.current.top;
        } else {
          const myHandEl = document.getElementById("my-hand");
          if (myHandEl) {
            const rect = myHandEl.getBoundingClientRect();
            startX = rect.left + rect.width / 2;
            startY = rect.top + rect.height / 2;
          }
        }
        // Clear the clicked card refs
        lastPlayedCardRectRef.current = null;
        lastPlayedCardIdRef.current = null;
      } else {
        const oppHandEl = document.getElementById("opponent-hand");
        if (oppHandEl) {
          const rect = oppHandEl.getBoundingClientRect();
          startX = rect.left + rect.width / 2;
          startY = rect.top + rect.height / 2;
        }
      }

      const animKey = `play-${cardId}-${Date.now()}`;
      
      // Dynamic chiptune play/attack/cut sound effects triggers
      const { rank, suit, isRed } = parseCardId(cardId);
      const isJoker = cardId === "JOK_R" || cardId === "JOK_B";
      const isAttack = isJoker || rank === "2" || rank === "3";
      const isCut = rank === "7" && suit === game.cutterSuit;

      if (isCut) {
        soundManager.playCardCut();
      } else if (isAttack) {
        soundManager.playCardAttack();
      } else {
        soundManager.playCardPlay();
      }

      setAnimatingCards(prev => ({
        ...prev,
        [animKey]: {
          cardId,
          startX,
          startY,
          endX: discardRect.left,
          endY: discardRect.top,
          width: 90,
          height: 126,
          faceDown: false,
          target: "discard",
          index: -1,
        }
      }));

      setTimeout(() => {
        setAnimatingCards(prev => {
          const next = { ...prev };
          delete next[animKey];
          return next;
        });
      }, 550);
    };

    // 1) ANIMATE INITIAL DEALING: waiting -> active
    if (prevStatus === "waiting" && currentStatus === "active") {
      const dealCount = 7;
      if (!drawStackEl) return;
      const drawRect = drawStackEl.getBoundingClientRect();

      for (let i = 0; i < dealCount; i++) {
        // Deal to local player
        const mineIdx = i;
        setTimeout(() => {
          soundManager.playCardDeal(); // Deal card sound effect
          const targetEl = document.getElementById(`my-card-${mineIdx}`);
          if (!targetEl) return;
          const targetRect = targetEl.getBoundingClientRect();
          const animKey = `deal-mine-${mineIdx}-${Date.now()}`;

          setAnimatingCards(prev => ({
            ...prev,
            [animKey]: {
              cardId: currentMyHand[mineIdx] || "BACK",
              startX: drawRect.left,
              startY: drawRect.top,
              endX: targetRect.left,
              endY: targetRect.top,
              width: targetRect.width || 90,
              height: targetRect.height || 126,
              faceDown: false,
              target: "mine",
              index: mineIdx,
            }
          }));

          setTimeout(() => {
            setAnimatingCards(prev => {
              const next = { ...prev };
              delete next[animKey];
              return next;
            });
          }, 550);
        }, (2 * i) * 120); // alternate stagger (0, 240, 480, 720...)

        // Deal to opponent
        const oppIdx = i;
        setTimeout(() => {
          soundManager.playCardDeal(); // Deal card sound effect
          const targetEl = document.getElementById(`opponent-card-${oppIdx}`);
          if (!targetEl) return;
          const targetRect = targetEl.getBoundingClientRect();
          const animKey = `deal-opp-${oppIdx}-${Date.now()}`;

          setAnimatingCards(prev => ({
            ...prev,
            [animKey]: {
              cardId: "BACK",
              startX: drawRect.left,
              startY: drawRect.top,
              endX: targetRect.left,
              endY: targetRect.top,
              width: targetRect.width || 60,
              height: targetRect.height || 84,
              faceDown: true,
              target: "opponent",
              index: oppIdx,
            }
          }));

          setTimeout(() => {
            setAnimatingCards(prev => {
              const next = { ...prev };
              delete next[animKey];
              return next;
            });
          }, 550);
        }, (2 * i + 1) * 120); // alternate stagger (120, 360, 600, 840...)
      }
      return;
    }

    // 2) ANIMATE CARD PLAYS: discard pile grows
    let playOccurred = false;
    let playedBy: "mine" | "opponent" | null = null;
    let playedCardId: string | null = null;

    if (currentDiscardPile.length > prevDiscardPile.length) {
      playOccurred = true;
      playedCardId = currentDiscardPile[currentDiscardPile.length - 1];
      if (lastPlayedCardIdRef.current === playedCardId) {
        playedBy = "mine";
        triggerPlayToDiscard("mine", playedCardId);
      } else {
        playedBy = "opponent";
        triggerPlayToDiscard("opponent", playedCardId);
      }
    }

    // 3) ANIMATE CARD PICKS / DRAW PENALTIES
    // My hand draw check
    const expectedMyHandLength = (playOccurred && playedBy === "mine") ? prevMyHand.length - 1 : prevMyHand.length;
    if (currentMyHand.length > expectedMyHandLength) {
      const newIndices = Array.from({ length: currentMyHand.length - expectedMyHandLength }, (_, i) => expectedMyHandLength + i);
      triggerFlyToHand("mine", newIndices);
    }

    // Opponent hand draw check
    const expectedOpponentHandLength = (playOccurred && playedBy === "opponent") ? prevOpponentHand.length - 1 : prevOpponentHand.length;
    if (currentOpponentHand.length > expectedOpponentHandLength) {
      const newIndices = Array.from({ length: currentOpponentHand.length - expectedOpponentHandLength }, (_, i) => expectedOpponentHandLength + i);
      triggerFlyToHand("opponent", newIndices);
    }

  }, [game?.status, game?.player1, game?.player1Hand, game?.player2Hand, game?.discardPile, user]);

  const triggerToast = (msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  };

  const triggerError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  };

  if (!game) return <div className="cg-loading">Loading game...</div>;

  const side = game.player1 === user ? "player1" : game.player2 === user ? "player2" : null;
  const myHand: string[] = side ? (side === "player1" ? game.player1Hand : game.player2Hand) : [];
  const opponentHand: string[] = side ? (side === "player1" ? game.player2Hand : game.player1Hand) : [];
  const opponentName = side === "player1" ? game.player2 : game.player1;
  const isMyTurn = game.status === "active" && game.currentTurn === side;
  const topCard = game.discardPile.length > 0 ? game.discardPile[game.discardPile.length - 1] : null;
  const myScore = handScore(myHand);
  const cutterSuit = game.cutterSuit ?? null;
  const attackPending = game.attackPending ?? null;

  // Animation layout sets
  const animatingMineIndices = new Set(
    Object.values(animatingCards)
      .filter(c => c.target === "mine")
      .map(c => c.index)
  );

  const animatingOpponentIndices = new Set(
    Object.values(animatingCards)
      .filter(c => c.target === "opponent")
      .map(c => c.index)
  );

  const isDiscardAnimating = Object.values(animatingCards).some(c => c.target === "discard");
  const renderedDiscardCard = isDiscardAnimating
    ? (game.discardPile.length >= 2 ? game.discardPile[game.discardPile.length - 2] : null)
    : (game.discardPile.length > 0 ? game.discardPile[game.discardPile.length - 1] : null);

  const getRenderedUnderCard = () => {
    if (isDiscardAnimating) {
      if (game.discardPile.length >= 3) {
        return game.discardPile[game.discardPile.length - 3];
      }
      return null;
    }
    if (game.discardPile.length >= 2) {
      return game.discardPile[game.discardPile.length - 2];
    }
    return null;
  };
  const renderedUnderCard = getRenderedUnderCard();

  // Determine which cards in my hand are playable
  const playableCards = isMyTurn ? myHand.filter(cardId => {
    const v = validatePlay(cardId, {
      topCard,
      attackPending: attackPending,
      requestedSuit: game.requestedSuit ?? null,
      cutterSuit,
      hand: myHand,
    });
    return v.valid;
  }) : [];

  const handleCardClick = async (cardId: string) => {
    if (!isMyTurn) return;
    if (!playableCards.includes(cardId)) {
      if (selectedCard === cardId) {
        setSelectedCard(null);
        return;
      }
      setSelectedCard(cardId);
      return;
    }

    const { rank } = parseCardId(cardId);
    const isAce = rank === "A";

    if (isAce) {
      // Show suit picker first
      setSelectedCard(cardId);
      setPendingAceCard(cardId);
      setShowSuitPicker(true);
      return;
    }

    setSelectedCard(cardId);

    // Save coordinate of the card before playing it!
    const myHandIndex = myHand.indexOf(cardId);
    if (myHandIndex >= 0) {
      const el = document.getElementById(`my-card-${myHandIndex}`);
      if (el) {
        lastPlayedCardRectRef.current = el.getBoundingClientRect();
        lastPlayedCardIdRef.current = cardId;
      }
    }

    try {
      await playCardMutation({ gameId: gameId as any, playerName: user, cardId });
      setSelectedCard(null);
    } catch (e: any) {
      triggerError(e.message || "Failed to play card");
      setSelectedCard(null);
      lastPlayedCardRectRef.current = null;
      lastPlayedCardIdRef.current = null;
    }
  };

  const handleSuitSelect = async (suit: string) => {
    if (!pendingAceCard) return;
    setShowSuitPicker(false);

    // Save coordinate of the Ace card before playing it!
    const myHandIndex = myHand.indexOf(pendingAceCard);
    if (myHandIndex >= 0) {
      const el = document.getElementById(`my-card-${myHandIndex}`);
      if (el) {
        lastPlayedCardRectRef.current = el.getBoundingClientRect();
        lastPlayedCardIdRef.current = pendingAceCard;
      }
    }

    try {
      await playCardMutation({ gameId: gameId as any, playerName: user, cardId: pendingAceCard, requestSuit: suit });
      await requestSuitMutation({ gameId: gameId as any, playerName: user, suit });
      setSelectedCard(null);
      setPendingAceCard(null);
    } catch (e: any) {
      triggerError(e.message || "Failed to play ace");
      setSelectedCard(null);
      setPendingAceCard(null);
      lastPlayedCardRectRef.current = null;
      lastPlayedCardIdRef.current = null;
    }
  };

  const handlePick = async () => {
    try {
      await pickCardMutation({ gameId: gameId as any, playerName: user });
    } catch (e: any) {
      triggerError(e.message || "Cannot pick card");
    }
  };

  const handlePass = async () => {
    try {
      await passTurnMutation({ gameId: gameId as any, playerName: user });
    } catch (e: any) {
      triggerError(e.message || "Cannot pass turn");
    }
  };

  const handleStart = async () => {
    try {
      await startGame({ gameId: gameId as any, playerName: user });
    } catch (e: any) {
      triggerError(e.message || "Failed to start game");
    }
  };

  const handleDelete = async () => {
    if (confirm("Delete this game?")) {
      try {
        await deleteGame({ gameId: gameId as any });
        onLeave();
      } catch (e: any) {
        triggerError("Failed to delete game");
      }
    }
  };

  const copyLink = () => {
    const matchId = gameId.slice(-6).toUpperCase();
    navigator.clipboard.writeText(matchId);
    triggerToast(`Match ID ${matchId} copied!`);
  };

  return (
    <div className="cg-layout">
      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className="cg-sidebar">
        <div className="cg-sidebar-header">
          <div className="cg-logo">🃏 CARDS</div>
          <div className="cg-version">V.1.0.0</div>
        </div>

        <div className="cg-sidebar-body">
          {/* Player info */}
          <div className="cg-info-box">
            <div className="cg-info-label">YOU</div>
            <div className="cg-info-val">{user}</div>
          </div>
          <div className="cg-info-box" style={{ marginTop: 8 }}>
            <div className="cg-info-label">OPPONENT</div>
            <div className="cg-info-val cg-opponent">{opponentName || "Waiting..."}</div>
          </div>

          {/* Game info */}
          {game.status === "active" && cutterSuit && (
            <div className="cg-info-box" style={{ marginTop: 8 }}>
              <div className="cg-info-label">CUTTER SUIT</div>
              <div className="cg-info-val" style={{ color: SUIT_COLORS[cutterSuit] }}>
                {SUIT_NAMES[cutterSuit]} (7 of {cutterSuit})
              </div>
            </div>
          )}

          {game.status === "active" && (
            <div className="cg-info-box" style={{ marginTop: 8 }}>
              <div className="cg-info-label">MY HAND VALUE</div>
              <div className="cg-info-val" style={{ color: myScore < 20 ? "#10b981" : "#f59e0b" }}>
                {myScore} pts {myScore < 20 && cutterSuit && myHand.includes(`7${cutterSuit}`) ? "⚡ CAN CUT" : ""}
              </div>
            </div>
          )}

          {game.status === "active" && game.requestedSuit && (
            <div className="cg-info-box cg-suit-request" style={{ marginTop: 8 }}>
              <div className="cg-info-label">SUIT REQUESTED</div>
              <div style={{ fontSize: "1.3rem", color: SUIT_COLORS[game.requestedSuit], fontWeight: "bold" }}>
                {SUIT_NAMES[game.requestedSuit]}
              </div>
            </div>
          )}

          {attackPending && (
            <div className="cg-info-box cg-attack-box" style={{ marginTop: 8 }}>
              <div className="cg-info-label">⚔ ATTACK ACTIVE</div>
              <div style={{ fontSize: "1.1rem", color: "#f43f5e", fontWeight: "bold" }}>
                {isMyTurn ? `You must pick ${attackPending.pendingPicks} or counter!` : `Opponent must pick ${attackPending.pendingPicks}`}
              </div>
            </div>
          )}

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 16 }}>
            <button className="cg-btn cg-btn-secondary" onClick={onLeave}>← LEAVE</button>
            <button className="cg-btn cg-btn-danger" onClick={handleDelete}>☠ DELETE</button>
            <button className="cg-btn cg-btn-secondary" onClick={copyLink}>🔗 COPY ID</button>
          </div>
        </div>
      </aside>

      {/* ── Main Board ──────────────────────────────── */}
      <main className="cg-main">
        {/* Status bar */}
        <div className="cg-status-bar">
          <div className={`cg-turn-indicator ${isMyTurn ? "my-turn" : "their-turn"}`}>
            {game.status === "waiting"
              ? "WAITING FOR OPPONENT"
              : game.status === "finished"
                ? `GAME OVER — ${game.winner?.toUpperCase()} WINS!`
                : isMyTurn
                  ? attackPending ? "YOUR TURN — COUNTER OR PICK!" : "YOUR TURN"
                  : `${(opponentName || "OPPONENT").toUpperCase()}'S TURN`
            }
          </div>
          <div className="cg-match-id">MATCH // {gameId.slice(-6).toUpperCase()}</div>
        </div>

        {/* Error banner */}
        {error && <div className="cg-error-banner">❌ {error.toUpperCase()}</div>}

        {/* Waiting state */}
        {game.status === "waiting" && (
          <div className="cg-waiting-area">
            <div className="cg-waiting-card">
              <h2>🃏 CARDS GAME LOBBY</h2>
              <p>Share your Match ID with your opponent:</p>
              <div className="cg-match-code">{gameId.slice(-6).toUpperCase()}</div>
              {!game.player2 ? (
                <p style={{ color: "#666", fontSize: "0.9rem" }}>Waiting for opponent to join...</p>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <p style={{ color: "#10b981" }}>✓ {game.player2} joined!</p>
                  {game.player1 === user && (
                    <button className="cg-btn cg-btn-primary" style={{ marginTop: 12, width: "100%", padding: "14px" }} onClick={handleStart}>
                      🎮 START GAME
                    </button>
                  )}
                  {game.player2 === user && (
                    <p style={{ color: "#aaa", fontSize: "0.9rem", marginTop: 8 }}>Waiting for host to start...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active game board */}
        {game.status === "active" && (
          <div className="cg-board">
            {/* Opponent's hand (face down) */}
            <div className="cg-opponent-area">
              <div className="cg-player-label">
                {opponentName || "Opponent"} — {opponentHand.length} cards
                {opponentHand.length === 2 && <span className="cg-warning">⚠ WARNING!</span>}
              </div>
              <div className="cg-hand cg-hand-opponent" id="opponent-hand">
                {opponentHand.map((_, i) => {
                  const isAnimating = animatingOpponentIndices.has(i);
                  return (
                    <div
                      key={i}
                      id={`opponent-card-${i}`}
                      style={{
                        marginLeft: i === 0 ? 0 : (opponentHand.length > 10 ? -30 : -20),
                        zIndex: i,
                        visibility: isAnimating ? "hidden" : "visible",
                        display: "inline-block",
                      }}
                    >
                      <PlayingCard
                        cardId="BACK"
                        faceDown={true}
                        small={opponentHand.length > 8}
                      />
                    </div>
                  );
                })}
                {opponentHand.length === 0 && <span style={{ color: "#aaa" }}>No cards</span>}
              </div>
            </div>

            {/* Center play area */}
            <div className="cg-center-area">
              {/* Draw pile + cutter */}
              <div className="cg-pile-section">
                <div className="cg-pile-group">
                  {/* Cutter indicator */}
                  {game.cutterIndicatorCard && (
                    <div className="cg-cutter-wrap">
                      <div className="cg-pile-label">CUTTER</div>
                      <CutterIndicatorCard cardId={game.cutterIndicatorCard} />
                    </div>
                  )}

                  {/* Draw pile */}
                  <div className="cg-draw-pile-wrap" onClick={isMyTurn && !attackPending && !game.hasPickedThisTurn ? handlePick : undefined}
                    style={{ cursor: isMyTurn && !attackPending && !game.hasPickedThisTurn ? "pointer" : "default" }}>
                    <div className="cg-pile-label">DRAW ({game.drawPile.length})</div>
                    <div className="cg-draw-stack" id="draw-pile">
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ position: "absolute", top: -i * 2, left: -i * 2, zIndex: i }}>
                          <PlayingCard cardId="BACK" faceDown={true} />
                        </div>
                      ))}
                    </div>
                    {isMyTurn && !attackPending && !game.hasPickedThisTurn && (
                      <div className="cg-pile-hint">CLICK TO PICK</div>
                    )}
                  </div>
                </div>

                {/* Discard pile */}
                <div className="cg-discard-wrap">
                  <div className="cg-pile-label">DISCARD ({game.discardPile.length})</div>
                  <div className="cg-discard-pile" id="discard-pile" style={{ position: "relative" }}>
                    {renderedUnderCard && (
                      <div
                        key={renderedUnderCard}
                        className="cg-discard-under-card"
                      >
                        <PlayingCard cardId={renderedUnderCard} />
                      </div>
                    )}
                    {renderedDiscardCard ? (
                      <div style={{ position: "relative", zIndex: 2 }}>
                        <PlayingCard cardId={renderedDiscardCard} />
                      </div>
                    ) : (
                      <div className="cg-empty-pile">EMPTY</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {isMyTurn && (
                <div className="cg-action-btns">
                  {attackPending && (
                    <button className="cg-btn cg-btn-danger cg-pick-btn" onClick={handlePick}>
                      PICK {attackPending.pendingPicks} CARD{attackPending.pendingPicks !== 1 ? "S" : ""}
                    </button>
                  )}
                  {game.hasPickedThisTurn && !attackPending && (
                    <button className="cg-btn cg-btn-secondary" onClick={handlePass}>
                      PASS TURN
                    </button>
                  )}
                  {!attackPending && !game.hasPickedThisTurn && (
                    <button className="cg-btn cg-btn-secondary" onClick={handlePick}>
                      PICK CARD
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* My hand */}
            <div className="cg-my-area">
              <div className="cg-player-label cg-my-label">
                {user} — {myHand.length} cards | {myScore}pts
                {myHand.length === 2 && <span className="cg-warning">⚠ WARNING!</span>}
              </div>
              <div className="cg-hand cg-hand-mine" id="my-hand">
                {myHand.map((cardId, i) => {
                  const canPlay = playableCards.includes(cardId);
                  const isAnimating = animatingMineIndices.has(i);
                  return (
                    <div
                      key={cardId + i}
                      id={`my-card-${i}`}
                      style={{
                        marginLeft: i === 0 ? 0 : (myHand.length > 10 ? -28 : myHand.length > 7 ? -18 : -8),
                        zIndex: selectedCard === cardId ? 50 : i,
                        visibility: isAnimating ? "hidden" : "visible",
                        display: "inline-block",
                      }}
                    >
                      <PlayingCard
                        cardId={cardId}
                        selected={selectedCard === cardId}
                        playable={canPlay && isMyTurn}
                        disabled={!isMyTurn || (!canPlay && selectedCard !== cardId)}
                        onClick={() => handleCardClick(cardId)}
                      />
                    </div>
                  );
                })}
                {myHand.length === 0 && <span style={{ color: "#10b981", fontSize: "1.2rem" }}>No cards — you should have won!</span>}
              </div>
            </div>
          </div>
        )}

        {/* Finished game result overlay */}
        {game.status === "finished" && showResult && (
          <div className="cg-result-overlay">
            <div className="cg-result-card">
              <div className="cg-result-icon">{game.winner === user ? "🏆" : "💀"}</div>
              <h2 className="cg-result-title">{game.winner === user ? "YOU WIN!" : "YOU LOSE!"}</h2>
              <div className="cg-result-winner">WINNER: {game.winner?.toUpperCase()}</div>
              {game.player1Score !== undefined && (
                <div className="cg-result-scores">
                  <div className="cg-score-row">
                    <span>{game.player1}</span>
                    <span>{game.player1Score} pts</span>
                  </div>
                  <div className="cg-score-row">
                    <span>{game.player2}</span>
                    <span>{game.player2Score} pts</span>
                  </div>
                </div>
              )}
              <button className="cg-btn cg-btn-primary" style={{ marginTop: 24, width: "100%" }} onClick={onLeave}>
                BACK TO LOBBY
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Chat panel ─────────────────────────── */}
      <aside className="cg-chat">
        <div className="cg-chat-header">CHAT</div>
        <div className="cg-chat-messages">
          {chatMessages.map((msg, i) => (
            <div key={msg._id || i} className={`cg-msg ${msg.sender === user ? "cg-msg-self" : "cg-msg-opponent"}`}>
              <span className="cg-msg-sender" style={{ color: msg.sender === user ? "var(--neon-blue)" : "var(--neon-pink)" }}>
                {msg.sender === user ? "You" : msg.sender}:
              </span>
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSendChat} className="cg-chat-input-area">
          <input
            type="text"
            className="cg-chat-input"
            placeholder="Type a message..."
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
          />
          <button type="submit" className="cg-chat-send-btn">
            SEND
          </button>
        </form>
      </aside>

      {/* ── Flying Cards Animation Overlay ───────────────── */}
      {Object.entries(animatingCards).map(([key, anim]) => {
        return (
          <div
            key={key}
            className="cg-flying-card"
            style={{
              left: 0,
              top: 0,
              width: `${anim.width}px`,
              height: `${anim.height}px`,
              transform: `translate3d(${anim.startX}px, ${anim.startY}px, 0)`,
              animation: "flyCard 0.55s cubic-bezier(0.25, 1, 0.5, 1) forwards",
              // Pass custom CSS variables
              ["--start-x" as any]: `${anim.startX}px`,
              ["--start-y" as any]: `${anim.startY}px`,
              ["--end-x" as any]: `${anim.endX}px`,
              ["--end-y" as any]: `${anim.endY}px`,
            }}
          >
            <PlayingCard
              cardId={anim.cardId}
              faceDown={anim.faceDown}
              small={anim.target === "opponent" && opponentHand.length > 8}
            />
          </div>
        );
      })}

      {/* ── Suit picker modal ─────────────────────────── */}
      {showSuitPicker && (
        <div className="cg-modal-overlay">
          <div className="cg-modal">
            <h3>Choose a suit to request</h3>
            <div className="cg-suit-grid">
              {(["H", "D", "S", "C"] as const).map(s => (
                <button key={s} className="cg-suit-btn" style={{ color: SUIT_COLORS[s] }}
                  onClick={() => handleSuitSelect(s)}>
                  {SUIT_NAMES[s]}
                </button>
              ))}
            </div>
            <button className="cg-btn cg-btn-secondary" style={{ marginTop: 12, width: "100%" }}
              onClick={() => { setShowSuitPicker(false); setPendingAceCard(null); setSelectedCard(null); }}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────── */}
      {toast && <div className="cg-toast">&gt; {toast.toUpperCase()}</div>}
    </div>
  );
};
