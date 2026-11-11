import { readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

export interface SessionFile {
  sessionId: string;
  filePath: string;
}

export function discoverSessions(baseDir: string): SessionFile[] {
  if (!existsSync(baseDir)) return [];

  const results: SessionFile[] = [];
  walk(baseDir, results);
  return results;
}

function walk(dir: string, results: SessionFile[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // <session>/subagents/agent-*.jsonl is subagent traffic, not a session.
      if (entry.name !== "subagents") walk(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push({
        sessionId: basename(entry.name, ".jsonl"),
        filePath: fullPath,
      });
    }
  }
}
