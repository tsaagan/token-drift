import type { Palette } from "./color.js";
import type { Report, ReportChange } from "../stats/report.js";
import { MIN_TURNS, NOT_RECORDED } from "../stats/compute-metrics.js";

const COL = { key: 16, turns: 5, out: 7, delta: 7, cost: 7, think: 6, cache: 6 };
const GROUP_LABEL: Record<Report["groupBy"], string> = {
  harnessVersion: "Version",
  model: "Model",
  effort: "Effort",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function renderDiagnosis(report: Report, p: Palette): string {
  const { totals } = report;
  const lines = [
    "",
    p.bold("  whodrifted") + p.dim(" · what changed in each Claude Code release"),
    p.dim("  " + "─".repeat(55)),
    "",
    hasPricedTurns(report)
      ? `  ${p.bold(fmtCost(totals.estimatedCostUsd))} estimated at API list prices`
      : "  Cost not estimated: no known price for the models in these logs",
    p.dim(`  ${[plural(totals.turns, "turn"), plural(totals.sessions, "session"), fmtDateRange(totals.firstSeen, totals.lastSeen)].filter(Boolean).join(" · ")}`),
  ];

  const verdict = verdictLines(report, p);
  if (verdict.length > 0) lines.push("", ...verdict.map((line) => `  ${line}`));
  return lines.join("\n");
}

export function renderTable(report: Report, p: Palette): string {
  const changeTo = new Map(report.changes.map((c) => [c.to, c]));
  const plain = (s: string): string => s;

  const lines = [
    "",
    "  " +
      [
        rpad(GROUP_LABEL[report.groupBy], COL.key),
        lpad("Turns", COL.turns),
        lpad("Output", COL.out),
        lpad("Δ", COL.delta),
        lpad("$/turn", COL.cost),
        lpad("Think", COL.think),
        lpad("Cache", COL.cache),
      ]
        .map(p.dim)
        .join(" │ "),
    rule("┼", p),
  ];

  for (const row of report.rows) {
    const change = changeTo.get(row.key);
    const paint = row.lowSample ? p.dim : plain;
    const key = report.groupBy === "model" ? shortModel(row.key) : row.key;
    const delta = row.lowSample
      ? p.dim(lpad("low n", COL.delta))
      : change?.significant
        ? paintDelta(change.outputTokensChange, p)
        : lpad("", COL.delta);

    lines.push(
      "  " +
        [
          paint(rpad(truncate(key, COL.key), COL.key)),
          paint(lpad(fmtInt(row.turns), COL.turns)),
          paint(lpad(fmtTokens(row.medianOutputTokens), COL.out)),
          delta,
          paint(lpad(fmtCostPerTurn(row.medianCostPerTurnUsd), COL.cost)),
          paint(lpad(row.medianThinkingTokens === null ? "—" : fmtTokens(row.medianThinkingTokens), COL.think)),
          paint(lpad(row.cacheHitRate === null ? "—" : `${(row.cacheHitRate * 100).toFixed(1)}%`, COL.cache)),
        ].join(" │ ")
    );
  }

  lines.push(rule("┴", p));
  return lines.join("\n");
}

/** The notes under the table: what the columns mean and what the cost is. */
export function renderSummary(report: Report, p: Palette): string {
  const { totals, rows } = report;
  const notes = ["Output, $/turn and Think are per-turn medians; Δ marks a significant change."];

  if (rows.some((row) => row.lowSample)) {
    notes.push(`low n = fewer than ${MIN_TURNS} turns, too few to compare.`);
  }
  if (rows.some((row) => row.key === NOT_RECORDED)) {
    notes.push(
      report.groupBy === "effort"
        ? `${NOT_RECORDED} = turns logged before Claude Code recorded the effort level.`
        : `${NOT_RECORDED} = turns whose log lines carry no ${GROUP_LABEL[report.groupBy].toLowerCase()}.`
    );
  }
  if (totals.unpricedTurns > 0 && hasPricedTurns(report)) {
    notes.push(
      `${plural(totals.unpricedTurns, "turn")} ran on a model with no known price and ` +
        `${totals.unpricedTurns === 1 ? "is" : "are"} left out of the cost.`
    );
  }
  notes.push(
    "Cost is an estimate (tokens × Anthropic API list prices), not a bill.",
    "On a subscription, it is what the same usage would cost through the API."
  );

  return [
    "",
    ...notes.map((note) => p.dim(`  ${note}`)),
    "",
    p.dim("  Run again after your next Claude Code update to see what it changed."),
    p.dim("  ★ github.com/tsaagan/whodrifted"),
    "",
  ].join("\n");
}

export function renderJson(report: Report): string {
  // Six decimals keeps every figure exact enough and drops float noise like 0.30000000000000004.
  return JSON.stringify(
    report,
    (_key, value: unknown) =>
      typeof value === "number" && !Number.isInteger(value)
        ? Math.round(value * 1e6) / 1e6
        : value,
    2
  );
}

/** At most three unindented lines, each within 80 columns, for pasting elsewhere. */
export function renderCompact(report: Report, p: Palette): string {
  const { totals } = report;
  const head = [
    p.bold("whodrifted"),
    hasPricedTurns(report)
      ? `${p.bold(fmtCost(totals.estimatedCostUsd))} estimated`
      : "cost not estimated",
    plural(totals.turns, "turn"),
    fmtDateRange(totals.firstSeen, totals.lastSeen),
  ]
    .filter(Boolean)
    .join(" · ");

  const significant = report.changes.filter((c) => c.significant).reverse();
  if (significant.length > 2) {
    return [
      head,
      fmtChange(significant[0], p),
      `+ ${significant.length - 1} earlier changes`,
    ].join("\n");
  }
  return [head, ...verdictLines(report, p, significant)].join("\n");
}

function verdictLines(
  report: Report,
  p: Palette,
  significant = report.changes.filter((c) => c.significant)
): string[] {
  if (report.groupBy !== "harnessVersion") return [];
  if (significant.length > 0) return significant.map((c) => fmtChange(c, p));
  if (report.changes.length > 0) {
    return [
      `${p.green("✓")} No significant change in output tokens across ${report.changes.length + 1} versions`,
    ];
  }
  return [
    p.dim(`· Nothing to compare yet: that takes two versions with at least ${MIN_TURNS} turns each.`),
  ];
}

function fmtChange(c: ReportChange, p: Palette): string {
  const up = c.outputTokensChange !== null && c.outputTokensChange > 0;
  const size =
    c.outputTokensChange === null
      ? "output tokens changed"
      : `${Math.abs(c.outputTokensChange * 100).toFixed(0)}% ${up ? "more" : "fewer"} output tokens`;

  return `${up ? p.red("▲") : p.green("▼")} ${p.bold(c.from)} → ${p.bold(c.to)}: ${size}${p.dim(` (${fmtCause(c)})`)}`;
}

function fmtCause(c: ReportChange): string {
  switch (c.attribution?.cause) {
    case "release":
      return "release: same model and effort";
    case "model":
      return `model: ${shortModel(c.attribution.from)} → ${shortModel(c.attribution.to)}`;
    case "effort":
      return `effort: ${c.attribution.from} → ${c.attribution.to}`;
    default:
      return "cause unclear";
  }
}

function hasPricedTurns(report: Report): boolean {
  return report.totals.turns > report.totals.unpricedTurns;
}

function rule(joint: string, p: Palette): string {
  return p.dim(
    "  " +
      Object.values(COL)
        .map((width) => "─".repeat(width))
        .join(`─${joint}─`)
  );
}

function paintDelta(change: number | null, p: Palette): string {
  if (change === null) return lpad("", COL.delta);
  const text = lpad(`${change > 0 ? "↑" : "↓"}${Math.abs(change * 100).toFixed(0)}%`, COL.delta);
  return change > 0 ? p.red(text) : p.green(text);
}

/** claude-sonnet-4-5-20250929 -> sonnet-4-5: the part people say out loud. */
function shortModel(id: string): string {
  return id
    .replace(/^.*claude-/, "")
    .replace(/[-@]\d{8}.*$/, "")
    .replace(/-v\d+(:\d+)?$/, "");
}

// Pad plain text before painting it: ANSI codes would count towards the width.
function lpad(s: string, width: number): string {
  return s.padStart(width);
}

function rpad(s: string, width: number): string {
  return s.padEnd(width);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function plural(n: number, noun: string): string {
  return `${fmtInt(n)} ${noun}${n === 1 ? "" : "s"}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtCost(dollars: number): string {
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCostPerTurn(dollars: number | null): string {
  if (dollars === null) return "—";
  if (dollars > 0 && dollars < 0.005) return "<$0.01";
  return fmtCost(dollars);
}

/** "2026-10-06", "2026-11-11" -> "Oct 6 – Nov 11, 2026". Empty when there are no dates. */
function fmtDateRange(first: string, last: string): string {
  if (first === "" || last === "") return "";
  const [y1, m1, d1] = first.split("-").map(Number);
  const [y2, m2, d2] = last.split("-").map(Number);
  const end = `${MONTHS[m2 - 1]} ${d2}, ${y2}`;
  if (first === last) return end;
  const start = `${MONTHS[m1 - 1]} ${d1}${y1 === y2 ? "" : `, ${y1}`}`;
  return `${start} – ${end}`;
}
