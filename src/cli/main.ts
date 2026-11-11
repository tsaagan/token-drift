import { loadAllTurns, logDirs } from "../parser/index.js";
import { buildReport } from "../stats/report.js";
import type { BoundaryKey } from "../types.js";
import { palette, shouldUseColor } from "./color.js";
import {
  renderCompact,
  renderDiagnosis,
  renderJson,
  renderSummary,
  renderTable,
} from "./render.js";

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type Format = "table" | "json" | "compact";

interface Options {
  groupBy: BoundaryKey["field"];
  format: Format;
}

const USAGE = `
  token-drift: what changed in each Claude Code release

  Usage: npx token-drift [options]

  Options:
    --by-version, -v   Group by Claude Code version (default)
    --by-model, -m     Group by model
    --by-effort, -e    Group by effort level
    --json             Print the report as JSON
    --compact          Print a short summary instead of the table
    --help, -h         Show this help
`;

/** The whole CLI as a function of its inputs, so every path can be tested. */
export function main(
  argv: string[],
  env: Record<string, string | undefined>,
  home: string,
  isTTY: boolean | undefined
): CliResult {
  const parsed = parseArgs(argv);
  if (parsed === "help") return { stdout: USAGE, stderr: "", exitCode: 0 };
  if ("unknown" in parsed) {
    return {
      stdout: "",
      stderr: `Unknown option: ${parsed.unknown}\nRun token-drift --help to see the options.`,
      exitCode: 1,
    };
  }

  const dirs = logDirs(env, home);
  const { turns, fileCount } = loadAllTurns(dirs);
  const report = buildReport(turns, parsed.groupBy);

  // A script piping --json into jq needs JSON even when there is nothing to report.
  if (parsed.format === "json") return ok(renderJson(report));
  if (turns.length === 0) return ok(renderNoLogs(dirs, fileCount, home));

  const p = palette(shouldUseColor(env, isTTY));
  if (parsed.format === "compact") return ok(renderCompact(report, p));
  return ok(
    [renderDiagnosis(report, p), renderTable(report, p), renderSummary(report, p)].join("\n")
  );
}

function ok(stdout: string): CliResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function parseArgs(args: string[]): Options | "help" | { unknown: string } {
  const options: Options = { groupBy: "harnessVersion", format: "table" };

  for (const arg of args) {
    switch (arg) {
      case "--by-version":
      case "-v":
        options.groupBy = "harnessVersion";
        break;
      case "--by-model":
      case "-m":
        options.groupBy = "model";
        break;
      case "--by-effort":
      case "-e":
        options.groupBy = "effort";
        break;
      case "--json":
        options.format = "json";
        break;
      case "--compact":
        options.format = "compact";
        break;
      case "--help":
      case "-h":
        return "help";
      default:
        return { unknown: arg };
    }
  }
  return options;
}

function renderNoLogs(dirs: string[], fileCount: number, home: string): string {
  const shown = dirs.map((dir) =>
    dir.startsWith(home) ? "~" + dir.slice(home.length) : dir
  );
  const headline =
    fileCount === 0
      ? "No Claude Code sessions found."
      : `Found ${fileCount} log ${fileCount === 1 ? "file" : "files"}, but no finished turns in ${fileCount === 1 ? "it" : "them"} yet.`;

  return [
    "",
    `  ${headline}`,
    "",
    "  Looked in:",
    ...shown.map((dir) => `    ${dir}`),
    "",
    "  token-drift reads the logs Claude Code writes as you use it, so there",
    "  is nothing to show until you have run a session. If your logs are",
    "  somewhere else, set CLAUDE_CONFIG_DIR to that folder.",
    "",
  ].join("\n");
}
