import { Command } from '@commander-js/extra-typings'
import pc from 'picocolors'
import { getActiveProfile, resolveKeyFile, resolveSite, getKeyFileSource } from '../lib/config.js'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope, shouldOutputJson } from '../lib/output.js'
import { detectAgent } from '../lib/agent.js'
import { loadCredential, credentialLabel } from '../core/auth.js'
import { DEFAULT_SCOPES } from '../lib/constants.js'

export function makeWhoamiCommand(globalOpts: () => GlobalOpts): Command {
  return new Command('whoami')
    .description('Show auth status, service account, and detected agent')
    .action(async () => {
      const opts = globalOpts()
      const keyFile = resolveKeyFile(opts)
      const profile = opts.profile ?? getActiveProfile()
      const site = resolveSite(opts)
      const agent = detectAgent()

      let email: string | null = null
      let project: string | null = null
      let authType: string | null = null
      let keyOk = false
      if (keyFile) {
        try {
          const key = loadCredential(keyFile)
          email = credentialLabel(key)
          project = key.project_id ?? null
          authType = key.type
          keyOk = true
        } catch { /* unreadable / invalid */ }
      }

      const data = {
        authenticated: keyOk,
        profile,
        key_source: keyFile ? getKeyFileSource(opts) : null,
        key_file: keyFile,
        auth_type: authType,
        identity: email,
        project_id: project,
        default_site: site,
        scopes: DEFAULT_SCOPES,
        agent,
      }

      if (shouldOutputJson(opts)) {
        outputEnvelope({ data, command: 'whoami' }, opts)
      } else {
        process.stdout.write(
          `${pc.bold('Profile')}:  ${profile}\n` +
          `${pc.bold('Authed')}:   ${data.authenticated ? pc.green('yes') : pc.red('no')}\n` +
          `${pc.bold('Type')}:     ${authType ?? pc.dim('(none)')}\n` +
          `${pc.bold('Identity')}: ${email ?? pc.dim('(none)')}\n` +
          `${pc.bold('Project')}:  ${project ?? pc.dim('(none)')}\n` +
          `${pc.bold('Site')}:     ${site ?? pc.dim('(none — pass --site)')}\n` +
          `${pc.bold('Source')}:   ${data.key_source ?? pc.dim('(none)')}\n` +
          `${pc.bold('Agent')}:    ${agent ?? pc.dim('none')}\n`,
        )
      }
    })
}
