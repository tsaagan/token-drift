import { describe, it, expect } from "vitest";
import { computeMetrics, computeDeltas, medianWithCi } from "./compute-metrics.js";
import type { Turn } from "../types.js";

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  const turn = {
    sessionId: "s1",
    harnessVersion: "2.1.310",
    model: "claude-sonnet-4-20250514",
    effort: "high",
    inputTokens: 10000,
    outputTokens: 400,
    thinkingTokens: 0,
    cacheCreationTokens: 1000,
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

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

describe("medianWithCi", () => {
  it("returns the 95% order-statistic interval around the median", () => {
    // n = 100: ranks 40 and 61 of the sorted values 1..100
    expect(medianWithCi(range(100, (i) => 100 - i))).toEqual({
      median: 50.5,
      low: 40,
      high: 61,
    });
  });
});

describe("computeMetrics", () => {
  it("groups turns by harness version and computes medians", () => {
    const turns: Turn[] = [
      makeTurn({ harnessVersion: "2.1.310", outputTokens: 100 }),
      makeTurn({ harnessVersion: "2.1.310", outputTokens: 300 }),
      makeTurn({ harnessVersion: "2.1.310", outputTokens: 500 }),
      makeTurn({ harnessVersion: "2.1.312", outputTokens: 800 }),
      makeTurn({ harnessVersion: "2.1.312", outputTokens: 1000 }),
    ];

    const metrics = computeMetrics(turns, "harnessVersion");

    expect(Object.keys(metrics)).toHaveLength(2);
    expect(metrics["2.1.310"].medianOutputTokens).toBe(300);
    expect(metrics["2.1.312"].medianOutputTokens).toBe(900);
  });

  it("computes cache hit rate correctly", () => {
    const turns: Turn[] = [
      makeTurn({ cacheCreationTokens: 1000, cacheReadTokens: 3000 }),
      makeTurn({ cacheCreationTokens: 0, cacheReadTokens: 4000 }),
    ];

    const metrics = computeMetrics(turns, "harnessVersion");
    // total creation: 1000, total read: 7000, total: 8000
    // hit rate: 7000/8000 = 0.875
    expect(metrics["2.1.310"].cacheHitRate).toBeCloseTo(0.875);
  });

  it("has no cache hit rate, rather than 0%, when no cache tokens were used", () => {
    const turns: Turn[] = [
      makeTurn({ cacheCreationTokens: 0, cacheReadTokens: 0 }),
    ];

    const metrics = computeMetrics(turns, "harnessVersion");
    expect(metrics["2.1.310"].cacheHitRate).toBeNull();
  });

  it("counts unique sessions", () => {
    const turns: Turn[] = [
      makeTurn({ sessionId: "s1" }),
      makeTurn({ sessionId: "s1" }),
      makeTurn({ sessionId: "s2" }),
    ];

    const metrics = computeMetrics(turns, "harnessVersion");
    expect(metrics["2.1.310"].sessionCount).toBe(2);
  });

  it("computes total and median cost per turn", () => {
    const turns: Turn[] = [
      makeTurn({
        model: "claude-sonnet-4-20250514",
        inputTokens: 10000,
        outputTokens: 500,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
      makeTurn({
        model: "claude-sonnet-4-20250514",
        inputTokens: 20000,
        outputTokens: 1000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
    ];

    const metrics = computeMetrics(turns, "harnessVersion");
    // sonnet: input $3/M, output $15/M
    // turn1: 10000*3/1M + 500*15/1M = 0.03 + 0.0075 = 0.0375
    // turn2: 20000*3/1M + 1000*15/1M = 0.06 + 0.015 = 0.075
    expect(metrics["2.1.310"].totalCost).toBeCloseTo(0.1125, 4);
    expect(metrics["2.1.310"].medianCostPerTurn).toBeCloseTo(0.05625, 4);
  });

  it("tracks first and last seen dates", () => {
    const turns: Turn[] = [
      makeTurn({ timestamp: 1700000000000 }), // 2023-11-14
      makeTurn({ timestamp: 1700200000000 }), // 2023-11-17
    ];

    const metrics = computeMetrics(turns, "harnessVersion");
    expect(metrics["2.1.310"].firstSeen).toBe("2023-11-14");
    expect(metrics["2.1.310"].lastSeen).toBe("2023-11-17");
  });

  it("leaves turns without thinking data out of the thinking median", () => {
    const turns: Turn[] = [
      makeTurn({ thinkingTokens: null }),
      makeTurn({ thinkingTokens: 100 }),
      makeTurn({ thinkingTokens: 300 }),
    ];

    const metrics = computeMetrics(turns, "harnessVersion");
    expect(metrics["2.1.310"].medianThinkingTokens).toBe(200);
  });

  it("reports the interval around the median output tokens", () => {
    const turns = range(100, (i) => makeTurn({ outputTokens: i + 1 }));

    const metrics = computeMetrics(turns, "harnessVersion");
    expect(metrics["2.1.310"].outputTokensCi).toEqual([40, 61]);
  });

  it("reports no thinking median when no turn carries thinking data", () => {
    const turns: Turn[] = [makeTurn({ thinkingTokens: null }), makeTurn({ thinkingTokens: null })];

    const metrics = computeMetrics(turns, "harnessVersion");
    expect(metrics["2.1.310"].medianThinkingTokens).toBeNull();
  });

  it("counts turns it cannot price and keeps them out of the cost figures", () => {
    const turns: Turn[] = [
      makeTurn({ model: "gpt-4o", harnessVersion: "2.1.310" }),
      makeTurn({ harnessVersion: "2.1.310" }),
      makeTurn({ harnessVersion: "2.1.310" }),
      makeTurn({ model: "gpt-4o", harnessVersion: "2.1.311" }),
    ];

    const metrics = computeMetrics(turns, "harnessVersion");
    // one default turn: 10000*3 + 400*15 + 1000*3.75 + 3000*0.3 per million = $0.04065
    expect(metrics["2.1.310"]).toMatchObject({ unpricedTurns: 1 });
    expect(metrics["2.1.310"].totalCost).toBeCloseTo(0.0813, 6);
    expect(metrics["2.1.310"].medianCostPerTurn).toBeCloseTo(0.04065, 6);
    expect(metrics["2.1.311"]).toMatchObject({ unpricedTurns: 1, totalCost: 0, medianCostPerTurn: null });
  });

  it("keeps turns with no value for the grouping field, under one labelled row", () => {
    const turns: Turn[] = [
      makeTurn({ effort: null }),
      makeTurn({ effort: null }),
      makeTurn({ effort: "high" }),
    ];

    const metrics = computeMetrics(turns, "effort");
    expect(Object.keys(metrics).sort()).toEqual(["(not recorded)", "high"]);
    expect(metrics["(not recorded)"].turns).toHaveLength(2);
  });

  it("groups by model when requested", () => {
    const turns: Turn[] = [
      makeTurn({ model: "claude-sonnet-4-20250514", outputTokens: 100 }),
      makeTurn({ model: "claude-opus-4-20250514", outputTokens: 900 }),
    ];

    const metrics = computeMetrics(turns, "model");
    expect(Object.keys(metrics)).toHaveLength(2);
    expect(metrics["claude-sonnet-4-20250514"].medianOutputTokens).toBe(100);
    expect(metrics["claude-opus-4-20250514"].medianOutputTokens).toBe(900);
  });
});

describe("computeDeltas", () => {
  it("computes deltas between consecutive versions", () => {
    const turns: Turn[] = [
      makeTurn({ harnessVersion: "2.1.310", outputTokens: 100 }),
      makeTurn({ harnessVersion: "2.1.310", outputTokens: 300 }),
      makeTurn({ harnessVersion: "2.1.312", outputTokens: 500 }),
      makeTurn({ harnessVersion: "2.1.312", outputTokens: 700 }),
    ];

    const deltas = computeDeltas(computeMetrics(turns, "harnessVersion"), "harnessVersion", 1);

    expect(deltas).toHaveLength(1);
    expect(deltas[0].from).toBe("2.1.310");
    expect(deltas[0].to).toBe("2.1.312");
    // median 310: 200, median 312: 600 -> delta: (600-200)/200 = 2.0
    expect(deltas[0].outputTokensDelta).toBeCloseTo(2.0);
  });

  it("returns empty array for single version", () => {
    const turns: Turn[] = [makeTurn()];
    const deltas = computeDeltas(computeMetrics(turns, "harnessVersion"), "harnessVersion", 1);
    expect(deltas).toHaveLength(0);
  });

  it("sorts versions semver-style before computing deltas", () => {
    const turns: Turn[] = [
      makeTurn({ harnessVersion: "2.1.312", outputTokens: 600 }),
      makeTurn({ harnessVersion: "2.1.310", outputTokens: 200 }),
      makeTurn({ harnessVersion: "2.1.319", outputTokens: 400 }),
    ];

    const deltas = computeDeltas(computeMetrics(turns, "harnessVersion"), "harnessVersion", 1);
    expect(deltas).toHaveLength(2);
    expect(deltas[0].from).toBe("2.1.310");
    expect(deltas[0].to).toBe("2.1.312");
    expect(deltas[1].from).toBe("2.1.312");
    expect(deltas[1].to).toBe("2.1.319");
  });

  it("never compares against a version too small to trust", () => {
    const turns = [
      ...range(100, () => makeTurn({ harnessVersion: "2.1.310", outputTokens: 500 })),
      makeTurn({ harnessVersion: "2.1.311", outputTokens: 5000 }),
      ...range(100, () => makeTurn({ harnessVersion: "2.1.312", outputTokens: 500 })),
    ];

    const deltas = computeDeltas(computeMetrics(turns, "harnessVersion"), "harnessVersion");

    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      from: "2.1.310",
      to: "2.1.312",
      nFrom: 100,
      nTo: 100,
      outputTokensDelta: 0,
    });
  });

  it("flags a shift whose intervals do not overlap", () => {
    const turns = [
      ...range(40, (i) => makeTurn({ harnessVersion: "2.1.310", outputTokens: 60 + i * 20 })),
      ...range(40, (i) => makeTurn({ harnessVersion: "2.1.311", outputTokens: 1060 + i * 20 })),
    ];

    const [delta] = computeDeltas(computeMetrics(turns, "harnessVersion"), "harnessVersion");
    expect(delta.significant).toBe(true);
  });

  it("does not flag a median shift that sits inside the noise", () => {
    // same spread, medians 450 and 500
    const turns = [
      ...range(40, (i) => makeTurn({ harnessVersion: "2.1.310", outputTokens: 60 + i * 20 })),
      ...range(40, (i) => makeTurn({ harnessVersion: "2.1.311", outputTokens: 110 + i * 20 })),
    ];

    const [delta] = computeDeltas(computeMetrics(turns, "harnessVersion"), "harnessVersion");
    expect(delta.outputTokensDelta).toBeCloseTo(0.11, 2);
    expect(delta.significant).toBe(false);
  });

  it("produces no deltas for fields that have no order", () => {
    const turns = [
      ...range(40, () => makeTurn({ model: "claude-sonnet-4-20250514", outputTokens: 200 })),
      ...range(40, () => makeTurn({ model: "claude-opus-4-20250514", outputTokens: 800 })),
    ];

    expect(computeDeltas(computeMetrics(turns, "model"), "model")).toEqual([]);
  });
});
