# システム設計

## アーキテクチャ

```text
AI 先手エージェント ─ Playwright MCP ┐
                                      ├─ LocalWeb UI ─ HTTP API ─ GameService ─ tsshogi
AI 後手エージェント ─ Playwright MCP ┘                       │
人間プレイヤー ───── LocalWeb UI ──────────────────────────  ├─ 棋譜ログ
                                                              └─ プレイバック状態
観戦者 ───────────────────────────────── LocalWeb UI
```

## 技術スタック

| 役割 | 採用技術 | 理由 |
|---|---|---|
| サーバー | Node.js + Express | 軽量。将来 WebSocket を追加しやすい |
| フロントエンド | React + Vite | コンポーネント分離が容易。HMR で開発効率が高い |
| 将棋ルール | tsshogi | KIF/CSA/USI 対応。合法手・局面・棋譜をまとめて扱える |
| 型共有 | TypeScript (ESM) | クライアント・サーバー間でモデルを共有 |
| テスト | Vitest | ESM ネイティブ、設定が軽い |
| 外部 AI | Ollama (gemma4) | ローカルで動く LLM。APIが単純 |

## 責務分離

### フロントエンド (`src/client/`)
- 盤面・持ち駒・棋譜ログの表示
- クリックによる駒の選択と移動
- プレイヤー設定（AI種別・探索深さ・表示名）
- プレイバック操作
- 保存棋譜の読み込みと KIF/CSA ダウンロード

### サーバー (`src/server/`)
- `GameService`: 対局状態の唯一の正として管理
- 合法手チェックと指し手適用（tsshogi 委譲）
- 棋譜スナップショット生成とアーカイブ保存
- `AiPlayer` インターフェースによる AI の DI
- KIF/CSA エクスポート

### AI 実装
- `SimpleAiPlayer`: ヒューリスティック + αβ探索。深さ可変
- `OllamaAiPlayer`: ローカル LLM への問い合わせ
- 外部エージェント (`src/agents/`): HTTP ポーリング方式の独立プロセス

## データモデル

### 対局状態 (`GameState`)
現在局面の SFEN、手番、盤面ビュー、持ち駒、合法手一覧、棋譜ログ、AI 動作状態を含む。クライアントは 1 秒ポーリングで最新状態を取得する。

### 棋譜エントリ (`MoveLogEntry`)
1 手ごとに `{ ply, side, usi, displayText, sfen, agentName, reason, candidates, evaluation, createdAt }` を保存する。

### アーカイブ保存形式
- `data/games/{id}.json`: スナップショット込みの完全棋譜（プレイバック用）
- `data/games/{id}.jsonl`: 1 手ごとの追記ログ（耐障害性のため）

## API 一覧

| Method | Path | 用途 |
|---|---|---|
| `GET` | `/api/state` | 現在状態を取得 |
| `POST` | `/api/new-game` | 対局を初期化 |
| `POST` | `/api/move` | USI 指し手を適用 |
| `POST` | `/api/ai/start` | AI 自動対局を開始（プレイヤー設定付き） |
| `POST` | `/api/ai/stop` | AI 自動対局を停止 |
| `POST` | `/api/resign` | 投了 |
| `GET` | `/api/replay/:ply` | 指定手数の局面を取得 |
| `GET` | `/api/games` | 保存棋譜の一覧を取得 |
| `GET` | `/api/games/:id` | 保存棋譜を取得 |
| `GET` | `/api/games/:id/kif` | KIF 形式でダウンロード |
| `GET` | `/api/games/:id/csa` | CSA 形式でダウンロード |

## Playwright MCP 操作方針

UI には以下の安定セレクタを付与している。

- `data-testid="square-{file}-{rank}"` — 各マス
- `data-testid="move-input"` / `data-testid="submit-move"` — USI 入力経路
- `data-testid="ai-start"` / `data-testid="ai-stop"` — AI 制御
- `data-testid="replay-slider"` / `data-testid="move-log"` — 観戦

外部エージェントは DOM 位置に依存せず `data-testid` と `/api/state` を使う。
詳細は [04-agent-contract.md](./04-agent-contract.md) を参照。
