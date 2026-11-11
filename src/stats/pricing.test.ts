import { describe, it, expect } from "vitest";
import { estimateRequestCost, estimateTurnCost, modelFamily, ratesFor } from "./pricing.js";
import type { Turn } from "../types.js";

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  const turn = {
    sessionId: "s1",
    harnessVersion: "2.1.310",
    model: "claude-sonnet-4-20250514",
    effort: "high",
    inputTokens: 10000,
    outputTokens: 1000,
    thinkingTokens: null,
    cacheCreationTokens: 5000,
    cacheReadTokens: 3000,
    toolCalls: 2,
    timestamp: 1700000000000,
    ...overrides,
  };
  return {
    ...turn,
    requests: overrides.requests ?? [
      {
        model: turn.model,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        cacheWrite5mTokens: turn.cacheCreationTokens,
        cacheWrite1hTokens: 0,
        cacheReadTokens: turn.cacheReadTokens,
      },
    ],
  };
}

describe("modelFamily", () => {
  it("recognizes opus models", () => {
    expect(modelFamily("claude-opus-4-6")).toBe("opus");
    expect(modelFamily("claude-opus-4-20250514")).toBe("opus");
  });

  it("recognizes sonnet models", () => {
    expect(modelFamily("claude-sonnet-4-20250514")).toBe("sonnet");
    expect(modelFamily("claude-sonnet-4-5-20250514")).toBe("sonnet");
  });

  it("recognizes haiku models", () => {
    expect(modelFamily("claude-haiku-4-5")).toBe("haiku");
  });

  it("returns unknown for unrecognized models", () => {
    expect(modelFamily("gpt-4o")).toBe("unknown");
  });
});

describe("estimateTurnCost", () => {
  it("computes cost for an opus turn with cache", () => {
    const turn = makeTurn({
      model: "claude-opus-4-6",
      inputTokens: 50000,
      outputTokens: 2000,
      cacheCreationTokens: 10000,
      cacheReadTokens: 30000,
    });
    const cost = estimateTurnCost(turn);
    // Opus 4.6: input $5/M, output $25/M, 5m cache write $6.25/M, cache read $0.50/M
    // input: 50000 * 5/1M = 0.25
    // output: 2000 * 25/1M = 0.05
    // cache_write: 10000 * 6.25/1M = 0.0625
    // cache_read: 30000 * 0.50/1M = 0.015
    // total = 0.3775
    expect(cost).toBeCloseTo(0.3775, 4);
  });

  it("computes cost for a sonnet turn", () => {
    const turn = makeTurn({
      model: "claude-sonnet-4-20250514",
      inputTokens: 10000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    const cost = estimateTurnCost(turn);
    // sonnet: input $3/M, output $15/M
    // 10000 * 3/1M + 500 * 15/1M = 0.03 + 0.0075 = 0.0375
    expect(cost).toBeCloseTo(0.0375, 4);
  });

  it("returns null for a turn it cannot price in full", () => {
    const turn = makeTurn({ model: "gpt-4o" });
    expect(estimateTurnCost(turn)).toBeNull();
  });

  it("prices a turn request by request, each at its own model and prompt length", () => {
    const none = { outputTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 };
    const turn = makeTurn({
      model: "claude-haiku-5-5",
      requests: [
        // Opus 5.5: 1M input at $4/M = $4
        { model: "claude-opus-5-5", inputTokens: 1_000_000, cacheReadTokens: 0, ...none },
        // Haiku 5.5, 150K prompt: 50K at $0.50/M + 100K cache read at $0.05/M = $0.03
        { model: "claude-haiku-5-5", inputTokens: 50_000, cacheReadTokens: 100_000, ...none },
      ],
    });

    expect(estimateTurnCost(turn)).toBeCloseTo(4.03, 9);
  });
});

describe("ratesFor", () => {
  it("prices Fable 5.2 at its own rate card", () => {
    expect(ratesFor("claude-fable-5-2")).toEqual({
      inputPerM: 8,
      outputPerM: 40,
      cacheWrite5mPerM: 10,
      cacheWrite1hPerM: 16,
      cacheReadPerM: 0.2,
    });
  });

  // Rows below are Anthropic's published list prices, USD per million tokens.
  it.each([
    ["claude-opus-4-20250514", 15, 75, 1.5],
    ["claude-opus-4-1-20250805", 15, 75, 1.5],
    ["claude-opus-4-5-20251101", 5, 25, 0.5],
    ["claude-opus-4-6", 5, 25, 0.5],
    ["claude-opus-5", 5, 25, 0.5],
    ["claude-opus-5-5", 4, 20, 0.2],
    ["claude-3-5-haiku-20241022", 0.8, 4, 0.08],
    ["claude-haiku-4-5-20251001", 1, 5, 0.1],
    ["claude-haiku-5-5", 0.1, 0.5, 0.01],
    ["claude-sonnet-4-20250514", 3, 15, 0.3],
    ["claude-sonnet-4-5-20250929", 3, 15, 0.3],
    ["claude-sonnet-4-6", 3, 15, 0.3],
    ["claude-3-7-sonnet-20250219", 3, 15, 0.3],
    ["claude-sonnet-5", 2, 10, 0.2],
    ["claude-sonnet-5-5", 2, 10, 0.1],
  ])("prices %s at %d in, %d out, %d cache read", (model, input, output, cacheRead) => {
    expect(ratesFor(model)).toMatchObject({
      inputPerM: input,
      outputPerM: output,
      cacheWrite5mPerM: input * 1.25,
      cacheWrite1hPerM: input * 2,
      cacheReadPerM: cacheRead,
    });
  });

  it("moves Haiku 5.5 to its long-prompt rates above 100,000 prompt tokens", () => {
    expect(ratesFor("claude-haiku-5-5", 100_000)).toMatchObject({ inputPerM: 0.1, outputPerM: 0.5 });
    expect(ratesFor("claude-haiku-5-5", 100_001)).toEqual({
      inputPerM: 0.5,
      outputPerM: 2.5,
      cacheWrite5mPerM: 0.625,
      cacheWrite1hPerM: 1,
      cacheReadPerM: 0.05,
    });
  });

  it("has no rates for a model it cannot identify", () => {
    expect(ratesFor("gpt-4o")).toBeNull();
    expect(ratesFor("claude-3-haiku-20240307")).toBeNull();
    expect(ratesFor("claude-mythos-preview")).toBeNull();
  });
});

describe("estimateRequestCost", () => {
  const thousandOfEach = {
    inputTokens: 1000,
    outputTokens: 1000,
    cacheWrite5mTokens: 1000,
    cacheWrite1hTokens: 1000,
    cacheReadTokens: 1000,
  };

  it("prices each token class, with 1-hour cache writes at twice the input rate", () => {
    // Opus 5.5 per million: 4 in, 20 out, 5 and 8 cache write, 0.20 cache read
    const cost = estimateRequestCost({ model: "claude-opus-5-5", ...thousandOfEach });
    expect(cost).toBeCloseTo((4 + 20 + 5 + 8 + 0.2) / 1000, 9);
  });

  it("returns null, not zero, for a model it cannot price", () => {
    expect(estimateRequestCost({ model: "gpt-4o", ...thousandOfEach })).toBeNull();
  });
});
