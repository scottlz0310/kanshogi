import {
  Color,
  ImmutablePosition,
  Move,
  PieceType,
  Position,
  Square,
  handPieceTypes
} from "tsshogi";
import type { ThoughtSummary } from "../shared/types";
import type { LegalMoveCandidate } from "./legalMoves";
import { generateLegalMoves } from "./legalMoves";

const pieceValues: Record<PieceType, number> = {
  [PieceType.PAWN]: 1,
  [PieceType.LANCE]: 3,
  [PieceType.KNIGHT]: 3,
  [PieceType.SILVER]: 5,
  [PieceType.GOLD]: 6,
  [PieceType.BISHOP]: 8,
  [PieceType.ROOK]: 10,
  [PieceType.KING]: 100,
  [PieceType.PROM_PAWN]: 6,
  [PieceType.PROM_LANCE]: 6,
  [PieceType.PROM_KNIGHT]: 6,
  [PieceType.PROM_SILVER]: 6,
  [PieceType.HORSE]: 12,
  [PieceType.DRAGON]: 14
};

type ScoredMove = LegalMoveCandidate & {
  score: number;
  givesCheck: boolean;
};

export type AiDecision = ThoughtSummary & {
  usi: string;
};

function applyOnClone(position: ImmutablePosition, move: Move): Position | null {
  const clone = position.clone();
  const clonedMove = clone.createMoveByUSI(move.usi);

  if (!clonedMove || !clone.doMove(clonedMove)) {
    return null;
  }

  return clone;
}

function scoreMove(position: ImmutablePosition, candidate: LegalMoveCandidate): ScoredMove {
  const { move } = candidate;
  const clone = applyOnClone(position, move);
  const givesCheck = clone?.checked ?? false;
  const centerDistance = Math.abs(move.to.file - 5) + Math.abs(move.to.rank - 5);
  const captureScore = move.capturedPieceType ? pieceValues[move.capturedPieceType] * 3 : 0;
  const promotionScore = move.promote ? 6 : 0;
  const checkScore = givesCheck ? 5 : 0;
  const developmentScore = move.from instanceof Square ? 1 : 2;

  return {
    ...candidate,
    givesCheck,
    score: captureScore + promotionScore + checkScore + developmentScore - centerDistance * 0.1
  };
}

// 盤面の駒得点をBlack視点で返す（正=先手有利、負=後手有利）
function evaluatePosition(position: ImmutablePosition): number {
  let score = 0;

  for (const sq of Square.all) {
    const piece = position.board.at(sq);
    if (piece) {
      const value = pieceValues[piece.type] ?? 0;
      score += piece.color === Color.BLACK ? value : -value;
    }
  }

  for (const pieceType of handPieceTypes as PieceType[]) {
    const value = pieceValues[pieceType] ?? 0;
    score += position.hand(Color.BLACK).count(pieceType) * value;
    score -= position.hand(Color.WHITE).count(pieceType) * value;
  }

  return score;
}

// αβ法による再帰探索。スコアは常にBlack視点
function alphaBeta(
  position: ImmutablePosition,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean
): number {
  if (depth === 0) return evaluatePosition(position);

  const legalMoves = generateLegalMoves(position);

  if (legalMoves.length === 0) {
    return maximizing ? -9999 : 9999;
  }

  if (maximizing) {
    let best = -Infinity;
    for (const candidate of legalMoves) {
      const next = applyOnClone(position, candidate.move);
      if (!next) continue;
      const score = alphaBeta(next, depth - 1, alpha, beta, false);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const candidate of legalMoves) {
      const next = applyOnClone(position, candidate.move);
      if (!next) continue;
      const score = alphaBeta(next, depth - 1, alpha, beta, true);
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    return best;
  }
}

function sideName(color: Color): string {
  return color === Color.BLACK ? "先手AI" : "後手AI";
}

function buildReason(
  position: ImmutablePosition,
  best: ScoredMove,
  name: string,
  depth: number
): string {
  const parts: string[] = [];

  if (depth > 1) {
    parts.push(`${depth}手読み`);
  }
  if (best.move.capturedPieceType) {
    parts.push("駒得");
  }
  if (best.move.promote) {
    parts.push("成り");
  }
  if (best.givesCheck) {
    parts.push("王手");
  }
  if (parts.length === 0 || (parts.length === 1 && depth > 1)) {
    parts.push("中央重視");
  }

  return `${name}: ${parts.join("＋")}で ${best.usi} を選択`;
}

function evaluationText(score: number): string {
  if (score >= 16) return "やや有利";
  if (score >= 8) return "わずかに有利";
  return "互角";
}

function minimaxEvalText(relScore: number): string {
  if (relScore >= 8) return "やや有利";
  if (relScore >= 3) return "わずかに有利";
  if (relScore <= -8) return "やや不利";
  if (relScore <= -3) return "わずかに不利";
  return "互角";
}

export function chooseAiMove(
  position: ImmutablePosition,
  legalMoves: LegalMoveCandidate[],
  playerName?: string,
  depth = 1
): AiDecision | null {
  if (legalMoves.length === 0) {
    return null;
  }

  const name = playerName ?? sideName(position.color);

  if (depth <= 1) {
    const ranked = legalMoves
      .map((candidate) => scoreMove(position, candidate))
      .sort((a, b) => b.score - a.score || a.usi.localeCompare(b.usi));
    const best = ranked[0];
    const candidates = ranked.slice(0, 5).map((c) => c.usi);

    return {
      usi: best.usi,
      agentName: name,
      reason: buildReason(position, best, name, 1),
      candidates,
      evaluation: evaluationText(best.score)
    };
  }

  // 深さ2以上: ヒューリスティックで手を並べ替えてからαβ探索
  const isBlack = position.color === Color.BLACK;
  const ordered = legalMoves
    .map((c) => ({ candidate: c, h: scoreMove(position, c).score }))
    .sort((a, b) => b.h - a.h)
    .map((x) => x.candidate);

  let bestScore = isBlack ? -Infinity : Infinity;
  let bestCandidate = ordered[0];
  let givesCheck = false;

  for (const candidate of ordered) {
    const next = applyOnClone(position, candidate.move);
    if (!next) continue;
    const score = alphaBeta(next, depth - 1, -Infinity, Infinity, next.color === Color.BLACK);
    const isBetter = isBlack ? score > bestScore : score < bestScore;
    if (isBetter) {
      bestScore = score;
      bestCandidate = candidate;
      givesCheck = next.checked;
    }
  }

  const scoredBest: ScoredMove = { ...bestCandidate, score: bestScore, givesCheck };
  const relScore = isBlack ? bestScore : -bestScore;

  return {
    usi: bestCandidate.usi,
    agentName: name,
    reason: buildReason(position, scoredBest, name, depth),
    candidates: ordered.slice(0, 5).map((c) => c.usi),
    evaluation: minimaxEvalText(relScore)
  };
}

export function manualThought(usi: string): ThoughtSummary {
  return {
    reason: `観戦者または外部エージェントが ${usi} を入力`,
    candidates: [usi],
    evaluation: "未評価"
  };
}
