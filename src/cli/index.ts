#!/usr/bin/env node

import { loadAllTurns } from "../parser/index.js";
import { buildReport } from "../stats/report.js";
import {
  renderDiagnosis,
  renderTable,
  renderSummary,
  renderJson,
  renderCompact,
} from "./render.js";
import { palette, shouldUseColor } from "./color.js";
import type { BoundaryKey } from "../types.js";

type Format = "table" | "json" | "compact";

interface Options {
  groupBy: BoundaryKey["field"];
  format: Format;
}

export function run(argv: string[]): void {
  const opts = parseArgs(argv);
  const { turns } = loadAllTurns();

  if (turns.length === 0) {
    console.log("\n  No Claude Code logs found.");
    console.log("  Looked in: ~/.claude/projects/**/*.jsonl");
    console.log(
      "  Set CLAUDE_CONFIG_DIR if your logs are elsewhere.\n"
    );
    process.exit(0);
  }

  const report = buildReport(turns, opts.groupBy);
  const p = palette(shouldUseColor(process.env, process.stdout.isTTY));

  switch (opts.format) {
    case "json":
      console.log(renderJson(report));
      break;
    case "compact":
      console.log(renderCompact(report, p));
      break;
    case "table":
      console.log(renderDiagnosis(report, p));
      console.log(renderTable(report, p));
      console.log(renderSummary(report, p));
      break;
  }
}

function parseArgs(args: string[]): Options {
  let groupBy: BoundaryKey["field"] = "harnessVersion";
  let format: Format = "table";

  for (const arg of args) {
    switch (arg) {
      case "--by-model":
      case "-m":
        groupBy = "model";
        break;
      case "--by-effort":
      case "-e":
        groupBy = "effort";
        break;
      case "--by-version":
      case "-v":
        groupBy = "harnessVersion";
        break;
      case "--json":
        format = "json";
        break;
      case "--compact":
        format = "compact";
        break;
      case "--help":
      case "-h":
        console.log(`
  whodrifted — what changed in each Claude Code release

  Usage: npx whodrifted [options]

  Options:
    --by-version, -v   Group by harness version (default)
    --by-model, -m     Group by model
    --by-effort, -e    Group by effort setting
    --json             Output as JSON (for scripting)
    --compact          One-line summary (for screenshots)
    --help, -h         Show this help
`);
        process.exit(0);
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`  Unknown flag: ${arg}`);
          console.error("  Run whodrifted --help for usage.\n");
          process.exit(1);
        }
    }
  }

  return { groupBy, format };
}

run(process.argv.slice(2));
