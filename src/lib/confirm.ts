import type { GlobalOpts } from './config.js'
import { outputError, ExitCode } from './output.js'
import { isUnderAgent } from './agent.js'

export function requireConfirm(
  supplied: string | undefined,
  expected: string,
  opts: GlobalOpts
): void {
  const underAgent = isUnderAgent()
  if (supplied === expected) return
  if (!underAgent && opts.yes) return
  outputError({
    code: 'VALIDATION',
    message: `Destructive operation requires --confirm ${expected}`,
    hint: underAgent
      ? `Re-run with --confirm ${expected}. --yes is rejected under an AI agent.`
      : `Re-run with --confirm ${expected} or --yes to skip the guard.`,
  }, opts)
  process.exit(ExitCode.VALIDATION)
}
