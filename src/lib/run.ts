// Shared command plumbing: resolve service account → client, resolve site,
// and map API/auth errors to output + typed exit codes.
import { resolveKeyFile, resolveSite, type GlobalOpts } from './config.js'
import { loadKeyFile, AuthError, type ServiceAccountKey } from '../core/auth.js'
import { makeClient, ApiError, type GscClient } from '../core/client.js'
import { outputError, ExitCode, type ErrorCode } from './output.js'
import { normalizeSiteUrl } from './gsc.js'
import { ENV_PREFIX } from './constants.js'

export function exitForCode(code: string): number {
  switch (code) {
    case 'AUTH_MISSING':
    case 'AUTH_INVALID':
    case 'AUTH_EXPIRED':
      return ExitCode.AUTH
    case 'RATE_LIMIT':
      return ExitCode.RATE_LIMIT
    case 'VALIDATION':
      return ExitCode.VALIDATION
    case 'NETWORK':
    case 'TIMEOUT':
      return ExitCode.NETWORK
    case 'NOT_FOUND':
      return ExitCode.NOT_FOUND
    default:
      return ExitCode.GENERIC
  }
}

export function requireClient(opts: GlobalOpts): { client: GscClient; key: ServiceAccountKey } {
  const keyFile = resolveKeyFile(opts)
  if (!keyFile) {
    outputError({
      code: 'AUTH_MISSING',
      message: 'No service-account key configured.',
      hint: `Run \`gsc login --key-file <path>\`, or set ${ENV_PREFIX}_KEY_FILE / GOOGLE_APPLICATION_CREDENTIALS.`,
    }, opts)
    process.exit(ExitCode.AUTH)
  }
  try {
    const key = loadKeyFile(keyFile)
    const client = makeClient(key, { timeoutMs: opts.timeout })
    return { client, key }
  } catch (e) {
    const code = e instanceof AuthError ? e.code : 'AUTH_INVALID'
    outputError({ code: code as ErrorCode, message: e instanceof Error ? e.message : String(e) }, opts)
    process.exit(exitForCode(code))
  }
}

export function requireSite(opts: GlobalOpts, explicit?: string): string {
  const site = resolveSite(opts, explicit)
  if (!site) {
    outputError({
      code: 'VALIDATION',
      message: 'No site specified.',
      hint: 'Pass --site <siteUrl>, set GSC_SITE, or set a default site via `gsc login --default-site`.',
    }, opts)
    process.exit(ExitCode.VALIDATION)
  }
  return normalizeSiteUrl(site)
}

export function failApi(err: unknown, opts: GlobalOpts): never {
  const code = err instanceof ApiError ? err.code : (err as { code?: string }).code ?? 'UPSTREAM'
  outputError({
    code: code as ErrorCode,
    message: err instanceof Error ? err.message : String(err),
  }, opts)
  process.exit(exitForCode(code))
}
