# Agents Guide — gsc (Google Search Console CLI)

Docs for AI coding agents working on or with this repo.

## Build
- `npm install` — install deps
- `npm run build` — produces `dist/cli.cjs` + `dist/mcp.cjs`
- `npm run dev -- <args>` — run the CLI from source via tsx (no build)
- `npm run dev:mcp` — run the MCP server from source
- `npm run typecheck` — type-check without emitting

## Test
- `npm run smoke` — runs `scripts/smoke.sh`, the offline golden-path matrix (18 checks)
- Live API check: `node dist/cli.cjs doctor --deep --json` (needs a configured service-account key)

## Auth model
- **Service account only.** A JSON key is loaded; a JWT is signed (RS256, `node:crypto`) and exchanged for an OAuth2 access token at `oauth2.googleapis.com/token`. Token cached in-memory until ~60s before expiry. No `google-auth-library` dependency — see `src/core/auth.ts`.
- Scopes minted: `webmasters` + `indexing` (the API enforces real permission at the property level).
- Resolution: `--key-file` > `GSC_KEY_FILE` > `GOOGLE_APPLICATION_CREDENTIALS` > profile.
- `siteUrl`: URL-prefix (`https://example.com/`, trailing slash) or domain (`sc-domain:example.com`). `normalizeSiteUrl()` coerces.

## API surface (12 methods, 3 hosts — see src/core/client.ts)
- `webmasters/v3`: searchAnalytics.query, sites.*, sitemaps.*
- `searchconsole/v1`: urlInspection.index.inspect
- `indexing/v3`: urlNotifications.publish / getMetadata

## Code style
- TypeScript strict, ESM source with `.js` import extensions.
- Dep ceiling: `commander`, `@commander-js/extra-typings`, `@clack/prompts`, `picocolors`, `@modelcontextprotocol/sdk`, `zod`. No SDK for Google — raw fetch + crypto.
- Hand-roll visual output (table, banner). No chalk/ora/boxen/figlet/ink/cli-table3.

## Output contract (non-negotiable)
- **Logs → stderr. Data → stdout. Events → NDJSON on stdout.**
- `--json` auto-true when stdout is piped. Tabular commands route through `lib/rows.ts` (table | csv | markdown | envelope).
- Response envelope `{version:"2", status, command, data, metadata, error?}`. `--raw` opts out.
- Spinners on **stderr only**, silent when JSON-mode or agent detected.

## Safety & quotas
- Destructive ops (`sites remove`, `sitemaps delete`) require `--confirm <exact-value>`; `--yes` rejected under agent.
- `--dry-run=client` short-circuits **before** the network call.
- URL Inspection 2,000/day/property and Indexing 200/day/project — bulk loops `--throttle` + `--max` and warn.

## Error codes (controlled vocabulary)
`AUTH_MISSING | AUTH_INVALID | AUTH_EXPIRED | RATE_LIMIT | VALIDATION | NETWORK | UPSTREAM | NOT_FOUND | TIMEOUT | UNKNOWN`

## Exit codes
`0 ok | 1 generic | 2 usage | 3 validation | 4 auth | 5 rate_limit | 6 network | 7 not_found | 75 temp_fail`

## Commits
- Conventional: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- No `Co-Authored-By` lines, no AI attribution.

## Layout
```
src/
  lib/          infrastructure (config, output, rows, gsc helpers, run plumbing)
  core/         auth (JWT minting) + client (12 API methods) + types
  commands/     one file per command group
  mcp/          stdio MCP server + tool mapping (tools.ts)
bin/gsc         shim for Claude Code plugin PATH
.claude-plugin/ plugin.json manifest
```
