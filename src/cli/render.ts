import type { Palette } from "./color.js";
import type { Report, ReportChange } from "../stats/report.js";

const COL = { key: 16, n: 5, out: 7, delta: 7, cost: 7, think: 6, cache: 6 };
const GROUP_LABEL: Record<string, string> = {
  harnessVersion: "Version",
  model: "Model",
  effort: "Effort",
};

export function renderDiagnosis(report: Report, p: Palette): string {
  const { totals, changes } = report;
  const lines: string[] = [""];

  lines.push(
    p.bold("  whodrifted") +
      p.dim(" · what changed in each Claude Code release")
  );
  lines.push(p.dim("  " + "─".repeat(55)));

  if (totals.estimatedCostUsd > 0) {
    lines.push("");
    lines.push(
      `  ${p.bold(fmtCost(totals.estimatedCostUsd))} estimated at API list prices · ${totals.turns} turns · ${totals.sessions} sessions`
    );
  }

  const significant = changes.filter((c) => c.significant);
  if (significant.length > 0) {
    lines.push("");
    for (const c of significant) {
      lines.push(fmtChange(c, p));
    }
  } else if (changes.length > 0) {
    lines.push("");
    lines.push(
      `  ${p.green("✓")} No significant output changes between versions`
    );
  }

  return lines.join("\n");
}

export function renderTable(report: Report, p: Palette): string {
  const { rows, changes } = report;
  const changeMap = new Map(changes.map((c) => [c.to, c]));
  const lines: string[] = [""];
  const label = GROUP_LABEL[report.groupBy] ?? "Key";

  const hdr =
    `  ${p.dim(rpad(label, COL.key))} │ ` +
    `${p.dim(lpad("n", COL.n))} │ ` +
    `${p.dim(lpad("Output", COL.out))} │ ` +
    `${p.dim(lpad("Δ", COL.delta))} │ ` +
    `${p.dim(lpad("$/turn", COL.cost))} │ ` +
    `${p.dim(lpad("Think", COL.think))} │ ` +
    `${p.dim(lpad("Cache", COL.cache))}`;
  lines.push(hdr);
  lines.push(sep("┼", p));

  for (const row of rows) {
    const change = changeMap.get(row.key);
    const deltaStr = row.lowSample
      ? p.dim("low n")
      : change?.significant
        ? colorDelta(change.outputTokensChange, p)
        : "";

    const fmt = row.lowSample ? p.dim : (s: string) => s;

    lines.push(
      `  ${fmt(rpad(truncate(row.key, COL.key), COL.key))} │ ` +
        `${fmt(lpad(String(row.turns), COL.n))} │ ` +
        `${fmt(lpad(fmtNum(row.medianOutputTokens), COL.out))} │ ` +
        `${lpad(deltaStr, COL.delta)} │ ` +
        `${fmt(lpad(fmtCostShort(row.medianCostPerTurnUsd), COL.cost))} │ ` +
        `${fmt(lpad(row.medianThinkingTokens === null ? "—" : fmtNum(row.medianThinkingTokens), COL.think))} │ ` +
        `${fmt(lpad((row.cacheHitRate * 100).toFixed(1) + "%", COL.cache))}`
    );
  }

  lines.push(sep("┴", p));
  return lines.join("\n");
}

export function renderSummary(report: Report, p: Palette): string {
  const { totals, rows } = report;
  const lines: string[] = [""];
  lines.push(
    p.dim(
      `  ${totals.turns} turns · ${totals.sessions} sessions · ${rows.length} ${GROUP_LABEL[report.groupBy]?.toLowerCase() ?? "group"}s`
    )
  );
  lines.push(p.dim("  source: ~/.claude/projects/**/*.jsonl"));
  lines.push(
    p.dim(
      `  generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`
    )
  );
  if (totals.unpricedTurns > 0) {
    lines.push(
      p.dim(
        `  ${totals.unpricedTurns} turns could not be priced (unknown model)`
      )
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}

export function renderCompact(report: Report, p: Palette): string {
  const { totals, changes } = report;
  const parts = [
    `${p.bold("whodrifted")} · ${p.bold(fmtCost(totals.estimatedCostUsd))} estimated · ${totals.turns} turns`,
  ];

  const significant = changes.filter((c) => c.significant);
  for (const c of significant) {
    parts.push(fmtChange(c, p));
  }
  if (significant.length === 0 && changes.length > 0) {
    parts.push(
      `  ${p.green("✓")} No significant changes across ${changes.length + 1} versions`
    );
  }
  return parts.join("\n");
}

function fmtChange(c: ReportChange, p: Palette): string {
  const pct = c.outputTokensChange !== null
    ? Math.abs(c.outputTokensChange * 100).toFixed(0)
    : "?";
  const dir =
    c.outputTokensChange !== null && c.outputTokensChange > 0 ? "more" : "fewer";
  const marker =
    c.outputTokensChange !== null && c.outputTokensChange > 0
      ? p.red("▲")
      : p.green("▼");

  let cause = "";
  if (c.attribution) {
    switch (c.attribution.cause) {
      case "release":
        cause = p.dim(` (release change, same model)`);
        break;
      case "model":
        cause = p.dim(
          ` (model: ${c.attribution.from} → ${c.attribution.to})`
        );
        break;
      case "effort":
        cause = p.dim(
          ` (effort: ${c.attribution.from} → ${c.attribution.to})`
        );
        break;
      case "unclear":
        cause = p.dim(` (cause unclear)`);
        break;
    }
  }

  return `  ${marker} ${p.bold(c.from)} → ${p.bold(c.to)}: ${pct}% ${dir} output${cause}`;
}

function sep(joint: string, p: Palette): string {
  return p.dim(
    `  ${"─".repeat(COL.key)}─${joint}─` +
      `${"─".repeat(COL.n)}─${joint}─` +
      `${"─".repeat(COL.out)}─${joint}─` +
      `${"─".repeat(COL.delta)}─${joint}─` +
      `${"─".repeat(COL.cost)}─${joint}─` +
      `${"─".repeat(COL.think)}─${joint}─` +
      `${"─".repeat(COL.cache)}`
  );
}

function colorDelta(d: number | null, p: Palette): string {
  if (d === null) return p.yellow("new");
  const pct = Math.abs(d * 100).toFixed(0);
  return d > 0 ? p.red(`↑${pct}%`) : p.green(`↓${pct}%`);
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[\d+m/g;

function visibleLength(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

function lpad(s: string, w: number): string {
  const gap = w - visibleLength(s);
  return gap > 0 ? " ".repeat(gap) + s : s;
}

function rpad(s: string, w: number): string {
  const gap = w - visibleLength(s);
  return gap > 0 ? s + " ".repeat(gap) : s;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtCost(dollars: number): string {
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(3)}`;
}

function fmtCostShort(dollars: number | null): string {
  if (dollars === null) return "—";
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  if (dollars >= 0.01) return `$${dollars.toFixed(2)}`;
  if (dollars >= 0.001) return `$${dollars.toFixed(3)}`;
  return "$0.00";
}
