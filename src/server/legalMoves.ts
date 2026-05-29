import {
  Color,
  handPieceTypes,
  type ImmutablePosition,
  isPromotableRank,
  type Move,
  type PieceType,
  Square,
} from "tsshogi";

export type LegalMoveCandidate = {
  usi: string;
  move: Move;
};

function addCandidate(
  candidates: Map<string, LegalMoveCandidate>,
  position: ImmutablePosition,
  move: Move | null,
): void {
  if (!move || !position.isValidMove(move)) {
    return;
  }

  candidates.set(move.usi, {
    usi: move.usi,
    move,
  });
}

export function generateLegalMoves(position: ImmutablePosition): LegalMoveCandidate[] {
  const candidates = new Map<string, LegalMoveCandidate>();

  for (const from of position.board.listNonEmptySquares()) {
    const piece = position.board.at(from);

    if (!piece || piece.color !== position.color) {
      continue;
    }

    for (const to of Square.all) {
      const move = position.createMove(from, to);
      addCandidate(candidates, position, move);

      if (
        move &&
        piece?.isPromotable() &&
        (isPromotableRank(position.color, from.rank) || isPromotableRank(position.color, to.rank))
      ) {
        addCandidate(candidates, position, move.withPromote());
      }
    }
  }

  for (const pieceType of handPieceTypes as PieceType[]) {
    if (position.hand(position.color).count(pieceType) === 0) {
      continue;
    }

    for (const to of Square.all) {
      addCandidate(candidates, position, position.createMove(pieceType, to));
    }
  }

  return [...candidates.values()].sort((a, b) => a.usi.localeCompare(b.usi));
}

export function parseSide(color: Color): "black" | "white" {
  return color === Color.BLACK ? "black" : "white";
}
