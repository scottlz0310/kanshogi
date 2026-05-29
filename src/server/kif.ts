import {
  exportCSA,
  exportKIF,
  InitialPositionSFEN,
  Position,
  Record,
  RecordMetadataKey,
} from "tsshogi";
import type { GameArchive } from "../shared/types.js";

function toJstDateString(iso: string): string {
  return iso.replace("T", " ").slice(0, 19).replace(/-/g, "/");
}

function buildRecord(archive: GameArchive): Record {
  const sfen = archive.initialSfen ?? InitialPositionSFEN.STANDARD;
  const pos = Position.newBySFEN(sfen);

  if (!pos) {
    throw new Error(`初期局面の生成に失敗しました: ${sfen}`);
  }

  const record = new Record(pos);

  if (archive.players.black) {
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, archive.players.black);
  }
  if (archive.players.white) {
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, archive.players.white);
  }

  record.metadata.setStandardMetadata(
    RecordMetadataKey.START_DATETIME,
    toJstDateString(archive.startedAt),
  );

  if (archive.finishedReason) {
    record.metadata.setCustomMetadata("終局理由", archive.finishedReason);
  }

  for (const entry of archive.log) {
    const move = record.position.createMoveByUSI(entry.usi);

    if (!move) {
      throw new Error(`USI手の変換に失敗しました: ${entry.usi} (${entry.ply}手目)`);
    }

    record.append(move);
  }

  return record;
}

export function archiveToKIF(archive: GameArchive): string {
  return exportKIF(buildRecord(archive));
}

export function archiveToCSA(archive: GameArchive): string {
  return exportCSA(buildRecord(archive));
}
