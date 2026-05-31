import pc from 'picocolors'
import type { GlobalOpts } from './config.js'
import { shouldUseColor } from './tty.js'

type Level = 'debug' | 'info' | 'warn' | 'error'
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export function makeLogger(opts: GlobalOpts) {
  const threshold = opts.verbose ? 10 : opts.quiet ? 40 : 20
  const color = shouldUseColor()
  const prefixes = color
    ? { debug: pc.dim('·'), info: pc.cyan('i'), warn: pc.yellow('!'), error: pc.red('✗') }
    : { debug: '·', info: 'i', warn: '!', error: '✗' }
  const write = (lvl: Level, msg: string) => {
    if (LEVELS[lvl] < threshold) return
    process.stderr.write(`${prefixes[lvl]} ${msg}\n`)
  }
  return {
    debug: (m: string) => write('debug', m),
    info:  (m: string) => write('info',  m),
    warn:  (m: string) => write('warn',  m),
    error: (m: string) => write('error', m),
  }
}
