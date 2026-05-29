import { InitialPositionSFEN } from "tsshogi";
import { describe, expect, test } from "vitest";
import type { GameState } from "../shared/types";
import { SimpleAiPlayer } from "./simpleAiPlayer";

function makeState(sfen: string = InitialPositionSFEN.STANDARD): GameState {
  return {
    gameId: "test",
    sfen,
    ply: 0,
    status: "playing",
    turn: "black",
    board: [],
    hands: { black: [], white: [] },
    checked: false,
    startedAt: "",
    updatedAt: "",
    legalMoves: [],
    log: [],
    aiRunning: false,
    aiThinking: false,
    stepMode: false,
    isHumanTurn: true,
    turnStartedAt: new Date().toISOString(),
    clockMs: { black: 0, white: 0 },
    finishedReason: null,
    maxPly: 200,
  };
}

describe("SimpleAiPlayer", () => {
  test("初期局面で合法手を返す", async () => {
    const player = new SimpleAiPlayer("テストAI");
    const result = await player.chooseMove(makeState());

    expect(result.usi).toMatch(/^[1-9][a-i][1-9][a-i]\+?$|^\w\*[1-9][a-i]$/);
    expect(result.thought?.agentName).toBe("テストAI");
    expect(result.thought?.candidates.length).toBeGreaterThan(0);
    expect(typeof result.thought?.evaluation).toBe("string");
  });

  test("nameプロパティが正しく設定される", () => {
    const player = new SimpleAiPlayer("後手テストAI");
    expect(player.name).toBe("後手テストAI");
  });

  test("reasonにエージェント名が含まれる", async () => {
    const player = new SimpleAiPlayer("名前付きAI");
    const result = await player.chooseMove(makeState());

    expect(result.thought?.reason).toContain("名前付きAI");
  });

  test("不正なSFENで例外をスローする", async () => {
    const player = new SimpleAiPlayer("テストAI");
    const state = makeState("invalid-sfen");

    await expect(player.chooseMove(state)).rejects.toThrow("SFENの解析に失敗しました");
  });

  test("候補手が5件以下になる", async () => {
    const player = new SimpleAiPlayer("テストAI");
    const result = await player.chooseMove(makeState());

    expect(result.thought?.candidates.length).toBeLessThanOrEqual(5);
  });
});
