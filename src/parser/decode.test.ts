import { describe, it, expect } from "vitest";
import { decodeLine } from "./decode.js";

const assistant = (extra: object, message: object): string =>
  JSON.stringify({ type: "assistant", version: "2.1.310", timestamp: 1700000001000, ...extra, message });

describe("decodeLine", () => {
  it.each(["null", "42", '"text"', "[]", "{truncated"])(
    "returns null for %s instead of throwing",
    (line) => {
      expect(decodeLine(line)).toBeNull();
    }
  );

  it("separates a human prompt from a tool result", () => {
    const base = { type: "user", version: "2.1.310", timestamp: "2026-03-11T02:40:20.000Z" };
    const prompt = JSON.stringify({ ...base, message: { role: "user", content: "fix the bug" } });
    const toolResult = JSON.stringify({
      ...base,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1" }] },
    });

    expect(decodeLine(prompt)).toEqual({ kind: "prompt", version: "2.1.310", timestamp: 1773196820000 });
    expect(decodeLine(toolResult)).toEqual({ kind: "tool_result", version: "2.1.310", timestamp: 1773196820000 });
  });

  it("decodes an assistant response", () => {
    const line = assistant(
      {},
      {
        id: "msg_1",
        model: "claude-opus-4-6",
        usage: { input_tokens: 2, output_tokens: 244, cache_creation_input_tokens: 500, cache_read_input_tokens: 20000 },
        content: [{ type: "text", text: "hi" }, { type: "tool_use", id: "toolu_1" }],
      }
    );

    expect(decodeLine(line)).toMatchObject({
      kind: "response",
      version: "2.1.310",
      timestamp: 1700000001000,
      messageId: "msg_1",
      model: "claude-opus-4-6",
      inputTokens: 2,
      outputTokens: 244,
      cacheCreationTokens: 500,
      cacheReadTokens: 20000,
      toolCalls: 1,
    });
  });

  it("distinguishes missing thinking tokens from zero and reads effort", () => {
    const base = { id: "a", model: "claude-opus-4-6", content: [] };
    const without = decodeLine(assistant({}, { ...base, usage: { output_tokens: 5 } }));
    const topLevel = decodeLine(
      assistant({ effort: "high" }, { ...base, usage: { output_tokens: 5, output_tokens_details: { thinking_tokens: 0 } } })
    );
    const onMessage = decodeLine(assistant({}, { ...base, effort: "low", usage: { output_tokens: 5 } }));

    expect(without).toMatchObject({ thinkingTokens: null, effort: null });
    expect(topLevel).toMatchObject({ thinkingTokens: 0, effort: "high" });
    expect(onMessage).toMatchObject({ effort: "low" });
  });

  it("drops synthetic, sidechain and meta records", () => {
    const usage = { output_tokens: 9 };
    expect(decodeLine(assistant({}, { model: "<synthetic>", usage, content: [] }))).toBeNull();
    expect(decodeLine(assistant({ isSidechain: true }, { model: "claude-haiku-4-5", usage, content: [] }))).toBeNull();
    expect(
      decodeLine(JSON.stringify({ type: "user", isMeta: true, message: { role: "user", content: "<local-command-stdout>" } }))
    ).toBeNull();
  });

  it("splits cache writes by lifetime when the log says which they were", () => {
    const base = { id: "a", model: "claude-opus-5-5", content: [] };
    const split = decodeLine(
      assistant({}, {
        ...base,
        usage: {
          output_tokens: 5,
          cache_creation_input_tokens: 900,
          cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 700 },
        },
      })
    );
    const unsplit = decodeLine(
      assistant({}, { ...base, usage: { output_tokens: 5, cache_creation_input_tokens: 900 } })
    );

    expect(split).toMatchObject({ cacheCreationTokens: 900, cacheWrite1hTokens: 700 });
    expect(unsplit).toMatchObject({ cacheCreationTokens: 900, cacheWrite1hTokens: 0 });
  });
});
