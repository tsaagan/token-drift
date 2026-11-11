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
    expect(out).toContain("1200 turns");
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

  it("shows cost per turn", () => {
    const out = renderTable(makeReport(), p);
    const line = out.split("\n").find((l) => l.includes("2.1.310"));
    expect(line).toBeDefined();
    expect(line).toContain("$0.38");
  });

  it("fits within 80 columns", () => {
    const out = renderTable(makeReport(), p);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it("uses the groupBy label as the first column header", () => {
    const report = makeReport({ groupBy: "model" });
    const out = renderTable(report, p);
    expect(out).toContain("Model");
    expect(out).not.toContain("Version");
  });
});

describe("renderSummary", () => {
  it("includes turn and session counts and source", () => {
    const out = renderSummary(makeReport(), p);
    expect(out).toContain("1200 turns");
    expect(out).toContain("45 sessions");
    expect(out).toContain(".jsonl");
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
  it("fits in 3 lines or fewer", () => {
    const report = makeReport({
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
    const out = renderCompact(report, p);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("includes cost and turn count", () => {
    const out = renderCompact(makeReport(), p);
    expect(out).toContain("$194.50");
    expect(out).toContain("1200");
  });
});
