import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Turn } from "../types.js";
import { discoverSessions } from "./discover-sessions.js";
import { parseSession } from "./parse-session.js";

export function loadAllTurns(
  logDir?: string
): { turns: Turn[]; sessionCount: number; fileCount: number } {
  const dir = logDir ?? join(homedir(), ".claude", "projects");
  const sessionFiles = discoverSessions(dir);

  const allTurns: Turn[] = [];
  const sessionIds = new Set<string>();

  for (const sf of sessionFiles) {
    let raw: string;
    try {
      raw = readFileSync(sf.filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const turns = parseSession(sf.sessionId, lines);

    for (const turn of turns) {
      allTurns.push(turn);
      sessionIds.add(turn.sessionId);
    }
  }

  return {
    turns: allTurns,
    sessionCount: sessionIds.size,
    fileCount: sessionFiles.length,
  };
}
