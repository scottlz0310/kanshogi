import fs from "node:fs";
import path from "node:path";
import type { GameArchive, GameArchiveSummary, MoveLogEntry } from "../shared/types";

const fileEncoding = "utf-8";

function assertGameId(id: string): void {
  if (!/^[0-9TZ-]+$/.test(id)) {
    throw new Error(`不正な棋譜IDです: ${id}`);
  }
}

export class ArchiveStore {
  private readonly dir: string;

  constructor(dir = path.resolve(process.cwd(), "data", "games")) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  saveArchive(archive: GameArchive): void {
    assertGameId(archive.id);
    const file = path.join(this.dir, `${archive.id}.json`);
    fs.writeFileSync(file, JSON.stringify(archive, null, 2), fileEncoding);
  }

  appendMove(entry: MoveLogEntry, gameId: string): void {
    assertGameId(gameId);
    const file = path.join(this.dir, `${gameId}.jsonl`);
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, fileEncoding);
  }

  writeMeta(archive: GameArchive): void {
    assertGameId(archive.id);
    const file = path.join(this.dir, `${archive.id}.jsonl`);
    const meta = {
      type: "game_start",
      id: archive.id,
      startedAt: archive.startedAt,
      initialSfen: archive.initialSfen
    };

    fs.writeFileSync(file, `${JSON.stringify(meta)}\n`, fileEncoding);
  }

  listArchives(): GameArchiveSummary[] {
    return fs
      .readdirSync(this.dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => this.loadArchive(path.basename(name, ".json")))
      .map(({ id, startedAt, updatedAt, log, status, players, finishedReason }) => ({
        id,
        startedAt,
        updatedAt,
        moves: log.length,
        status,
        players: players ?? {},
        finishedReason: finishedReason ?? null
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  loadArchive(id: string): GameArchive {
    assertGameId(id);
    const file = path.join(this.dir, `${id}.json`);

    try {
      const raw = JSON.parse(fs.readFileSync(file, fileEncoding)) as Partial<GameArchive>;
      return {
        version: raw.version ?? 0,
        players: raw.players ?? {},
        finishedReason: raw.finishedReason ?? null,
        ...raw
      } as GameArchive;
    } catch (error) {
      throw new Error(`棋譜ファイルを読み込めません: ${file}`, { cause: error });
    }
  }
}
