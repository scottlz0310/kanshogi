import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  GameArchive,
  GameArchiveSummary,
  GameState,
  MoveLogEntry,
  ReplaySnapshot,
  Side
} from "../shared/types";

type ApiError = {
  error: string;
};

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    },
    ...options
  });

  const data = (await response.json()) as unknown;

  if (!response.ok) {
    const apiError = data as Partial<ApiError>;
    throw new Error(apiError.error ?? "APIリクエストに失敗しました");
  }

  return data as T;
}

function formatMs(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function sideLabel(side: "black" | "white"): string {
  return side === "black" ? "先手" : "後手";
}

function statusLabel(status: GameState["status"]): string {
  return {
    ready: "開始前",
    playing: "対局中",
    paused: "一時停止",
    finished: "終局"
  }[status];
}

const RANK_LETTERS = "abcdefghi";

function squareUSI(file: number, rank: number): string {
  return `${file}${RANK_LETTERS[rank - 1]}`;
}

type Selection =
  | { kind: "square"; file: number; rank: number }
  | { kind: "hand"; dropUsi: string }
  | null;

type PromoDialog = { usi: string; usiPromote: string };

function computeLegalTargets(selection: Selection, legalMoves: string[]): Set<string> {
  const dests = new Set<string>();
  if (!selection) return dests;
  if (selection.kind === "square") {
    const from = squareUSI(selection.file, selection.rank);
    for (const m of legalMoves) {
      if (m.slice(0, 2) === from) dests.add(m.slice(2, 4));
    }
  } else {
    const prefix = `${selection.dropUsi}*`;
    for (const m of legalMoves) {
      if (m.startsWith(prefix)) dests.add(m.slice(prefix.length));
    }
  }
  return dests;
}

function Board({
  snapshot,
  interactive,
  selectedSquareUSI,
  legalTargetUSIs,
  onSquareClick
}: {
  snapshot: ReplaySnapshot;
  interactive: boolean;
  selectedSquareUSI: string | null;
  legalTargetUSIs: Set<string>;
  onSquareClick: (file: number, rank: number) => void;
}) {
  return (
    <div className="board" data-testid="shogi-board">
      {snapshot.board.map((square) => {
        const sqUSI = squareUSI(square.file, square.rank);
        const isSelected = sqUSI === selectedSquareUSI;
        const isTarget = legalTargetUSIs.has(sqUSI);
        const cls = [
          "square",
          isSelected ? "selectedSquare" : "",
          isTarget ? "legalTarget" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            className={cls}
            data-testid={square.testId}
            key={`${square.file}-${square.rank}`}
            onClick={interactive ? () => onSquareClick(square.file, square.rank) : undefined}
            title={`${square.file}${square.rank}`}
            type="button"
          >
            {square.piece ? (
              <span
                className={
                  square.piece.side === "white" ? "pieceLabel whitePiece" : "pieceLabel"
                }
              >
                {square.piece.label}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Hands({
  snapshot,
  interactive,
  turn,
  selectedHandDropUsi,
  onHandPieceClick,
  clockMs,
  turnElapsedMs
}: {
  snapshot: ReplaySnapshot;
  interactive: boolean;
  turn: Side;
  selectedHandDropUsi: string | null;
  onHandPieceClick: (dropUsi: string) => void;
  clockMs?: { black: number; white: number };
  turnElapsedMs?: number;
}) {
  return (
    <div className="hands">
      {(["white", "black"] as const).map((side) => {
        const accumulated = clockMs?.[side] ?? 0;
        const isActive = side === turn;
        const displayMs = accumulated + (isActive && turnElapsedMs !== undefined ? turnElapsedMs : 0);
        return (
        <div className="hand" key={side}>
          <div className="handTitle">
            <span>{sideLabel(side)} 持ち駒</span>
            {clockMs !== undefined ? (
              <span className={`handClock${isActive ? " handClockActive" : ""}`}>
                {formatMs(displayMs)}
              </span>
            ) : null}
          </div>
          <div className="handPieces">
            {snapshot.hands[side].length === 0 ? (
              <span className="emptyText">なし</span>
            ) : (
              snapshot.hands[side].map((piece) => {
                const isClickable = interactive && side === turn;
                const isSelected = piece.dropUsi === selectedHandDropUsi;
                return (
                  <button
                    className={`handPiece${isSelected ? " handPieceSelected" : ""}`}
                    disabled={!isClickable}
                    key={`${side}-${piece.type}`}
                    onClick={isClickable ? () => onHandPieceClick(piece.dropUsi) : undefined}
                    type="button"
                  >
                    {piece.label}×{piece.count}
                  </button>
                );
              })
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function PromotionDialog({ onChoose }: { onChoose: (promote: boolean) => void }) {
  return (
    <div className="promoOverlay">
      <div className="promoDialog">
        <p>成りますか？</p>
        <div className="buttonRow">
          <button onClick={() => onChoose(true)} type="button">
            成る
          </button>
          <button onClick={() => onChoose(false)} type="button">
            不成
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveLog({ log }: { log: MoveLogEntry[] }) {
  return (
    <div className="moveLog" data-testid="move-log">
      {log.length === 0 ? (
        <div className="emptyText">棋譜はまだありません</div>
      ) : (
        log.map((entry) => (
          <article className="moveEntry" key={entry.ply}>
            <div className="moveEntryHead">
              <span>
                {entry.ply}. {entry.displayText}
                {entry.agentName ? ` (${entry.agentName})` : ""}
              </span>
              <span>
                {entry.evaluation}
                {entry.thinkingTimeMs !== undefined ? ` / ${formatMs(entry.thinkingTimeMs)}` : ""}
              </span>
            </div>
            <div className="moveReason">{entry.reason}</div>
            <div className="candidateLine">候補: {entry.candidates.join(", ")}</div>
          </article>
        ))
      )}
    </div>
  );
}

type AiType = "simple" | "ollama" | "usi" | "none";
type PlayerConfig = { type: AiType; name: string; depth: number; enginePath: string };

const defaultPlayers: { black: PlayerConfig; white: PlayerConfig } = {
  black: { type: "simple", name: "先手AI", depth: 1, enginePath: "" },
  white: { type: "simple", name: "後手AI", depth: 1, enginePath: "" }
};

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [archives, setArchives] = useState<GameArchiveSummary[]>([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState("");
  const [loadedArchive, setLoadedArchive] = useState<GameArchive | null>(null);
  const [replayPly, setReplayPly] = useState(0);
  const [replaySnapshot, setReplaySnapshot] = useState<ReplaySnapshot | null>(null);
  const [moveInput, setMoveInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState(defaultPlayers);
  const [stepMode, setStepMode] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [promoDialog, setPromoDialog] = useState<PromoDialog | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const activeLog = loadedArchive?.log ?? state?.log ?? [];
  const maxReplayPly = activeLog.length;
  const currentSnapshot = loadedArchive
    ? loadedArchive.snapshots[replayPly]
    : replaySnapshot ?? state;
  const isArchiveMode = loadedArchive !== null;
  const isInteractive =
    !isArchiveMode &&
    replaySnapshot === null &&
    state?.status !== "finished" &&
    (!state?.stepMode || !state?.aiRunning || (state?.isHumanTurn ?? true));

  const turnElapsedMs =
    state?.status === "playing" ? nowMs - new Date(state.turnStartedAt).getTime() : 0;

  const legalTargets = useMemo(
    () => computeLegalTargets(selection, isInteractive && state ? state.legalMoves : []),
    [selection, isInteractive, state]
  );

  const selectedSquareUSI =
    selection?.kind === "square" ? squareUSI(selection.file, selection.rank) : null;
  const selectedHandDropUsi = selection?.kind === "hand" ? selection.dropUsi : null;

  const legalMovePreview = useMemo(() => {
    if (!state || isArchiveMode) {
      return [];
    }
    return state.legalMoves.slice(0, 24);
  }, [isArchiveMode, state]);

  async function refreshState(): Promise<void> {
    const nextState = await requestJson<GameState>("/api/state");
    setState(nextState);
    setReplayPly((current) => (current > nextState.log.length ? nextState.log.length : current));
    if (!loadedArchive && replayPly === nextState.log.length) {
      setReplaySnapshot(null);
    }
  }

  async function refreshArchives(): Promise<void> {
    setArchives(await requestJson<GameArchiveSummary[]>("/api/games"));
  }

  useEffect(() => {
    refreshState().catch((nextError: unknown) =>
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    );
    refreshArchives().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!loadedArchive) {
        refreshState().catch((nextError: unknown) =>
          setError(nextError instanceof Error ? nextError.message : String(nextError))
        );
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loadedArchive, replayPly]);

  async function runAction(action: () => Promise<GameState>): Promise<void> {
    try {
      setError(null);
      const nextState = await action();
      setState(nextState);
      setLoadedArchive(null);
      setReplaySnapshot(null);
      setReplayPly(nextState.log.length);
      setSelection(null);
      await refreshArchives();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function applyUSI(usi: string): Promise<void> {
    await runAction(() =>
      requestJson<GameState>("/api/move", {
        method: "POST",
        body: JSON.stringify({ usi })
      })
    );
  }

  async function submitMove(event: FormEvent): Promise<void> {
    event.preventDefault();
    const usi = moveInput.trim();
    if (!usi) return;
    await applyUSI(usi);
    setMoveInput("");
  }

  function handleSquareClick(file: number, rank: number): void {
    if (!isInteractive || !state || !currentSnapshot) return;

    const targetUSI = squareUSI(file, rank);

    if (selection?.kind === "square" && selection.file === file && selection.rank === rank) {
      setSelection(null);
      return;
    }

    if (selection) {
      if (legalTargets.has(targetUSI)) {
        const baseUSI =
          selection.kind === "square"
            ? `${squareUSI(selection.file, selection.rank)}${targetUSI}`
            : `${selection.dropUsi}*${targetUSI}`;
        const promoUSI = `${baseUSI}+`;
        const canPromote = state.legalMoves.includes(promoUSI);
        const baseIsLegal = state.legalMoves.includes(baseUSI);

        setSelection(null);
        if (canPromote && baseIsLegal) {
          setPromoDialog({ usi: baseUSI, usiPromote: promoUSI });
        } else {
          void applyUSI(canPromote ? promoUSI : baseUSI);
        }
        return;
      }

      const clickedPiece = currentSnapshot.board.find(
        (s) => s.file === file && s.rank === rank
      )?.piece;
      if (clickedPiece?.side === currentSnapshot.turn) {
        setSelection({ kind: "square", file, rank });
        return;
      }
      setSelection(null);
      return;
    }

    const clickedPiece = currentSnapshot.board.find(
      (s) => s.file === file && s.rank === rank
    )?.piece;
    if (clickedPiece?.side === currentSnapshot.turn) {
      setSelection({ kind: "square", file, rank });
    }
  }

  function handleHandPieceClick(dropUsi: string): void {
    if (!isInteractive) return;
    if (selection?.kind === "hand" && selection.dropUsi === dropUsi) {
      setSelection(null);
    } else {
      setSelection({ kind: "hand", dropUsi });
    }
  }

  function handlePromoChoice(promote: boolean): void {
    if (!promoDialog) return;
    const usi = promote ? promoDialog.usiPromote : promoDialog.usi;
    setPromoDialog(null);
    void applyUSI(usi);
  }

  async function changeReplay(nextPly: number): Promise<void> {
    setReplayPly(nextPly);
    setSelection(null);
    setError(null);

    if (loadedArchive) {
      setReplaySnapshot(loadedArchive.snapshots[nextPly]);
      return;
    }

    if (state && nextPly === state.log.length) {
      setReplaySnapshot(null);
      return;
    }

    try {
      setReplaySnapshot(await requestJson<ReplaySnapshot>(`/api/replay/${nextPly}`));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function loadArchive(): Promise<void> {
    if (!selectedArchiveId) return;
    try {
      setError(null);
      const archive = await requestJson<GameArchive>(`/api/games/${selectedArchiveId}`);
      setLoadedArchive(archive);
      setReplayPly(0);
      setReplaySnapshot(archive.snapshots[0]);
      setSelection(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  if (!state || !currentSnapshot) {
    return <main className="loading">読み込み中</main>;
  }

  return (
    <main className="appShell">
      {promoDialog ? <PromotionDialog onChoose={handlePromoChoice} /> : null}

      <header className="topBar">
        <div>
          <h1>AI 将棋観戦</h1>
          <p>
            {isArchiveMode ? "保存棋譜を再生中" : `対局ID ${state.gameId}`} /{" "}
            {statusLabel(currentSnapshot.status)}
          </p>
        </div>
        <div className="statusStrip">
          {currentSnapshot.status === "finished" ? null : (
            <span>{sideLabel(currentSnapshot.turn)}番</span>
          )}
          {currentSnapshot.checked && currentSnapshot.status !== "finished" ? (
            <span className="checkedBadge">王手</span>
          ) : null}
        </div>
      </header>

      {!isArchiveMode && state.status === "finished" && state.finishedReason ? (
        <div className="finishedBanner">終局 — {state.finishedReason}</div>
      ) : null}

      {error ? <div className="errorBanner">{error}</div> : null}

      <section className="workspace">
        <section className="boardArea" aria-label="将棋盤">
          <Hands
            clockMs={!isArchiveMode ? state.clockMs : undefined}
            interactive={isInteractive}
            onHandPieceClick={handleHandPieceClick}
            selectedHandDropUsi={selectedHandDropUsi}
            snapshot={currentSnapshot}
            turn={currentSnapshot.turn}
            turnElapsedMs={!isArchiveMode && state.status === "playing" ? turnElapsedMs : undefined}
          />
          <Board
            interactive={isInteractive}
            legalTargetUSIs={legalTargets}
            onSquareClick={handleSquareClick}
            selectedSquareUSI={selectedSquareUSI}
            snapshot={currentSnapshot}
          />
          <div className="sfenLine">SFEN: {currentSnapshot.sfen}</div>
        </section>

        <aside className="sidePanel">
          <section className="panelSection">
            <h2>操作</h2>
            <div className="playerSetup">
              {(["black", "white"] as const).map((side) => (
                <div key={side}>
                  <div className="playerRow">
                    <span className="playerSideLabel">{sideLabel(side)}</span>
                    <select
                      disabled={isArchiveMode || state.status !== "ready"}
                      onChange={(e) =>
                        setPlayers((prev) => ({
                          ...prev,
                          [side]: { ...prev[side], type: e.target.value as AiType }
                        }))
                      }
                      value={players[side].type}
                    >
                      <option value="simple">SimpleAI</option>
                      <option value="ollama">Ollama (gemma4)</option>
                      <option value="usi">USIエンジン</option>
                      <option value="none">手動</option>
                    </select>
                    <input
                      disabled={isArchiveMode || state.status !== "ready"}
                      maxLength={20}
                      onChange={(e) =>
                        setPlayers((prev) => ({
                          ...prev,
                          [side]: { ...prev[side], name: e.target.value }
                        }))
                      }
                      placeholder="表示名"
                      value={players[side].name}
                    />
                  </div>
                  {players[side].type === "simple" ? (
                    <div className="depthRow">
                      <span className="depthLabel">読み深さ</span>
                      <select
                        disabled={isArchiveMode || state.status !== "ready"}
                        onChange={(e) =>
                          setPlayers((prev) => ({
                            ...prev,
                            [side]: { ...prev[side], depth: Number(e.target.value) }
                          }))
                        }
                        value={players[side].depth}
                      >
                        <option value={1}>1手（速い）</option>
                        <option value={2}>2手</option>
                        <option value={3}>3手（推奨）</option>
                        <option value={4}>4手（遅い）</option>
                      </select>
                    </div>
                  ) : null}
                  {players[side].type === "usi" ? (
                    <div className="enginePathRow">
                      <span className="depthLabel">パス</span>
                      <input
                        className="enginePathInput"
                        disabled={isArchiveMode || state.status !== "ready"}
                        onChange={(e) =>
                          setPlayers((prev) => ({
                            ...prev,
                            [side]: { ...prev[side], enginePath: e.target.value }
                          }))
                        }
                        placeholder="例: C:\engines\yaneuraou.exe"
                        value={players[side].enginePath}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <label className="stepModeLabel">
              <input
                checked={state.aiRunning ? state.stepMode : stepMode}
                disabled={isArchiveMode || state.status === "finished" || (state.status !== "ready" && !state.aiRunning)}
                onChange={(e) => {
                  const next = e.target.checked;
                  setStepMode(next);
                  if (state.aiRunning) {
                    void runAction(() =>
                      requestJson<GameState>("/api/ai/mode", {
                        method: "POST",
                        body: JSON.stringify({ stepMode: next })
                      })
                    );
                  }
                }}
                type="checkbox"
              />
              ステップ実行（１手ずつ）
            </label>
            <div className="buttonRow">
              <button
                data-testid="ai-start"
                disabled={isArchiveMode || state.status === "finished"}
                onClick={() =>
                  runAction(() =>
                    requestJson<GameState>("/api/ai/start", {
                      method: "POST",
                      body: JSON.stringify({ black: players.black, white: players.white, stepMode })
                    })
                  )
                }
                type="button"
              >
                AI開始
              </button>
              <button
                data-testid="ai-stop"
                disabled={isArchiveMode || state.status === "finished"}
                onClick={() =>
                  runAction(() => requestJson<GameState>("/api/ai/stop", { method: "POST" }))
                }
                type="button"
              >
                AI停止
              </button>
              {!isArchiveMode && state.stepMode && state.aiRunning && state.status === "playing" ? (
                state.isHumanTurn ? (
                  <span className="humanTurnBadge">あなたの番</span>
                ) : (
                  <button
                    disabled={state.aiThinking}
                    onClick={() =>
                      runAction(() =>
                        requestJson<GameState>("/api/ai/step", { method: "POST" })
                      )
                    }
                    type="button"
                  >
                    {state.aiThinking ? "AI計算中..." : "次の手"}
                  </button>
                )
              ) : null}
              {!isArchiveMode && !state.stepMode && state.aiThinking ? (
                <span className="aiThinkingBadge">AI計算中...</span>
              ) : null}
              <button
                disabled={isArchiveMode}
                onClick={() => {
                  setPlayers(defaultPlayers);
                  return runAction(() =>
                    requestJson<GameState>("/api/new-game", { method: "POST" })
                  );
                }}
                type="button"
              >
                新規対局
              </button>
            </div>
            <p className="agentWarning">
              ⚠ 外部エージェント(<code>npm run agents</code>)とAI開始の同時使用は非推奨です
            </p>

            <form className="moveForm" onSubmit={submitMove}>
              <input
                data-testid="move-input"
                disabled={isArchiveMode || state.status === "finished"}
                onChange={(event) => setMoveInput(event.target.value)}
                placeholder="例: 7g7f"
                value={moveInput}
              />
              <button
                data-testid="submit-move"
                disabled={isArchiveMode || state.status === "finished"}
                type="submit"
              >
                指す
              </button>
            </form>

            {!isArchiveMode && state.status === "playing" ? (
              <div className="buttonRow">
                <button
                  className="resignButton"
                  data-testid="resign-black"
                  onClick={() =>
                    runAction(() =>
                      requestJson<GameState>("/api/resign", {
                        method: "POST",
                        body: JSON.stringify({ side: "black" })
                      })
                    )
                  }
                  type="button"
                >
                  先手投了
                </button>
                <button
                  className="resignButton"
                  data-testid="resign-white"
                  onClick={() =>
                    runAction(() =>
                      requestJson<GameState>("/api/resign", {
                        method: "POST",
                        body: JSON.stringify({ side: "white" })
                      })
                    )
                  }
                  type="button"
                >
                  後手投了
                </button>
              </div>
            ) : null}
          </section>

          <section className="panelSection">
            <h2>プレイバック</h2>
            <input
              data-testid="replay-slider"
              max={maxReplayPly}
              min={0}
              onChange={(event) => changeReplay(Number(event.target.value))}
              type="range"
              value={replayPly}
            />
            <div className="replayMeta">
              {replayPly} / {maxReplayPly} 手
            </div>
          </section>

          <section className="panelSection">
            <h2>保存棋譜</h2>
            <div className="archiveControls">
              <select
                onChange={(event) => setSelectedArchiveId(event.target.value)}
                value={selectedArchiveId}
              >
                <option value="">選択してください</option>
                {archives.map((archive) => {
                  const black = archive.players.black ?? "先手";
                  const white = archive.players.white ?? "後手";
                  const result = archive.finishedReason ? ` [${archive.finishedReason}]` : "";
                  return (
                    <option key={archive.id} value={archive.id}>
                      {formatDateTime(archive.startedAt)} / {black} vs {white} / {archive.moves}手
                      {result}
                    </option>
                  );
                })}
              </select>
              <button onClick={loadArchive} type="button">
                読込
              </button>
            </div>
            {selectedArchiveId ? (
              <div className="archiveDownloads">
                <a download href={`/api/games/${selectedArchiveId}/kif`}>
                  KIF
                </a>
                <a download href={`/api/games/${selectedArchiveId}/csa`}>
                  CSA
                </a>
              </div>
            ) : null}
            {isArchiveMode ? (
              <button
                onClick={() => {
                  setLoadedArchive(null);
                  setReplaySnapshot(null);
                  setReplayPly(state.log.length);
                }}
                type="button"
              >
                現在の対局へ戻る
              </button>
            ) : null}
          </section>

          <section className="panelSection">
            <h2>合法手候補</h2>
            <div className="legalMoves">
              {legalMovePreview.map((move) => (
                <button
                  disabled={isArchiveMode}
                  key={move}
                  onClick={() => setMoveInput(move)}
                  type="button"
                >
                  {move}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="logArea">
        <h2>棋譜と思考ログ</h2>
        <MoveLog log={activeLog} />
      </section>
    </main>
  );
}
