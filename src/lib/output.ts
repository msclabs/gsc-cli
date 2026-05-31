import pc from 'picocolors'
import type { GlobalOpts } from './config.js'
import { buildEnvelope, type Envelope } from './envelope.js'
import { ENV_PREFIX } from './constants.js'

export enum ExitCode {
  SUCCESS = 0,
  GENERIC = 1,
  USAGE = 2,
  VALIDATION = 3,
  AUTH = 4,
  RATE_LIMIT = 5,
  NETWORK = 6,
  NOT_FOUND = 7,
  TEMP_FAIL = 75,
}

export type ErrorCode =
  | 'AUTH_MISSING' | 'AUTH_INVALID' | 'AUTH_EXPIRED'
  | 'RATE_LIMIT' | 'VALIDATION' | 'NETWORK' | 'UPSTREAM'
  | 'NOT_FOUND' | 'TIMEOUT' | 'UNKNOWN'

const JSON_ENV = `${ENV_PREFIX}_JSON`

export function shouldOutputJson(opts: GlobalOpts): boolean {
  if (opts.format && opts.format !== 'table') return true
  if (opts.json) return true
  if (process.env[JSON_ENV] === '1') return true
  if (!process.stdout.isTTY) return true
  return false
}

export function outputEnvelope<T>(
  payload: { data: T; metadata?: Record<string, unknown>; status?: Envelope['status']; command?: string },
  opts: GlobalOpts
): void {
  if (opts.raw) {
    process.stdout.write(JSON.stringify(payload.data, null, opts.compact ? 0 : 2) + '\n')
    return
  }
  if (shouldOutputJson(opts)) {
    const env = buildEnvelope({ ...payload, status: payload.status ?? 'success' })
    process.stdout.write(JSON.stringify(env, null, opts.compact ? 0 : 2) + '\n')
  } else {
    if (typeof payload.data === 'string') process.stdout.write(payload.data + '\n')
    else process.stdout.write(JSON.stringify(payload.data, null, 2) + '\n')
  }
}

export function outputError(
  error: { code: ErrorCode; message: string; hint?: string; retry?: { after_ms?: number; strategy?: string } },
  opts: GlobalOpts
): void {
  if (shouldOutputJson(opts)) {
    const env = buildEnvelope({ status: 'error', error })
    process.stderr.write(JSON.stringify(env, null, 2) + '\n')
  } else {
    process.stderr.write(pc.red(`Error [${error.code}]: ${error.message}`) + '\n')
    if (error.hint) process.stderr.write(pc.dim(`Hint: ${error.hint}`) + '\n')
  }
}

export function outputFormatted<T>(data: T, humanFn: () => void, opts: GlobalOpts): void {
  if (shouldOutputJson(opts)) outputEnvelope({ data }, opts)
  else humanFn()
}

const MAX_RESPONSE_BYTES = 100 * 1024
export function capResponse<T>(data: T, nextCursor?: string): { data: T; truncated: boolean; continue_with?: string } {
  const serialized = JSON.stringify(data)
  if (serialized.length <= MAX_RESPONSE_BYTES) return { data, truncated: false }
  return { data, truncated: true, continue_with: nextCursor }
}
