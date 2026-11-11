/** Token usage of one API request, as billed. */
export interface RequestUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
}

export interface Turn {
  sessionId: string;
  harnessVersion: string;
  model: string;
  effort: string | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number | null;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  toolCalls: number;
  timestamp: number;
  /** One entry per API request in the turn; the token fields above are their sums. */
  requests: RequestUsage[];
}

export interface BoundaryKey {
  field: "harnessVersion" | "model" | "effort";
  value: string;
}

export interface VersionMetrics {
  turns: Turn[];
  medianOutputTokens: number;
  outputTokensCi: readonly [number, number];
  medianThinkingTokens: number | null;
  medianToolCalls: number;
  /** Cache reads as a share of all cache tokens; null when there were none. */
  cacheHitRate: number | null;
  /** Estimated USD over the turns that could be priced. */
  totalCost: number;
  medianCostPerTurn: number | null;
  unpricedTurns: number;
  sessionCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface Delta {
  from: string;
  to: string;
  field: BoundaryKey["field"];
  nFrom: number;
  nTo: number;
  outputTokensDelta: number;
  significant: boolean;
  thinkingTokensDelta: number | null;
  toolCallsDelta: number;
  cacheHitRateDelta: number | null;
}
