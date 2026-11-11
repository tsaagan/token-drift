import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Turn } from "../types.js";
import { discoverSessions } from "./discover-sessions.js";
import { parseSession } from "./parse-session.js";

/**
 * Where to look for session logs. CLAUDE_CONFIG_DIR wins when set, as it does
 * for Claude Code itself; otherwise both default locations are searched.
 */
export function logDirs(
  env: Record<string, string | undefined>,
  home: string
): string[] {
  const configured = env.CLAUDE_CONFIG_DIR?.trim();
  if (configured) return [join(configured, "projects")];
  return [
    join(home, ".config", "claude", "projects"),
    join(home, ".claude", "projects"),
  ];
}

export function loadAllTurns(dirs: string[]): {
  turns: Turn[];
  fileCount: number;
} {
  const sessionFiles = dirs.flatMap(discoverSessions);
  const turns: Turn[] = [];

  for (const sf of sessionFiles) {
    let raw: string;
    try {
      raw = readFileSync(sf.filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    for (const turn of parseSession(sf.sessionId, lines)) turns.push(turn);
  }

  return { turns, fileCount: sessionFiles.length };
}
