import { describe, it, expect } from "vitest";
import { buildReport } from "./report.js";
import type { Turn } from "../types.js";

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  const turn = {
    sessionId: "s1",
    harnessVersion: "2.1.310",
    model: "claude-opus-5-5",
    effort: "high" as string | null,
    inputTokens: 0,
    outputTokens: 500,
    thinkingTokens: null,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    toolCalls: 1,
    timestamp: Date.parse("2026-11-01T12:00:00Z"),
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
const many = (n: number, f: (i: number) => Partial<Turn>): Turn[] =>
  Array.from({ length: n }, (_, i) => makeTurn(f(i)));

describe("buildReport", () => {
  it("reports the same totals whichever field the rows are grouped by", () => {
    const turns = [
      // Opus 5.5 output at $20/M: 1M tokens = $20 a turn
      makeTurn({ sessionId: "a", effort: null, outputTokens: 1_000_000, timestamp: Date.parse("2026-10-10T08:00:00Z") }),
      makeTurn({ sessionId: "b", effort: "high", outputTokens: 1_000_000 }),
      makeTurn({ sessionId: "b", effort: "high", model: "gpt-4o", harnessVersion: "" }),
    ];
    const totals = {
      estimatedCostUsd: 40,
      turns: 3,
      sessions: 2,
      unpricedTurns: 1,
      firstSeen: "2026-10-10",
      lastSeen: "2026-11-01",
    };

    expect(buildReport(turns, "harnessVersion").totals).toEqual(totals);
    expect(buildReport(turns, "model").totals).toEqual(totals);
    expect(buildReport(turns, "effort").totals).toEqual(totals);
  });

  it("lists releases in version order with each row's figures", () => {
    const { rows } = buildReport(
      [
        ...many(20, () => ({ harnessVersion: "2.1.10", outputTokens: 1000 })),
        ...many(2, () => ({ harnessVersion: "2.1.9", outputTokens: 500 })),
      ],
      "harnessVersion"
    );

    expect(rows.map((r) => r.key)).toEqual(["2.1.9", "2.1.10"]);
    // 500 output tokens on Opus 5.5 at $20/M = $0.01 a turn
    expect(rows[0]).toMatchObject({
      turns: 2,
      sessions: 1,
      lowSample: true,
      medianOutputTokens: 500,
      medianThinkingTokens: null,
      estimatedCostUsd: 0.02,
      medianCostPerTurnUsd: 0.01,
      unpricedTurns: 0,
      firstSeen: "2026-11-01",
    });
    expect(rows[1]).toMatchObject({ turns: 20, lowSample: false });
    expect(rows[0]).not.toHaveProperty("requests");
  });

  it("orders models and effort levels by estimated cost, highest first", () => {
    const { rows } = buildReport(
      [
        makeTurn({ model: "claude-haiku-5-5", outputTokens: 1000 }),
        makeTurn({ model: "claude-fable-5-2", outputTokens: 1000 }),
        makeTurn({ model: "claude-opus-5-5", outputTokens: 1000 }),
      ],
      "model"
    );

    expect(rows.map((r) => r.key)).toEqual(["claude-fable-5-2", "claude-opus-5-5", "claude-haiku-5-5"]);
  });

  it("reports each significant change between releases with its cause", () => {
    const { changes } = buildReport(
      [
        ...many(40, (i) => ({ harnessVersion: "2.1.310", outputTokens: 60 + i * 20 })),
        makeTurn({ harnessVersion: "2.1.311", outputTokens: 9000 }),
        ...many(40, (i) => ({ harnessVersion: "2.1.312", outputTokens: 1060 + i * 20 })),
        ...many(40, (i) => ({ harnessVersion: "2.1.313", outputTokens: 1070 + i * 20 })),
      ],
      "harnessVersion"
    );

    expect(changes).toHaveLength(2);
    // medians 450 -> 1450; cost here is output only, so it moves by the same ratio
    expect(changes[0]).toMatchObject({
      from: "2.1.310",
      to: "2.1.312",
      significant: true,
      attribution: { cause: "release", model: "claude-opus-5-5", effort: "high" },
    });
    expect(changes[0].outputTokensChange).toBeCloseTo(1000 / 450, 9);
    expect(changes[0].costPerTurnChange).toBeCloseTo(1000 / 450, 9);
    expect(changes[1]).toMatchObject({ from: "2.1.312", to: "2.1.313", significant: false, attribution: null });
  });

  it("uses null, which survives JSON, for a change from a zero baseline", () => {
    const { changes } = buildReport(
      [
        ...many(20, () => ({ harnessVersion: "2.1.310", model: "gpt-4o" })),
        ...many(20, () => ({ harnessVersion: "2.1.311" })),
      ],
      "harnessVersion"
    );

    expect(changes[0].costPerTurnChange).toBeNull();
  });

  it("lists the (not recorded) effort row last, however much it cost", () => {
    const { rows } = buildReport(
      [
        makeTurn({ effort: null, outputTokens: 900_000 }),
        makeTurn({ effort: "high", outputTokens: 1000 }),
        makeTurn({ effort: "medium", outputTokens: 2000 }),
      ],
      "effort"
    );

    expect(rows.map((r) => r.key)).toEqual(["medium", "high", "(not recorded)"]);
  });
});
