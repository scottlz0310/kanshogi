export type Side = "black" | "white";

export type GameStatus = "ready" | "playing" | "paused" | "finished";

export type PieceView = {
  side: Side;
  type: string;
  label: string;
  promoted: boolean;
  sfen: string;
};

export type BoardSquareView = {
  file: number;
  rank: number;
  testId: string;
  piece: PieceView | null;
};

export type HandPieceView = {
  type: string;
  label: string;
  count: number;
  dropUsi: string;
};

export type HandsView = Record<Side, HandPieceView[]>;

export type ThoughtSummary = {
  agentName?: string;
  reason: string;
  candidates: string[];
  evaluation: string;
};

export type MoveLogEntry = ThoughtSummary & {
  ply: number;
  side: Side;
  usi: string;
  displayText: string;
  sfen: string;
  thinkingTimeMs?: number;
  createdAt: string;
};

export type ReplaySnapshot = {
  ply: number;
  status: GameStatus;
  turn: Side;
  sfen: string;
  board: BoardSquareView[];
  hands: HandsView;
  checked: boolean;
};

export type GameState = ReplaySnapshot & {
  gameId: string;
  startedAt: string;
  updatedAt: string;
  legalMoves: string[];
  log: MoveLogEntry[];
  aiRunning: boolean;
  aiThinking: boolean;
  stepMode: boolean;
  isHumanTurn: boolean;
  turnStartedAt: string;
  clockMs: { black: number; white: number };
  finishedReason: string | null;
  maxPly: number;
};

export type Players = {
  black?: string;
  white?: string;
};

export type GameArchiveSummary = {
  id: string;
  startedAt: string;
  updatedAt: string;
  moves: number;
  status: GameStatus;
  players: Players;
  finishedReason: string | null;
};

export type GameArchive = GameArchiveSummary & {
  version: number;
  initialSfen: string;
  log: MoveLogEntry[];
  snapshots: ReplaySnapshot[];
};

export type MoveRequest = {
  usi: string;
  thought?: ThoughtSummary;
};
