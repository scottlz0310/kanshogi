import { createInterface } from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import type { GameState, MoveRequest } from "../shared/types.js";
import type { AiPlayer } from "./aiPlayer.js";

interface UsiInfo {
  depth: number;
  scoreCp: number;
  pv: string[];
}

function parseInfoLine(line: string): UsiInfo | null {
  const tokens = line.split(" ");
  const info: Partial<UsiInfo> = {};

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "depth") info.depth = Number(tokens[i + 1]);
    if (tokens[i] === "score" && tokens[i + 1] === "cp") info.scoreCp = Number(tokens[i + 2]);
    if (tokens[i] === "pv") info.pv = tokens.slice(i + 1).filter(Boolean);
  }

  if (info.depth === undefined && info.scoreCp === undefined) return null;
  return { depth: info.depth ?? 0, scoreCp: info.scoreCp ?? 0, pv: info.pv ?? [] };
}

function cpToEvalText(cp: number): string {
  if (cp > 800) return "優勢";
  if (cp > 300) return "やや有利";
  if (cp > 100) return "わずかに有利";
  if (cp < -800) return "劣勢";
  if (cp < -300) return "やや不利";
  if (cp < -100) return "わずかに不利";
  return "互角";
}

export class UsiEnginePlayer implements AiPlayer {
  private proc: ChildProcess | null = null;
  private lineHandlers: Array<(line: string) => void> = [];

  constructor(
    public readonly name: string,
    private readonly enginePath: string,
    private readonly moveTimeMs: number = 3000
  ) {}

  async chooseMove(state: GameState): Promise<MoveRequest> {
    if (!this.proc || this.proc.exitCode !== null) {
      await this.start();
    }

    this.send(`position sfen ${state.sfen}`);

    const lines = await this.collect(
      `go movetime ${this.moveTimeMs}`,
      (l) => l.startsWith("bestmove"),
      this.moveTimeMs + 5000
    );

    // depth最大のinfo行を採用
    let bestInfo: UsiInfo | null = null;
    for (const line of lines) {
      if (line.startsWith("info")) {
        const parsed = parseInfoLine(line);
        if (parsed && parsed.depth >= (bestInfo?.depth ?? 0)) {
          bestInfo = parsed;
        }
      }
    }

    const bestLine = lines.find((l) => l.startsWith("bestmove"));
    const usi = bestLine?.split(" ")[1] ?? "";

    if (!usi || usi === "resign" || usi === "win") {
      throw new Error(`エンジンが指し手を返しませんでした: ${usi || "(空)"}`);
    }

    const depth = bestInfo?.depth ?? 0;
    const scoreCp = bestInfo?.scoreCp ?? 0;
    const pvCandidates = (bestInfo?.pv ?? []).slice(0, 5);
    if (!pvCandidates.includes(usi)) pvCandidates.unshift(usi);

    const parts = [];
    if (depth > 0) parts.push(`${depth}手読み`);
    parts.push(`評価値 ${scoreCp >= 0 ? "+" : ""}${scoreCp}cp`);

    return {
      usi,
      thought: {
        agentName: this.name,
        reason: `${this.name}: ${parts.join("、")}で ${usi} を選択`,
        candidates: pvCandidates.slice(0, 5),
        evaluation: cpToEvalText(scoreCp)
      }
    };
  }

  close(): void {
    if (this.proc) {
      try {
        this.proc.stdin?.write("quit\n");
      } catch {
        // ignore
      }
      this.proc.kill();
      this.proc = null;
    }
  }

  private async start(): Promise<void> {
    const proc = spawn(this.enginePath, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc = proc;

    const errorPromise = new Promise<never>((_, reject) => {
      proc.on("error", (err) => {
        reject(new Error(`USIエンジンの起動に失敗しました: ${err.message}`));
      });
    });

    const rl = createInterface({ input: proc.stdout! });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        for (const h of this.lineHandlers) h(trimmed);
      }
    });

    await Promise.race([
      (async () => {
        await this.collect("usi", (l) => l === "usiok", 5000);
        await this.collect("isready", (l) => l === "readyok", 15000);
      })(),
      errorPromise
    ]);
  }

  private send(cmd: string): void {
    this.proc?.stdin?.write(`${cmd}\n`);
  }

  private collect(
    cmd: string,
    done: (line: string) => boolean,
    timeoutMs: number
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const collected: string[] = [];
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.lineHandlers = this.lineHandlers.filter((h) => h !== handler);
        reject(new Error(`USIエンジン応答タイムアウト: "${cmd}"`));
      }, timeoutMs);

      const handler = (line: string): void => {
        if (settled) return;
        collected.push(line);
        if (done(line)) {
          settled = true;
          clearTimeout(timer);
          this.lineHandlers = this.lineHandlers.filter((h) => h !== handler);
          resolve(collected);
        }
      };

      this.lineHandlers.push(handler);
      if (cmd) this.send(cmd);
    });
  }
}
