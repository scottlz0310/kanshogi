import type { GameState, MoveRequest } from "../shared/types.js";

export interface AiPlayer {
  readonly name: string;
  chooseMove(state: GameState): Promise<MoveRequest>;
  close?(): void;
}
