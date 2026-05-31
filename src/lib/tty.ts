export function isStdinTTY(): boolean { return Boolean(process.stdin.isTTY) }
export function isStdoutTTY(): boolean { return Boolean(process.stdout.isTTY) }
export function isStderrTTY(): boolean { return Boolean(process.stderr.isTTY) }

export function isInteractive(): boolean {
  if (!isStdoutTTY()) return false
  if (process.env.CI) return false
  if (process.env.TERM === 'dumb') return false
  if (process.env.NO_COLOR) return false
  return true
}

export function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR) return true
  return isStdoutTTY()
}
