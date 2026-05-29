# AI将棋観戦

[![CI](https://github.com/scottlz0310/kanshogi/actions/workflows/ci.yml/badge.svg)](https://github.com/scottlz0310/kanshogi/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/scottlz0310/kanshogi/branch/main/graph/badge.svg)](https://codecov.io/gh/scottlz0310/kanshogi)

AI同士の将棋対局を観戦し、思考プロセスを可視化するローカルWebアプリ。人間がAIと対局することもできる。

## 差別化ポイント

単に強いAIを動かすのではなく、**AIがどの手を候補にあげ、なぜその手を選び、局面をどう評価したか**を棋譜ログとして残す。観戦者はリプレイを通じてAIの判断を追跡できる。

## 主な機能

- AI同士の自動対局・人間 vs AI 対局
- 複数のAI種別（SimpleAI / Ollama LLM / USIエンジン / 手動）
- 思考ログ：各手の評価値・候補手・理由文を記録
- 対局時計（手ごとの消費時間を計測・表示）
- ステップ実行（1手ずつ進めながら観戦）
- 盤面クリック操作・成り選択ダイアログ
- 棋譜保存・再生・KIF/CSAエクスポート

## クイックスタート

```bash
pnpm install
pnpm dev
```

開発サーバー起動後、ブラウザで `http://localhost:5173` を開く。

| コマンド | 説明 |
|---|---|
| `pnpm dev` | 開発サーバー（Vite HMR + Express） |
| `pnpm build && pnpm start` | 本番ビルド後に起動（ポート 3030） |
| `pnpm test` | テスト実行 |
| `pnpm typecheck` | 型チェックのみ |

## AI種別

| 種別 | 設定 | 特性 |
|---|---|---|
| SimpleAI | 読み深さ 1〜4 | αβ法。即座〜数秒。透明性が高い |
| Ollama | — | ローカルLLM（gemma4等）へのプロンプト。要 `ollama` 起動 |
| USIエンジン | エンジンパス | YaneuraOu等の外部USIエンジン |
| 手動 | — | 人間が盤面クリックで操作 |

## ステップ実行

「ステップ実行（1手ずつ）」チェックを入れてAI開始すると、「次の手」ボタンを押すごとに1手ずつ進む。対局中にAuto ↔ Stepの切り替えも可能。

## 外部エージェント（開発・実験用）

別プロセスとしてOllamaエージェントを起動する実験用経路。UIのAI開始との同時使用は非推奨。

```bash
pnpm agents        # 先手・後手同時起動
pnpm agent:black   # 先手のみ
pnpm agent:white   # 後手のみ
```

## 技術スタック

- **サーバー**: Node.js + Express 5 + TypeScript (ESM)
- **クライアント**: React 19 + Vite
- **将棋ロジック**: [tsshogi](https://github.com/sunfish-shogi/tsshogi)
- **テスト**: Vitest

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/01-vision.md](docs/01-vision.md) | プロジェクトビジョン・差別化ポイント |
| [docs/02-design.md](docs/02-design.md) | アーキテクチャ・API設計 |
| [docs/03-implementation-plan.md](docs/03-implementation-plan.md) | 実装フェーズ計画（Phase 1〜8） |
| [docs/04-agent-contract.md](docs/04-agent-contract.md) | 外部エージェント仕様 |
