import { Command } from '@commander-js/extra-typings'
import pc from 'picocolors'
import * as path from 'node:path'
import { addProfile, setActiveProfile } from '../lib/config.js'
import type { GlobalOpts } from '../lib/config.js'
import { outputError, ExitCode } from '../lib/output.js'
import { isInteractive } from '../lib/tty.js'
import { detectAgent } from '../lib/agent.js'
import { loadKeyFile, AuthError } from '../core/auth.js'
import { makeClient } from '../core/client.js'
import { ENV_PREFIX } from '../lib/constants.js'

export function makeLoginCommand(globalOpts: () => GlobalOpts): Command {
  return new Command('login')
    .description('Configure a service-account key (and optional default site)')
    .option('--key-file <path>', 'Path to the service-account JSON key file')
    .option('--default-site <siteUrl>', 'Default property (e.g. sc-domain:example.com or https://example.com/)')
    .option('--profile <name>', 'Profile name (default: "default")')
    .option('--no-verify', 'Skip the sites.list verification call')
    .action(async (opts) => {
      const g = globalOpts()
      const agent = detectAgent()
      let keyFile = opts.keyFile

      // Refuse interactive prompt under an agent — Stripe pattern.
      if (!keyFile && agent) {
        outputError({
          code: 'AUTH_MISSING',
          message: `Detected agent (${agent}). Interactive login disabled.`,
          hint: `Pass --key-file <path>, or set ${ENV_PREFIX}_KEY_FILE / GOOGLE_APPLICATION_CREDENTIALS in the environment.`,
        }, g)
        process.exit(ExitCode.AUTH)
      }

      if (!keyFile) {
        if (!isInteractive()) {
          outputError({
            code: 'VALIDATION',
            message: 'Non-interactive mode requires --key-file <path>',
            hint: `Or set ${ENV_PREFIX}_KEY_FILE in your environment.`,
          }, g)
          process.exit(ExitCode.VALIDATION)
        }
        const { text, isCancel } = await import('@clack/prompts')
        const result = await text({ message: 'Path to service-account JSON key:' })
        if (isCancel(result)) process.exit(ExitCode.SUCCESS)
        keyFile = result as string
      }

      keyFile = path.resolve(keyFile.trim())

      // Validate the key file parses and is a service account.
      let email: string
      try {
        email = loadKeyFile(keyFile).client_email
      } catch (e) {
        outputError({
          code: e instanceof AuthError ? (e.code as 'AUTH_INVALID') : 'AUTH_INVALID',
          message: e instanceof Error ? e.message : String(e),
        }, g)
        process.exit(ExitCode.AUTH)
      }

      // Verify the SA can actually reach the API (unless --no-verify).
      let verifiedSites: number | null = null
      if (opts.verify !== false) {
        try {
          const client = makeClient(loadKeyFile(keyFile), { timeoutMs: g.timeout })
          const sites = await client.listSites()
          verifiedSites = sites.length
        } catch (e) {
          process.stderr.write(
            pc.yellow('!') + ` Verification call failed: ${e instanceof Error ? e.message : String(e)}\n` +
            pc.dim('  Saving credentials anyway. Ensure the SA email is added as a user on your property.\n'),
          )
        }
      }

      const profileName = opts.profile ?? g.profile ?? 'default'
      const profile: { key_file: string; default_site?: string } = { key_file: keyFile }
      if (opts.defaultSite) profile.default_site = opts.defaultSite
      addProfile(profileName, profile)
      setActiveProfile(profileName)

      process.stderr.write(
        pc.green('✓') + ` Configured. Profile: ${profileName}\n` +
        `  Service account: ${email}\n` +
        (opts.defaultSite ? `  Default site:    ${opts.defaultSite}\n` : '') +
        (verifiedSites !== null ? pc.dim(`  Verified: ${verifiedSites} propertie(s) visible to this account.\n`) : ''),
      )
      if (verifiedSites === 0) {
        process.stderr.write(pc.yellow('  Note: 0 properties visible — add ') + pc.bold(email) + pc.yellow(' as a user in Search Console.\n'))
      }
    })
}
