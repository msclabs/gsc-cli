# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
