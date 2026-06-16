---
name: gsc
description: "Google Search Console CLI. Use when an agent needs search performance data (keywords/pages ranking, what to improve), index-coverage audits, per-URL inspection (errors, canonicals, indexing state), sitemap management, to request indexing (Google), or to instant-index via IndexNow (Bing/Yandex/Naver/Seznam/Yep). Every command supports --json (auto-true on pipe), --format csv|ndjson|markdown, --raw. Auth via Google service account (IndexNow needs no auth — just a hosted key file)."
---

# gsc — Google Search Console CLI

## When to use
- "How are we ranking?" → `gsc perf keywords` / `gsc perf pages`
- "What should we improve?" → `gsc perf opportunities` (striking-distance keywords)
- "Is this page indexed? Any errors?" → `gsc inspect <url>`
- "Audit coverage across the site" → `gsc coverage --from-sitemap <url>`
- "Manage / submit sitemaps" → `gsc sitemaps list|submit`
- "Request (re)indexing on Google" → `gsc index publish <url>`
- "Instant-index on Bing/Yandex/etc (not Google)" → `gsc indexnow submit <url>`

## Auth (service account)
1. Google Cloud: enable **Google Search Console API** (+ **Web Search Indexing API** for `index *`).
2. Create a service account → JSON key.
3. In Search Console → property → Settings → Users & permissions → add the SA email (Owner if you need the Indexing API).
4. `gsc login --key-file ./key.json --default-site sc-domain:example.com`
   - Or set `GSC_KEY_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` + `GSC_SITE`.
   - Under a detected agent, interactive `login` refuses and exits 4 — pass `--key-file` or set the env vars.

`siteUrl` is either a URL-prefix property (`https://example.com/`) or a domain property (`sc-domain:example.com`).

## Quick commands
- `gsc doctor --deep --json` — diagnostics + live API round-trip
- `gsc sites list` — properties + permission levels
- `gsc perf keywords --site sc-domain:example.com --range last-28d` — top queries
- `gsc perf query --dim query,page,country --filter country=usa --filter query~calculator --all`
- `gsc perf opportunities --min-impressions 200` — high-impression, position 5–20, low CTR
- `gsc inspect https://example.com/page --site sc-domain:example.com`
- `gsc inspect --from-sitemap https://example.com/sitemap.xml --format ndjson` — bulk stream
- `gsc coverage --from-perf --top 100` — indexed vs. excluded + reason
- `gsc sitemaps list` · `gsc sitemaps submit https://example.com/sitemap.xml`
- `gsc index publish https://example.com/page` · `gsc index status <url>`
- `gsc mcp serve` — run as stdio MCP server

## IndexNow (Bing, Yandex, Naver, Seznam, Yep — NOT Google)
IndexNow is the non-Google instant-index channel. No OAuth: ownership is proven by hosting a `{key}.txt` file at the domain root. One submit fans out to every participating engine via `api.indexnow.org`. For Google, use `gsc index` / `gsc sitemaps` — Google never adopted IndexNow.
- `gsc indexnow key generate` — print a fresh 32-hex key
- `gsc indexnow key set --host example.com` — store a key (generates if `--key` omitted); prints the file + URL you must host
- `gsc indexnow key verify --host example.com` — fetch the hosted file and confirm it matches
- `gsc indexnow submit <url...> --host example.com` — 1 URL = GET, many = batched POST (≤10k/request)
- `gsc indexnow submit --from-sitemap https://example.com/sitemap.xml` — submit every `<loc>` (also `--urls <file>`, `--from-stdin`)
- `gsc indexnow engines` — list participating engines
- Key resolution: `--key` > `GSC_INDEXNOW_KEY` > stored host key (`~/.config/gsc/indexnow.json`). Host derives from `--host` or the `--site`/default-site chain.
- No "did it index?" status API exists in IndexNow — submit returns only whether the ping was accepted (HTTP 200/202). For real index status, use `gsc inspect` (Google).

## Filters & dates
- `--filter key=val` (equals) · `key!=val` · `key~regex` (include) · `key!~regex` (exclude). Repeatable = AND. Dimensions: country, device, page, query, searchAppearance.
- `--range last-7d|last-28d|last-30d|last-90d|last-3mo|last-6mo|last-12mo|last-16mo`, or explicit `--start/--end`. Default last-28d. Data lags 2–3 days.

## Output modes
- Default (TTY): table · piped / `--json` / `GSC_JSON=1`: envelope `{version, status, command, data, metadata, error?}`
- `--format ndjson` (with `--all` / bulk): line-delimited events `{type, timestamp, sequence, payload}`
- `--format csv|markdown`: tabular export (perf, sites, sitemaps) · `--raw`: bare data

## Safety & limits
- Destructive ops (`sites remove`, `sitemaps delete`) require `--confirm <exact-value>`. `--dry-run=client` previews.
- URL Inspection: **2,000/day/property** — bulk modes throttle (`--throttle`) and cap (`--max`).
- Indexing publish: **200/day/project**, officially JobPosting/BroadcastEvent only (the CLI warns).
- Search Analytics: 25k rows/request (auto-paginated with `--all`), 16-month window.

## Error codes
`AUTH_MISSING, AUTH_INVALID, AUTH_EXPIRED, RATE_LIMIT, VALIDATION, NETWORK, UPSTREAM, NOT_FOUND, TIMEOUT, UNKNOWN`

## Exit codes
0 ok · 1 generic · 2 usage · 3 validation · 4 auth · 5 rate-limit · 6 network · 7 not-found · 75 temp-fail
