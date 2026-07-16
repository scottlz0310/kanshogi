# 外部 AI エージェント操作仕様

## 概要

外部 AI エージェントは Playwright MCP またはHTTP API を通じてAI将棋対局システムに参加できる。サーバー側の合法手判定は常に有効であり、エージェントは `data-testid` と `/api/state` の情報のみに依拠して安定した操作が可能である。

## 基本方針

- エージェントは UI (`data-testid`) または HTTP API どちらからでも指し手を送信できる。
- 合法手の正本は `/api/state` の `legalMoves` フィールドである。UI の合法手候補ボタンは最大 24 件に制限されており、全件は `/api/state.legalMoves` を参照すること。
- 指し手は必ず USI 形式（例: `7g7f`、持ち駒打ち: `P*5e`）で指定する。
- 思考要約（`agentName`・`reason`・`candidates`・`evaluation`）は `/api/move` の `thought` フィールドで渡すと棋譜ログに記録される。

## data-testid 一覧

| `data-testid` | 要素 | 用途 |
|---|---|---|
| `shogi-board` | `div` | 盤面全体 |
| `square-{file}-{rank}` | `button` | 各マス（例: `square-7-6`）|
| `move-input` | `input` | USI 指し手入力欄 |
| `submit-move` | `button` | 指し手送信ボタン |
| `ai-start` | `button` | 組み込み AI 自動対局開始 |
| `ai-stop` | `button` | 組み込み AI 自動対局停止 |
| `replay-slider` | `input[type=range]` | プレイバックスライダー |
| `move-log` | `div` | 棋譜ログ全体 |
| `resign-black` | `button` | 先手投了 |
| `resign-white` | `button` | 後手投了 |

## UI 経由の操作手順

```
1. GET /api/state で現在の turn と legalMoves を確認する
2. legalMoves から指したい USI を選ぶ
3. move-input に USI を入力する（browser_fill_form または browser_type）
4. submit-move をクリックする（browser_click）
5. GET /api/state で指し手が反映されたことを確認する
```

## API 経由の操作手順

```http
POST /api/move
Content-Type: application/json

{
  "usi": "7g7f",
  "thought": {
    "agentName": "先手AIエージェント",
    "reason": "飛車先を開ける",
    "candidates": ["7g7f", "2g2f", "3g3f"],
    "evaluation": "互角"
  }
}
```

レスポンスは更新後の `GameState` である。エラー時は `{ "error": "メッセージ" }` が返る。

## 2 エージェント対局の進め方

```
初期化:
  POST /api/new-game

対局ループ (終局まで繰り返す):
  1. GET /api/state で status・turn・legalMoves を取得する
  2. status === "finished" なら終了
  3. turn に応じた AI エージェントが指し手を決定する
  4. POST /api/move で指し手と thought を送信する

終局確認:
  GET /api/state の finishedReason を確認する
  GET /api/games で保存棋譜の一覧を確認する
```

## エラーの取り扱い

| HTTP ステータス | 意味 |
|---|---|
| `200` | 成功 |
| `400` | 合法手でない / 手番違い / 終局後の指し手 |

`400` を受け取った場合は、`GET /api/state` で最新状態を取得し直してから再試行すること。

## 状態観測フィールド

`GET /api/state` のレスポンス主要フィールド：

```ts
{
  status: "ready" | "playing" | "paused" | "finished";
  turn: "black" | "white";
  sfen: string;          // 現局面の SFEN 文字列
  legalMoves: string[];  // 合法手一覧（USI 形式）← 合法手の正本
  checked: boolean;      // 王手中かどうか
  finishedReason: string | null;
  log: MoveLogEntry[];
  aiRunning: boolean;    // 組み込み AI が動作中かどうか
}
```

## 注意事項

- `aiRunning === true` の間は組み込み AI が手を打ち続ける。外部エージェントと競合するため、`POST /api/ai/stop` で停止してから外部エージェントを動かすこと。
- `status === "finished"` 後の `/api/move` は 400 エラーになる。新規対局は `POST /api/new-game` で開始する。
- 盤面クリック操作は Phase 5 で実装済み。ただし外部エージェントからは USI 入力欄経由を推奨する。
- `bun run agents` による外部エージェントと組み込み AI (`ai-start`) の同時起動は非推奨。

## ollama 外部エージェントの起動

```bash
# 先手と後手を別ターミナルで起動
bun run agent:black   # 先手Gemma4
bun run agent:white   # 後手Gemma4

# または同時起動
bun run agents
```

環境変数で接続先を変更できる：

| 変数 | デフォルト | 説明 |
|---|---|---|
| `GAME_SERVER` | `http://localhost:3030` | ゲームサーバーの URL |
| `OLLAMA_SERVER` | `http://localhost:11434` | ollama サーバーの URL |
| `OLLAMA_MODEL` | `gemma4` | 使用するモデル名 |
