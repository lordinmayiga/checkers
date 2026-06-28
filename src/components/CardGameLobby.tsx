import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface CardGameLobbyProps {
  user: string;
  onEnterGame: (gameId: string) => void;
  onSwitchToCheckers: () => void;
  soundMuted: boolean;
  onToggleSound: () => void;
  onLogout: () => void;
}

function extractGameId(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const cg = url.searchParams.get("cardGameId");
    if (cg) return cg;
  } catch (_) {}
  return trimmed;
}

export const CardGameLobby: React.FC<CardGameLobbyProps> = ({
  user,
  onEnterGame,
  onSwitchToCheckers,
  soundMuted,
  onToggleSound,
  onLogout,
}) => {
  const games = useQuery(api.cardGame.getCardGames, user ? { user } : "skip");
  const createGame = useMutation(api.cardGame.createCardGame);
  const joinGame = useMutation(api.cardGame.joinCardGame);
  const deleteGame = useMutation(api.cardGame.deleteCardGame);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [matchCode, setMatchCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleCreateGame = async () => {
    try {
      const gameId = await createGame({ player1: user });
      onEnterGame(gameId);
    } catch (e: any) {
      alert("Failed to create game: " + e.message);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchCode.trim()) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const cleaned = extractGameId(matchCode);
      const gameId = await joinGame({ matchCode: cleaned, player2: user });
      setShowJoinModal(false);
      setMatchCode("");
      onEnterGame(gameId);
    } catch (err: any) {
      setJoinError(err?.message || "Failed to join game");
    } finally {
      setIsJoining(false);
    }
  };

  const handleDelete = async (gameId: string) => {
    if (confirm("Delete this game?")) {
      try {
        await deleteGame({ gameId: gameId as any });
      } catch (e) {}
    }
  };

  const copyLink = (gameId: string) => {
    const matchId = gameId.slice(-6).toUpperCase();
    navigator.clipboard.writeText(matchId);
    setCopiedId(gameId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="app-container">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "1.6rem" }}>🃏</span>
            <div>
              <h2 style={{ fontSize: "1.3rem" }}>CARDS</h2>
              <div className="sidebar-version">V.1.0.0</div>
            </div>
          </div>
        </div>

        <div className="sidebar-content">
          <div className="brutal-card brutal-shadow-small" style={{ padding: "12px", backgroundColor: "#000", color: "#fff" }}>
            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>SESSION ACTIVE</div>
            <div style={{ fontWeight: "bold", fontSize: "1.2rem" }}>{user}</div>
          </div>

          <button className="brutal-button primary" onClick={handleCreateGame}
            style={{ width: "100%", padding: "14px", marginTop: 10 }}>
            + NEW CARDS GAME
          </button>
          <button className="brutal-button accent" onClick={() => { setMobileMenuOpen(false); setShowJoinModal(true); }}
            style={{ width: "100%", padding: "14px", marginTop: 8 }}>
            → JOIN BY ID
          </button>

          <div style={{ borderTop: "2px solid #333", marginTop: 16, paddingTop: 16 }}>
            <button className="brutal-button" onClick={onSwitchToCheckers}
              style={{ width: "100%", padding: "12px", backgroundColor: "#1e293b" }}>
              ♟ SWITCH TO CHECKERS
            </button>
          </div>

          <button className="brutal-button" onClick={() => { setMobileMenuOpen(false); onLogout(); }}
            style={{ width: "100%", padding: "12px", marginTop: 8, backgroundColor: "#334155" }}>
            ↩ LOGOUT
          </button>
        </div>

        <div className="sidebar-footer">
          <button className="brutal-button sidebar-footer-btn" onClick={() => { setMobileMenuOpen(false); onLogout(); }}
            style={{ padding: "10px" }}>
            LOGOUT / SWITCH PLAYER
          </button>
        </div>
      </aside>

      {/* Main panel */}
      <main className="main-layout">
        <header className="top-bar mobile-hide">
          <div className="logo-text">🃏 CARDS — GAME LOBBY</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="brutal-button" onClick={onToggleSound} style={{ padding: "6px 10px", fontSize: "1rem" }}>
              {soundMuted ? "🔇" : "🔊"}
            </button>
            <button className="brutal-button" onClick={onSwitchToCheckers} style={{ padding: "6px 12px" }}>
              ♟ CHECKERS
            </button>
          </div>
        </header>

        {/* Mobile navbar */}
        <nav className="mobile-navbar">
          <div className="mobile-navbar-left">
            <button className="hamburger-btn" onClick={() => setMobileMenuOpen(true)}>☰</button>
            <span className="mobile-navbar-title">🃏 CARDS LOBBY</span>
          </div>
          <div className="mobile-navbar-right">
            <button className="brutal-button action-btn mobile-action-btn" onClick={onToggleSound}
              style={{ width: "36px", height: "36px", fontSize: "0.9rem" }}>
              {soundMuted ? "🔇" : "🔊"}
            </button>
          </div>
        </nav>

        <div className="lobby-container">
          <div className="lobby-header">
            <h2>ACTIVE GAMES</h2>
            <div style={{ fontSize: "0.9rem", color: "#666" }}>{(games?.length || 0)} GAME(S) IN REGISTRY</div>
          </div>

          <div className="lobby-grid">
            <div className="games-list">
              {games === undefined ? (
                <div className="empty-state brutal-card"><h3>LOADING...</h3></div>
              ) : games.length === 0 ? (
                <div className="empty-state brutal-card">
                  <h3>NO ACTIVE GAMES</h3>
                  <p style={{ marginTop: 12 }}>Create a new Cards game from the sidebar to begin.</p>
                </div>
              ) : (
                games.map(game => {
                  const isP1 = game.player1 === user;
                  const opponent = isP1 ? (game.player2 || "WAITING...") : game.player1;
                  let statusText = "";
                  if (game.status === "waiting") statusText = "WAITING FOR PLAYER";
                  else if (game.status === "finished") statusText = `WINNER: ${game.winner ?? "?"}`;
                  else {
                    const myTurn = game.currentTurn === (isP1 ? "player1" : "player2");
                    statusText = myTurn ? "YOUR TURN" : "THEIR TURN";
                  }

                  return (
                    <div key={game._id} className="game-card brutal-card brutal-shadow">
                      <div className="game-card-header">
                        <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>
                          🃏 MATCH // {game._id.slice(-6).toUpperCase()}
                        </span>
                        <span style={{
                          padding: "4px 8px",
                          backgroundColor: game.status === "active" ? "#ffde43" : game.status === "finished" ? "#ccc" : "#00cc44",
                          fontWeight: "bold", border: "2px solid #000",
                        }}>
                          {game.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="game-card-details">
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#aaa" }}>OPPONENT</div>
                          <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: game.player2 ? "var(--text-color)" : "var(--light-green)" }}>
                            {opponent}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#aaa" }}>STATUS</div>
                          <div style={{ fontSize: "1.1rem", fontWeight: "bold" }}>{statusText}</div>
                        </div>
                      </div>
                      <div className="game-card-actions">
                        <button className="brutal-button primary" onClick={() => onEnterGame(game._id)}>
                          {game.status === "waiting" && isP1 ? "OPEN" : game.status === "waiting" ? "JOIN" : "PLAY"}
                        </button>
                        <button className="brutal-button" onClick={() => copyLink(game._id)}>
                          {copiedId === game._id ? "COPIED!" : "COPY ID"}
                        </button>
                        <button className="brutal-button" onClick={() => handleDelete(game._id)}
                          style={{ backgroundColor: "#991b1b", color: "#fff" }}>
                          DELETE
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rules panel */}
            <div className="lobby-tips">
              <div className="brutal-card brutal-shadow">
                <h3 style={{ borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 12 }}>CARDS RULES</h3>
                <ul style={{ listStyleType: "square", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                  <li><strong>DEAL:</strong> 7 cards each, one random non-7 is the cutter indicator</li>
                  <li><strong>PLAY:</strong> Match suit OR number on the discard pile</li>
                  <li><strong>ACES:</strong> Request any suit. Ace of Spades also neutralises attacks</li>
                  <li><strong>ATTACK:</strong> 2=pick 2, 3=pick 3, Joker=pick 5. Counter or pick!</li>
                  <li><strong>J & 8:</strong> Playing a Jack or 8 keeps your turn</li>
                  <li><strong>CUT:</strong> Play the 7 of cutter suit if your hand total &lt;20 to end the game (lowest total wins)</li>
                  <li><strong>WIN:</strong> First to empty hand wins outright</li>
                  <li><strong>WARNING:</strong> Auto-announced at 2 cards left</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Join Modal */}
      {showJoinModal && (
        <div className="modal-overlay">
          <div className="modal-card brutal-card brutal-shadow" role="dialog" aria-modal="true">
            <h2 style={{ borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 16 }}>JOIN CARDS GAME</h2>
            <p style={{ fontSize: "0.95rem", color: "#ccc", marginBottom: 16, fontFamily: "var(--font-mono)" }}>
              Enter the 6-character Match ID to connect.
            </p>
            <form onSubmit={handleJoinSubmit}>
              <input type="text" className="brutal-input" placeholder="e.g. H6T5MP"
                value={matchCode} onChange={e => { setMatchCode(e.target.value); setJoinError(null); }}
                disabled={isJoining} autoFocus />
              {joinError && (
                <div style={{ color: "var(--neon-pink)", fontWeight: "bold", fontSize: "0.9rem", marginBottom: 16 }}>
                  ERROR: {joinError}
                </div>
              )}
              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" className="brutal-button primary" disabled={isJoining || !matchCode.trim()} style={{ flex: 1 }}>
                  {isJoining ? "CONNECTING..." : "JOIN GAME"}
                </button>
                <button type="button" className="brutal-button" onClick={() => { setShowJoinModal(false); setMatchCode(""); setJoinError(null); }}
                  disabled={isJoining} style={{ flex: 1 }}>
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
