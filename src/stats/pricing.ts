import type { RequestUsage, Turn } from "../types.js";

export interface ModelRates {
  inputPerM: number;
  outputPerM: number;
  cacheWrite5mPerM: number;
  cacheWrite1hPerM: number;
  cacheReadPerM: number;
}

type RateCardFamily = "fable" | "opus" | "sonnet" | "haiku";

/** USD per million tokens. */
type Prices = readonly [input: number, output: number, cacheRead: number];

/**
 * [major, minor] of the first release a row applies to, then its prices. A
 * model priced by prompt length adds the prices that apply above `over` tokens.
 */
type RateRow = readonly [
  from: readonly [number, number],
  ...prices: Prices,
  longPrompt?: { over: number; prices: Prices },
];

/**
 * Anthropic API list prices, newest row first within each family.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (read 2026-11-11).
 * Cache writes are 1.25x input (5-minute) and 2x input (1-hour) on every row.
 */
const RATE_CARD: Record<RateCardFamily, readonly RateRow[]> = {
  fable: [
    [[5, 2], 8, 40, 0.2],
    [[5, 1], 10, 50, 0.25],
    [[5, 0], 10, 50, 1],
  ],
  opus: [
    [[5, 5], 4, 20, 0.2],
    [[4, 5], 5, 25, 0.5],
    [[0, 0], 15, 75, 1.5],
  ],
  sonnet: [
    [[5, 5], 2, 10, 0.1],
    [[5, 0], 2, 10, 0.2],
    [[0, 0], 3, 15, 0.3],
  ],
  haiku: [
    [[5, 5], 0.1, 0.5, 0.01, { over: 100_000, prices: [0.5, 2.5, 0.05] }],
    [[4, 5], 1, 5, 0.1],
    [[3, 5], 0.8, 4, 0.08],
  ],
};

const NEW_STYLE_ID = /(fable|mythos|opus|sonnet|haiku)-(\d{1,2})(?!\d)(?:-(\d{1,2})(?!\d))?/;
const OLD_STYLE_ID = /(\d{1,2})(?:-(\d{1,2}))?-(opus|sonnet|haiku)/;

const FAMILIES = ["fable", "mythos", "opus", "sonnet", "haiku"] as const;
export type ModelFamily = (typeof FAMILIES)[number] | "unknown";

export function modelFamily(model: string): ModelFamily {
  return FAMILIES.find((family) => model.includes(family)) ?? "unknown";
}

/** claude-opus-4-6 -> [4, 6]; claude-3-5-haiku-20241022 -> [3, 5]; no version -> null. */
function modelVersion(model: string): readonly [number, number] | null {
  const modern = NEW_STYLE_ID.exec(model);
  if (modern) return [Number(modern[2]), Number(modern[3] ?? 0)];
  const legacy = OLD_STYLE_ID.exec(model);
  if (legacy) return [Number(legacy[1]), Number(legacy[2] ?? 0)];
  return null;
}

/**
 * Rates for one request. `promptTokens` is the request's whole prompt (input,
 * cache writes and cache reads); it only matters for models priced by length.
 */
export function ratesFor(model: string, promptTokens = 0): ModelRates | null {
  const family = modelFamily(model);
  const version = modelVersion(model);
  if (family === "unknown" || !version) return null;

  const card = RATE_CARD[family === "mythos" ? "fable" : family];
  const row = card.find(
    ([from]) => version[0] > from[0] || (version[0] === from[0] && version[1] >= from[1])
  );
  if (!row) return null;

  const longPrompt = row[4];
  const [input, output, cacheRead] =
    longPrompt && promptTokens > longPrompt.over
      ? longPrompt.prices
      : [row[1], row[2], row[3]];
  return {
    inputPerM: input,
    outputPerM: output,
    cacheWrite5mPerM: input * 1.25,
    cacheWrite1hPerM: input * 2,
    cacheReadPerM: cacheRead,
  };
}

/** Estimated USD for one request at list prices; null when the model has no known rates. */
export function estimateRequestCost(usage: RequestUsage): number | null {
  const cacheWriteTokens = usage.cacheWrite5mTokens + usage.cacheWrite1hTokens;
  const promptTokens = usage.inputTokens + cacheWriteTokens + usage.cacheReadTokens;
  const rates = ratesFor(usage.model, promptTokens);
  if (!rates) return null;

  return (
    (usage.inputTokens * rates.inputPerM +
      usage.outputTokens * rates.outputPerM +
      usage.cacheWrite5mTokens * rates.cacheWrite5mPerM +
      usage.cacheWrite1hTokens * rates.cacheWrite1hPerM +
      usage.cacheReadTokens * rates.cacheReadPerM) /
    1_000_000
  );
}

/** Sum over the turn's requests; null when any of them cannot be priced. */
export function estimateTurnCost(turn: Turn): number | null {
  let total = 0;
  for (const request of turn.requests) {
    const cost = estimateRequestCost(request);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}
