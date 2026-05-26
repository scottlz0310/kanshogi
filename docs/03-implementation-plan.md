# 実装フェーズ計画

各フェーズの目的・実装内容・完了状態を記録する。

---

## Phase 1: MVP — 基本対局基盤 ✅

**目的**: AI 同士の自動対局が動く最小構成を作る。

**実装内容**:
- Express サーバー + React/Vite クライアント構成
- tsshogi による合法手判定と局面管理
- SimpleAI（1手読みヒューリスティック）
- `/api/state` / `/api/move` / `/api/ai/start` / `/api/ai/stop`
- 盤面・持ち駒・棋譜ログの表示
- プレイバックスライダー
- Playwright MCP 用 `data-testid` 付与
- 棋譜ログへの `agentName` / `reason` / `candidates` / `evaluation` 保存
- 外部エージェント仕様書 ([04-agent-contract.md](./04-agent-contract.md))
- ollama 外部エージェント (`src/agents/ollamaAgent.ts`)

---

## Phase 2: 棋譜保存形式の整理 ✅

**目的**: 保存棋譜を後から扱いやすくし、外部ツールとの連携を可能にする。

**実装内容**:
- アーカイブにバージョン番号と対局者名フィールドを追加
- KIF / CSA エクスポート API (`/api/games/:id/kif`, `/api/games/:id/csa`)
- 棋譜一覧に終局理由・手数・開始時刻・対局者名を表示
- 旧形式アーカイブへのデフォルト値補完（後方互換）

---

## Phase 3: 終局処理の強化 ✅

**目的**: 終局理由を明確化し、観戦体験を向上させる。

**実装内容**:
- 投了 API (`POST /api/resign`) と UI ボタン
- 詰み・合法手なし・千日手・手数上限の検出と理由表示
- 終局バナー・王手バッジの表示
- 終局後の指し手を拒否

---

## Phase 4: AI 差し替え口の設計 ✅

**目的**: AI 実装を共通インターフェースで扱えるようにする。

**実装内容**:
- `AiPlayer` インターフェース定義（入力: `GameState`、出力: `MoveRequest`）
- `SimpleAiPlayer` と `OllamaAiPlayer` を実装
- `GameService.startAi(players)` で DI を受け取る設計に変更
- `ollamaAgent.ts` を `OllamaAiPlayer` を使うよう簡略化
- `SimpleAiPlayer` のテスト追加

---

## Phase 4.5: AI 選択 UI ✅

**目的**: UI からプレイヤーの AI 種別と表示名を設定できるようにする。

**実装内容**:
- 操作パネルに先手・後手それぞれの AI 種別セレクトと名前入力を追加
- `POST /api/ai/start` に `{ black: { type, name }, white: { type, name } }` を送信
- 外部エージェントとの同時使用に関する注意書きを UI に表示

---

## Phase 5: 盤面クリック操作 ✅

**目的**: USI を直接入力しなくても盤面クリックで指せるようにする。

**実装内容**:
- 駒をクリックで選択し、合法移動先をハイライト表示（緑丸）
- 移動先クリックで指し手を確定
- 成り選択ダイアログ（「成る」/「不成」）
- 持ち駒クリックで打ち先をハイライト表示
- プレイバック中・アーカイブ閲覧中はクリック無効

---

## Phase 6: 探索深さ可変 + 手動プレイヤー対応 ✅

**目的**: AI の強さを調節できるようにし、人間が AI と対局できるようにする。

**実装内容**:
- SimpleAI に αβ法による手先読みを追加（深さ 1〜4 を選択可能）
- プレイヤー設定に「手動」選択肢を追加
- 「手動」側は AI が動かず、人間が盤面クリックまたは USI 入力で指す
- 深さに応じた評価テキスト（「やや有利」「わずかに不利」等）と理由文の改善
- 棋譜ログに探索深さを反映した理由文を記録

**探索深さの目安**:
| 深さ | 読む手数 | 応答時間の目安 |
|---|---|---|
| 1 | 次の1手のみ | 即座 |
| 2 | 自1手＋相手1手 | 数十ms |
| 3 | 自2手＋相手1手 | 数百ms（推奨） |
| 4 | 自2手＋相手2手 | 数秒 |

---

---

## Phase 7: USI エンジン接続 ✅

**目的**: YaneuraOu 等の外部 USI エンジンを `AiPlayer` 実装として接続し、強い AI との対局と詳細な思考可視化を実現する。

**背景**: 将棋 AI の本流は USI（Universal Shogi Interface）プロトコルに対応したエンジン。LLM と異なり「実際に局面を読む」ため非常に強く、`info depth N score cp X pv ...` の形式でリアルタイムに思考過程を出力する。これはプロジェクトの「思考プロセスの可視化」ビジョンと直接合致する。

**実装内容**:
- `UsiEnginePlayer` クラスを `AiPlayer` 実装として追加
  - Node.js `child_process` でエンジンバイナリを起動
  - stdin/stdout で USI プロトコルをやり取り
  - `bestmove` を指し手として取得
  - `info` 行から評価値（`score cp`）・探索深さ・読み筋（`pv`）を抽出
- `PlayerConfig` に `"usi"` タイプと `enginePath` フィールドを追加
- UI にエンジンパス入力欄を追加
- `info` 行から生成した `ThoughtSummary` を棋譜ログに記録
  - `evaluation`: センチポーンをテキスト（「やや有利」等）に変換
  - `reason`: `${depth}手読み、評価値 ${score}cp`
  - `candidates`: 読み筋の先頭 5 手

**USI プロトコルの通信フロー**:
```
送信: usi          → 受信: usiok
送信: isready      → 受信: readyok
送信: position sfen <SFEN> moves <手順>
送信: go movetime 3000
受信: info depth 12 score cp 48 pv 7g7f 8c8d ...  （複数行）
受信: bestmove 7g7f
送信: quit
```

**完了条件**:
- YaneuraOu バイナリを指定して対局できる
- 棋譜ログに探索深さ・評価値・読み筋が記録される
- SimpleAI・LLM との同じ DI 口で差し替えられる

---

---

## Phase 8: 対局時計 + AutoMode/StepMode ✅

**目的**: AI対戦をじっくり観戦できるようにし、各手の思考時間を可視化する。

**実装内容**:
- 手ごとの思考時間を計測し `MoveLogEntry.thinkingTimeMs` に記録
- 持ち駒エリアにプレイヤーごとの累計消費時間を表示（現在の手はリアルタイム加算）
- ステップ実行モード（1手ずつ進めるチェックボックス）
  - AI開始時に `stepMode: true` を送信
  - AI は自動実行せず「次の手」ボタン押下で1手ずつ進む
  - AI のターン中は「AI計算中...」を表示、手動のターン中は「あなたの番」を表示
  - ステップ実行中は手動プレイヤーのターンに限り盤面クリックが有効
- `POST /api/ai/step` エンドポイントを追加
- `GameState` に `aiThinking`, `stepMode`, `isHumanTurn`, `turnStartedAt`, `clockMs` を追加

---

## 今後の検討テーマ

- **WebSocket リアルタイム更新**: 現在は 1 秒ポーリング。複数観戦者への push 配信
- **分岐棋譜編集**: 局面から別の変化を試す機能
