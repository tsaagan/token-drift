import { describe, it, expect } from "vitest";
import {
  renderDiagnosis,
  renderTable,
  renderSummary,
  renderJson,
  renderCompact,
} from "./render.js";
import { palette } from "./color.js";
import type { Report, ReportRow } from "../stats/report.js";

const p = palette(false);

function makeRow(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    key: "2.1.310",
    turns: 100,
    sessions: 5,
    lowSample: false,
    medianOutputTokens: 450,
    outputTokensCi: [380, 520] as const,
    medianThinkingTokens: null,
    medianToolCalls: 3,
    cacheHitRate: 0.85,
    estimatedCostUsd: 45.2,
    medianCostPerTurnUsd: 0.38,
    unpricedTurns: 0,
    firstSeen: "2026-09-01",
    lastSeen: "2026-10-15",
    ...overrides,
  };
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: 1,
    groupBy: "harnessVersion",
    totals: {
      estimatedCostUsd: 194.5,
      turns: 1200,
      sessions: 45,
      unpricedTurns: 0,
      firstSeen: "2026-09-01",
      lastSeen: "2026-11-10",
    },
    rows: [makeRow()],
    changes: [],
    ...overrides,
  };
}

describe("renderDiagnosis", () => {
  it("shows total estimated cost and counts", () => {
    const out = renderDiagnosis(makeReport(), p);
    expect(out).toContain("$194.50");
    expect(out).toContain("1,200 turns");
    expect(out).toContain("45 sessions");
  });

  it("labels cost as estimated at list prices", () => {
    const out = renderDiagnosis(makeReport(), p);
    expect(out).toMatch(/list prices/i);
  });

  it("shows significant changes with release attribution", () => {
    const report = makeReport({
      changes: [
        {
          from: "2.1.310",
          to: "2.1.312",
          outputTokensChange: 2.0,
          costPerTurnChange: 1.8,
          significant: true,
          attribution: {
            cause: "release",
            model: "claude-opus-5-5",
            effort: "high",
            turnsFrom: 40,
            turnsTo: 40,
          },
        },
      ],
    });
    const out = renderDiagnosis(report, p);
    expect(out).toContain("2.1.310");
    expect(out).toContain("2.1.312");
    expect(out).toContain("200%");
    expect(out).toContain("release");
  });

  it("shows model attribution when the model changed", () => {
    const report = makeReport({
      changes: [
        {
          from: "2.1.310",
          to: "2.1.312",
          outputTokensChange: -0.5,
          costPerTurnChange: -0.6,
          significant: true,
          attribution: {
            cause: "model",
            from: "claude-opus-5-5",
            to: "claude-fable-5-2",
          },
        },
      ],
    });
    const out = renderDiagnosis(report, p);
    expect(out).toContain("model");
  });

  it("says no significant changes when deltas exist but none are significant", () => {
    const report = makeReport({
      changes: [
        {
          from: "2.1.310",
          to: "2.1.312",
          outputTokensChange: 0.05,
          costPerTurnChange: 0.03,
          significant: false,
          attribution: null,
        },
      ],
    });
    const out = renderDiagnosis(report, p);
    expect(out).toMatch(/no significant/i);
  });
});

const change = (overrides: Partial<Report["changes"][number]> = {}): Report["changes"][number] => ({
  from: "2.1.310",
  to: "2.1.312",
  outputTokensChange: -0.5,
  costPerTurnChange: -0.4,
  significant: true,
  attribution: { cause: "unclear" },
  ...overrides,
});
const totals = (overrides: Partial<Report["totals"]>): Report =>
  makeReport({ totals: { ...makeReport().totals, ...overrides } });

describe("renderDiagnosis for a first-time reader", () => {
  it("separates thousands and uses the singular for one session", () => {
    const out = renderDiagnosis(totals({ turns: 1132, sessions: 1 }), p);
    expect(out).toContain("1,132 turns · 1 session ·");
  });

  it("shows the dates the logs cover", () => {
    expect(renderDiagnosis(makeReport(), p)).toContain("Sep 1 – Nov 10, 2026");
    expect(renderDiagnosis(totals({ firstSeen: "2025-03-01", lastSeen: "2026-11-01" }), p)).toContain(
      "Mar 1, 2025 – Nov 1, 2026"
    );
    expect(renderDiagnosis(totals({ firstSeen: "2026-11-01", lastSeen: "2026-11-01" }), p)).toContain(
      "· Nov 1, 2026"
    );
    expect(renderDiagnosis(totals({ firstSeen: "", lastSeen: "" }), p)).toContain("45 sessions\n");
  });

  it("writes the total with cents, and with separators above $1,000", () => {
    expect(renderDiagnosis(totals({ estimatedCostUsd: 1234.5 }), p)).toContain("$1,234.50 ");
    expect(renderDiagnosis(totals({ estimatedCostUsd: 0.127 }), p)).toContain("$0.13 ");
  });

  it("says cost could not be estimated when no turn could be priced", () => {
    const out = renderDiagnosis(totals({ estimatedCostUsd: 0, unpricedTurns: 1200 }), p);
    expect(out).toMatch(/cost not estimated/i);
    expect(out).toContain("1,200 turns");
    expect(out).not.toContain("$0");
  });

  it("names what changed, and shortens model ids in the cause", () => {
    const out = renderDiagnosis(
      makeReport({
        changes: [change({ attribution: { cause: "model", from: "claude-opus-5-5", to: "claude-fable-5-2" } })],
      }),
      p
    );
    expect(out).toContain("50% fewer output tokens (model: opus-5-5 → fable-5-2)");
  });

  it("keeps every line within 80 columns, long model ids included", () => {
    const out = renderDiagnosis(
      makeReport({
        changes: [
          change({
            outputTokensChange: 12.5,
            attribution: { cause: "model", from: "claude-3-7-sonnet-20250219", to: "us.anthropic.claude-sonnet-4-5-20250929-v1:0" },
          }),
          change({
            outputTokensChange: 1.05,
            attribution: { cause: "release", model: "claude-opus-5-5", effort: "high", turnsFrom: 40, turnsTo: 40 },
          }),
        ],
      }),
      p
    );
    for (const line of out.split("\n")) expect(line.length).toBeLessThanOrEqual(80);
    expect(out).toContain("(model: 3-7-sonnet → sonnet-4-5)");
  });

  it("explains why nothing is compared when no two versions have enough turns", () => {
    const out = renderDiagnosis(makeReport({ changes: [] }), p);
    expect(out).toMatch(/two versions with at least 20 turns each/);
  });

  it("makes no claim about versions when grouped by model", () => {
    const out = renderDiagnosis(makeReport({ groupBy: "model", changes: [] }), p);
    expect(out).not.toMatch(/version/i);
  });

  it("counts the versions it compared when nothing changed", () => {
    const out = renderDiagnosis(
      makeReport({ changes: [change({ significant: false, attribution: null }), change({ significant: false, attribution: null })] }),
      p
    );
    expect(out).toContain("No significant change in output tokens across 3 versions");
  });
});

describe("renderTable", () => {
  it("shows delta arrows for significant increases", () => {
    const report = makeReport({
      rows: [
        makeRow({ key: "2.1.310" }),
        makeRow({ key: "2.1.312", medianOutputTokens: 1350 }),
      ],
      changes: [
        {
          from: "2.1.310",
          to: "2.1.312",
          outputTokensChange: 2.0,
          costPerTurnChange: null,
          significant: true,
          attribution: {
            cause: "release",
            model: "claude-opus-5-5",
            effort: "high",
            turnsFrom: 40,
            turnsTo: 40,
          },
        },
      ],
    });
    const out = renderTable(report, p);
    const line = out.split("\n").find((l) => l.includes("2.1.312"));
    expect(line).toBeDefined();
    expect(line).toContain("↑200%");
  });

  it("shows no arrow for non-significant changes", () => {
    const report = makeReport({
      rows: [
        makeRow({ key: "2.1.310" }),
        makeRow({ key: "2.1.311", medianOutputTokens: 500 }),
      ],
      changes: [
        {
          from: "2.1.310",
          to: "2.1.311",
          outputTokensChange: 0.11,
          costPerTurnChange: 0.1,
          significant: false,
          attribution: null,
        },
      ],
    });
    const out = renderTable(report, p);
    const line = out.split("\n").find((l) => l.includes("2.1.311"));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/[↑↓]/);
  });

  it("marks low-sample rows", () => {
    const report = makeReport({
      rows: [
        makeRow({ key: "2.1.310" }),
        makeRow({ key: "2.1.311", turns: 5, lowSample: true }),
      ],
    });
    const out = renderTable(report, p);
    const line = out.split("\n").find((l) => l.includes("2.1.311"));
    expect(line).toBeDefined();
    expect(line).toContain("low n");
  });

  it("prints a dash for null thinking tokens", () => {
    const out = renderTable(makeReport(), p);
    const line = out.split("\n").find((l) => l.includes("2.1.310"));
    expect(line).toBeDefined();
    expect(line).toContain("—");
  });

  it("prints a dash, not 0%, when the row used no cache at all", () => {
    const out = renderTable(makeReport({ rows: [makeRow({ cacheHitRate: null, medianThinkingTokens: 50 })] }), p);
    const line = out.split("\n").find((l) => l.includes("2.1.310")) ?? "";
    expect(line.split("│").at(-1)?.trim()).toBe("—");
  });

  it("shows cost per turn", () => {
    const out = renderTable(makeReport(), p);
    const line = out.split("\n").find((l) => l.includes("2.1.310"));
    expect(line).toBeDefined();
    expect(line).toContain("$0.38");
  });

  it("heads the count column with a word, not a symbol", () => {
    expect(renderTable(makeReport(), p).split("\n")[1]).toContain("Turns");
  });

  it("tells apart two models whose ids share a long prefix", () => {
    const report = makeReport({
      groupBy: "model",
      rows: [makeRow({ key: "claude-sonnet-4-20250514" }), makeRow({ key: "claude-sonnet-4-5-20250929" })],
    });
    const keys = renderTable(report, p)
      .split("\n")
      .filter((l) => l.includes("sonnet"))
      .map((l) => l.split("│")[0].trim());

    expect(keys).toEqual(["sonnet-4", "sonnet-4-5"]);
  });

  it("prints <$0.01, not $0.00 or a third decimal, for a tiny cost per turn", () => {
    const out = renderTable(makeReport({ rows: [makeRow({ medianCostPerTurnUsd: 0.002 })] }), p);
    expect(out).toContain("<$0.01");
  });

  it("separates thousands in the turn count", () => {
    const out = renderTable(makeReport({ rows: [makeRow({ turns: 12345 })] }), p);
    expect(out).toContain("12,345");
  });

  it("fits within 80 columns", () => {
    const out = renderTable(makeReport(), p);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it("lines up the same with colour on as with it off", () => {
    const report = makeReport({
      rows: [makeRow(), makeRow({ key: "2.1.311", turns: 5, lowSample: true }), makeRow({ key: "2.1.312" })],
      changes: [change({ from: "2.1.310", to: "2.1.312", outputTokensChange: 0.22 })],
    });
    // eslint-disable-next-line no-control-regex
    const stripped = renderTable(report, palette(true)).replace(/\x1b\[\d+m/g, "");

    expect(stripped).toBe(renderTable(report, p));
  });

  it("uses the groupBy label as the first column header", () => {
    const report = makeReport({ groupBy: "model" });
    const out = renderTable(report, p);
    expect(out).toContain("Model");
    expect(out).not.toContain("Version");
  });
});

describe("renderSummary", () => {
  it("says the cost is an estimate and not a bill", () => {
    const out = renderSummary(makeReport(), p);
    expect(out).toMatch(/estimate/);
    expect(out).toMatch(/not a bill/);
  });

  it("explains low n only when a row is marked with it", () => {
    const withLowN = makeReport({ rows: [makeRow(), makeRow({ key: "2.1.311", turns: 5, lowSample: true })] });

    expect(renderSummary(withLowN, p)).toContain("low n = fewer than 20 turns");
    expect(renderSummary(makeReport(), p)).not.toContain("low n");
  });

  it("says how many turns were left out of the cost", () => {
    const report = makeReport();
    report.totals.unpricedTurns = 25;

    expect(renderSummary(report, p)).toContain("25 turns ran on a model with no known price");
    expect(renderSummary(makeReport(), p)).not.toContain("no known price");
  });

  it("explains the (not recorded) row when grouping by effort", () => {
    const report = makeReport({ groupBy: "effort", rows: [makeRow({ key: "high" }), makeRow({ key: "(not recorded)" })] });

    expect(renderSummary(report, p)).toMatch(/\(not recorded\) = .*effort/);
    expect(renderSummary(makeReport(), p)).not.toContain("(not recorded)");
  });

  it("gives a reason to come back, and where the project lives", () => {
    const out = renderSummary(makeReport(), p);
    expect(out).toContain("after your next Claude Code update");
    expect(out).toContain("github.com/tsaagan/whodrifted");
  });

  it("prints the same thing every time for the same report", () => {
    expect(renderSummary(makeReport(), p)).toBe(renderSummary(makeReport(), p));
    expect(renderSummary(makeReport(), p)).not.toMatch(/generated/);
  });

  it("fits within 80 columns", () => {
    const report = makeReport({ groupBy: "effort", rows: [makeRow({ key: "(not recorded)", lowSample: true })] });
    report.totals.unpricedTurns = 12345;
    for (const line of renderSummary(report, p).split("\n")) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});

describe("renderJson", () => {
  it("returns valid JSON matching the report schema", () => {
    const report = makeReport();
    const parsed = JSON.parse(renderJson(report));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.totals.estimatedCostUsd).toBe(194.5);
    expect(parsed.rows).toHaveLength(1);
  });
});

describe("renderCompact", () => {
  const lines = (report: Report): string[] => renderCompact(report, p).split("\n");

  it("leads with cost, turns and dates on one line", () => {
    expect(lines(makeReport())[0]).toBe(
      "whodrifted · $194.50 estimated · 1,200 turns · Sep 1 – Nov 10, 2026"
    );
  });

  it("adds one line saying nothing changed", () => {
    const report = makeReport({ changes: [change({ significant: false, attribution: null })] });
    expect(lines(report)).toEqual([
      "whodrifted · $194.50 estimated · 1,200 turns · Sep 1 – Nov 10, 2026",
      "✓ No significant change in output tokens across 2 versions",
    ]);
  });

  it("says when there is too little data to compare versions", () => {
    expect(lines(makeReport({ changes: [] }))[1]).toMatch(/two versions with at least 20 turns each/);
  });

  it("never runs past three lines, newest change first", () => {
    const report = makeReport({
      changes: [
        change({ from: "2.1.300", to: "2.1.301" }),
        change({ from: "2.1.301", to: "2.1.302" }),
        change({ from: "2.1.302", to: "2.1.303" }),
        change({ from: "2.1.303", to: "2.1.304", attribution: { cause: "model", from: "claude-opus-5-5", to: "claude-fable-5-2" } }),
      ],
    });

    expect(lines(report)).toEqual([
      "whodrifted · $194.50 estimated · 1,200 turns · Sep 1 – Nov 10, 2026",
      "▼ 2.1.303 → 2.1.304: 50% fewer output tokens (model: opus-5-5 → fable-5-2)",
      "+ 3 earlier changes",
    ]);
  });

  it("has no indentation and fits 80 columns, so it pastes cleanly", () => {
    const report = makeReport({
      changes: [change({ attribution: { cause: "model", from: "claude-3-7-sonnet-20250219", to: "claude-sonnet-4-5-20250929" } })],
    });
    for (const line of lines(report)) {
      expect(line).toBe(line.trim());
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});

describe("renderJson rounding", () => {
  it("rounds away floating-point noise", () => {
    const report = makeReport({ rows: [makeRow({ estimatedCostUsd: 0.1 + 0.2, cacheHitRate: 0.974025974025974 })] });
    const parsed = JSON.parse(renderJson(report));

    expect(parsed.rows[0].estimatedCostUsd).toBe(0.3);
    expect(parsed.rows[0].cacheHitRate).toBe(0.974026);
    expect(parsed.rows[0].turns).toBe(100);
  });
});
