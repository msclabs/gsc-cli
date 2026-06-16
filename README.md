```
 ██████╗ ███████╗ ██████╗
██╔════╝ ██╔════╝██╔════╝
██║  ███╗███████╗██║
██║   ██║╚════██║██║
╚██████╔╝███████║╚██████╗
 ╚═════╝ ╚══════╝ ╚═════╝
```

# gsc — Google Search Console CLI

> Performance, coverage, URL inspection, sitemaps, and indexing — from the terminal. Agent + MCP ready.

The whole Search Console surface as one CLI: what you rank for, what to improve, what's broken, and how to publish — with JSON-on-pipe, NDJSON streaming, CSV export, an `mcp serve` co-binary, and `--confirm` safety. Auth via a Google **service account** (headless / CI / agent friendly).

## Quick start

```bash
npm install && npm run build

# 1. Enable the "Google Search Console API" (+ "Web Search Indexing API") in Google Cloud.
# 2. Create a service account, download its JSON key.
# 3. In Search Console → property → Users & permissions → add the SA email.

./dist/cli.cjs login --key-file ./key.json --default-site sc-domain:example.com
./dist/cli.cjs doctor --deep                 # verifies a live API round-trip
./dist/cli.cjs perf keywords --range last-28d
./dist/cli.cjs perf keywords --format csv > keywords.csv
./dist/cli.cjs inspect https://example.com/page
```

## Commands

| Command | Description |
|---|---|
| `login --key-file <p> [--default-site <s>]` | Configure a service-account key (refuses prompt under agent) |
| `logout` / `whoami` / `doctor [--deep]` | Credential mgmt + diagnostics |
| `schema <command>` | JSON schema for a command's output |
| `mcp serve` / `mcp info` | Run as stdio MCP server (co-binary) |
| `sites list \| get \| add \| remove` | Manage properties |
| `perf query` | Raw Search Analytics — `--dim`, `--filter`, `--all` |
| `perf keywords \| pages \| dates` | Sugar over the Performance report |
| `perf opportunities` | Striking-distance keywords (high impr, pos 5–20, low CTR) |
| `inspect <url>` | URL index status, coverage, canonicals, errors |
| `inspect --urls/--from-sitemap/--from-perf` | Bulk inspection (throttled, quota-capped) |
| `coverage` | Index-coverage audit — indexed vs. excluded + reason |
| `sitemaps list \| get \| submit \| delete` | Manage sitemaps |
| `index publish \| publish-batch \| status` | Web Search Indexing API (Google) |
| `indexnow submit \| key \| engines` | Instant-index via IndexNow (Bing/Yandex/Naver/Seznam/Yep — not Google) |

## IndexNow

The non-Google instant-index channel. No OAuth — prove ownership by hosting a `{key}.txt` file at the domain root; one submit fans out to all participating engines via `api.indexnow.org`.

```bash
gsc indexnow key set --host example.com          # store a key, prints the file + URL to host
gsc indexnow key verify --host example.com       # confirm the hosted file matches
gsc indexnow submit https://example.com/page --host example.com
gsc indexnow submit --from-sitemap https://example.com/sitemap.xml --host example.com
```

Key resolution: `--key` > `GSC_INDEXNOW_KEY` > stored host key (`~/.config/gsc/indexnow.json`). Host derives from `--host` or `--site`. IndexNow has no index-status API — submit reports only ping acceptance; for real status use `gsc inspect` (Google).

## Filters & dates

- `--filter key=val` · `key!=val` · `key~regex` · `key!~regex` — repeatable (AND). Dimensions: `country device page query searchAppearance`.
- `--range last-7d|last-28d|last-30d|last-90d|last-3mo|last-6mo|last-12mo|last-16mo` or `--start/--end`. Default `last-28d`. Data lags 2–3 days.
- `--all` auto-paginates Search Analytics (25k rows/request); `--format ndjson` streams big exports.

## Global flags

`--json` `--raw` `--format json|ndjson|table|csv|markdown` `--compact` `--quiet` `--verbose` `--no-color` `--key-file <p>` `--site <s>` `--profile` `--yes` `--confirm <value>` `--dry-run [mode]` `--timeout <ms>` `--last`

## Env vars

- `GSC_KEY_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` — service-account JSON key path
- `GSC_SITE` — default property (`sc-domain:example.com` or `https://example.com/`)
- `GSC_PROFILE` — credential profile · `GSC_JSON=1` — force JSON · `NO_COLOR` · `CI`
- `GSC_INDEXNOW_KEY` — IndexNow key (overrides the stored host key)

## Quotas (enforced/warned)

- URL Inspection: **2,000/day/property** — bulk modes throttle + cap.
- Indexing publish: **200/day/project**; officially JobPosting/BroadcastEvent only.
- Search Analytics: 25k rows/request, 50k/day/type, 16-month window.

## Using as an MCP server

```json
{ "mcpServers": { "gsc": { "command": "gsc", "args": ["mcp", "serve"],
  "env": { "GSC_KEY_FILE": "/path/key.json", "GSC_SITE": "sc-domain:example.com" } } } }
```

Tools: `sites_list`, `search_analytics`, `url_inspect`, `sitemaps_list`, `sitemap_submit`, `index_publish`, `whoami`.

## Using with Claude Code

```bash
claude --plugin-dir /path/to/gsc-cli   # `gsc` joins the Bash tool's PATH
```

## License

MIT.
