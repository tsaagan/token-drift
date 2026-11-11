import type { BoundaryKey, Turn } from "../types.js";
import {
  MIN_TURNS,
  compareSemver,
  computeDeltas,
  computeMetrics,
} from "./compute-metrics.js";
import { attributeChange, type Attribution } from "./attribution.js";

export interface ReportTotals {
  /** Tokens × Anthropic list prices. An estimate, not an invoice. */
  estimatedCostUsd: number;
  turns: number;
  sessions: number;
  /** Turns left out of estimatedCostUsd because their model has no known rates. */
  unpricedTurns: number;
  firstSeen: string;
  lastSeen: string;
}

export interface ReportRow {
  key: string;
  turns: number;
  sessions: number;
  /** Too few turns to compare against a neighbour. */
  lowSample: boolean;
  medianOutputTokens: number;
  /** 95% confidence interval of medianOutputTokens. */
  outputTokensCi: readonly [number, number];
  /** null when the logs carry no thinking-token counts for this row. */
  medianThinkingTokens: number | null;
  medianToolCalls: number;
  cacheHitRate: number;
  estimatedCostUsd: number;
  medianCostPerTurnUsd: number | null;
  unpricedTurns: number;
  firstSeen: string;
  lastSeen: string;
}

/** How one release compares with the nearest earlier release that has enough turns. */
export interface ReportChange {
  from: string;
  to: string;
  /** Relative change in median output tokens: 0.5 is +50%. null when the baseline is zero. */
  outputTokensChange: number | null;
  /** Relative change in median estimated cost per turn. null when either side is unpriced. */
  costPerTurnChange: number | null;
  /** The two 95% confidence intervals of median output tokens do not overlap. */
  significant: boolean;
  /** Set for significant changes only. */
  attribution: Attribution | null;
}

/** What every output format (table, compact, JSON) is rendered from. */
export interface Report {
  schemaVersion: 1;
  groupBy: BoundaryKey["field"];
  totals: ReportTotals;
  /** Releases in version order; models and effort levels by cost, highest first. */
  rows: ReportRow[];
  /** Oldest first. Empty unless grouped by release. */
  changes: ReportChange[];
}

export function buildReport(
  turns: Turn[],
  groupBy: BoundaryKey["field"]
): Report {
  const metrics = computeMetrics(turns, groupBy);
  const groups = Object.values(metrics);
  const keys = Object.keys(metrics).sort(
    groupBy === "harnessVersion"
      ? compareSemver
      : (a, b) => metrics[b].totalCost - metrics[a].totalCost
  );
  const dates = groups
    .flatMap((m) => [m.firstSeen, m.lastSeen])
    .filter((d) => d !== "")
    .sort();

  return {
    schemaVersion: 1,
    groupBy,
    totals: {
      estimatedCostUsd: groups.reduce((sum, m) => sum + m.totalCost, 0),
      turns: turns.length,
      sessions: new Set(turns.map((t) => t.sessionId)).size,
      unpricedTurns: groups.reduce((sum, m) => sum + m.unpricedTurns, 0),
      firstSeen: dates[0] ?? "",
      lastSeen: dates.at(-1) ?? "",
    },
    rows: keys.map((key) => {
      const m = metrics[key];
      return {
        key,
        turns: m.turns.length,
        sessions: m.sessionCount,
        lowSample: m.turns.length < MIN_TURNS,
        medianOutputTokens: m.medianOutputTokens,
        outputTokensCi: m.outputTokensCi,
        medianThinkingTokens: m.medianThinkingTokens,
        medianToolCalls: m.medianToolCalls,
        cacheHitRate: m.cacheHitRate,
        estimatedCostUsd: m.totalCost,
        medianCostPerTurnUsd: m.medianCostPerTurn,
        unpricedTurns: m.unpricedTurns,
        firstSeen: m.firstSeen,
        lastSeen: m.lastSeen,
      };
    }),
    changes: computeDeltas(metrics, groupBy).map((d) => {
      const from = metrics[d.from];
      const to = metrics[d.to];
      return {
        from: d.from,
        to: d.to,
        outputTokensChange: relativeChange(
          from.medianOutputTokens,
          to.medianOutputTokens
        ),
        costPerTurnChange: relativeChange(
          from.medianCostPerTurn,
          to.medianCostPerTurn
        ),
        significant: d.significant,
        attribution: d.significant
          ? attributeChange(from.turns, to.turns)
          : null,
      };
    }),
  };
}

function relativeChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return (to - from) / from;
}
