import { describe, expect, it } from "vitest";

// ollama応答のJSON解析ロジックを単体でテストする
function parseOllamaResponse(
  raw: string,
  legalMoves: string[]
): { usi: string; reason: string; candidates: string[]; evaluation: string } {
  let decision: Partial<{ usi: string; reason: string; candidates: string[]; evaluation: string }> = {};
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    decision = JSON.parse(jsonStr) as typeof decision;
  } catch {
    decision = {};
  }

  const chosenUsi =
    typeof decision.usi === "string" && legalMoves.includes(decision.usi)
      ? decision.usi
      : legalMoves[0];

  const rawCandidates = Array.isArray(decision.candidates) ? decision.candidates : [];
  const validCandidates = rawCandidates.filter(
    (m): m is string => typeof m === "string" && legalMoves.includes(m)
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

const legalMoves = ["7g7f", "2g2f", "3g3f", "4g4f", "5g5f"];

describe("parseOllamaResponse", () => {
  it("正常なJSON応答を解析できる", () => {
    const raw = JSON.stringify({
      usi: "7g7f",
      reason: "飛車先を開ける",
      candidates: ["7g7f", "2g2f"],
      evaluation: "互角"
    });
    const result = parseOllamaResponse(raw, legalMoves);
    expect(result.usi).toBe("7g7f");
    expect(result.reason).toBe("飛車先を開ける");
    expect(result.candidates).toContain("7g7f");
    expect(result.evaluation).toBe("互角");
  });

  it("前置きテキスト付きのJSONでも解析できる", () => {
    const raw = `では、以下のJSONで回答します:\n{"usi":"2g2f","reason":"歩を進める","candidates":["2g2f"],"evaluation":"わずかに有利"}`;
    const result = parseOllamaResponse(raw, legalMoves);
    expect(result.usi).toBe("2g2f");
  });

  it("合法手外のusiはフォールバックする", () => {
    const raw = JSON.stringify({ usi: "9z9z", reason: "無効手" });
    const result = parseOllamaResponse(raw, legalMoves);
    expect(result.usi).toBe(legalMoves[0]);
  });

  it("JSON解析失敗時はフォールバックする", () => {
    const result = parseOllamaResponse("壊れた応答テキスト", legalMoves);
    expect(result.usi).toBe(legalMoves[0]);
    expect(result.reason).toBe("AIが選択");
  });

  it("候補手から合法手外の手を除外する", () => {
    const raw = JSON.stringify({
      usi: "7g7f",
      reason: "定跡手",
      candidates: ["7g7f", "9z9z", "illegal"],
      evaluation: "互角"
    });
    const result = parseOllamaResponse(raw, legalMoves);
    expect(result.candidates.every((m) => legalMoves.includes(m))).toBe(true);
  });
});
