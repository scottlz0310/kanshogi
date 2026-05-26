import { describe, expect, test } from "vitest";
import { InitialPositionSFEN, Position } from "tsshogi";
import { generateLegalMoves } from "./legalMoves";

function initialPosition() {
  const position = Position.newBySFEN(InitialPositionSFEN.STANDARD);

  if (!position) {
    throw new Error("初期局面を生成できません");
  }

  return position;
}

describe("generateLegalMoves", () => {
  test.each(["7g7f", "2g2f", "6i7h"])("初期局面で合法手を生成する: %s", (usi) => {
    const moves = generateLegalMoves(initialPosition()).map((move) => move.usi);

    expect(moves).toContain(usi);
  });

  test.each(["3c3d", "5a5b", "7g7e"])("初期局面で非合法手を含めない: %s", (usi) => {
    const moves = generateLegalMoves(initialPosition()).map((move) => move.usi);

    expect(moves).not.toContain(usi);
  });
});
