import type { Turn } from "../types.js";
import { MIN_TURNS, NOT_RECORDED, medianWithCi } from "./compute-metrics.js";

/**
 * Why median output tokens moved between two releases.
 * - release: the shift is still there comparing only turns on the same model
 *   and effort, so the model and effort cannot explain it.
 * - model / effort: no like-for-like shift was found and the most-used model
 *   (or, failing that, effort level) differs between the two releases.
 * - unclear: neither of the above could be shown.
 */
export type Attribution =
  | {
      cause: "release";
      model: string;
      effort: string | null;
      turnsFrom: number;
      turnsTo: number;
    }
  | { cause: "model" | "effort"; from: string; to: string }
  | { cause: "unclear" };

export function attributeChange(
  from: Turn[],
  to: Turn[],
  minTurns: number = MIN_TURNS
): Attribution {
  const shared = largestSharedStratum(from, to, minTurns);
  if (shared) {
    const before = medianWithCi(shared.from.map((t) => t.outputTokens));
    const after = medianWithCi(shared.to.map((t) => t.outputTokens));
    if (after.low > before.high || after.high < before.low) {
      return {
        cause: "release",
        model: shared.from[0].model,
        effort: shared.from[0].effort,
        turnsFrom: shared.from.length,
        turnsTo: shared.to.length,
      };
    }
  }

  const modelFrom = mostUsed(from, (t) => t.model);
  const modelTo = mostUsed(to, (t) => t.model);
  if (modelFrom !== modelTo) {
    return { cause: "model", from: modelFrom, to: modelTo };
  }

  const effortFrom = mostUsed(from, (t) => t.effort ?? NOT_RECORDED);
  const effortTo = mostUsed(to, (t) => t.effort ?? NOT_RECORDED);
  // Older logs carry no effort level; its first appearance is not a change.
  const bothRecorded = effortFrom !== NOT_RECORDED && effortTo !== NOT_RECORDED;
  if (bothRecorded && effortFrom !== effortTo) {
    return { cause: "effort", from: effortFrom, to: effortTo };
  }

  return { cause: "unclear" };
}

function mostUsed(turns: Turn[], key: (t: Turn) => string): string {
  let best = "";
  let bestCount = 0;
  for (const [k, group] of groupBy(turns, key)) {
    if (group.length > bestCount) {
      best = k;
      bestCount = group.length;
    }
  }
  return best;
}

/** The model+effort pair with the most turns on both sides, if any has enough. */
function largestSharedStratum(
  from: Turn[],
  to: Turn[],
  minTurns: number
): { from: Turn[]; to: Turn[] } | null {
  const before = groupBy(from, stratum);
  const after = groupBy(to, stratum);

  let best: { from: Turn[]; to: Turn[] } | null = null;
  for (const [key, a] of before) {
    const b = after.get(key);
    if (!b || a.length < minTurns || b.length < minTurns) continue;
    const size = Math.min(a.length, b.length);
    if (!best || size > Math.min(best.from.length, best.to.length)) {
      best = { from: a, to: b };
    }
  }
  return best;
}

function stratum(turn: Turn): string {
  return JSON.stringify([turn.model, turn.effort]);
}

function groupBy(turns: Turn[], key: (t: Turn) => string): Map<string, Turn[]> {
  const groups = new Map<string, Turn[]>();
  for (const turn of turns) {
    const k = key(turn);
    const group = groups.get(k);
    if (group) group.push(turn);
    else groups.set(k, [turn]);
  }
  return groups;
}
