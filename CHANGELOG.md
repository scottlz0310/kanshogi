# Changelog

本プロジェクトの主要な変更を記録する。
フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に準拠する。

## [Unreleased]

### Added

- 開発環境ツールチェーンを整備
  - Biome を導入（lint + format）。`biome.json` と scripts `lint`/`format`/`check` を追加
  - lefthook を導入。pre-commit で `biome check`、pre-push で `typecheck` + `test`
  - GitHub Actions CI（lint / typecheck / coverage / build、Node 26）を追加
  - Codecov 連携を追加（vitest v8 カバレッジを `codecov/codecov-action@v5` でアップロード。`codecov.yml`・README バッジ）
  - Renovate 設定（`renovate.json`、共有プリセット `scottlz0310/renovate-config` を拡張）を追加
  - `.node-version`(26.2.0)・`engines`・`.editorconfig`・`.gitattributes` を追加

### Changed

- パッケージマネージャを pnpm から Bun へ移行
  - Bun 1.3.14 と isolated linker を使用し、`bun.lock` による再現可能なインストールへ統一
  - CI・Lefthook・ドキュメント・UI のパッケージマネージャコマンドを Bun 向けに更新
- USI エンジン接続を深層学習系エンジン（ふかうら王 / dlshogi 等）に対応
  - 子プロセスの `cwd` を実行ファイルのディレクトリに固定（`eval/eval_options.txt` 等の相対参照を解決可能に）
  - `isready` のタイムアウトを 15 秒から 10 分へ拡張（初回 TRT/ONNX エンジンビルドを許容）
  - `info string` および stderr 出力をサーバーログに転送（初期化・推論進捗の可視化）
- パッケージマネージャを npm から pnpm へ移行
  - `package.json` の `packageManager` を `pnpm@11.1.3` に固定
  - `package-lock.json` を削除し `pnpm-lock.yaml` を生成
  - `pnpm-workspace.yaml` を追加し、esbuild のビルドスクリプト実行を許可
  - README・`docs/04-agent-contract.md`・UI 文言中の `npm` コマンドを `pnpm` に置換
- 既存コードを Biome ルールに準拠
  - React hook 依存を `useCallback`/`useRef` で適正化（マウント時ロード・ポーリングの挙動は不変）
  - CSS の `!important` 除去・セレクタ特異性の修正
  - 未使用引数の削除・non-null assertion の除去

## [0.1.0] - 2026-05-26

初回リリース。AI 同士の将棋対局を観戦・再生するローカル Web アプリの最小構成から、外部 USI エンジン接続・対局時計までを Phase 1〜8 として実装。

### Added

- **基本対局基盤** (Phase 1)
  - Express サーバー + React/Vite クライアント構成
  - tsshogi による合法手判定と局面管理
  - SimpleAI（1手読みヒューリスティック）
  - 対局 API（`/api/state`・`/api/move`・`/api/ai/start`・`/api/ai/stop`）
  - 盤面・持ち駒・棋譜ログの表示とプレイバックスライダー
  - 棋譜ログへの `agentName`・`reason`・`candidates`・`evaluation` 保存
  - 外部エージェント仕様 (`docs/04-agent-contract.md`) と ollama 外部エージェント (`src/agents/ollamaAgent.ts`)
- **棋譜保存形式の整理** (Phase 2)
  - アーカイブへのバージョン番号・対局者名フィールド追加
  - KIF / CSA エクスポート API（`/api/games/:id/kif`・`/api/games/:id/csa`）
  - 棋譜一覧での終局理由・手数・開始時刻・対局者名の表示
  - 旧形式アーカイブへのデフォルト値補完（後方互換）
- **終局処理** (Phase 3)
  - 投了 API（`POST /api/resign`）と UI ボタン
  - 詰み・合法手なし・千日手・手数上限の検出と理由表示
  - 終局バナー・王手バッジの表示、終局後の指し手拒否
- **AI 差し替え口** (Phase 4・4.5)
  - 共通インターフェース `AiPlayer`（入力 `GameState` / 出力 `MoveRequest`）
  - `SimpleAiPlayer`・`OllamaAiPlayer` 実装と `GameService.startAi(players)` への DI 化
  - 操作パネルに先手・後手の AI 種別セレクトと表示名入力を追加
- **盤面クリック操作** (Phase 5)
  - 駒選択時の合法移動先ハイライト、移動先クリックでの確定
  - 成り選択ダイアログ（「成る」/「不成」）と持ち駒打ちのハイライト
  - プレイバック中・アーカイブ閲覧中のクリック無効化
- **探索深さ可変・手動プレイヤー** (Phase 6)
  - SimpleAI に αβ法による先読み（深さ 1〜4）を追加
  - プレイヤー設定への「手動」選択肢追加（人間がクリック / USI 入力で操作）
  - 深さに応じた評価テキスト・理由文の生成
- **USI エンジン接続** (Phase 7)
  - `UsiEnginePlayer` を `AiPlayer` 実装として追加（`child_process` で USI プロトコル通信）
  - `bestmove` 取得と `info` 行からの評価値・探索深さ・読み筋抽出
  - `PlayerConfig` への `"usi"` タイプ・`enginePath` 追加、UI のエンジンパス入力欄
- **対局時計・ステップ実行** (Phase 8)
  - 手ごとの思考時間計測（`MoveLogEntry.thinkingTimeMs`）とプレイヤー別累計消費時間の表示
  - ステップ実行モード（「次の手」ボタンで1手ずつ進行）と `POST /api/ai/step` エンドポイント
  - `GameState` への `aiThinking`・`stepMode`・`isHumanTurn`・`turnStartedAt`・`clockMs` 追加

[Unreleased]: https://github.com/scottlz0310/kanshogi/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/scottlz0310/kanshogi/releases/tag/v0.1.0
