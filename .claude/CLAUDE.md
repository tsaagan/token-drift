# whodrifted

Zero-config CLI that reads local Claude Code logs and shows what changed at each release — cost, performance, regressions, attributed to harness version, model, or effort.

## Stack
- TypeScript strict, ESM, zero runtime dependencies in core
- Vitest for tests, ESLint with typescript-eslint strict
- Pricing uses published Anthropic rates (src/stats/pricing.ts)

## Verify
```
npm run check
```
Runs: `tsc --noEmit && vitest run && eslint .`

## Architecture
- `src/parser/` — reads ~/.claude/projects/**/*.jsonl, emits typed Turn objects
- `src/stats/` — groups turns by boundary, computes deltas with confidence intervals, estimates cost
- `src/cli/` — diagnosis headline + table renderer, the `npx whodrifted` entry point
- `src/types.ts` — shared types, single source of truth

## Constraints
- Zero config: must work with `npx whodrifted` and nothing else
- No network calls in the default path
- Parse errors in log lines are skipped silently (logs are append-only, may be truncated)
- Cost estimates use token counts × published per-model rates. Label as estimates, never "actual spend"

## Product goals
- The "aha moment" is seeing your total spend + any regressions in the first 3 seconds
- Output must be screenshot-worthy for Twitter/Reddit sharing
- Every number shown must be defensible with a clear methodology
