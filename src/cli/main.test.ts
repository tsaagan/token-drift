import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./main.js";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "token-drift-home-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** Writes one session of `turns` prompt/response pairs under `configDir`/projects. */
function writeSession(configDir: string, turns: number): void {
  const lines: string[] = [];
  for (let i = 0; i < turns; i++) {
    lines.push(
      JSON.stringify({
        type: "user",
        version: "2.1.310",
        timestamp: "2026-11-01T10:00:00.000Z",
        message: { role: "user", content: "hi" },
      }),
      JSON.stringify({
        type: "assistant",
        version: "2.1.310",
        timestamp: "2026-11-01T10:00:05.000Z",
        message: {
          id: `msg_${i}`,
          model: "claude-opus-5-5",
          usage: { output_tokens: 400, cache_read_input_tokens: 9000, cache_creation_input_tokens: 1000 },
          content: [{ type: "text" }],
        },
      })
    );
  }
  const dir = join(configDir, "projects", "-Users-ada-app");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "session-1.jsonl"), lines.join("\n") + "\n");
}

const run = (argv: string[], env: Record<string, string | undefined> = {}) =>
  main(argv, env, home, false);

describe("main", () => {
  it("rejects an unknown flag, pointing at --help, with exit code 1", () => {
    const result = run(["--wat"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown option: --wat");
    expect(result.stderr).toContain("token-drift --help");
  });

  it("rejects a stray word instead of ignoring it", () => {
    expect(run(["wat"])).toMatchObject({ exitCode: 1, stdout: "" });
  });

  it("prints usage for --help", () => {
    const result = run(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--by-model");
    expect(result.stdout).toContain("--json");
  });

  it("says where it looked when there are no logs", () => {
    const result = run([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No Claude Code sessions found");
    expect(result.stdout).toContain("~/.claude/projects");
    expect(result.stdout).toContain("~/.config/claude/projects");
    expect(result.stdout).toContain("CLAUDE_CONFIG_DIR");
  });

  it("says so when log files exist but hold no finished turn", () => {
    const dir = join(home, ".claude", "projects", "p");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "s.jsonl"), '{"type":"user","message":{"content":"hi"}}\n');

    expect(run([]).stdout).toContain("Found 1 log file, but no finished turns");
  });

  it("still prints valid JSON for --json when there are no logs", () => {
    const result = run(["--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      totals: { turns: 0, sessions: 0, estimatedCostUsd: 0 },
      rows: [],
      changes: [],
    });
  });

  it("reads the default log directory", () => {
    writeSession(join(home, ".claude"), 3);

    expect(JSON.parse(run(["--json"]).stdout).totals.turns).toBe(3);
  });

  it("reads CLAUDE_CONFIG_DIR instead of the defaults when it is set", () => {
    const custom = join(home, "elsewhere");
    writeSession(custom, 2);
    writeSession(join(home, ".claude"), 5);

    const result = run(["--json"], { CLAUDE_CONFIG_DIR: custom });

    expect(JSON.parse(result.stdout).totals.turns).toBe(2);
  });

  it("groups by model or effort when asked", () => {
    writeSession(join(home, ".claude"), 3);

    expect(JSON.parse(run(["--json", "--by-model"]).stdout).rows[0].key).toBe("claude-opus-5-5");
    expect(JSON.parse(run(["--json", "-e"]).stdout).groupBy).toBe("effort");
  });
});
