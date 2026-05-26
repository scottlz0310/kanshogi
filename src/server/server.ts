import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MoveRequest } from "../shared/types";
import { GameService } from "./gameService";
import { archiveToCSA, archiveToKIF } from "./kif";
import { OllamaAiPlayer } from "./ollamaAiPlayer";
import { SimpleAiPlayer } from "./simpleAiPlayer";
import { UsiEnginePlayer } from "./usiEnginePlayer";

type PlayerConfig = {
  type?: "simple" | "ollama" | "usi" | "none";
  name?: string;
  depth?: number;
  enginePath?: string;
  moveTimeMs?: number;
};

function buildPlayer(config: PlayerConfig | undefined, defaultName: string) {
  if (config?.type === "none") return null;
  const name = config?.name?.trim() || defaultName;
  if (config?.type === "ollama") return new OllamaAiPlayer(name);
  if (config?.type === "usi") {
    const enginePath = config.enginePath?.trim();
    if (!enginePath) throw new Error("USIエンジンのパスが指定されていません");
    return new UsiEnginePlayer(name, enginePath, config.moveTimeMs ?? 3000);
  }
  return new SimpleAiPlayer(name, config?.depth ?? 1);
}

const app = express();
const service = new GameService();
const port = Number(process.env.PORT ?? 3030);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../../dist");

app.use(express.json());

function parsePly(value: string): number {
  const ply = Number(value);

  if (!Number.isInteger(ply) || ply < 0) {
    throw new Error(`手数は0以上の整数で指定してください: ${value}`);
  }

  return ply;
}

function handleError(response: express.Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  response.status(400).json({ error: message });
}

app.get("/api/state", (_request, response) => {
  response.json(service.getState());
});

app.post("/api/new-game", (_request, response) => {
  response.json(service.newGame());
});

app.post("/api/move", (request, response) => {
  try {
    response.json(service.applyMove(request.body as MoveRequest));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/resign", (request, response) => {
  try {
    const { side } = request.body as { side?: string };

    if (side !== "black" && side !== "white") {
      response.status(400).json({ error: "side は 'black' または 'white' を指定してください" });
      return;
    }

    response.json(service.resign(side));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/ai/start", (request, response) => {
  try {
    const body = request.body as { black?: PlayerConfig; white?: PlayerConfig; stepMode?: boolean };
    const players = {
      black: buildPlayer(body.black, "先手AI"),
      white: buildPlayer(body.white, "後手AI")
    };
    response.json(service.startAi(players, body.stepMode ?? false));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/ai/stop", (_request, response) => {
  response.json(service.stopAi());
});

app.post("/api/ai/step", (_request, response) => {
  response.json(service.step());
});

app.post("/api/ai/mode", (request, response) => {
  const { stepMode } = request.body as { stepMode: boolean };
  response.json(service.setStepMode(stepMode ?? false));
});

app.get("/api/replay/:ply", (request, response) => {
  try {
    response.json(service.getReplay(parsePly(request.params.ply)));
  } catch (error) {
    handleError(response, error);
  }
});

app.get("/api/games", (_request, response) => {
  response.json(service.listArchives());
});

app.get("/api/games/:id", (request, response) => {
  try {
    response.json(service.loadArchive(request.params.id));
  } catch (error) {
    handleError(response, error);
  }
});

app.get("/api/games/:id/replay/:ply", (request, response) => {
  try {
    response.json(service.getArchiveReplay(request.params.id, parsePly(request.params.ply)));
  } catch (error) {
    handleError(response, error);
  }
});

app.get("/api/games/:id/kif", (request, response) => {
  try {
    const archive = service.loadArchive(request.params.id);
    const kif = archiveToKIF(archive);
    response
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${request.params.id}.kif"`)
      .send(kif);
  } catch (error) {
    handleError(response, error);
  }
});

app.get("/api/games/:id/csa", (request, response) => {
  try {
    const archive = service.loadArchive(request.params.id);
    const csa = archiveToCSA(archive);
    response
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${request.params.id}.csa"`)
      .send(csa);
  } catch (error) {
    handleError(response, error);
  }
});

app.use(express.static(distPath));
app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`AI将棋サーバーを起動しました: http://localhost:${port}`);
});
