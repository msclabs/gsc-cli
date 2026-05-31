import { Command } from '@commander-js/extra-typings'
import pc from 'picocolors'
import { removeProfile, getActiveProfile } from '../lib/config.js'
import type { GlobalOpts } from '../lib/config.js'
import { outputError, ExitCode } from '../lib/output.js'

export function makeLogoutCommand(globalOpts: () => GlobalOpts): Command {
  return new Command('logout')
    .description('Remove credentials for a profile')
    .option('--profile <name>', 'Profile name (default: active profile)')
    .action(async (opts) => {
      const g = globalOpts()
      const name = opts.profile ?? g.profile ?? getActiveProfile()
      try {
        removeProfile(name)
        process.stderr.write(pc.green('✓') + ` Removed profile: ${name}\n`)
      } catch (err) {
        outputError({
          code: 'NOT_FOUND',
          message: err instanceof Error ? err.message : 'Profile not found',
        }, g)
        process.exit(ExitCode.NOT_FOUND)
      }
    })
}
