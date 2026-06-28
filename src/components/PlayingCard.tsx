import React from "react";
import { Crown } from "lucide-react";

// Card ID format: "2H", "10D", "KS", "AH", "AS", "JOK_R", "JOK_B"

interface PlayingCardProps {
  cardId: string;
  faceDown?: boolean;
  selected?: boolean;
  playable?: boolean;
  onClick?: () => void;
  small?: boolean;
  style?: React.CSSProperties;
  glowColor?: string;
  disabled?: boolean;
}

// Royal card back design in deep navy and gold
function CardBack({ width, height }: { width: number; height: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 100 140" style={{ display: "block" }}>
      <defs>
        <linearGradient id="backGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0B111E" />
          <stop offset="50%" stopColor="#151E33" />
          <stop offset="100%" stopColor="#1C2844" />
        </linearGradient>
        <pattern id="backPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="none" />
          <path d="M 0 0 L 8 8 M 8 0 L 0 8" stroke="#E9B308" strokeWidth="0.4" opacity="0.15" />
        </pattern>
      </defs>
      <rect width="100" height="140" rx="8" ry="8" fill="url(#backGrad)" />
      <rect width="100" height="140" rx="8" ry="8" fill="url(#backPattern)" />
      
      {/* Intricate Gold Borders */}
      <rect x="3" y="3" width="94" height="134" rx="6" ry="6" fill="none" stroke="#E9B308" strokeWidth="1.5" opacity="0.7" />
      <rect x="6" y="6" width="88" height="128" rx="4" ry="4" fill="none" stroke="#E9B308" strokeWidth="0.8" opacity="0.4" />
      <rect x="9" y="9" width="82" height="122" rx="3" ry="3" fill="none" stroke="#E9B308" strokeWidth="0.4" opacity="0.2" />

      {/* Center Crown Ornament */}
      <g transform="translate(38, 50)">
        <Crown width={24} height={24} stroke="#E9B308" strokeWidth={1.5} opacity={0.8} />
      </g>
      
      <text x="50" y="92" textAnchor="middle" fontSize="8" fill="#E9B308" opacity="0.6" fontFamily="var(--font-mono)" letterSpacing="2">
        ROYAL
      </text>
    </svg>
  );
}

function parseCardId(cardId: string): { rank: string; suit: string | null; isJoker: boolean; isRed: boolean } {
  if (cardId === "JOK_R") return { rank: "JOKER", suit: null, isJoker: true, isRed: true };
  if (cardId === "JOK_B") return { rank: "JOKER", suit: null, isJoker: true, isRed: false };
  const suit = cardId.slice(-1);
  const rank = cardId.slice(0, -1);
  return { rank, suit, isJoker: false, isRed: suit === "H" || suit === "D" };
}

function getCardImageUrl(cardId: string, faceDown = false): string {
  if (faceDown || cardId === "BACK") {
    return "/PNG/Cards (large)/card_back.png";
  }
  if (cardId === "JOK_R") {
    return "/PNG/Cards (large)/card_joker_red.png";
  }
  if (cardId === "JOK_B") {
    return "/PNG/Cards (large)/card_joker_black.png";
  }
  const { rank, suit } = parseCardId(cardId);
  const suitNames: Record<string, string> = {
    H: "hearts",
    D: "diamonds",
    S: "spades",
    C: "clubs"
  };
  const suitName = suitNames[suit || ""];
  if (!suitName) {
    return "/PNG/Cards (large)/card_back.png";
  }
  let rankStr = rank;
  if (rank.length === 1 && rank >= "2" && rank <= "9") {
    rankStr = "0" + rank;
  }
  return `/PNG/Cards (large)/card_${suitName}_${rankStr}.png`;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
  cardId,
  faceDown = false,
  selected = false,
  playable = false,
  onClick,
  small = false,
  style,
  glowColor,
  disabled = false,
}) => {
  const width = small ? 60 : 90;
  const height = small ? 84 : 126;

  if (faceDown || cardId === "BACK") {
    const transformStyle = selected ? "translateY(-12px)" : playable ? "translateY(-4px)" : "none";
    const filterStyle = selected ? "drop-shadow(0 0 8px #E9B308)" : undefined;

    return (
      <div
        onClick={!disabled ? onClick : undefined}
        style={{
          cursor: onClick && !disabled ? "pointer" : "default",
          display: "inline-block",
          transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s ease",
          transform: transformStyle,
          filter: filterStyle,
          userSelect: "none",
          ...style,
        }}
      >
        <CardBack width={width} height={height} />
      </div>
    );
  }

  const { isJoker, isRed, suit } = parseCardId(cardId);
  const suitChar = suit || "";
  const isRedCard = isJoker ? isRed : (suitChar === "H" || suitChar === "D");
  const glow = glowColor || (isRedCard ? "rgba(194, 30, 46, 0.4)" : "rgba(10, 29, 55, 0.4)");

  const transformStyle = selected ? "translateY(-16px) scale(1.05)" : playable ? "translateY(-6px)" : "none";

  const filterStyle = selected
    ? `drop-shadow(0 0 10px ${glow})`
    : playable
      ? `drop-shadow(0 0 5px ${glow})`
      : undefined;

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      style={{
        cursor: onClick && !disabled ? "pointer" : "default",
        display: "inline-block",
        transition: "transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), filter 0.18s ease",
        transform: transformStyle,
        filter: filterStyle,
        userSelect: "none",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <img
        src={getCardImageUrl(cardId, faceDown)}
        alt={cardId}
        style={{
          display: "block",
          width: `${width}px`,
          height: `${height}px`,
          objectFit: "fill",
          borderRadius: "8px",
        }}
      />
    </div>
  );
};

// Small horizontal cutter card indicator (sideways)
export const CutterIndicatorCard: React.FC<{ cardId: string }> = ({ cardId }) => {
  return (
    <div style={{ transform: "rotate(-90deg)", display: "inline-block" }}>
      <img
        src={getCardImageUrl(cardId, false)}
        alt={cardId}
        style={{
          display: "block",
          width: "56px",
          height: "80px",
          objectFit: "fill",
          borderRadius: "4px",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)",
        }}
      />
    </div>
  );
};
