import pc from 'picocolors'
import type { GlobalOpts } from './config.js'
import { isInteractive, isStderrTTY } from './tty.js'
import { shouldOutputJson } from './output.js'
import { isUnderAgent } from './agent.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
  opts: GlobalOpts
): Promise<T> {
  // Spinner is ONLY allowed when:
  //  - interactive TTY, AND
  //  - stderr is a TTY (so we can overwrite), AND
  //  - we are NOT in JSON mode, AND
  //  - no agent detected
  const show = isInteractive() && isStderrTTY() && !shouldOutputJson(opts) && !isUnderAgent() && !opts.quiet
  let i = 0
  let timer: ReturnType<typeof setInterval> | undefined

  if (show) {
    process.stderr.write(`${FRAMES[0]} ${message}`)
    timer = setInterval(() => {
      i = (i + 1) % FRAMES.length
      process.stderr.write(`\r${FRAMES[i]} ${message}`)
    }, 80)
  }

  try {
    const result = await fn()
    if (timer) clearInterval(timer)
    if (show) process.stderr.write(`\r${pc.green('✓')} ${message}\n`)
    return result
  } catch (err) {
    if (timer) clearInterval(timer)
    if (show) process.stderr.write(`\r${pc.red('✗')} ${message}\n`)
    throw err
  }
}
