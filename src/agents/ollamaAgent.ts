import { OllamaAiPlayer } from "../server/ollamaAiPlayer.js";
import type { GameState } from "../shared/types.js";

const GAME_SERVER = process.env.GAME_SERVER ?? "http://localhost:3030";
const OLLAMA_BASE = process.env.OLLAMA_SERVER ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "gemma4";
const POLL_MS = 1000;

function parseArgs(): { side: "black" | "white"; agentName: string } {
  const args = process.argv.slice(2);
  const sideRaw = args[args.indexOf("--side") + 1];
  const nameRaw = args[args.indexOf("--name") + 1];
  const side: "black" | "white" = sideRaw === "white" ? "white" : "black";
  const agentName = nameRaw ?? (side === "black" ? "先手Gemma4" : "後手Gemma4");
  return { side, agentName };
}

async function getState(): Promise<GameState> {
  const res = await fetch(`${GAME_SERVER}/api/state`);
  if (!res.ok) throw new Error(`状態取得失敗: ${res.status}`);
  return res.json() as Promise<GameState>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const { side, agentName } = parseArgs();
  const player = new OllamaAiPlayer(agentName, OLLAMA_BASE, MODEL);

  console.log(
    `[${agentName}] 起動 (${side === "black" ? "先手" : "後手"}) | サーバー: ${GAME_SERVER} | モデル: ${MODEL}`,
  );

  while (true) {
    let state: GameState;

    try {
      state = await getState();
    } catch (error) {
      console.error(`[${agentName}] 状態取得エラー:`, error);
      await sleep(POLL_MS);
      continue;
    }

    if (state.status === "finished") {
      console.log(`[${agentName}] 対局終了: ${state.finishedReason}`);
      break;
    }

    const canMove = (state.status === "playing" || state.status === "ready") && state.turn === side;

    if (!canMove) {
      await sleep(POLL_MS);
      continue;
    }

    console.log(`[${agentName}] ${state.ply + 1}手目を思考中...`);

    try {
      const request = await player.chooseMove(state);
      const res = await fetch(`${GAME_SERVER}/api/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(`指し手送信失敗: ${err.error}`);
      }

      console.log(`[${agentName}] → ${request.usi}  [${request.thought?.evaluation ?? ""}]`);
    } catch (error) {
      console.error(`[${agentName}] 指し手エラー:`, error);
      await sleep(2000);
    }
  }
}

main().catch((error: unknown) => {
  console.error("致命的なエラー:", error);
  process.exit(1);
});
