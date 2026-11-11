# whodrifted

What changed in each Claude Code release — cost, performance, and regressions, measured from your own logs.

```
$ npx whodrifted

  whodrifted · what changed in each Claude Code release
  ───────────────────────────────────────────────────────

  $626.79 estimated at API list prices · 1132 turns · 26 sessions

  ✓ No significant output changes between versions

  Version          │     n │  Output │       Δ │  $/turn │  Think │  Cache
  ─────────────────┼───────┼─────────┼─────────┼─────────┼────────┼───────
  2.1.306          │   111 │    1.5K │         │   $0.24 │    333 │  91.9%
  2.1.310          │   302 │    1.1K │         │   $0.20 │    160 │  94.7%
  2.1.311          │   276 │    1.5K │         │   $0.29 │    185 │  94.9%
  2.1.312          │    77 │     951 │         │   $0.20 │    230 │  92.7%
  2.1.314          │   116 │    1.5K │         │   $0.35 │    369 │  94.8%
  2.1.319          │   178 │    1.4K │         │   $0.39 │    179 │  96.1%
  ─────────────────┴───────┴─────────┴─────────┴─────────┴────────┴───────
```

## Install

```
npx whodrifted
```

No config. No API keys. No network calls. It reads the session logs Claude Code already writes to `~/.claude/projects/`.

## What it shows

| Column | Meaning |
|--------|---------|
| **n** | Number of turns (a turn = one prompt + response cycle) |
| **Output** | Median output tokens per turn |
| **Δ** | Change from the previous version, shown only when statistically significant (95% CI from order statistics) |
| **$/turn** | Median estimated cost per turn at Anthropic's published list prices |
| **Think** | Median thinking tokens per turn |
| **Cache** | Cache hit rate (cache reads / total cache tokens) |

When a version upgrade causes a significant change in output tokens, whodrifted attributes the cause:

- **release** — the shift holds even comparing only turns on the same model and effort level
- **model** — the most-used model changed between versions (e.g. opus → fable)
- **effort** — the effort setting changed

## Options

```
npx whodrifted [options]

  --by-version, -v   Group by harness version (default)
  --by-model, -m     Group by model
  --by-effort, -e    Group by effort setting
  --json             Machine-readable JSON output
  --compact          One-line summary for screenshots
  --help, -h         Show this help
```

## How cost is estimated

Cost = tokens × published per-model rates. The rate card covers every Claude model from 3.5 Haiku through Opus 5.5 and Fable 5.2, including:

- Separate rates for 5-minute and 1-hour cache writes
- Haiku 5.5's long-prompt pricing tier (above 100K prompt tokens)
- Per-request pricing when a single turn uses multiple models

Turns on unknown models (proxied, custom deployments) are labelled "unpriced" and excluded from cost figures — they never silently cost $0.

These are **estimates at list prices**, not invoices. Actual bills may differ due to volume discounts, committed-use tiers, or Bedrock/Vertex pricing.

## How significance is tested

Each version's median output tokens comes with a 95% confidence interval computed from order statistics (ranks n/2 ± 0.98·√n of the sorted sample). A change between two adjacent versions is flagged as significant only when their intervals don't overlap.

Versions with fewer than 20 turns are shown (marked "low n") but never used as a baseline or comparison target.

## JSON schema

`--json` outputs a stable schema for scripting and dashboards:

```jsonc
{
  "schemaVersion": 1,
  "groupBy": "harnessVersion",
  "totals": {
    "estimatedCostUsd": 626.79,
    "turns": 1132,
    "sessions": 26,
    "unpricedTurns": 0,
    "firstSeen": "2026-10-06",
    "lastSeen": "2026-11-11"
  },
  "rows": [
    {
      "key": "2.1.310",
      "turns": 302,
      "medianOutputTokens": 1100,
      "medianCostPerTurnUsd": 0.20,
      "estimatedCostUsd": 45.20,
      // ... full row fields
    }
  ],
  "changes": [
    {
      "from": "2.1.310",
      "to": "2.1.311",
      "outputTokensChange": 0.36,
      "significant": true,
      "attribution": { "cause": "release", "model": "claude-opus-4-6" }
      // ... full change fields
    }
  ]
}
```

## Privacy

whodrifted reads only local log files. It never makes network calls, sends telemetry, or uploads data. Your session logs stay on your machine.

## License

MIT
