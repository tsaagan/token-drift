import { describe, it, expect } from "vitest";
import { parseSession } from "./parse-session.js";

describe("parseSession", () => {
  it("extracts turns from a minimal session", () => {
    const lines = [
      JSON.stringify({
        type: "user",
        version: "2.1.310",
        timestamp: 1700000000000,
      }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.310",
        timestamp: 1700000001000,
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            output_tokens: 500,
            cache_creation_input_tokens: 1000,
            cache_read_input_tokens: 2000,
          },
          content: [
            { type: "text", text: "hello" },
            { type: "tool_use", id: "t1", name: "Read", input: {} },
          ],
        },
      }),
    ];

    const turns = parseSession("sess-001", lines);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      sessionId: "sess-001",
      harnessVersion: "2.1.310",
      model: "claude-sonnet-4-20250514",
      outputTokens: 500,
      thinkingTokens: null,
      cacheCreationTokens: 1000,
      cacheReadTokens: 2000,
      toolCalls: 1,
    });
  });

  it("handles multiple turns in one session", () => {
    const lines = [
      JSON.stringify({ type: "user", version: "2.1.310", timestamp: 1700000000000 }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.310",
        timestamp: 1700000001000,
        message: {
          model: "claude-sonnet-4-20250514",
          usage: { output_tokens: 200 },
          content: [{ type: "text", text: "a" }],
        },
      }),
      JSON.stringify({ type: "user", version: "2.1.310", timestamp: 1700000002000 }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.310",
        timestamp: 1700000003000,
        message: {
          model: "claude-sonnet-4-20250514",
          usage: { output_tokens: 300 },
          content: [{ type: "text", text: "b" }],
        },
      }),
    ];

    const turns = parseSession("sess-002", lines);
    expect(turns).toHaveLength(2);
    expect(turns[0].outputTokens).toBe(200);
    expect(turns[1].outputTokens).toBe(300);
  });

  it("skips malformed lines without crashing", () => {
    const lines = [
      "not json",
      JSON.stringify({ type: "user", version: "2.1.310", timestamp: 1700000000000 }),
      "{truncated",
      JSON.stringify({
        type: "assistant",
        version: "2.1.310",
        timestamp: 1700000001000,
        message: {
          model: "claude-sonnet-4-20250514",
          usage: { output_tokens: 100 },
          content: [],
        },
      }),
    ];

    const turns = parseSession("sess-003", lines);
    expect(turns).toHaveLength(1);
    expect(turns[0].outputTokens).toBe(100);
  });

  it("tracks version changes mid-session", () => {
    const lines = [
      JSON.stringify({ type: "user", version: "2.1.310", timestamp: 1700000000000 }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.310",
        timestamp: 1700000001000,
        message: {
          model: "claude-sonnet-4-20250514",
          usage: { output_tokens: 100 },
          content: [],
        },
      }),
      JSON.stringify({ type: "user", version: "2.1.312", timestamp: 1700000002000 }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.312",
        timestamp: 1700000003000,
        message: {
          model: "claude-sonnet-4-20250514",
          usage: { output_tokens: 200 },
          content: [],
        },
      }),
    ];

    const turns = parseSession("sess-004", lines);
    expect(turns).toHaveLength(2);
    expect(turns[0].harnessVersion).toBe("2.1.310");
    expect(turns[1].harnessVersion).toBe("2.1.312");
  });

  it("extracts thinking tokens from output_tokens_details", () => {
    const lines = [
      JSON.stringify({ type: "user", version: "2.1.322", timestamp: 1700000000000 }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.322",
        timestamp: 1700000001000,
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            output_tokens: 800,
            output_tokens_details: { thinking_tokens: 500 },
          },
          content: [{ type: "text", text: "thought hard" }],
        },
      }),
    ];

    const turns = parseSession("sess-005", lines);
    expect(turns[0].thinkingTokens).toBe(500);
    expect(turns[0].outputTokens).toBe(800);
  });

  it("handles assistant messages with null or missing message field", () => {
    const lines = [
      JSON.stringify({ type: "user", version: "2.1.310", timestamp: 1700000000000 }),
      JSON.stringify({ type: "assistant", version: "2.1.310", timestamp: 1700000001000, message: null }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.310",
        timestamp: 1700000002000,
        message: {
          model: "claude-sonnet-4-20250514",
          usage: { output_tokens: 100 },
          content: [],
        },
      }),
    ];

    const turns = parseSession("sess-006", lines);
    expect(turns).toHaveLength(1);
    expect(turns[0].outputTokens).toBe(100);
  });
});

const line = (o: object): string => JSON.stringify(o);
const usage = (output_tokens: number) => ({
  input_tokens: 2,
  output_tokens,
  cache_creation_input_tokens: 500,
  cache_read_input_tokens: 20000,
});
const assistant = (id: string | undefined, out: number, block: unknown): string =>
  line({
    type: "assistant",
    version: "2.1.310",
    timestamp: "2026-03-11T02:40:21.000Z",
    message: { id, model: "claude-opus-4-6", usage: usage(out), content: [block] },
  });
const prompt = (text: string): string =>
  line({
    type: "user",
    version: "2.1.310",
    timestamp: "2026-03-11T02:40:20.000Z",
    message: { role: "user", content: text },
  });
const toolResult = (id: string): string =>
  line({
    type: "user",
    version: "2.1.310",
    timestamp: "2026-03-11T02:40:22.000Z",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id }] },
  });

describe("parseSession on the real transcript shape", () => {
  it("skips JSON that is not a log entry instead of throwing", () => {
    const turns = parseSession("s", ["null", prompt("hi"), assistant("msg_1", 5, null)]);

    expect(turns).toHaveLength(1);
    expect(turns[0].outputTokens).toBe(5);
  });

  it("starts a new turn only on a human prompt", () => {
    const turns = parseSession("s", [
      prompt("one"),
      assistant("msg_1", 10, { type: "tool_use", id: "toolu_1" }),
      toolResult("toolu_1"),
      assistant("msg_2", 20, { type: "text" }),
      prompt("two"),
      assistant("msg_3", 30, { type: "text" }),
    ]);

    expect(turns.map((t) => t.outputTokens)).toEqual([30, 30]);
  });

  it("sums responses that carry no message id", () => {
    const turns = parseSession("s", [
      prompt("go"),
      assistant(undefined, 10, { type: "text" }),
      assistant(undefined, 20, { type: "text" }),
    ]);

    expect(turns[0].outputTokens).toBe(30);
  });

  it("takes the last usage snapshot when records of one response disagree", () => {
    const turns = parseSession("s", [
      prompt("go"),
      assistant("msg_1", 2, { type: "thinking" }),
      assistant("msg_1", 1093, { type: "text" }),
    ]);

    expect(turns[0].outputTokens).toBe(1093);
  });

  it("counts a response's usage once and every tool call in it", () => {
    const turns = parseSession("s", [
      prompt("fix the bug"),
      assistant("msg_1", 244, { type: "text" }),
      assistant("msg_1", 244, { type: "tool_use", id: "toolu_1" }),
      assistant("msg_1", 244, { type: "tool_use", id: "toolu_2" }),
      toolResult("toolu_1"),
      toolResult("toolu_2"),
      assistant("msg_2", 100, { type: "text" }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      outputTokens: 344,
      cacheCreationTokens: 1000,
      cacheReadTokens: 40000,
      toolCalls: 2,
    });
  });

  it("carries the effort level onto the turn", () => {
    const turns = parseSession("s", [
      prompt("go"),
      line({
        type: "assistant",
        version: "2.1.310",
        effort: "high",
        message: { id: "msg_1", model: "claude-opus-4-6", usage: usage(5), content: [] },
      }),
    ]);

    expect(turns[0].effort).toBe("high");
  });

  it("keeps each request's usage so cost can be priced per request", () => {
    const turns = parseSession("s", [
      prompt("go"),
      assistant("msg_1", 2, { type: "thinking" }),
      assistant("msg_1", 244, { type: "tool_use", id: "toolu_1" }),
      toolResult("toolu_1"),
      line({
        type: "assistant",
        version: "2.1.310",
        message: {
          id: "msg_2",
          model: "claude-haiku-5-5",
          usage: {
            input_tokens: 7,
            output_tokens: 100,
            cache_creation_input_tokens: 900,
            cache_creation: { ephemeral_1h_input_tokens: 700 },
            cache_read_input_tokens: 150000,
          },
          content: [{ type: "text" }],
        },
      }),
    ]);

    expect(turns[0].requests).toEqual([
      {
        model: "claude-opus-4-6",
        inputTokens: 2,
        outputTokens: 244,
        cacheWrite5mTokens: 500,
        cacheWrite1hTokens: 0,
        cacheReadTokens: 20000,
      },
      {
        model: "claude-haiku-5-5",
        inputTokens: 7,
        outputTokens: 100,
        cacheWrite5mTokens: 200,
        cacheWrite1hTokens: 700,
        cacheReadTokens: 150000,
      },
    ]);
  });
});
