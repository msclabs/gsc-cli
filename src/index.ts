import { Command } from '@commander-js/extra-typings'
import { CLI_NAME, VERSION, ENV_PREFIX } from './lib/constants.js'
import { detectAgent } from './lib/agent.js'
import { readLast } from './lib/cache.js'
import type { GlobalOpts } from './lib/config.js'
import { banner } from './lib/banner.js'
import { isInteractive } from './lib/tty.js'

import { makeLoginCommand } from './commands/login.js'
import { makeLogoutCommand } from './commands/logout.js'
import { makeWhoamiCommand } from './commands/whoami.js'
import { makeDoctorCommand } from './commands/doctor.js'
import { makeSchemaCommand } from './commands/schema.js'
import { makeMcpCommand } from './commands/mcp.js'
import { makeSitesCommand } from './commands/sites.js'
import { makePerfCommand } from './commands/perf.js'
import { makeInspectCommand } from './commands/inspect.js'
import { makeCoverageCommand } from './commands/coverage.js'
import { makeSitemapsCommand } from './commands/sitemaps.js'
import { makeIndexCommand } from './commands/index-cmd.js'
import { makeIndexNowCommand } from './commands/indexnow.js'

// --help --json — capability manifest for agent self-discovery.
if (process.argv.includes('--help') && process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(buildManifest(), null, 2) + '\n')
  process.exit(0)
}

// --last replay (wit pattern).
if (process.argv.includes('--last')) {
  const last = readLast()
  if (last) { process.stdout.write(JSON.stringify(last, null, 2) + '\n'); process.exit(0) }
  process.stderr.write('No cached result yet.\n')
  process.exit(7)
}

const program = new Command()
  .name(CLI_NAME)
  .description('Google Search Console CLI — performance, coverage, inspection, sitemaps, indexing. Agent + MCP ready.')
  .version(VERSION, '-v, --version')
  .option('--json', 'output JSON envelope')
  .option('--raw', 'bare data, no envelope')
  .option('--format <fmt>', 'json | ndjson | table | csv | markdown')
  .option('--compact', 'single-line JSON')
  .option('--quiet', 'suppress informational output')
  .option('--verbose', 'debug logs to stderr')
  .option('--no-color', 'disable ANSI color')
  .option('--key-file <path>', 'service-account JSON key (overrides env + profile)')
  .option('--site <siteUrl>', 'default property for commands')
  .option('--profile <name>', 'credential profile')
  .option('--yes', 'skip confirm prompts (humans only; rejected under agent)')
  .option('--confirm <value>', 'exact-match destructive-op guard')
  .option('--dry-run [mode]', 'none | client | server (default: client when flag bare)')
  .option('--timeout <ms>', 'network timeout', (v) => parseInt(v, 10))

const globalOpts = (): GlobalOpts => program.opts() as unknown as GlobalOpts

program.addCommand(makeLoginCommand(globalOpts))
program.addCommand(makeLogoutCommand(globalOpts))
program.addCommand(makeWhoamiCommand(globalOpts))
program.addCommand(makeDoctorCommand(globalOpts))
program.addCommand(makeSchemaCommand(globalOpts))
program.addCommand(makeMcpCommand(globalOpts))
program.addCommand(makeSitesCommand(globalOpts))
program.addCommand(makePerfCommand(globalOpts))
program.addCommand(makeInspectCommand(globalOpts))
program.addCommand(makeCoverageCommand(globalOpts))
program.addCommand(makeSitemapsCommand(globalOpts))
program.addCommand(makeIndexCommand(globalOpts))
program.addCommand(makeIndexNowCommand(globalOpts))

if (process.argv.length <= 2) {
  if (isInteractive()) process.stderr.write(banner())
  program.help()
}

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})

function buildManifest() {
  return {
    cli: { name: CLI_NAME, version: VERSION },
    description: 'Google Search Console CLI',
    commands: [
      { name: 'login', description: 'Configure a service-account key + default site' },
      { name: 'logout', description: 'Remove a credential profile' },
      { name: 'whoami', description: 'Auth status, service account, detected agent' },
      { name: 'doctor', description: 'Diagnostics (--deep for live API round-trip)' },
      { name: 'schema', description: 'Emit JSON schema for a command output' },
      { name: 'mcp', description: 'MCP server management (serve | info)' },
      { name: 'sites', description: 'list | get | add | remove — manage properties' },
      { name: 'perf', description: 'query | keywords | pages | dates | opportunities — search analytics' },
      { name: 'inspect', description: 'URL index status / coverage / errors (single or bulk)' },
      { name: 'coverage', description: 'Index-coverage audit over top pages / sitemap' },
      { name: 'sitemaps', description: 'list | get | submit | delete' },
      { name: 'index', description: 'publish | publish-batch | status — Web Search Indexing API (Google)' },
      { name: 'indexnow', description: 'submit | key | engines — instant-index via IndexNow (Bing/Yandex/Naver/Seznam/Yep)' },
    ],
    globalOptions: [
      '--json', '--raw', '--format', '--compact', '--quiet', '--verbose',
      '--no-color', '--key-file', '--site', '--profile', '--yes', '--confirm',
      '--dry-run', '--timeout', '--last',
    ],
    envVars: [
      { name: `${ENV_PREFIX}_KEY_FILE`, description: 'Service-account JSON key path' },
      { name: 'GOOGLE_APPLICATION_CREDENTIALS', description: 'Service-account JSON key path (standard Google var)' },
      { name: `${ENV_PREFIX}_SITE`, description: 'Default property (siteUrl)' },
      { name: `${ENV_PREFIX}_PROFILE`, description: 'Credential profile' },
      { name: `${ENV_PREFIX}_INDEXNOW_KEY`, description: 'IndexNow key (overrides stored host key)' },
      { name: `${ENV_PREFIX}_JSON`, description: 'Set to 1 to force JSON output' },
      { name: 'NO_COLOR', description: 'Disable ANSI color' },
      { name: 'CI', description: 'Force non-interactive mode' },
    ],
    exitCodes: [
      { code: 0, name: 'SUCCESS' }, { code: 1, name: 'GENERIC' }, { code: 2, name: 'USAGE' },
      { code: 3, name: 'VALIDATION' }, { code: 4, name: 'AUTH' }, { code: 5, name: 'RATE_LIMIT' },
      { code: 6, name: 'NETWORK' }, { code: 7, name: 'NOT_FOUND' }, { code: 75, name: 'TEMP_FAIL' },
    ],
    errorCodes: ['AUTH_MISSING', 'AUTH_INVALID', 'AUTH_EXPIRED', 'RATE_LIMIT', 'VALIDATION', 'NETWORK', 'UPSTREAM', 'NOT_FOUND', 'TIMEOUT', 'UNKNOWN'],
    mcp: { subcommand: 'mcp serve', transport: 'stdio' },
    agent: { detected: detectAgent() },
  }
}
