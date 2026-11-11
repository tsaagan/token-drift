import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllTurns, logDirs } from "./index.js";

describe("logDirs", () => {
  it("looks in both places Claude Code has kept its logs", () => {
    expect(logDirs({}, "/home/ada")).toEqual([
      join("/home/ada", ".config", "claude", "projects"),
      join("/home/ada", ".claude", "projects"),
    ]);
  });

  it("uses CLAUDE_CONFIG_DIR instead when it is set", () => {
    expect(logDirs({ CLAUDE_CONFIG_DIR: "/data/claude" }, "/home/ada")).toEqual([
      join("/data/claude", "projects"),
    ]);
    expect(logDirs({ CLAUDE_CONFIG_DIR: "  " }, "/home/ada")).toHaveLength(2);
  });
});

describe("loadAllTurns", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "token-drift-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const session = (id: string): string =>
    [
      JSON.stringify({ type: "user", version: "2.1.310", message: { role: "user", content: "hi" } }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.310",
        message: { id, model: "claude-opus-5-5", usage: { output_tokens: 5 }, content: [] },
      }),
    ].join("\n") + "\n";

  it("reads every directory it is given and skips the ones that do not exist", () => {
    const a = join(root, "a", "projects");
    const b = join(root, "b", "projects");
    mkdirSync(join(a, "p"), { recursive: true });
    mkdirSync(join(b, "p"), { recursive: true });
    writeFileSync(join(a, "p", "s1.jsonl"), session("m1"));
    writeFileSync(join(b, "p", "s2.jsonl"), session("m2"));

    const loaded = loadAllTurns([a, join(root, "missing"), b]);

    expect(loaded.fileCount).toBe(2);
    expect(loaded.turns.map((t) => t.sessionId).sort()).toEqual(["s1", "s2"]);
  });
});
