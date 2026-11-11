import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { discoverSessions } from "./discover-sessions.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, "__test-logs__");

beforeEach(() => {
  mkdirSync(join(TEST_DIR, "proj-a"), { recursive: true });
  mkdirSync(join(TEST_DIR, "proj-b"), { recursive: true });

  writeFileSync(
    join(TEST_DIR, "proj-a", "sess-001.jsonl"),
    '{"type":"user","version":"2.1.310","timestamp":1700000000000}\n'
  );
  writeFileSync(
    join(TEST_DIR, "proj-b", "sess-002.jsonl"),
    '{"type":"user","version":"2.1.312","timestamp":1700000001000}\n'
  );
  writeFileSync(join(TEST_DIR, "proj-a", "not-a-session.txt"), "ignore me");
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("discoverSessions", () => {
  it("finds all .jsonl files recursively", () => {
    const sessions = discoverSessions(TEST_DIR);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sessionId).sort()).toEqual([
      "sess-001",
      "sess-002",
    ]);
  });

  it("returns file paths that exist", () => {
    const sessions = discoverSessions(TEST_DIR);
    for (const s of sessions) {
      expect(s.filePath).toContain(".jsonl");
    }
  });

  it("returns empty array for non-existent directory", () => {
    const sessions = discoverSessions("/tmp/does-not-exist-whodrifted");
    expect(sessions).toEqual([]);
  });

  it("does not count subagent transcripts as sessions", () => {
    const subagents = join(TEST_DIR, "proj-a", "sess-001", "subagents");
    mkdirSync(subagents, { recursive: true });
    writeFileSync(join(subagents, "agent-abc.jsonl"), "{}\n");

    const sessions = discoverSessions(TEST_DIR);
    expect(sessions.map((s) => s.sessionId).sort()).toEqual([
      "sess-001",
      "sess-002",
    ]);
  });
});
