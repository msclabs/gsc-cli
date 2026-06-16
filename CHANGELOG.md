# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] — 2026-06-17

### Added
- **IndexNow:** `indexnow submit|key|engines` — instant-index URLs on the non-Google engines (Bing, Yandex, Naver, Seznam, Yep). One submit fans out to all via `api.indexnow.org`.
  - `indexnow key generate|set|show|verify` — host-scoped keys in `~/.config/gsc/indexnow.json`; `set` prints the `{key}.txt` file + URL to host; `verify` fetches it and confirms the match.
  - `indexnow submit` — single URL via GET, many via batched POST (≤10k/request). Sources: args, `--urls <file>`, `--from-sitemap <url>` (parses `<loc>`), `--from-stdin`. Dedups + filters to http(s). `--dry-run=client` previews.
  - Host derives from `--host` or the `--site`/default-site chain; key from `--key` > `GSC_INDEXNOW_KEY` > stored.
  - No auth (ownership = hosted key file). No status API — submit reports only ping acceptance (HTTP 200/202).
- **MCP:** added `indexnow_submit` tool (8 tools total).

## [0.1.0] — 2026-05-31

### Added
- Initial release of `gsc` — Google Search Console CLI covering the full API surface.
- **Auth:** service-account JWT minting (RS256 via `node:crypto`, no `google-auth-library`), in-memory token cache. Resolution chain `--key-file` > `GSC_KEY_FILE` > `GOOGLE_APPLICATION_CREDENTIALS` > profile.
- **Sites:** `sites list|get|add|remove` (`sites.*`).
- **Performance:** `perf query|keywords|pages|dates` (`searchanalytics.query`) with terse `--filter` syntax (`=`,`!=`,`~`,`!~`), date presets (`--range last-28d` …), `--all` auto-pagination, flattened named-dimension rows.
- **Derived:** `perf opportunities` (striking-distance: high impressions, position 5–20, low CTR).
- **Inspection:** `inspect <url>` + bulk (`--urls`, `--from-sitemap`, `--from-perf`) with throttle + daily-quota cap (`urlInspection.index.inspect`).
- **Coverage:** `coverage` index-audit — indexed vs. excluded + reason, sourced from perf/sitemap.
- **Sitemaps:** `sitemaps list|get|submit|delete` (`sitemaps.*`).
- **Indexing:** `index publish|publish-batch|status` (Web Search Indexing API) with quota warnings.
- Response envelope v2, auto-JSON on pipe, NDJSON streaming, CSV/markdown export for tabular commands.
- `mcp serve` co-binary with 7 tools (sites_list, search_analytics, url_inspect, sitemaps_list, sitemap_submit, index_publish, whoami).
- `--help --json` capability manifest, `schema <command>`, agent detection.
- `--confirm <value>` guard + `--dry-run` on destructive ops (sites remove, sitemaps delete).
- 9 typed exit codes + 10-code controlled error vocabulary; `doctor --deep` live round-trip.
- `.claude-plugin/plugin.json` + `bin/gsc`, `AGENTS.md` + `SKILL.md`, 18-scenario offline smoke suite, CI matrix (Node 20, 22).
