import type { Turn, VersionMetrics, Delta, BoundaryKey } from "../types.js";
import { estimateTurnCost } from "./pricing.js";

/** Fewest turns a group needs before it is compared with its neighbour. */
export const MIN_TURNS = 20;

/** Row for turns whose log lines carry no value for the grouping field. */
export const NOT_RECORDED = "(not recorded)";

export function computeMetrics(
  turns: Turn[],
  groupBy: BoundaryKey["field"]
): Record<string, VersionMetrics> {
  const groups = new Map<string, Turn[]>();

  for (const turn of turns) {
    const key = turn[groupBy] || NOT_RECORDED;
    const group = groups.get(key);
    if (group) {
      group.push(turn);
    } else {
      groups.set(key, [turn]);
    }
  }

  const result: Record<string, VersionMetrics> = {};

  for (const [key, groupTurns] of groups) {
    const sessions = new Set(groupTurns.map((t) => t.sessionId));
    const timestamps = groupTurns
      .map((t) => t.timestamp)
      .filter((t) => t > 0)
      .sort((a, b) => a - b);

    const totalCacheCreation = groupTurns.reduce(
      (sum, t) => sum + t.cacheCreationTokens,
      0
    );
    const totalCacheRead = groupTurns.reduce(
      (sum, t) => sum + t.cacheReadTokens,
      0
    );
    const totalCache = totalCacheCreation + totalCacheRead;

    const thinking = groupTurns
      .map((t) => t.thinkingTokens)
      .filter((t): t is number => t !== null);
    const output = medianWithCi(groupTurns.map((t) => t.outputTokens));
    const turnCosts = groupTurns
      .map(estimateTurnCost)
      .filter((cost): cost is number => cost !== null);

    result[key] = {
      turns: groupTurns,
      medianOutputTokens: output.median,
      outputTokensCi: [output.low, output.high],
      medianThinkingTokens: thinking.length > 0 ? median(thinking) : null,
      medianToolCalls: median(groupTurns.map((t) => t.toolCalls)),
      cacheHitRate: totalCache > 0 ? totalCacheRead / totalCache : 0,
      totalCost: turnCosts.reduce((a, b) => a + b, 0),
      medianCostPerTurn: turnCosts.length > 0 ? median(turnCosts) : null,
      unpricedTurns: groupTurns.length - turnCosts.length,
      sessionCount: sessions.size,
      firstSeen: timestamps.length > 0 ? toDateString(timestamps[0]) : "",
      lastSeen:
        timestamps.length > 0
          ? toDateString(timestamps[timestamps.length - 1])
          : "",
    };
  }

  return result;
}

export function computeDeltas(
  metrics: Record<string, VersionMetrics>,
  groupBy: BoundaryKey["field"],
  minTurns: number = MIN_TURNS
): Delta[] {
  // Releases have an order; models and effort levels have no "previous" one.
  if (groupBy !== "harnessVersion") return [];

  // A group below minTurns is neither a baseline nor a result.
  const sortedKeys = Object.keys(metrics)
    .filter((key) => metrics[key].turns.length >= minTurns)
    .sort(compareSemver);

  const deltas: Delta[] = [];
  for (let i = 1; i < sortedKeys.length; i++) {
    const from = sortedKeys[i - 1];
    const to = sortedKeys[i];
    const prev = metrics[from];
    const curr = metrics[to];

    deltas.push({
      from,
      to,
      field: groupBy,
      nFrom: prev.turns.length,
      nTo: curr.turns.length,
      outputTokensDelta: relativeDelta(
        prev.medianOutputTokens,
        curr.medianOutputTokens
      ),
      significant:
        curr.outputTokensCi[0] > prev.outputTokensCi[1] ||
        curr.outputTokensCi[1] < prev.outputTokensCi[0],
      thinkingTokensDelta:
        prev.medianThinkingTokens === null || curr.medianThinkingTokens === null
          ? null
          : relativeDelta(prev.medianThinkingTokens, curr.medianThinkingTokens),
      toolCallsDelta: relativeDelta(prev.medianToolCalls, curr.medianToolCalls),
      cacheHitRateDelta: curr.cacheHitRate - prev.cacheHitRate,
    });
  }

  return deltas;
}

function median(values: number[]): number {
  return medianWithCi(values).median;
}

/**
 * Median with a distribution-free 95% confidence interval taken from order
 * statistics: the values at ranks n/2 ± 0.98·√n of the sorted sample.
 */
export function medianWithCi(values: readonly number[]): {
  median: number;
  low: number;
  high: number;
} {
  const n = values.length;
  if (n === 0) return { median: 0, low: 0, high: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const halfWidth = 0.98 * Math.sqrt(n);
  const lowRank = Math.max(1, Math.round(n / 2 - halfWidth));
  const highRank = Math.min(n, Math.round(1 + n / 2 + halfWidth));

  return {
    median: n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    low: sorted[lowRank - 1],
    high: sorted[highRank - 1],
  };
}

function relativeDelta(prev: number, curr: number): number {
  if (prev === 0) return curr === 0 ? 0 : Infinity;
  return (curr - prev) / prev;
}

export function compareSemver(a: string, b: string): number {
  const partsA = a.split(".").map((p) => parseInt(p, 10) || 0);
  const partsB = b.split(".").map((p) => parseInt(p, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function toDateString(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}
