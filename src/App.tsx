import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { ConvexProvider, ConvexReactClient, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { LoginGate } from "./components/LoginGate";
import { Lobby } from "./components/Lobby";
import { CardGame } from "./components/CardGame";
import { CardGameLobby } from "./components/CardGameLobby";
import "./App.css";

import { getAvailableMoves } from "../convex/checkersRules";
import { soundManager } from "./utils/sound";

// Initialize Convex client
const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("VITE_CONVEX_URL is not defined in environment variables!");
}
const convex = new ConvexReactClient(convexUrl || "http://127.0.0.1:3210");

// Helper to parse pasted lobby link or match code
function extractGameIdOrCode(input: string): string {
  const trimmed = input.trim();
  try {
    // Try to parse as URL
    const url = new URL(trimmed);
    const gameId = url.searchParams.get("gameId");
    if (gameId) return gameId;
  } catch (e) {
    // Not a valid URL, check if it's a URL-like string containing ?gameId=
    if (trimmed.includes("gameId=")) {
      const parts = trimmed.split("gameId=");
      if (parts.length > 1) {
        return parts[1].split("&")[0];
      }
    }
  }
  return trimmed;
}

function AppContent() {
  const [user, setUser] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGame_mode, setActiveGame_mode] = useState<"checkers" | "cards">("checkers");
  const [activeCardGameId, setActiveCardGameId] = useState<string | null>(null);
  
  // Mobile layout state variables
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const triggerToast = (msg: string) => {
    setToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Scroll handling for mobile navbar auto-fade
  const lastScrollTop = useRef(0);
  const navbarTimeoutRef = useRef<any>(null);

  const startNavbarFadeTimer = () => {
    if (navbarTimeoutRef.current) clearTimeout(navbarTimeoutRef.current);
    navbarTimeoutRef.current = setTimeout(() => {
      setIsNavbarVisible(false);
    }, 3000); // 3 seconds timeout
  };

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth <= 768) {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const delta = scrollTop - lastScrollTop.current;
        
        if (delta < -8) {
          // Scrolling up - show navbar
          setIsNavbarVisible(true);
          startNavbarFadeTimer();
        } else if (delta > 8 && scrollTop > 60) {
          // Scrolling down - hide navbar immediately
          setIsNavbarVisible(false);
          if (navbarTimeoutRef.current) clearTimeout(navbarTimeoutRef.current);
        }
        lastScrollTop.current = scrollTop;
      }
    };

    const handleInteraction = () => {
      if (window.innerWidth <= 768) {
        setIsNavbarVisible(true);
        startNavbarFadeTimer();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("touchstart", handleInteraction, { passive: true });
    window.addEventListener("mousemove", handleInteraction, { passive: true });

    startNavbarFadeTimer();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("touchstart", handleInteraction);
      window.removeEventListener("mousemove", handleInteraction);
      if (navbarTimeoutRef.current) clearTimeout(navbarTimeoutRef.current);
    };
  }, []);

  // Local game interaction state
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number | null>(null);
  const [validDestinations, setValidDestinations] = useState<number[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<any>(null);

  const [soundMuted, setSoundMuted] = useState(soundManager.isMuted());

  const handleToggleSound = () => {
    const nextMuted = !soundMuted;
    soundManager.setMuted(nextMuted);
    setSoundMuted(nextMuted);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const logMoveFailure = (msg: string) => {
    console.warn(`[Checkers Move Failure] ${msg}`);
    soundManager.playError();
    setFeedbackMessage(msg);
    setAnnouncement(msg);
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedbackMessage(null);
    }, 4500);
  };

  // Slices 5 & 6 states
  const [chatOpen, setChatOpen] = useState(true); // Default open on desktop
  const [chatInput, setChatInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [prevMessageCount, setPrevMessageCount] = useState(0);

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [keyboardMode, setKeyboardMode] = useState(false);

  const [announcement, setAnnouncement] = useState("");
  const [lastMsgId, setLastMsgId] = useState<string | null>(null);

  // Mutations
  const createGameMutation = useMutation(api.games.createGame);
  const joinGameMutation = useMutation(api.games.joinGame);
  const makeMoveMutation = useMutation(api.games.makeMove);
  const sendMessageMutation = useMutation(api.games.sendMessage);
  const deleteGameMutation = useMutation(api.games.deleteGame);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch active game ID from URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get("gameId");
    if (gameId) {
      setActiveGameId(gameId);
    }
    const cardGameId = params.get("cardGameId");
    if (cardGameId) {
      setActiveCardGameId(cardGameId);
      setActiveGame_mode("cards");
    }
    const mode = params.get("mode");
    if (mode === "cards") {
      setActiveGame_mode("cards");
    }

    const savedUser = localStorage.getItem("checkers_user");
    if (savedUser) {
      setUser(savedUser);
    }
  }, []);

  // Fetch games for the active user
  const games = useQuery(api.games.getGames, user ? { user } : "skip");

  // Fetch active game details
  const activeGame = useQuery(
    api.games.getGame,
    activeGameId ? { gameId: activeGameId as any } : "skip"
  );

  // Fetch chat/log messages for the active game
  const messages = useQuery(
    api.games.getMessages,
    activeGameId ? { gameId: activeGameId as any } : "skip"
  );

  // Sound effects for Game Start and Game Over (Win/Loss)
  const prevStatusRef = useRef<string | null>(null);
  const prevActiveGameIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeGame) {
      prevStatusRef.current = null;
      prevActiveGameIdRef.current = null;
      return;
    }

    const currentStatus = activeGame.status;
    const currentGameId = activeGame._id;

    if (currentGameId !== prevActiveGameIdRef.current) {
      // Switched to or loaded a game in progress
      if (currentStatus === "playing") {
        soundManager.playGameStart();
      }
    } else {
      // Status changed in the current game
      if (prevStatusRef.current === "waiting" && currentStatus === "playing") {
        soundManager.playGameStart();
      } else if (prevStatusRef.current === "playing" && currentStatus === "finished") {
        if (activeGame.winner === user) {
          soundManager.playWin();
        } else {
          soundManager.playLoss();
        }
      }
    }

    prevStatusRef.current = currentStatus;
    prevActiveGameIdRef.current = currentGameId;
  }, [activeGame, user]);

  // Auto-join opponent if visiting direct link
  useEffect(() => {
    if (activeGameId && user && activeGame) {
      // If we are not the creator and player2 is empty, join!
      if (activeGame.player1 !== user && !activeGame.player2) {
        joinGameMutation({ gameId: activeGameId as any, player2: user }).catch(
          (err) => console.error("Error joining game:", err)
        );
      }
    }
  }, [activeGameId, user, activeGame, joinGameMutation]);

  // Auto-scroll chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (chatOpen && messages) {
      const timer = setTimeout(scrollToBottom, 50);
      return () => clearTimeout(timer);
    }
  }, [messages, chatOpen]);

  // Track unread messages
  useEffect(() => {
    if (messages) {
      if (!chatOpen && prevMessageCount > 0 && messages.length > prevMessageCount) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.sender !== "System" && lastMsg.sender !== user) {
          setUnreadCount((prev) => prev + (messages.length - prevMessageCount));
        }
      }
      setPrevMessageCount(messages.length);
    }
  }, [messages, chatOpen, prevMessageCount, user]);

  // Play sound when another user sends a chat message
  const prevMessageLenRef = useRef<number>(0);
  useEffect(() => {
    if (!messages) return;
    if (prevMessageLenRef.current > 0 && messages.length > prevMessageLenRef.current) {
      const newestMsg = messages[messages.length - 1];
      if (newestMsg.sender !== "System" && newestMsg.sender !== user) {
        soundManager.playMessage();
      }
    }
    prevMessageLenRef.current = messages.length;
  }, [messages, user]);

  // Screen reader announcements
  useEffect(() => {
    if (!activeGame) return;

    const isPlayer1 = activeGame.player1 === user;
    const isPlayer2 = activeGame.player2 === user;
    const p1Color = activeGame.player1Color ?? "W";
    const localUserColor = isPlayer1
      ? p1Color
      : isPlayer2
        ? (p1Color === "W" ? "B" : "W")
        : null;
    const nextPlayerName = activeGame.turn === p1Color ? activeGame.player1 : (activeGame.player2 || "Opponent");
    const isNextPlayerMe = activeGame.turn === localUserColor;
    const turnAnnounce = isNextPlayerMe
      ? "It is now your turn."
      : `It is now ${nextPlayerName}'s turn.`;

    if (messages && messages.length > 0) {
      const latestMsg = messages[messages.length - 1];
      if (latestMsg._id !== lastMsgId) {
        setLastMsgId(latestMsg._id);
        if (latestMsg.sender === "System") {
          setAnnouncement(`${latestMsg.text}. ${turnAnnounce}`);
        } else {
          setAnnouncement(`${latestMsg.sender} says: "${latestMsg.text}"`);
        }
      }
    } else {
      setAnnouncement(turnAnnounce);
    }
  }, [activeGame?.turn, messages, user, activeGame?.player1, activeGame?.player2, lastMsgId]);

  // Game move animation logic using the FLIP (First, Last, Invert, Play) technique
  const prevBoardRef = useRef<(string | null)[] | null>(null);
  const prevGameIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!activeGame || !activeGame.board) {
      prevBoardRef.current = null;
      prevGameIdRef.current = null;
      return;
    }

    // If we switched games, don't animate the initial board render
    if (prevGameIdRef.current !== activeGame._id) {
      prevBoardRef.current = activeGame.board;
      prevGameIdRef.current = activeGame._id;
      return;
    }

    const prevBoard = prevBoardRef.current;
    const newBoard = activeGame.board;
    prevBoardRef.current = newBoard;

    if (!prevBoard) return;

    // Detect if a single piece moved
    const fromIndices: number[] = [];
    const toIndices: number[] = [];

    for (let i = 0; i < 64; i++) {
      if (prevBoard[i] !== newBoard[i]) {
        if (prevBoard[i] !== null && newBoard[i] === null) {
          fromIndices.push(i);
        } else if (prevBoard[i] === null && newBoard[i] !== null) {
          toIndices.push(i);
        } else if (prevBoard[i] !== null && newBoard[i] !== null) {
          // Changed type e.g. W -> WK (promotion destination)
          fromIndices.push(i);
          toIndices.push(i);
        }
      }
    }

    if (fromIndices.length > 0 || toIndices.length > 0) {
      const prevPieceCount = prevBoard.filter((x) => x !== null).length;
      const newPieceCount = newBoard.filter((x) => x !== null).length;

      const prevKingCount = prevBoard.filter((x) => x === "WK" || x === "BK").length;
      const newKingCount = newBoard.filter((x) => x === "WK" || x === "BK").length;

      if (newKingCount > prevKingCount) {
        soundManager.playKing();
      } else if (newPieceCount < prevPieceCount) {
        soundManager.playCapture();
      } else {
        soundManager.playMove();
      }
    }

    // We expect exactly one destination square for a move
    if (toIndices.length === 1) {
      const toIndex = toIndices[0];
      const newPiece = newBoard[toIndex];

      // Find the starting square of the piece that moved
      const fromIndex = fromIndices.find((idx) => {
        const prevPiece = prevBoard[idx];
        if (!prevPiece || !newPiece) return false;
        const isWhite = prevPiece.startsWith("W") && newPiece.startsWith("W");
        const isBlack = prevPiece.startsWith("B") && newPiece.startsWith("B");
        return isWhite || isBlack;
      });

      if (fromIndex !== undefined && fromIndex !== toIndex) {
        // Find elements in the DOM
        const fromEl = document.querySelector(`[data-square-index="${fromIndex}"]`);
        const toEl = document.querySelector(`[data-square-index="${toIndex}"]`);

        if (fromEl && toEl) {
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();
          const dx = fromRect.left - toRect.left;
          const dy = fromRect.top - toRect.top;

          const pieceEl = toEl.querySelector(".piece") as HTMLElement;
          if (pieceEl) {
            // Apply the inverse translation instantly
            pieceEl.style.transition = "none";
            pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
            
            // Force a reflow
            pieceEl.getBoundingClientRect();

            // Set transition and target transform
            pieceEl.style.transition = "transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)";
            pieceEl.style.transform = "translate(0, 0)";

            // Clean up transition inline style once finished
            const handleTransitionEnd = () => {
              pieceEl.style.transition = "";
              pieceEl.style.transform = "";
              pieceEl.removeEventListener("transitionend", handleTransitionEnd);
            };
            pieceEl.addEventListener("transitionend", handleTransitionEnd);
          }
        }
      }
    }
  }, [activeGame?.board, activeGame?._id]);

  const handleLogin = (username: string) => {
    localStorage.setItem("checkers_user", username);
    setUser(username);
  };

  const handleLogout = () => {
    localStorage.removeItem("checkers_user");
    setUser(null);
    setActiveGameId(null);
    setActiveCardGameId(null);
    setActiveGame_mode("checkers");
    window.history.pushState({}, "", window.location.pathname);
  };

  const handleEnterCardGame = (gameId: string) => {
    setActiveCardGameId(gameId);
    setActiveGame_mode("cards");
    window.history.pushState({}, "", `?cardGameId=${gameId}`);
  };

  const handleLeaveCardGame = () => {
    setActiveCardGameId(null);
    window.history.pushState({}, "", `?mode=cards`);
  };

  const handleSwitchToCards = () => {
    setActiveGame_mode("cards");
    setActiveCardGameId(null);
    setActiveGameId(null);
    window.history.pushState({}, "", `?mode=cards`);
  };

  const handleSwitchToCheckers = () => {
    setActiveGame_mode("checkers");
    setActiveCardGameId(null);
    window.history.pushState({}, "", window.location.pathname);
  };

  const handleCreateGame = async (playerColor: "W" | "B") => {
    if (!user) return;
    try {
      const newGameId = await createGameMutation({ player1: user, player1Color: playerColor });
      window.history.pushState({}, "", `?gameId=${newGameId}`);
      setActiveGameId(newGameId);
    } catch (err) {
      console.error("Failed to create game:", err);
    }
  };

  const handleSelectGame = (gameId: string) => {
    window.history.pushState({}, "", `?gameId=${gameId}`);
    setActiveGameId(gameId);
  };

  const handleLeaveGame = () => {
    setActiveGameId(null);
    window.history.pushState({}, "", window.location.pathname);
  };

  const handleJoinGameByCode = async (code: string) => {
    if (!user) throw new Error("No user session found");
    const cleanedCode = extractGameIdOrCode(code);
    const newGameId = await joinGameMutation({
      matchCode: cleanedCode,
      player2: user,
    });
    window.history.pushState({}, "", `?gameId=${newGameId}`);
    setActiveGameId(newGameId);
    return newGameId;
  };

  // Click handlers
  const handleSquareClick = async (index: number) => {
    if (!activeGame || !user) return;

    const cell = activeGame.board[index];
    const r = Math.floor(index / 8);
    const c = index % 8;
    const squareName = `${String.fromCharCode(65 + c)}${8 - r}`;

    // 1. Check if game is in progress
    if (activeGame.status !== "playing") {
      if (cell !== null) {
        logMoveFailure(`Cannot move piece at ${squareName} because the game status is '${activeGame.status}'.`);
      }
      return;
    }

    // 2. Check if it is the player's turn
    if (!isMyTurn || !userColor) {
      if (cell !== null) {
        const turnColor = activeGame.turn === "W" ? "White" : "Black";
        logMoveFailure(`Cannot move piece at ${squareName} because it is ${turnColor}'s turn.`);
      }
      return;
    }

    const isOwnPiece =
      cell &&
      (userColor === "W"
        ? cell === "W" || cell === "WK"
        : cell === "B" || cell === "BK");

    if (isOwnPiece) {
      // 3. Check if locked mid-jump
      if (activeGame.pendingCapture !== undefined && activeGame.pendingCapture !== index) {
        const lockedR = Math.floor(activeGame.pendingCapture / 8);
        const lockedC = activeGame.pendingCapture % 8;
        const lockedName = `${String.fromCharCode(65 + lockedC)}${8 - lockedR}`;
        logMoveFailure(`Cannot move piece at ${squareName} because you must continue the multi-jump with your locked piece at ${lockedName}.`);
        return;
      }

      // 4. Check if the clicked piece has any valid moves
      const allMoves = getAvailableMoves(activeGame.board, userColor, activeGame.pendingCapture);
      const filteredMoves = allMoves.filter((m) => m.start === index);
      if (filteredMoves.length === 0) {
        // Find if any capture moves exist on the board
        const capturesExist = allMoves.some((m) => m.isCapture);
        if (capturesExist) {
          logMoveFailure(`Piece at ${squareName} has no valid moves because checkers rules force you to make a capture move with another piece.`);
        } else {
          logMoveFailure(`Piece at ${squareName} has no valid moves (it is blocked).`);
        }
        return;
      }

      setSelectedPieceIndex(index);
      setValidDestinations(filteredMoves.map((m) => m.end));
      setFeedbackMessage(null);
    } else if (selectedPieceIndex !== null) {
      if (validDestinations.includes(index)) {
        try {
          await makeMoveMutation({
            gameId: activeGame._id,
            startIndex: selectedPieceIndex,
            endIndex: index,
            user: user,
          });
          setFeedbackMessage(null);
        } catch (err) {
          console.error("Failed to make move:", err);
          logMoveFailure("Failed to execute move on the server.");
        } finally {
          setSelectedPieceIndex(null);
          setValidDestinations([]);
        }
      } else {
        const startR = Math.floor(selectedPieceIndex / 8);
        const startC = selectedPieceIndex % 8;
        const startName = `${String.fromCharCode(65 + startC)}${8 - startR}`;
        
        let reason = `Square ${squareName} is not a valid destination.`;
        if ((r + c) % 2 === 0) {
          reason = `Square ${squareName} is not playable (must be a dark square).`;
        } else if (cell !== null) {
          reason = `Square ${squareName} is occupied.`;
        } else {
          const allMoves = getAvailableMoves(activeGame.board, userColor, activeGame.pendingCapture);
          const capturesExist = allMoves.some((m) => m.isCapture);
          if (capturesExist) {
            reason = `Move to ${squareName} is invalid because checkers rules force you to make a capture move.`;
          } else {
            reason = `Move to ${squareName} is invalid (not a standard diagonal move for this piece).`;
          }
        }
        logMoveFailure(`Cannot move piece from ${startName} to ${squareName}: ${reason}`);
        setSelectedPieceIndex(null);
        setValidDestinations([]);
      }
    } else {
      if (cell !== null) {
        logMoveFailure(`Piece at ${squareName} is an opponent's piece.`);
      }
      setSelectedPieceIndex(null);
      setValidDestinations([]);
    }
  };

  // Drag-and-drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!activeGame || !user) {
      e.preventDefault();
      return;
    }
    const cell = activeGame.board[index];
    const r = Math.floor(index / 8);
    const c = index % 8;
    const squareName = `${String.fromCharCode(65 + c)}${8 - r}`;

    if (activeGame.status !== "playing") {
      e.preventDefault();
      logMoveFailure(`Cannot drag piece at ${squareName} because the game status is '${activeGame.status}'.`);
      return;
    }

    if (!isMyTurn || !userColor) {
      e.preventDefault();
      const turnColor = activeGame.turn === "W" ? "White" : "Black";
      logMoveFailure(`Cannot drag piece at ${squareName} because it is ${turnColor}'s turn.`);
      return;
    }

    const isOwnPiece =
      cell &&
      (userColor === "W"
        ? cell === "W" || cell === "WK"
        : cell === "B" || cell === "BK");

    if (!isOwnPiece) {
      e.preventDefault();
      logMoveFailure(`Piece at ${squareName} is an opponent's piece.`);
      return;
    }

    if (activeGame.pendingCapture !== undefined && activeGame.pendingCapture !== index) {
      e.preventDefault();
      const lockedR = Math.floor(activeGame.pendingCapture / 8);
      const lockedC = activeGame.pendingCapture % 8;
      const lockedName = `${String.fromCharCode(65 + lockedC)}${8 - lockedR}`;
      logMoveFailure(`Cannot drag piece at ${squareName} because you must continue the multi-jump with your locked piece at ${lockedName}.`);
      return;
    }

    const allMoves = getAvailableMoves(activeGame.board, userColor, activeGame.pendingCapture);
    const filteredMoves = allMoves.filter((m) => m.start === index);

    if (filteredMoves.length === 0) {
      e.preventDefault();
      const capturesExist = allMoves.some((m) => m.isCapture);
      if (capturesExist) {
        logMoveFailure(`Piece at ${squareName} cannot be dragged because you are forced to make a capture move with another piece.`);
      } else {
        logMoveFailure(`Piece at ${squareName} cannot be dragged (it has no valid moves).`);
      }
      return;
    }

    setSelectedPieceIndex(index);
    setValidDestinations(filteredMoves.map((m) => m.end));

    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (validDestinations.includes(index)) {
      e.preventDefault();
    }
  };

  const handleDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!activeGame || !user) return;
    if (activeGame.status !== "playing") return;
    const draggedIndexStr = e.dataTransfer.getData("text/plain");
    if (!draggedIndexStr) return;

    const draggedIndex = parseInt(draggedIndexStr, 10);
    const r = Math.floor(index / 8);
    const c = index % 8;
    const squareName = `${String.fromCharCode(65 + c)}${8 - r}`;

    if (draggedIndex === selectedPieceIndex && validDestinations.includes(index)) {
      try {
        await makeMoveMutation({
          gameId: activeGame._id,
          startIndex: draggedIndex,
          endIndex: index,
          user: user,
        });
        setFeedbackMessage(null);
      } catch (err) {
        console.error("Failed to make move via drop:", err);
        logMoveFailure("Failed to execute move on the server.");
      }
    } else {
      const startR = Math.floor(draggedIndex / 8);
      const startC = draggedIndex % 8;
      const startName = `${String.fromCharCode(65 + startC)}${8 - startR}`;
      const cell = activeGame.board[index];
      
      let reason = `Square ${squareName} is not a valid destination.`;
      if ((r + c) % 2 === 0) {
        reason = `Square ${squareName} is not playable (must be a dark square).`;
      } else if (cell !== null) {
        reason = `Square ${squareName} is occupied.`;
      } else {
        const allMoves = getAvailableMoves(activeGame.board, userColor!, activeGame.pendingCapture);
        const capturesExist = allMoves.some((m) => m.isCapture);
        if (capturesExist) {
          reason = `Move to ${squareName} is invalid because checkers rules force you to make a capture move.`;
        } else {
          reason = `Move to ${squareName} is invalid (not a standard diagonal move for this piece).`;
        }
      }
      logMoveFailure(`Cannot drop piece from ${startName} to ${squareName}: ${reason}`);
    }

    setSelectedPieceIndex(null);
    setValidDestinations([]);
  };

  const handleDragEnd = () => {
    setSelectedPieceIndex(null);
    setValidDestinations([]);
  };

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return;
    }

    if (focusedIndex === null) {
      if (movablePieces.length > 0) {
        setFocusedIndex(movablePieces[0]);
      } else {
        setFocusedIndex(24);
      }
      setKeyboardMode(true);
      return;
    }

    const isFlipped = userColor === "B";
    const visualRow = isFlipped ? 7 - Math.floor(focusedIndex / 8) : Math.floor(focusedIndex / 8);
    const visualCol = isFlipped ? 7 - (focusedIndex % 8) : focusedIndex % 8;
    
    let newVisualRow = visualRow;
    let newVisualCol = visualCol;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        setKeyboardMode(true);
        newVisualRow = Math.max(0, visualRow - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        setKeyboardMode(true);
        newVisualRow = Math.min(7, visualRow + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        setKeyboardMode(true);
        newVisualCol = Math.max(0, visualCol - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        setKeyboardMode(true);
        newVisualCol = Math.min(7, visualCol + 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setKeyboardMode(true);
        handleSquareClick(focusedIndex);
        return;
      case "Escape":
        e.preventDefault();
        setSelectedPieceIndex(null);
        setValidDestinations([]);
        return;
      default:
        return;
    }

    const dbRow = isFlipped ? 7 - newVisualRow : newVisualRow;
    const dbCol = isFlipped ? 7 - newVisualCol : newVisualCol;
    const newIndex = dbRow * 8 + dbCol;
    
    setFocusedIndex(newIndex);
  };

  // Chat message submit handler
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !user || !activeGameId) return;

    try {
      await sendMessageMutation({
        gameId: activeGameId as any,
        sender: user,
        text: chatInput.trim(),
      });
      setChatInput("");
    } catch (err) {
      console.error("Failed to send chat message:", err);
    }
  };

  // Auth gate
  if (!user) {
    return <LoginGate onLogin={handleLogin} />;
  }

  // ── CARDS GAME ROUTING ──
  if (activeGame_mode === "cards") {
    if (activeCardGameId) {
      return (
        <CardGame
          user={user}
          gameId={activeCardGameId}
          onLeave={handleLeaveCardGame}
        />
      );
    }
    return (
      <CardGameLobby
        user={user}
        onEnterGame={handleEnterCardGame}
        onSwitchToCheckers={handleSwitchToCheckers}
        soundMuted={soundMuted}
        onToggleSound={handleToggleSound}
        onLogout={handleLogout}
      />
    );
  }

  // ── CHECKERS LOBBY ──
  if (!activeGameId || !activeGame) {
    return (
      <Lobby
        username={user}
        games={games}
        onCreateGame={handleCreateGame}
        onLogout={handleLogout}
        onSelectGame={handleSelectGame}
        onJoinGameByCode={handleJoinGameByCode}
        soundMuted={soundMuted}
        onToggleSound={handleToggleSound}
        onSwitchToCards={handleSwitchToCards}
      />
    );
  }

  // Active Game Room view
  const isPlayer1 = activeGame.player1 === user;
  const isPlayer2 = activeGame.player2 === user;
  const opponent = isPlayer1
    ? activeGame.player2 || "WAITING FOR OPPONENT..."
    : activeGame.player1;

  const p1Color = activeGame.player1Color ?? "W";
  const userColor: "W" | "B" | null = isPlayer1
    ? (p1Color as "W" | "B")
    : isPlayer2
      ? (p1Color === "W" ? "B" : "W")
      : null;

  const isMyTurn = activeGame.status === "playing" && activeGame.turn === userColor;

  // Pre-calculate indices of pieces that can make a move/jump on this turn
  const movablePieces = isMyTurn && userColor
    ? Array.from(
        new Set(
          getAvailableMoves(activeGame.board, userColor, activeGame.pendingCapture).map(
            (m) => m.start
          )
        )
      )
    : [];

  // Calculate captures
  let whitePiecesCount = 0;
  let blackPiecesCount = 0;
  activeGame.board.forEach((cell) => {
    if (cell === "W" || cell === "WK") whitePiecesCount++;
    if (cell === "B" || cell === "BK") blackPiecesCount++;
  });
  const capturedWhite = 12 - whitePiecesCount;
  const capturedBlack = 12 - blackPiecesCount;

  // Filter captured pieces lists from db, fallback to empty arrays
  const capturedWhiteList = (activeGame.capturedPieces ?? []).filter((p) => p.startsWith("W"));
  const capturedBlackList = (activeGame.capturedPieces ?? []).filter((p) => p.startsWith("B"));

  // Fallbacks for legacy games where capturedPieces wasn't populated yet
  const displayWhiteCaptured = capturedWhiteList.length > 0
    ? capturedWhiteList
    : Array(capturedWhite).fill("W");
  const displayBlackCaptured = capturedBlackList.length > 0
    ? capturedBlackList
    : Array(capturedBlack).fill("B");


  const isFlipped = userColor === "B";
  const boardIndices = Array.from({ length: 64 }, (_, i) => isFlipped ? 63 - i : i);

  return (
    <div className="app-container">
      {/* Screen Reader Announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Mobile Top Navbar */}
      <nav className={`mobile-navbar ${isNavbarVisible ? "" : "navbar-hidden"}`}>
        <div className="mobile-navbar-left">
          <button className="hamburger-btn" onClick={() => setMobileMenuOpen(true)} aria-label="Open Menu">
            ☰
          </button>
          <span className="mobile-navbar-title">BRUTAL CHECKERS</span>
        </div>
        <div className="mobile-navbar-right">
          <button
            className="brutal-button action-btn mobile-action-btn"
            onClick={handleToggleSound}
            title={soundMuted ? "Unmute Sounds" : "Mute Sounds"}
            style={{ width: "36px", height: "36px", fontSize: "0.9rem" }}
          >
            {soundMuted ? "🔇" : "🔊"}
          </button>
          <button
            className="brutal-button action-btn mobile-action-btn"
            onClick={() => {
              const matchId = activeGameId.slice(-6).toUpperCase();
              navigator.clipboard.writeText(matchId);
              triggerToast(`Match ID: ${matchId} copied to clipboard!`);
            }}
            title="Copy Match ID"
            style={{ width: "36px", height: "36px", fontSize: "0.9rem" }}
          >
            🔗
          </button>
          <button
            className={`brutal-button action-btn mobile-action-btn ${unreadCount > 0 ? "has-unread" : ""}`}
            onClick={() => {
              setChatOpen((prev) => !prev);
              setUnreadCount(0);
            }}
            title="Toggle Chat & Logs"
            style={{ width: "36px", height: "36px", fontSize: "0.9rem", position: "relative" }}
          >
            💬 {unreadCount > 0 && <span className="unread-badge" style={{ width: "16px", height: "16px", fontSize: "0.55rem", top: "-5px", right: "-5px" }}>{unreadCount}</span>}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Left Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header">
          <h2 style={{ fontSize: "1.4rem" }}>BRUTAL CHECKERS</h2>
          <div className="sidebar-version">V.1.0.4-STABLE</div>
        </div>

        <div className="sidebar-content">
          <div
            className="brutal-card brutal-shadow-small"
            style={{
              padding: "12px",
              backgroundColor: "#000",
              color: "#fff",
              marginBottom: "8px",
            }}
          >
            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>ACTIVE USER</div>
            <div style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
              {user}
            </div>
          </div>

          <button
            className="brutal-button primary"
            onClick={() => {
              setMobileMenuOpen(false);
              handleLeaveGame();
            }}
            style={{ width: "100%", padding: "14px" }}
          >
            ← LEAVE GAME
          </button>

          <button
            className="brutal-button"
            onClick={async () => {
              if (confirm("Are you sure you want to end and delete this game? This will boot both players and erase all match data.")) {
                try {
                  setMobileMenuOpen(false);
                  await deleteGameMutation({ gameId: activeGame._id });
                  handleLeaveGame();
                } catch (err) {
                  console.error("Failed to delete active game:", err);
                  alert("Failed to end game.");
                }
              }
            }}
            style={{ width: "100%", padding: "14px", marginTop: "10px", backgroundColor: "#991b1b", color: "#fff" }}
          >
            ☠ END & DELETE GAME
          </button>

          {/* Opponent Info (Desktop Only) */}
          <div
            className="mobile-hide"
            style={{
              border: "3px solid #000",
              padding: "12px",
              background: "var(--panel-bg)",
              marginTop: "auto",
            }}
          >
            <div style={{ fontWeight: "bold", borderBottom: "2px solid var(--border-color)", paddingBottom: "4px" }}>
              OPPONENT INFO
            </div>
            <div style={{ marginTop: "8px", fontSize: "1rem" }}>
              NAME: <strong style={{ color: "var(--light-green)" }}>{opponent}</strong>
            </div>
            <div style={{ marginTop: "4px", fontSize: "0.9rem", color: "#aaa" }}>
              ROLE: {isPlayer1
                ? `${p1Color === "W" ? "WHITE" : "BLACK"} (CREATOR)`
                : `${p1Color === "W" ? "BLACK" : "WHITE"} (JOINED)`}
            </div>
          </div>

          {/* Mobile Accordion for details hidden on main view */}
          <div className="drawer-accordion brutal-border desktop-hide" style={{ marginTop: "auto" }}>
            <button
              type="button"
              className="drawer-accordion-header"
              onClick={() => setDetailsExpanded(!detailsExpanded)}
            >
              <span>MATCH DETAILS & HELP</span>
              <span>{detailsExpanded ? "▲" : "▼"}</span>
            </button>
            {detailsExpanded && (
              <div className="drawer-accordion-content">
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontWeight: "bold", fontSize: "0.8rem", color: "#aaa", borderBottom: "1px solid #444", paddingBottom: "4px", marginBottom: "8px" }}>
                    OPPONENT INFO
                  </div>
                  <div style={{ fontSize: "0.95rem" }}>
                    NAME: <strong style={{ color: "var(--light-green)" }}>{opponent}</strong>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#aaa", marginTop: "4px" }}>
                    ROLE: {isPlayer1
                      ? `${p1Color === "W" ? "WHITE" : "BLACK"} (CREATOR)`
                      : `${p1Color === "W" ? "BLACK" : "WHITE"} (JOINED)`}
                  </div>
                </div>
                
                <div>
                  <div style={{ fontWeight: "bold", fontSize: "0.8rem", color: "#aaa", borderBottom: "1px solid #444", paddingBottom: "4px", marginBottom: "8px" }}>
                    KEYBOARD INPUTS
                  </div>
                  <div style={{ fontSize: "0.8rem", lineHeight: "1.4", fontFamily: "var(--font-mono)", color: "#fff" }}>
                    <div>• TAB: Select board</div>
                    <div>• ARROWS: Move grid focus</div>
                    <div>• ENTER/SPACE: Click square</div>
                    <div>• ESC: Deselect piece</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            className="brutal-button sidebar-footer-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              handleLogout();
            }}
            style={{ padding: "10px" }}
          >
            LOGOUT / SWITCH PLAYER
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="main-layout">
        <header className="top-bar mobile-hide">
          <div className="logo-text">MATCH ID // {activeGameId.slice(-6).toUpperCase()}</div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="brutal-button action-btn"
              onClick={handleToggleSound}
              title={soundMuted ? "Unmute Sounds" : "Mute Sounds"}
            >
              {soundMuted ? "🔇" : "🔊"}
            </button>
            <button
              className="brutal-button action-btn"
              onClick={() => {
                const matchId = activeGameId.slice(-6).toUpperCase();
                navigator.clipboard.writeText(matchId);
                triggerToast(`Match ID: ${matchId} copied to clipboard!`);
              }}
              title="Copy Match ID"
            >
              🔗
            </button>
            <button
              className={`brutal-button action-btn chat-toggle-btn ${unreadCount > 0 ? "has-unread" : ""}`}
              onClick={() => {
                setChatOpen((prev) => !prev);
                setUnreadCount(0);
              }}
              title="Toggle Chat & Logs"
            >
              💬 {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
            </button>
          </div>
        </header>

        {/* Board & Stats Area */}
        <div
          style={{
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
            width: "100%",
            maxWidth: "800px",
            margin: "0 auto",
          }}
        >
          {/* Status Indicators */}
          <div className="status-boxes">
            <div className={`status-box ${activeGame.turn === "W" ? "light" : "dark"} ${isMyTurn ? "active-turn-pulse" : ""}`}>
              <div className="status-label">CURRENT TURN</div>
              <div className="status-value">
                {activeGame.turn === "W" ? "WHITE" : "BLACK"} {isMyTurn ? "(YOURS)" : ""}
              </div>
            </div>
            <div className="status-box" style={{ background: "var(--panel-bg)" }}>
              <div className="status-label">GAME STATUS</div>
              <div className="status-value">{activeGame.status.toUpperCase()}</div>
            </div>
          </div>

          {feedbackMessage && (
            <div className="feedback-banner" role="alert">
              &gt; {feedbackMessage.toUpperCase()}
            </div>
          )}

          {/* Checkerboard Wrapper */}
          <div
            className="brutal-border board-wrapper"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (focusedIndex === null) {
                if (movablePieces.length > 0) {
                  setFocusedIndex(movablePieces[0]);
                } else {
                  setFocusedIndex(24);
                }
              }
              setKeyboardMode(true);
            }}
            onBlur={() => setKeyboardMode(false)}
            aria-label="Checkers Board. Use arrow keys to navigate squares, Enter or Space to select or move pieces."
            style={{
              outline: "none",
            }}
          >
            {/* The 8x8 Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(8, 1fr)",
                gridTemplateRows: "repeat(8, 1fr)",
                width: "100%",
                height: "100%",
              }}
            >
              {boardIndices.map((index) => {
                const cell = activeGame.board[index];
                const r = Math.floor(index / 8);
                const c = index % 8;
                const isPlayableSquare = (r + c) % 2 === 1;
                const isValidTarget = validDestinations.includes(index);
                const isFocused = keyboardMode && focusedIndex === index;
                const isLastMoveSquare = index === activeGame.lastMoveStart || index === activeGame.lastMoveEnd;
                const squareName = `${String.fromCharCode(65 + c)}${8 - r}`;

                return (
                  <div
                    key={index}
                    data-square-index={index}
                    onClick={() => {
                      setFocusedIndex(index);
                      setKeyboardMode(false);
                      handleSquareClick(index);
                    }}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    className={`grid-square ${isPlayableSquare ? "playable" : "non-playable"} ${
                      isValidTarget ? "valid-target" : ""
                    } ${isFocused ? "keyboard-focused" : ""} ${
                      isLastMoveSquare ? "last-move-highlight" : ""
                    }`}
                    aria-label={`${squareName}. ${
                      cell
                        ? `${cell === "W" ? "White pawn" : cell === "WK" ? "White King" : cell === "B" ? "Black pawn" : "Black King"}${
                            movablePieces.includes(index) ? ", movable" : ""
                          }`
                        : "empty"
                    }`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    {/* Render Chess Pieces if they exist */}
                    {cell && (
                      <div
                        className={`piece ${cell === "W" || cell === "WK" ? "white" : "black"} ${
                          movablePieces.includes(index) ? "movable" : ""
                        } ${selectedPieceIndex === index ? "selected" : ""} ${
                          activeGame.pendingCapture === index ? "pending-capture" : ""
                        }`}
                        draggable={movablePieces.includes(index)}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragEnd={handleDragEnd}
                        style={{
                          width: "80%",
                          height: "80%",
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {/* Indicate King promotion */}
                        {(cell === "WK" || cell === "BK") && (
                          <span className="king-crown" aria-label="King">👑</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Under board details (Stats & Controls info) */}
          <div className="details-grid-container">
            {/* Capture Stats */}
            <div className="brutal-border brutal-shadow-small captured-panel">
              <div
                style={{
                  fontSize: "0.8rem",
                  borderBottom: "2px solid var(--border-color)",
                  width: "100%",
                  paddingBottom: "4px",
                  fontWeight: "bold",
                }}
              >
                CAPTURED PIECES
              </div>
              <div className="captured-row">
                <div className="captured-label">BY BLACK (WHITE):</div>
                <div className="captured-list">
                  {displayWhiteCaptured.map((p, idx) => (
                    <div key={idx} className="captured-piece white" title={p === "WK" ? "Captured White King" : "Captured White Pawn"}>
                      {p === "WK" && <span className="king-crown">👑</span>}
                    </div>
                  ))}
                  {displayWhiteCaptured.length === 0 && <span style={{ fontSize: "0.8rem", color: "#555" }}>NONE</span>}
                </div>
              </div>
              <div className="captured-row">
                <div className="captured-label">BY WHITE (BLACK):</div>
                <div className="captured-list">
                  {displayBlackCaptured.map((p, idx) => (
                    <div key={idx} className="captured-piece black" title={p === "BK" ? "Captured Black King" : "Captured Black Pawn"}>
                      {p === "BK" && <span className="king-crown">👑</span>}
                    </div>
                  ))}
                  {displayBlackCaptured.length === 0 && <span style={{ fontSize: "0.8rem", color: "#555" }}>NONE</span>}
                </div>
              </div>
            </div>

            {/* Help panel for accessibility/controls (Desktop Only) */}
            <div
              className="brutal-border brutal-shadow-small mobile-hide"
              style={{
                backgroundColor: "var(--panel-bg)",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                fontSize: "0.75rem",
                textAlign: "left",
                fontFamily: "var(--font-mono)",
              }}
            >
              <div style={{ fontWeight: "bold", borderBottom: "2px solid var(--border-color)", width: "100%", paddingBottom: "4px", marginBottom: "6px" }}>
                KEYBOARD INPUTS
              </div>
              <div>• TAB: Select board</div>
              <div>• ARROWS: Move grid focus</div>
              <div>• ENTER/SPACE: Click square</div>
              <div>• ESC: Deselect piece</div>
            </div>
          </div>
        </div>
      </main>

      {/* Right-side collapsible Chat & Logs Sidebar / Bottom Sheet */}
      <aside className={`chat-panel brutal-border-left ${chatOpen ? "open" : "closed"}`}>
        <div className="chat-header">
          <div className="chat-title">CHAT & SYSTEM LOGS</div>
          <button className="chat-close-btn" onClick={() => setChatOpen(false)}>×</button>
        </div>

        <div className="chat-messages">
          {messages?.map((msg, index) => {
            if (msg.sender === "System") {
              return (
                <div key={msg._id || index} className="chat-msg system">
                  &gt; {msg.text.toUpperCase()}
                </div>
              );
            }
            const isSelf = msg.sender === user;
            return (
              <div key={msg._id || index} className={`chat-msg user-msg ${isSelf ? "self" : "opponent"}`}>
                <span className="msg-sender">{msg.sender}</span>
                <span className="msg-text">{msg.text}</span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendChat} className="chat-input-form">
          <input
            type="text"
            className="chat-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="TYPE MESSAGE..."
            maxLength={100}
          />
          <button type="submit" className="brutal-button chat-send-btn">
            SEND
          </button>
        </form>
      </aside>

      {/* Brutalist Toast Notification */}
      {toast && (
        <div className="brutal-toast brutal-border brutal-shadow-small">
          &gt; {toast.toUpperCase()}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ConvexProvider client={convex}>
      <AppContent />
    </ConvexProvider>
  );
}
