import { Position } from "tsshogi";
import type { GameState, MoveRequest } from "../shared/types.js";
import { chooseAiMove } from "./ai.js";
import type { AiPlayer } from "./aiPlayer.js";
import { generateLegalMoves } from "./legalMoves.js";

export class SimpleAiPlayer implements AiPlayer {
  constructor(
    public readonly name: string,
    private readonly depth: number = 1
  ) {}

  async chooseMove(state: GameState): Promise<MoveRequest> {
    const position = Position.newBySFEN(state.sfen);
    if (!position) {
      throw new Error(`SFENの解析に失敗しました: ${state.sfen}`);
    }
    const legalMoves = generateLegalMoves(position);
    const decision = chooseAiMove(position, legalMoves, this.name, this.depth);
    if (!decision) {
      throw new Error("合法手がありません");
    }
    return {
      usi: decision.usi,
      thought: {
        agentName: this.name,
        reason: decision.reason,
        candidates: decision.candidates,
        evaluation: decision.evaluation
      }
    };
  }
}
