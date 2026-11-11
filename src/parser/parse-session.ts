import type { Turn } from "../types.js";
import { decodeLine, type ResponseRecord } from "./decode.js";

export function parseSession(sessionId: string, lines: Iterable<string>): Turn[] {
  const turns: Turn[] = [];
  let version = "";
  let timestamp = 0;
  let anonymous = 0;
  let responses = new Map<string, ResponseRecord>();
  let toolCalls = 0;

  const flush = (): void => {
    const turn = toTurn(sessionId, version, timestamp, [...responses.values()], toolCalls);
    if (turn) turns.push(turn);
    responses = new Map();
    toolCalls = 0;
  };

  for (const line of lines) {
    const record = decodeLine(line);
    if (!record) continue;

    // Tool results are logged as user lines; only a human prompt ends a turn.
    if (record.kind === "prompt") flush();
    version = record.version ?? version;
    timestamp = record.timestamp ?? timestamp;
    if (record.kind !== "response") continue;

    // One API response is written as one line per content block, each carrying
    // that response's usage. The last line holds the final count.
    responses.set(record.messageId ?? `anonymous:${anonymous++}`, record);
    // Content blocks are not repeated across those lines, so tool calls add up.
    toolCalls += record.toolCalls;
  }
  flush();

  return turns;
}

function toTurn(
  sessionId: string,
  harnessVersion: string,
  timestamp: number,
  responses: ResponseRecord[],
  toolCalls: number
): Turn | null {
  const last = responses.at(-1);
  const outputTokens = sum(responses.map((r) => r.outputTokens));
  if (!last || outputTokens === 0) return null;

  return {
    sessionId,
    harnessVersion,
    model: last.model,
    effort: last.effort,
    inputTokens: sum(responses.map((r) => r.inputTokens)),
    outputTokens,
    // null means the log carried no thinking data, which is not zero thinking.
    thinkingTokens: responses.every((r) => r.thinkingTokens === null)
      ? null
      : sum(responses.map((r) => r.thinkingTokens ?? 0)),
    cacheCreationTokens: sum(responses.map((r) => r.cacheCreationTokens)),
    cacheReadTokens: sum(responses.map((r) => r.cacheReadTokens)),
    toolCalls,
    timestamp,
    requests: responses.map((r) => ({
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheWrite5mTokens: r.cacheCreationTokens - r.cacheWrite1hTokens,
      cacheWrite1hTokens: r.cacheWrite1hTokens,
      cacheReadTokens: r.cacheReadTokens,
    })),
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
