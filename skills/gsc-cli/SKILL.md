---
name: gsc-cli
description: "Google Search Console CLI. Query search performance (keywords/pages ranking, what to improve), audit index coverage, inspect URLs for errors, manage sitemaps, request indexing — JSON-first output."
when_to_use: "Use for any Search Console task: 'how are we ranking', 'what keywords', 'what to improve', 'is this page indexed', 'any coverage errors', 'submit sitemap', 'request indexing', SEO performance for selvo.co / activecalculator.com / adspoke.ai. Triggers on 'gsc', 'search console', 'how are we ranking', 'what do we rank for', 'striking distance keywords', 'is X indexed', 'index coverage', 'submit sitemap'."
allowed-tools:
  - Bash(gsc:*)
  - Bash(node:*)
  - Read
---

# gsc — Google Search Console CLI

The whole Search Console surface as one CLI: performance, coverage, URL inspection, sitemaps, indexing. Auto-JSON when piped.

## Prerequisites

`gsc` must be globally linked. If not installed:
```bash
cd ~/Documents/Code/cli/gsc-cli && npm install && npm run build && npm link
```

**Auth.** Moiz's setup uses OAuth (his own identity, project `selvo-488115`) — a key file at `~/.config/gsc/adc.json`, default site `sc-domain:selvo.co`. Already configured. Check: `gsc whoami` / `gsc doctor --deep`.

Other properties: `sc-domain:activecalculator.com`, `sc-domain:adspoke.ai`, `sc-domain:cal-mcp.com`. Pass `--site <s>` to switch per-command.

## Commands

### Performance / keywords (what we rank for, what to improve)
```bash
gsc perf keywords --range last-28d                       # top queries by clicks
gsc perf pages --range last-28d                          # top pages
gsc perf dates                                           # clicks/impr by day (probe freshness)
gsc perf opportunities --min-impressions 200             # striking-distance: high impr, pos 5-20, low CTR
gsc perf query --dim query,page,country --filter country=usa --filter query~calculator --all
```
Filters: `key=val` `key!=val` `key~regex` `key!~regex` (repeatable = AND). Dimensions: country, device, page, query, searchAppearance.
Ranges: `last-7d|last-28d|last-30d|last-90d|last-3mo|last-6mo|last-12mo|last-16mo` or `--start/--end`. Data lags 2-3 days.

### Coverage / errors / inspection
```bash
gsc inspect https://selvo.co/blog/document360-alternatives   # index status, coverage, canonicals, errors
gsc inspect --from-sitemap https://selvo.co/sitemap.xml --format ndjson   # bulk (throttled, 2000/day cap)
gsc inspect --from-perf                                       # inspect top pages from perf
gsc coverage --from-perf --top 100                            # indexed vs excluded + reason
```

### Sitemaps
```bash
gsc sitemaps list
gsc sitemaps get https://selvo.co/sitemap.xml
gsc sitemaps submit https://selvo.co/sitemap.xml
gsc sitemaps delete https://selvo.co/old.xml --confirm https://selvo.co/old.xml
```

### Properties
```bash
gsc sites list                                            # all properties + permission
gsc sites add sc-domain:example.com --confirm sc-domain:example.com
```

### Indexing (see gotchas — needs service account, not OAuth)
```bash
gsc index publish https://selvo.co/page                   # request (re)crawl
gsc index status https://selvo.co/page
```

## Output

**Auto-JSON when piped.** Tables in terminal, envelope when piped. CSV/markdown export for tabular commands.
```bash
gsc perf keywords --raw | jq -r '.[].query'               # bare array, no envelope
gsc perf keywords --format csv > keywords.csv
gsc perf opportunities --range last-28d --format ndjson   # stream
```
Envelope: `{version, status, command, data, metadata, error?}`.

## Global flags

`--json` `--raw` `--format json|ndjson|table|csv|markdown` `--site <s>` `--key-file <p>` `--profile` `--confirm <v>` `--dry-run [mode]` `--timeout <ms>` `--last` `--quiet` `--verbose`

## Exit codes

0=ok 1=generic 2=usage 3=validation 4=auth 5=rate_limit 6=network 7=not_found 75=temp_fail.

## Gotchas

- **`index publish` won't work on OAuth/ADC creds** — the Web Search Indexing API enforces an *owner* check that requires a service account. Everything else (perf, inspect, coverage, sitemaps) works fine on OAuth.
- **Google SA bug:** newly-created service accounts are rejected in the Search Console add-user UI ("email not found", ack'd 2026-05). That's why auth is OAuth-as-owner via gcloud ADC. Don't waste time re-adding a service account until Google fixes it.
- **CTR is a percentage** (0-100) in output, not a 0-1 fraction.
- **No bulk coverage API** — `coverage` / `inspect bulk` loop URL Inspection one-by-one (2,000/day/property cap). Use `--throttle` / `--max`.
- **Data lag:** recent 2-3 days are often empty. If `perf keywords` returns nothing, widen `--range` or it's just lag.
- **Search Analytics caps:** 25k rows/request (`--all` paginates), 50k/day/type, 16-month window.
- **`--format table` still emits JSON when piped** (auto-JSON on non-TTY) — that's correct; use a TTY for tables or `--format csv` for files.
- **MCP:** `gsc mcp serve` exposes sites_list, search_analytics, url_inspect, sitemaps_list, sitemap_submit, index_publish, whoami.
