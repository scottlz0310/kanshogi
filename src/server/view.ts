import {
  Color,
  ImmutablePosition,
  PieceType,
  Square,
  handPieceTypes,
  standardPieceName
} from "tsshogi";
import type {
  BoardSquareView,
  GameStatus,
  HandPieceView,
  HandsView,
  PieceView,
  ReplaySnapshot,
  Side
} from "../shared/types";

const promotedTypes = new Set<PieceType>([
  PieceType.PROM_PAWN,
  PieceType.PROM_LANCE,
  PieceType.PROM_KNIGHT,
  PieceType.PROM_SILVER,
  PieceType.HORSE,
  PieceType.DRAGON
]);

const handOrder = [
  PieceType.ROOK,
  PieceType.BISHOP,
  PieceType.GOLD,
  PieceType.SILVER,
  PieceType.KNIGHT,
  PieceType.LANCE,
  PieceType.PAWN
];

const DROP_USI: Partial<Record<PieceType, string>> = {
  [PieceType.ROOK]: "R",
  [PieceType.BISHOP]: "B",
  [PieceType.GOLD]: "G",
  [PieceType.SILVER]: "S",
  [PieceType.KNIGHT]: "N",
  [PieceType.LANCE]: "L",
  [PieceType.PAWN]: "P"
};

export function sideFromColor(color: Color): Side {
  return color === Color.BLACK ? "black" : "white";
}

function pieceLabel(type: PieceType): string {
  return standardPieceName(type);
}

function serializePiece(piece: { color: Color; type: PieceType; sfen: string }): PieceView {
  return {
    side: sideFromColor(piece.color),
    type: piece.type,
    label: pieceLabel(piece.type),
    promoted: promotedTypes.has(piece.type),
    sfen: piece.sfen
  };
}

function serializeBoard(position: ImmutablePosition): BoardSquareView[] {
  const board: BoardSquareView[] = [];

  for (let rank = 1; rank <= 9; rank += 1) {
    for (let file = 9; file >= 1; file -= 1) {
      const square = new Square(file, rank);
      const piece = position.board.at(square);

      board.push({
        file,
        rank,
        testId: `square-${file}-${rank}`,
        piece: piece ? serializePiece(piece) : null
      });
    }
  }

  return board;
}

function serializeHand(position: ImmutablePosition, color: Color): HandPieceView[] {
  const hand = position.hand(color);
  const typedHandPieceTypes = handPieceTypes as PieceType[];
  const order = handOrder.filter((type) => typedHandPieceTypes.includes(type));

  return order
    .map((type) => ({
      type,
      label: pieceLabel(type),
      count: hand.count(type),
      dropUsi: DROP_USI[type] ?? ""
    }))
    .filter((piece) => piece.count > 0);
}

function serializeHands(position: ImmutablePosition): HandsView {
  return {
    black: serializeHand(position, Color.BLACK),
    white: serializeHand(position, Color.WHITE)
  };
}

export function createSnapshot(
  position: ImmutablePosition,
  ply: number,
  status: GameStatus
): ReplaySnapshot {
  return {
    ply,
    status,
    turn: sideFromColor(position.color),
    sfen: position.getSFEN(ply + 1),
    board: serializeBoard(position),
    hands: serializeHands(position),
    checked: position.checked
  };
}
