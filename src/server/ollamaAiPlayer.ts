import type { GameState, MoveRequest } from "../shared/types.js";
import type { AiPlayer } from "./aiPlayer.js";

interface OllamaDecision {
  usi: string;
  reason: string;
  candidates: string[];
  evaluation: string;
}

interface OllamaGenerateResponse {
  response: string;
}

export class OllamaAiPlayer implements AiPlayer {
  constructor(
    public readonly name: string,
    private readonly baseUrl: string = "http://localhost:11434",
    private readonly model: string = "gemma4"
  ) {}

  async chooseMove(state: GameState): Promise<MoveRequest> {
    const decision = await this.askOllama(state);
    return {
      usi: decision.usi,
      thought: {
        agentName: this.name,
        reason: `${this.name}: ${decision.reason}`,
        candidates: decision.candidates,
        evaluation: decision.evaluation
      }
    };
  }

  private buildPrompt(state: GameState): string {
    const sideName = state.turn === "black" ? "先手（下手）" : "後手（上手）";
    const moveList = state.legalMoves.join(" ");

    return `あなたは将棋AIです。${this.name}として${sideName}を担当しています。

## 現在の局面 (SFEN形式)
${state.sfen}

## 合法手一覧 (USI形式)
${moveList}

## 指示
上記の合法手一覧から1手を選び、以下のJSONフォーマットのみで回答してください。
説明文や前置きは不要です。JSONだけ返してください。

{
  "usi": "選んだ手（例: 7g7f）",
  "reason": "選んだ理由（日本語30文字以内）",
  "candidates": ["候補手1", "候補手2", "候補手3"],
  "evaluation": "互角"
}

evaluationの値は「互角」「わずかに有利」「やや有利」「やや不利」のいずれかにしてください。
必ず合法手一覧に含まれる手を選んでください。`;
  }

  private async askOllama(state: GameState): Promise<OllamaDecision> {
    const prompt = this.buildPrompt(state);

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.3 }
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API エラー ${res.status}: ${text}`);
    }

    const data = (await res.json()) as OllamaGenerateResponse;

    let decision: Partial<OllamaDecision> = {};
    try {
      const jsonMatch = data.response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : data.response;
      decision = JSON.parse(jsonStr) as Partial<OllamaDecision>;
    } catch {
      console.warn(`[${this.name}] JSON解析失敗。応答: ${data.response.slice(0, 200)}`);
    }

    const chosenUsi =
      typeof decision.usi === "string" && state.legalMoves.includes(decision.usi)
        ? decision.usi
        : state.legalMoves[0];

    if (chosenUsi !== decision.usi) {
      console.warn(`[${this.name}] 選択手 "${decision.usi}" が合法手外のためフォールバック: ${chosenUsi}`);
    }

    const rawCandidates = Array.isArray(decision.candidates) ? decision.candidates : [];
    const validCandidates = rawCandidates.filter(
      (m): m is string => typeof m === "string" && state.legalMoves.includes(m)
    );
    if (!validCandidates.includes(chosenUsi)) {
      validCandidates.unshift(chosenUsi);
    }

    return {
      usi: chosenUsi,
      reason: typeof decision.reason === "string" ? decision.reason : "AIが選択",
      candidates: validCandidates.slice(0, 5),
      evaluation: typeof decision.evaluation === "string" ? decision.evaluation : "互角"
    };
  }
}
