export interface GameMove {
  start: number;
  end: number;
  isCapture: boolean;
  capturedPieceIndex?: number;
}

export function isValidCoord(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function isPlayableSquare(r: number, c: number): boolean {
  return (r + c) % 2 === 1;
}

export function getPieceAt(board: (string | null)[], r: number, c: number): string | null {
  return board[r * 8 + c];
}

export function isFriendlyPiece(piece: string | null, player: "W" | "B"): boolean {
  if (!piece) return false;
  return player === "W" ? (piece === "W" || piece === "WK") : (piece === "B" || piece === "BK");
}

export function isOpponentPiece(piece: string | null, player: "W" | "B"): boolean {
  if (!piece) return false;
  return player === "W" ? (piece === "B" || piece === "BK") : (piece === "W" || piece === "WK");
}

/**
 * Calculates all available moves/captures for a player on the board.
 * If a pendingCapture index is provided, only captures starting from that index are allowed.
 * Otherwise, if any captures are available on the board, forced-capture rules apply and only captures are returned.
 */
export function getAvailableMoves(
  board: (string | null)[],
  player: "W" | "B",
  pendingCapture?: number
): GameMove[] {
  const captures: GameMove[] = [];
  const normals: GameMove[] = [];

  const dirs = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: 1 },
    { dr: 1, dc: -1 },
    { dr: 1, dc: 1 },
  ];

  // Helper to check and add pawn captures
  function checkPawnCapture(startIndex: number, r: number, c: number, dr: number, dc: number) {
    const nextRow = r + dr;
    const nextCol = c + dc;
    const jumpRow = r + 2 * dr;
    const jumpCol = c + 2 * dc;

    if (isValidCoord(jumpRow, jumpCol)) {
      const intermediatePiece = getPieceAt(board, nextRow, nextCol);
      const targetPiece = getPieceAt(board, jumpRow, jumpCol);

      if (isOpponentPiece(intermediatePiece, player) && targetPiece === null) {
        captures.push({
          start: startIndex,
          end: jumpRow * 8 + jumpCol,
          isCapture: true,
          capturedPieceIndex: nextRow * 8 + nextCol,
        });
      }
    }
  }

  // Scan only the locked piece if mid-jump, otherwise scan the whole board
  const scanIndices = pendingCapture !== undefined ? [pendingCapture] : Array.from({ length: 64 }, (_, i) => i);

  for (const index of scanIndices) {
    const piece = board[index];
    if (!piece || !isFriendlyPiece(piece, player)) continue;

    const r = Math.floor(index / 8);
    const c = index % 8;

    if (piece === "W" || piece === "B") {
      // PAWN LOGIC
      // 1. Normal moves: W moves up (dr = -1), B moves down (dr = 1)
      if (pendingCapture === undefined) {
        const moveDr = player === "W" ? -1 : 1;
        const colOffsets = [-1, 1];
        for (const dc of colOffsets) {
          const nextRow = r + moveDr;
          const nextCol = c + dc;
          if (isValidCoord(nextRow, nextCol) && getPieceAt(board, nextRow, nextCol) === null) {
            normals.push({
              start: index,
              end: nextRow * 8 + nextCol,
              isCapture: false,
            });
          }
        }
      }

      // 2. Capture moves: Pawns can jump backward or forward (Slice 4 rules upgrade)
      for (const d of dirs) {
        checkPawnCapture(index, r, c, d.dr, d.dc);
      }
    } else {
      // FLYING KING LOGIC
      for (const d of dirs) {
        let opponentRow = -1;
        let opponentCol = -1;
        let opponentFound = false;
        let step = 1;

        while (true) {
          const nextRow = r + step * d.dr;
          const nextCol = c + step * d.dc;
          if (!isValidCoord(nextRow, nextCol)) break;

          const currentPiece = getPieceAt(board, nextRow, nextCol);

          if (!opponentFound) {
            if (currentPiece === null) {
              // Normal sliding move (only allowed if no captures exist)
              if (pendingCapture === undefined) {
                normals.push({
                  start: index,
                  end: nextRow * 8 + nextCol,
                  isCapture: false,
                });
              }
              step++;
              continue;
            }

            if (isFriendlyPiece(currentPiece, player)) {
              // Path blocked by friendly piece
              break;
            }

            // Opponent piece found!
            opponentRow = nextRow;
            opponentCol = nextCol;
            opponentFound = true;
            step++;
          } else {
            // Looking for landing squares behind the opponent piece
            if (currentPiece === null) {
              captures.push({
                start: index,
                end: nextRow * 8 + nextCol,
                isCapture: true,
                capturedPieceIndex: opponentRow * 8 + opponentCol,
              });
              step++;
            } else {
              // Path blocked by any other piece
              break;
            }
          }
        }
      }
    }
  }

  // Enforce forced capture: if there are ANY captures available on the board (or from the locked piece),
  // normal moves are completely disallowed.
  if (pendingCapture === undefined) {
    if (captures.length > 0) {
      return captures;
    }
    return normals;
  } else {
    // If pending capture is active, only captures starting from that index are allowed.
    return captures;
  }
}
