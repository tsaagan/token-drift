export interface PromptRecord {
  kind: "prompt";
  version: string | null;
  timestamp: number | null;
}

export interface ToolResultRecord {
  kind: "tool_result";
  version: string | null;
  timestamp: number | null;
}

export interface ResponseRecord {
  kind: "response";
  version: string | null;
  timestamp: number | null;
  messageId: string | null;
  model: string;
  effort: string | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number | null;
  cacheCreationTokens: number;
  /** The part of cacheCreationTokens written to the 1-hour cache; the rest is 5-minute. */
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
  toolCalls: number;
}

export type LogRecord = PromptRecord | ToolResultRecord | ResponseRecord;

export function decodeLine(line: string): LogRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  if (raw.isSidechain === true || raw.isMeta === true) return null;

  const version = str(raw.version);
  const timestamp = toEpochMs(raw.timestamp);
  const message = isObject(raw.message) ? raw.message : null;

  if (raw.type === "user") {
    const content = message?.content;
    const isToolResult =
      Array.isArray(content) &&
      content.length > 0 &&
      content.every((b) => isObject(b) && b.type === "tool_result");
    return { kind: isToolResult ? "tool_result" : "prompt", version, timestamp };
  }

  if (raw.type !== "assistant" || !message) return null;

  const model = str(message.model);
  const usage = isObject(message.usage) ? message.usage : null;
  const outputTokens = count(usage?.output_tokens);
  if (!model || model === "<synthetic>" || outputTokens === null) return null;

  const details = isObject(usage?.output_tokens_details)
    ? usage.output_tokens_details
    : null;
  const cacheCreation = isObject(usage?.cache_creation)
    ? usage.cache_creation
    : null;
  const cacheCreationTokens = count(usage?.cache_creation_input_tokens) ?? 0;
  const blocks = Array.isArray(message.content) ? message.content : [];

  return {
    kind: "response",
    version,
    timestamp,
    messageId: str(message.id),
    model,
    effort: str(raw.effort) ?? str(message.effort),
    inputTokens: count(usage?.input_tokens) ?? 0,
    outputTokens,
    thinkingTokens: count(details?.thinking_tokens),
    cacheCreationTokens,
    cacheWrite1hTokens: Math.min(
      cacheCreationTokens,
      count(cacheCreation?.ephemeral_1h_input_tokens) ?? 0
    ),
    cacheReadTokens: count(usage?.cache_read_input_tokens) ?? 0,
    toolCalls: blocks.filter((b) => isObject(b) && b.type === "tool_use").length,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function count(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function toEpochMs(v: unknown): number | null {
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return v > 1e12 ? v : v * 1000;
  }
  return null;
}
