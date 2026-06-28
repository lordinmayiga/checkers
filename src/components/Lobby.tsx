import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";


interface Game {
  _id: string;
  _creationTime: number;
  player1: string;
  player2?: string;
  status: string;
  turn: string;
  winner?: string;
  player1Color?: string;
}

interface LobbyProps {
  username: string;
  games: Game[] | undefined;
  onCreateGame: (playerColor: "W" | "B") => void;
  onLogout: () => void;
  onSelectGame: (gameId: string) => void;
  onJoinGameByCode: (code: string) => Promise<string>;
  soundMuted: boolean;
  onToggleSound: () => void;
  onSwitchToCards?: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  username,
  games,
  onCreateGame,
  onLogout,
  onSelectGame,
  onJoinGameByCode,
  soundMuted,
  onToggleSound,
  onSwitchToCards,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Mobile layout state variables
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);

  // Scroll handling for mobile navbar auto-fade
  const lastScrollTop = React.useRef(0);
  const navbarTimeoutRef = React.useRef<any>(null);

  const startNavbarFadeTimer = () => {
    if (navbarTimeoutRef.current) clearTimeout(navbarTimeoutRef.current);
    navbarTimeoutRef.current = setTimeout(() => {
      setIsNavbarVisible(false);
    }, 3000); // 3 seconds timeout
  };

  React.useEffect(() => {
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

  // Modal states
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [matchCode, setMatchCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteGameMutation = useMutation(api.games.deleteGame);

  const handleDeleteGame = async (gameId: string) => {
    if (confirm("Are you sure you want to end and delete this game? This will erase all match history and messages.")) {
      try {
        await deleteGameMutation({ gameId: gameId as any });
      } catch (err) {
        console.error("Failed to delete game:", err);
        alert("Failed to delete game.");
      }
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchCode.trim()) return;
    setIsJoining(true);
    setError(null);
    try {
      await onJoinGameByCode(matchCode);
      setIsJoinModalOpen(false);
      setMatchCode("");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setIsJoining(false);
    }
  };

  const copyInviteLink = (gameId: string) => {
    const link = `${window.location.origin}${window.location.pathname}?gameId=${gameId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(gameId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="app-container">
      {/* Mobile Top Navbar */}
      <nav className={`mobile-navbar ${isNavbarVisible ? "" : "navbar-hidden"}`}>
        <div className="mobile-navbar-left">
          <button className="hamburger-btn" onClick={() => setMobileMenuOpen(true)} aria-label="Open Menu">
            ☰
          </button>
          <span className="mobile-navbar-title">GAME OPS LOBBY</span>
        </div>
        <div className="mobile-navbar-right">
          <button
            className="brutal-button action-btn mobile-action-btn"
            onClick={onToggleSound}
            title={soundMuted ? "Unmute Sounds" : "Mute Sounds"}
            style={{ width: "36px", height: "36px", fontSize: "0.9rem" }}
          >
            {soundMuted ? "🔇" : "🔊"}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header">
          <h2 style={{ fontSize: "1.4rem" }}>BRUTAL CHECKERS</h2>
          <div className="sidebar-version">V.1.0.4-STABLE</div>
        </div>

        <div className="sidebar-content">
          <div
            className="brutal-card brutal-shadow-small"
            style={{ padding: "12px", backgroundColor: "#000", color: "#fff" }}
          >
            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>SESSION ACTIVE</div>
            <div style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
              {username}
            </div>
          </div>

          <button
            className="brutal-button primary"
            onClick={() => {
              setMobileMenuOpen(false);
              setIsColorModalOpen(true);
            }}
            style={{ width: "100%", padding: "14px", marginTop: "10px" }}
          >
            + NEW GAME
          </button>

          <button
            className="brutal-button accent"
            onClick={() => {
              setMobileMenuOpen(false);
              setIsJoinModalOpen(true);
            }}
            style={{ width: "100%", padding: "14px", marginTop: "10px" }}
          >
            → JOIN BY ID
          </button>

          <button
            className="brutal-button"
            onClick={() => {
              setMobileMenuOpen(false);
              onLogout();
            }}
            style={{ width: "100%", padding: "14px", marginTop: "10px", backgroundColor: "#334155" }}
          >
            ↩ LOGOUT / SWITCH
          </button>
        </div>

        <div className="sidebar-footer">
          <button
            className="brutal-button sidebar-footer-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              onLogout();
            }}
            style={{ padding: "10px" }}
          >
            LOGOUT / SWITCH PLAYER
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="main-layout">
        <div className="top-bar mobile-hide">
          <div className="logo-text">GAME OPS LOBBY</div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div className="game-switcher">
              <button className="game-switcher-btn active">♟ CHECKERS</button>
              {onSwitchToCards && (
                <button className="game-switcher-btn" onClick={onSwitchToCards}>🃏 CARDS</button>
              )}
            </div>
            <button
              className="brutal-button"
              onClick={onToggleSound}
              title={soundMuted ? "Unmute Sounds" : "Mute Sounds"}
              style={{
                padding: "6px 10px",
                fontSize: "1rem",
                boxShadow: "2px 2px 0px #000",
                backgroundColor: "#1e293b",
                border: "2px solid #000",
                cursor: "pointer",
              }}
            >
              {soundMuted ? "🔇" : "🔊"}
            </button>
            <div style={{ fontSize: "1rem", fontWeight: "bold" }}>
              ONLINE // CONVEX COMPILER ACTIVE
            </div>
          </div>
        </div>

        <div className="lobby-container">
          <div className="lobby-header">
            <h2>ACTIVE MATCHES</h2>
            <div style={{ fontSize: "0.9rem", color: "#666" }}>
              {(games?.length || 0)} GAME(S) IN REGISTRY
            </div>
          </div>

          <div className="lobby-grid">
            <div className="games-list">
              {games === undefined ? (
                <div className="empty-state brutal-card">
                  <h3>RETRIEVING REGISTRY DATA...</h3>
                </div>
              ) : games.length === 0 ? (
                <div className="empty-state brutal-card">
                  <h3>NO ACTIVE REGISTRY ENTRIES</h3>
                  <p style={{ marginTop: "12px" }}>
                    Create a new game using the sidebar to begin.
                  </p>
                </div>
              ) : (
                games.map((game) => {
                  const isPlayer1 = game.player1 === username;
                  const opponent = isPlayer1
                    ? game.player2 || "WAITING FOR OPPONENT..."
                    : game.player1;

                  let turnText = "";
                  if (game.status === "waiting") {
                    turnText = "WAITING FOR PLAYER 2";
                  } else if (game.status === "finished") {
                    turnText = game.winner ? `WINNER: ${game.winner}` : "DRAW";
                  } else {
                    const p1Color = game.player1Color ?? "W";
                    const myColor = isPlayer1 ? p1Color : (p1Color === "W" ? "B" : "W");
                    const isMyTurn = game.turn === myColor;
                    turnText = isMyTurn ? "YOUR TURN" : "WAITING FOR THEM";
                  }

                  return (
                    <div
                      key={game._id}
                      className="game-card brutal-card brutal-shadow"
                    >
                      <div className="game-card-header">
                        <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>
                          MATCH ID // {game._id.slice(-6).toUpperCase()}
                        </span>
                        <span
                          style={{
                            padding: "4px 8px",
                            backgroundColor:
                              game.status === "playing"
                                ? "#ffde43"
                                : game.status === "finished"
                                  ? "#ccc"
                                  : "#00cc44",
                            fontWeight: "bold",
                            border: "2px solid #000",
                          }}
                        >
                          {game.status}
                        </span>
                      </div>

                      <div className="game-card-details">
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#aaa" }}>
                            OPPONENT
                          </div>
                          <div
                            style={{
                              fontSize: "1.1rem",
                              fontWeight: "bold",
                              color:
                                game.player2 ? "var(--text-color)" : "var(--light-green)",
                            }}
                          >
                            {opponent}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#aaa" }}>
                            TURN STATUS
                          </div>
                          <div
                            style={{ fontSize: "1.1rem", fontWeight: "bold" }}
                          >
                            {turnText}
                          </div>
                        </div>
                      </div>

                      <div className="game-card-actions">
                        <button
                          className="brutal-button primary"
                          onClick={() => onSelectGame(game._id)}
                        >
                          {game.status === "waiting" && isPlayer1
                            ? "OPEN GAME"
                            : game.status === "waiting"
                              ? "JOIN GAME"
                              : "RESUME PLAY"}
                        </button>
                        <button
                          className="brutal-button"
                          onClick={() => copyInviteLink(game._id)}
                        >
                          {copiedId === game._id ? "LINK COPIED!" : "COPY LINK"}
                        </button>
                        <button
                          className="brutal-button"
                          onClick={() => handleDeleteGame(game._id)}
                          style={{ backgroundColor: "#991b1b", color: "#fff" }}
                          title="Delete game from registry"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Side Tips Panel */}
            <div className="lobby-tips">
              <div className="brutal-card brutal-shadow" style={{ gap: "16px" }}>
                <h3
                  style={{
                    borderBottom: "2px solid #000",
                    paddingBottom: "8px",
                    marginBottom: "12px",
                  }}
                >
                  STABLE RULES
                </h3>
                <ul
                  style={{
                    listStyleType: "square",
                    paddingLeft: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    fontSize: "0.95rem",
                  }}
                >
                  <li>
                    <strong>KINGS ARE FLYING:</strong> Kings move any distance
                    along open diagonals.
                  </li>
                  <li>
                    <strong>FORCED JUMPS:</strong> If a jump is available, it
                    MUST be taken.
                  </li>
                  <li>
                    <strong>BACKWARD CAPTURES:</strong> Pawns can jump backwards
                    to capture.
                  </li>
                  <li>
                    <strong>MULTI-JUMP:</strong> If a chain exists, you must
                    complete it.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>

      {isJoinModalOpen && (
        <div className="modal-overlay">
          <div
            className="modal-card brutal-card brutal-shadow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <h2 id="modal-title" style={{ borderBottom: "2px solid #000", paddingBottom: "8px", marginBottom: "16px" }}>
              JOIN GAME BY ID
            </h2>
            <p style={{ fontSize: "0.95rem", color: "#ccc", marginBottom: "16px", fontFamily: "var(--font-mono)" }}>
              Enter a 6-character Match ID or a full Game ID/invite URL to connect to a match.
            </p>
            <form onSubmit={handleJoinSubmit}>
              <input
                type="text"
                className="brutal-input"
                placeholder="e.g. H6T5MP"
                value={matchCode}
                onChange={(e) => {
                  setMatchCode(e.target.value);
                  setError(null);
                }}
                disabled={isJoining}
                autoFocus
              />
              {error && (
                <div style={{ color: "var(--neon-pink)", fontWeight: "bold", fontSize: "0.9rem", marginBottom: "16px", fontFamily: "var(--font-mono)" }}>
                  ERROR: {error}
                </div>
              )}
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  type="submit"
                  className="brutal-button primary"
                  disabled={isJoining || !matchCode.trim()}
                  style={{ flex: 1 }}
                >
                  {isJoining ? "CONNECTING..." : "JOIN GAME"}
                </button>
                <button
                  type="button"
                  className="brutal-button"
                  onClick={() => {
                    setIsJoinModalOpen(false);
                    setMatchCode("");
                    setError(null);
                  }}
                  disabled={isJoining}
                  style={{ flex: 1 }}
                >
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isColorModalOpen && (
        <div className="modal-overlay">
          <div
            className="modal-card brutal-card brutal-shadow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="color-modal-title"
            style={{ maxWidth: "420px" }}
          >
            <h2 id="color-modal-title" style={{ borderBottom: "2px solid #000", paddingBottom: "8px", marginBottom: "16px" }}>
              SELECT COMBAT COLOR
            </h2>
            <p style={{ fontSize: "0.95rem", color: "#ccc", marginBottom: "24px", fontFamily: "var(--font-mono)", lineHeight: "1.4" }}>
              CHOOSE YOUR SIDE. WHITE MOVES FIRST AND DICTATES THE PACE. BLACK MOVES SECOND AND COUNTER-ATTACKS.
            </p>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
              {/* White Selection Option */}
              <button
                className="brutal-button"
                onClick={() => {
                  onCreateGame("W");
                  setIsColorModalOpen(false);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  padding: "20px 12px",
                  background: "#fff",
                  color: "#000",
                  border: "3px solid #000",
                  height: "100%",
                }}
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "#f1f5f9",
                  border: "4px solid #000",
                  boxShadow: "2px 2px 0px #000"
                }} />
                <span style={{ fontSize: "1.2rem", fontWeight: "900" }}>WHITE</span>
                <span style={{ fontSize: "0.75rem", color: "#666" }}>GOES FIRST</span>
              </button>

              {/* Black Selection Option */}
              <button
                className="brutal-button"
                onClick={() => {
                  onCreateGame("B");
                  setIsColorModalOpen(false);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  padding: "20px 12px",
                  background: "#0c101b",
                  color: "#fff",
                  border: "3px solid #fff",
                  height: "100%",
                }}
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "#1e293b",
                  border: "4px solid #fff",
                  boxShadow: "2px 2px 0px #fff"
                }} />
                <span style={{ fontSize: "1.2rem", fontWeight: "900", color: "#fff" }}>BLACK</span>
                <span style={{ fontSize: "0.75rem", color: "#aaa" }}>GOES SECOND</span>
              </button>
            </div>

            <button
              type="button"
              className="brutal-button"
              onClick={() => setIsColorModalOpen(false)}
              style={{ width: "100%", padding: "12px" }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
