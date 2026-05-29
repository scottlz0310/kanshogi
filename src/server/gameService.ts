import { Color, InitialPositionSFEN, Position, Record } from "tsshogi";
import type {
  GameArchive,
  GameArchiveSummary,
  GameState,
  GameStatus,
  MoveLogEntry,
  MoveRequest,
  Players,
  ReplaySnapshot,
} from "../shared/types";
import { manualThought } from "./ai";
import type { AiPlayer } from "./aiPlayer";
import { ArchiveStore } from "./archiveStore";
import { generateLegalMoves, parseSide } from "./legalMoves";
import { createSnapshot } from "./view";

const aiIntervalMs = 900;

function createGameId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createRecord(): Record {
  const position = Position.newBySFEN(InitialPositionSFEN.STANDARD);

  if (!position) {
    throw new Error("初期局面の生成に失敗しました");
  }

  return new Record(position);
}

export class GameService {
  private readonly archiveStore = new ArchiveStore();
  private record = createRecord();
  private gameId = createGameId();
  private startedAt = new Date().toISOString();
  private updatedAt = this.startedAt;
  private status: GameStatus = "ready";
  private log: MoveLogEntry[] = [];
  private snapshots: ReplaySnapshot[] = [];
  private aiIntervalId: ReturnType<typeof setInterval> | null = null;
  private aiPlaying = false;
  private aiThinking = false;
  private stepMode = false;
  private turnStartedAt = new Date();
  private clockMs = { black: 0, white: 0 };
  private finishedReason: string | null = null;
  private readonly maxPly = 200;
  private players: { black: AiPlayer | null; white: AiPlayer | null } | null = null;

  constructor() {
    this.initializeArchive();
  }

  newGame(): GameState {
    this.stopAi();
    this.closePlayers();
    this.record = createRecord();
    this.gameId = createGameId();
    this.startedAt = new Date().toISOString();
    this.updatedAt = this.startedAt;
    this.status = "ready";
    this.log = [];
    this.snapshots = [];
    this.finishedReason = null;
    this.stepMode = false;
    this.clockMs = { black: 0, white: 0 };
    this.turnStartedAt = new Date();
    this.initializeArchive();
    return this.getState();
  }

  getState(): GameState {
    const legalMoves = this.status === "finished" ? [] : generateLegalMoves(this.record.position);
    const snapshot = createSnapshot(this.record.position, this.log.length, this.status);

    return {
      ...snapshot,
      gameId: this.gameId,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      legalMoves: legalMoves.map((candidate) => candidate.usi),
      log: this.log,
      aiRunning: this.aiPlaying,
      aiThinking: this.aiThinking,
      stepMode: this.stepMode,
      isHumanTurn: this.currentPlayerIsHuman(),
      turnStartedAt: this.turnStartedAt.toISOString(),
      clockMs: { ...this.clockMs },
      finishedReason: this.finishedReason,
      maxPly: this.maxPly,
    };
  }

  applyMove(request: MoveRequest): GameState {
    const usi = request.usi.trim();
    const move = this.record.position.createMoveByUSI(usi);

    if (!move || !this.record.position.isValidMove(move)) {
      throw new Error(`合法手ではありません: ${usi}`);
    }

    if (this.status === "finished") {
      throw new Error("対局は終了しています");
    }

    if (this.status === "ready" || this.status === "paused") {
      this.status = "playing";
      this.turnStartedAt = new Date();
    }

    if (!this.record.append(move)) {
      throw new Error(`指し手を棋譜へ追加できません: ${usi}`);
    }

    const side = parseSide(move.color);
    const thinkingTimeMs = Date.now() - this.turnStartedAt.getTime();
    this.clockMs[side] += thinkingTimeMs;
    this.turnStartedAt = new Date();

    const thought = request.thought ?? manualThought(usi);
    const node = this.record.current;
    const entry: MoveLogEntry = {
      ply: node.ply,
      side,
      usi: move.usi,
      displayText: node.displayText,
      sfen: this.record.position.getSFEN(node.ply + 1),
      thinkingTimeMs,
      agentName: thought.agentName,
      reason: thought.reason,
      candidates: thought.candidates,
      evaluation: thought.evaluation,
      createdAt: new Date().toISOString(),
    };

    this.log.push(entry);
    this.updatedAt = entry.createdAt;
    this.updateTerminalStatus();
    this.snapshots.push(createSnapshot(this.record.position, this.log.length, this.status));
    this.archiveStore.appendMove(entry, this.gameId);
    this.persistArchive();

    return this.getState();
  }

  startAi(
    players: { black: AiPlayer | null; white: AiPlayer | null },
    stepMode = false,
  ): GameState {
    if (this.status === "finished") {
      throw new Error("終了済みの対局ではAI対局を開始できません。新規対局を開始してください");
    }

    this.closePlayers();
    this.players = players;
    this.status = "playing";
    this.stepMode = stepMode;
    this.aiPlaying = true;
    this.turnStartedAt = new Date();

    if (this.aiIntervalId) {
      clearInterval(this.aiIntervalId);
      this.aiIntervalId = null;
    }

    if (!stepMode) {
      this.aiIntervalId = setInterval(() => {
        void this.playOneAiMove();
      }, aiIntervalMs);
      void this.playOneAiMove();
    }

    this.persistArchive();
    return this.getState();
  }

  stopAi(): GameState {
    if (this.aiIntervalId) {
      clearInterval(this.aiIntervalId);
      this.aiIntervalId = null;
    }

    this.aiPlaying = false;
    this.closePlayers(); // USIエンジン等の外部プロセスをここで終了

    if (this.status === "playing") {
      this.status = "paused";
      this.persistArchive();
    }

    return this.getState();
  }

  setStepMode(stepMode: boolean): GameState {
    if (!this.aiPlaying) return this.getState();

    this.stepMode = stepMode;

    if (stepMode) {
      if (this.aiIntervalId) {
        clearInterval(this.aiIntervalId);
        this.aiIntervalId = null;
      }
    } else {
      if (!this.aiIntervalId) {
        this.aiIntervalId = setInterval(() => {
          void this.playOneAiMove();
        }, aiIntervalMs);
        void this.playOneAiMove();
      }
    }

    return this.getState();
  }

  step(): GameState {
    if (!this.stepMode || !this.aiPlaying || this.aiThinking) return this.getState();
    this.turnStartedAt = new Date(); // 待機時間を除外し AI 計算時間のみ計測
    void this.playOneAiMove();
    return this.getState();
  }

  getReplay(ply: number): ReplaySnapshot {
    return this.snapshotAt(this.currentArchive(), ply);
  }

  listArchives(): GameArchiveSummary[] {
    return this.archiveStore.listArchives();
  }

  loadArchive(id: string): GameArchive {
    return this.archiveStore.loadArchive(id);
  }

  getArchiveReplay(id: string, ply: number): ReplaySnapshot {
    return this.snapshotAt(this.archiveStore.loadArchive(id), ply);
  }

  private async playOneAiMove(): Promise<void> {
    if (this.aiThinking || this.status !== "playing" || !this.players) {
      return;
    }

    const state = this.getState();
    const player = state.turn === "black" ? this.players.black : this.players.white;

    if (!player) return; // 手動プレイヤーのターンはスキップ

    this.aiThinking = true;

    try {
      const request = await player.chooseMove(state);
      if (this.status === "playing") {
        this.applyMove(request);
      }
    } catch (error) {
      if (this.status === "playing") {
        const message = error instanceof Error ? error.message : String(error);
        this.finish(`AI対局中にエラーが発生しました: ${message}`);
      }
    } finally {
      this.aiThinking = false;
    }
  }

  resign(side: "black" | "white"): GameState {
    if (this.status === "finished") {
      throw new Error("対局は既に終了しています");
    }

    if (this.status === "ready") {
      throw new Error("対局が開始されていません");
    }

    const sideLabel = side === "black" ? "先手" : "後手";
    this.finish(`${sideLabel}の投了`);
    return this.getState();
  }

  private updateTerminalStatus(): void {
    if (this.record.repetition) {
      this.finish("千日手のため終了");
      return;
    }

    if (this.log.length >= this.maxPly) {
      this.finish(`手数上限 ${this.maxPly} に到達したため終了`);
      return;
    }

    if (generateLegalMoves(this.record.position).length === 0) {
      const loser = this.record.position.color === Color.BLACK ? "先手" : "後手";
      const reason = this.record.position.checked
        ? `${loser}が詰みました`
        : `${loser}に合法手がありません`;
      this.finish(reason);
    }
  }

  private finish(reason: string): void {
    if (this.aiIntervalId) {
      clearInterval(this.aiIntervalId);
      this.aiIntervalId = null;
    }

    this.aiPlaying = false;
    this.status = "finished";
    this.finishedReason = reason;
    this.updatedAt = new Date().toISOString();
    this.persistArchive();
  }

  private initializeArchive(): void {
    this.snapshots = [createSnapshot(this.record.position, 0, this.status)];
    const archive = this.currentArchive();
    this.archiveStore.writeMeta(archive);
    this.persistArchive();
  }

  private persistArchive(): void {
    this.archiveStore.saveArchive(this.currentArchive());
  }

  private derivePlayers(): Players {
    const black = this.log.find((e) => e.side === "black")?.agentName;
    const white = this.log.find((e) => e.side === "white")?.agentName;
    return {
      ...(black ? { black } : {}),
      ...(white ? { white } : {}),
    };
  }

  private currentArchive(): GameArchive {
    return {
      version: 1,
      id: this.gameId,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      moves: this.log.length,
      status: this.status,
      players: this.derivePlayers(),
      initialSfen: InitialPositionSFEN.STANDARD,
      log: this.log,
      snapshots: this.snapshots,
      finishedReason: this.finishedReason,
    };
  }

  private currentPlayerIsHuman(): boolean {
    if (!this.aiPlaying || !this.players) return true;
    const player =
      this.record.position.color === Color.BLACK ? this.players.black : this.players.white;
    return player === null;
  }

  private closePlayers(): void {
    this.players?.black?.close?.();
    this.players?.white?.close?.();
    this.players = null;
  }

  private snapshotAt(archive: GameArchive, ply: number): ReplaySnapshot {
    const snapshot = archive.snapshots[ply];

    if (!snapshot) {
      throw new Error(`指定手数の局面が存在しません: ${ply}`);
    }

    return snapshot;
  }
}
