import { describe, it, expect } from "vitest";
import { attributeChange } from "./attribution.js";
import type { Turn } from "../types.js";

function turns(
  n: number,
  model: string,
  effort: string | null,
  output: (i: number) => number
): Turn[] {
  return Array.from({ length: n }, (_, i) => ({
    sessionId: "s1",
    harnessVersion: "",
    model,
    effort,
    inputTokens: 0,
    outputTokens: output(i),
    thinkingTokens: null,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    toolCalls: 0,
    timestamp: 0,
    requests: [],
  }));
}
const low = (i: number): number => 60 + i * 20;
const high = (i: number): number => 1060 + i * 20;

describe("attributeChange", () => {
  it("attributes a shift to the release when it holds for the same model and effort", () => {
    const before = turns(40, "claude-opus-5-5", "high", low);
    const after = turns(40, "claude-opus-5-5", "high", high);

    expect(attributeChange(before, after)).toEqual({
      cause: "release",
      model: "claude-opus-5-5",
      effort: "high",
      turnsFrom: 40,
      turnsTo: 40,
    });
  });

  it("names the model when the releases share no model to compare like for like", () => {
    const before = turns(40, "claude-opus-5-5", "high", low);
    const after = turns(40, "claude-fable-5-2", "high", high);

    expect(attributeChange(before, after)).toEqual({
      cause: "model",
      from: "claude-opus-5-5",
      to: "claude-fable-5-2",
    });
  });

  it("names the model when the model both releases share shows no shift of its own", () => {
    const before = turns(40, "claude-opus-5-5", "high", low);
    const after = [
      ...turns(30, "claude-opus-5-5", "high", low),
      ...turns(100, "claude-fable-5-2", "high", high),
    ];

    expect(attributeChange(before, after)).toMatchObject({ cause: "model", to: "claude-fable-5-2" });
  });

  it("names the effort level when only that differs", () => {
    const before = turns(40, "claude-opus-5-5", "high", low);
    const after = turns(40, "claude-opus-5-5", "xhigh", high);

    expect(attributeChange(before, after)).toEqual({ cause: "effort", from: "high", to: "xhigh" });
  });

  it("says unclear when nothing differs and there is too little to compare like for like", () => {
    const before = [...turns(15, "claude-opus-5-5", "high", low), ...turns(10, "claude-opus-5-5", null, low)];
    const after = [...turns(15, "claude-opus-5-5", "high", high), ...turns(10, "claude-opus-5-5", null, high)];

    expect(attributeChange(before, after)).toEqual({ cause: "unclear" });
  });

  it("does not read the start of effort logging as a change of effort", () => {
    const before = turns(40, "claude-opus-5-5", null, low);
    const after = turns(40, "claude-opus-5-5", "high", high);

    expect(attributeChange(before, after)).toEqual({ cause: "unclear" });
  });
});
