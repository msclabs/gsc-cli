import { Command } from '@commander-js/extra-typings'
import pc from 'picocolors'
import {
  resolveKeyFile, getKeyFileSource, getActiveProfile, getCredentialsPath, resolveSite, loadConfigChain,
} from '../lib/config.js'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope, shouldOutputJson } from '../lib/output.js'
import { detectAgent } from '../lib/agent.js'
import { VERSION, CLI_NAME } from '../lib/constants.js'
import { makeLogger } from '../lib/logger.js'
import { loadKeyFile } from '../core/auth.js'
import { makeClient } from '../core/client.js'

export function makeDoctorCommand(globalOpts: () => GlobalOpts): Command {
  return new Command('doctor')
    .description('Run diagnostics: version, auth, key file, config, agent, API reach')
    .option('--deep', 'Include a live sites.list round-trip')
    .action(async (opts) => {
      const g = globalOpts()
      const log = makeLogger(g)
      const keyFile = resolveKeyFile(g)
      const projectConfig = loadConfigChain()
      const projectConfigKeys = Object.keys(projectConfig)

      let keyValid = false
      let email: string | null = null
      let keyError: string | null = null
      if (keyFile) {
        try {
          email = loadKeyFile(keyFile).client_email
          keyValid = true
        } catch (e) {
          keyError = e instanceof Error ? e.message : String(e)
        }
      }

      let deep: { sites_reachable: boolean; site_count?: number; error?: string } | null = null
      if (opts.deep && keyValid && keyFile) {
        try {
          const sites = await makeClient(loadKeyFile(keyFile), { timeoutMs: g.timeout }).listSites()
          deep = { sites_reachable: true, site_count: sites.length }
        } catch (e) {
          deep = { sites_reachable: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      const checks = {
        cli: { name: CLI_NAME, version: VERSION, node: process.version },
        auth: {
          profile: g.profile ?? getActiveProfile(),
          key_present: Boolean(keyFile),
          key_valid: keyValid,
          key_error: keyError,
          source: keyFile ? getKeyFileSource(g) : null,
          service_account: email,
          credentials_path: getCredentialsPath(),
          default_site: resolveSite(g),
        },
        agent: { detected: detectAgent() },
        env: {
          NO_COLOR: Boolean(process.env.NO_COLOR),
          CI: Boolean(process.env.CI),
          stdout_is_tty: Boolean(process.stdout.isTTY),
        },
        project_config: {
          keys: projectConfigKeys,
          count: projectConfigKeys.length,
          note: projectConfigKeys.length === 0 ? `no .${CLI_NAME}.json found in cwd→root walk` : undefined,
        },
        mcp: { co_binary: 'dist/mcp.cjs', subcommand: `${CLI_NAME} mcp serve` },
        deep,
      }
      log.debug(`doctor: key_valid=${keyValid} agent=${checks.agent.detected ?? 'none'}`)

      const status = keyValid && (!deep || deep.sites_reachable) ? 'success' : 'partial_success'

      if (shouldOutputJson(g)) {
        outputEnvelope({ data: checks, command: 'doctor', status }, g)
      } else {
        const ok = pc.green('✓')
        const warn = pc.yellow('!')
        const bad = pc.red('✗')
        process.stdout.write(
          `${pc.bold('CLI')}:    ${ok} ${CLI_NAME} v${VERSION} on Node ${process.version}\n` +
          `${pc.bold('Auth')}:   ${keyValid ? ok : keyFile ? bad : warn} ${
            keyValid ? `${email} (${checks.auth.source})`
            : keyFile ? `key error: ${keyError}`
            : `no key (run \`${CLI_NAME} login --key-file <path>\`)`
          }\n` +
          `${pc.bold('Site')}:   ${checks.auth.default_site ?? pc.dim('(none)')}\n` +
          `${pc.bold('Config')}: ${checks.auth.credentials_path}\n` +
          `${pc.bold('Agent')}:  ${checks.agent.detected ?? pc.dim('none')}\n` +
          `${pc.bold('MCP')}:    ${ok} \`${CLI_NAME} mcp serve\`\n` +
          (deep
            ? `${pc.bold('API')}:    ${deep.sites_reachable ? `${ok} ${deep.site_count} propertie(s)` : `${bad} ${deep.error}`}\n`
            : ''),
        )
      }
    })
}
