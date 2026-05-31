#!/usr/bin/env bash
# Smoke test — offline golden-path scenarios (no live Search Console API calls).
# Live API round-trips require a service-account key; see `gsc doctor --deep`.
# Exits non-zero on any failure.
set -euo pipefail

cd "$(dirname "$0")/.."

CLI="node dist/cli.cjs"
MCP="node dist/mcp.cjs"
FAIL=0

fail()  { echo "  ✗ $*" >&2; FAIL=$((FAIL+1)); }
pass()  { echo "  ✓ $*"; }
section()  { echo; echo "== $* =="; }

if [ ! -f dist/cli.cjs ] || [ ! -f dist/mcp.cjs ]; then
  echo "dist/cli.cjs or dist/mcp.cjs missing — run \`npm run build\` first" >&2
  exit 1
fi

section "Scenario: --help / --version"
$CLI --help >/dev/null && pass "--help prints" || fail "--help failed"
$CLI --version >/dev/null && pass "--version prints" || fail "--version failed"

section "Scenario: --help --json (capability manifest)"
$CLI --help --json | jq -e '.cli.name == "gsc"' >/dev/null && pass "manifest cli.name=gsc" || fail "manifest invalid"
$CLI --help --json | jq -e '.commands | length == 12' >/dev/null && pass "12 commands" || fail "command count off"
$CLI --help --json | jq -e '.exitCodes | length == 9' >/dev/null && pass "9 exit codes" || fail "exit codes missing"

section "Scenario: doctor --json (offline)"
$CLI doctor --json | jq -e '.version == "2"' >/dev/null && pass "envelope v2" || fail "no v2 envelope"
$CLI doctor --json | jq -e '.data.cli.name == "gsc"' >/dev/null && pass "cli name in data" || fail "cli name missing"

section "Scenario: whoami auto-JSON on pipe"
OUT=$($CLI whoami 2>/dev/null)
echo "$OUT" | jq -e 'has("data")' >/dev/null && pass "whoami | pipe → JSON envelope" || fail "whoami did not auto-JSON"

section "Scenario: missing auth → exit 4"
set +e
env -u GSC_KEY_FILE -u GOOGLE_APPLICATION_CREDENTIALS GSC_PROFILE=__none__ $CLI sites list --json >/dev/null 2>&1
CODE=$?
set -e
[ "$CODE" -eq 4 ] && pass "exit 4 AUTH when no key" || fail "expected exit 4, got $CODE"

section "Scenario: destructive op without --confirm → exit 3"
set +e
GSC_KEY_FILE=/tmp/none.json $CLI sites remove sc-domain:example.com --json >/dev/null 2>&1
CODE=$?
set -e
[ "$CODE" -eq 3 ] && pass "exit 3 VALIDATION (no confirm)" || fail "expected exit 3, got $CODE"

section "Scenario: destructive op with wrong --confirm → exit 3"
set +e
GSC_KEY_FILE=/tmp/none.json $CLI sites remove sc-domain:example.com --confirm wrong --json >/dev/null 2>&1
CODE=$?
set -e
[ "$CODE" -eq 3 ] && pass "exit 3 VALIDATION (wrong confirm)" || fail "expected exit 3, got $CODE"

section "Scenario: dry-run=client short-circuits before network"
$CLI sites add sc-domain:example.com --confirm sc-domain:example.com --dry-run=client --json \
  | jq -e '.metadata.dry_run == "client"' >/dev/null && pass "client dry-run metadata present" || fail "dry-run metadata missing"
$CLI sitemaps submit https://example.com/sitemap.xml --site sc-domain:example.com --dry-run=client --json \
  | jq -e '.data.would_submit' >/dev/null && pass "sitemap submit dry-run" || fail "sitemap dry-run missing"

section "Scenario: login refusal under agent → exit 4"
set +e
CLAUDECODE=1 $CLI login --json 2>/dev/null
CODE=$?
set -e
[ "$CODE" -eq 4 ] && pass "exit 4 AUTH under agent" || fail "expected exit 4 under agent, got $CODE"

section "Scenario: MCP co-binary responds to initialize"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
RESP=$(echo "$INIT" | $MCP 2>/dev/null | head -1)
echo "$RESP" | jq -e '.result.serverInfo.name == "gsc"' >/dev/null && pass "MCP initialize ok" || fail "MCP initialize failed: $RESP"

section "Scenario: schema command"
$CLI schema "perf keywords" | jq -e '.data.type == "array"' >/dev/null && pass "schema emits JSON schema" || fail "schema missing"

section "Scenario: stderr discipline (--verbose preserves stdout JSON)"
$CLI --verbose doctor --json > /tmp/gsc_out.json 2> /tmp/gsc_err.log
jq . /tmp/gsc_out.json >/dev/null && pass "stdout parses clean at --verbose" || fail "stdout polluted at --verbose"

section "Scenario: config chain wiring"
$CLI doctor --json | jq -e '.data.project_config.keys | type == "array"' >/dev/null \
  && pass "project_config key walk present" || fail "loadConfigChain not wired"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ All smoke tests passed"
else
  echo "❌ $FAIL test(s) failed"
  exit 1
fi
