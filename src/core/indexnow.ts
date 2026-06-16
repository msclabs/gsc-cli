// IndexNow client. Unlike the Google APIs, IndexNow has no OAuth: ownership is
// proven by hosting a `{key}.txt` file at the domain root. Submitting to the
// shared endpoint (api.indexnow.org) fans out to all participating engines.
import { randomBytes } from 'node:crypto'
import { USER_AGENT } from '../lib/constants.js'
import { agentUserAgentSuffix } from '../lib/agent.js'
import { ApiError } from './client.js'

// Default shared endpoint — distributes to every participating engine.
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

// Engines that participate in the protocol. Submitting to one shares with all.
// Google is intentionally absent — it never adopted IndexNow (use the Indexing
// API + sitemaps via `gsc index` / `gsc sitemaps` for Google).
export const INDEXNOW_ENGINES = [
  { name: 'Microsoft Bing', host: 'www.bing.com' },
  { name: 'Yandex', host: 'yandex.com' },
  { name: 'Naver', host: 'searchadvisor.naver.com' },
  { name: 'Seznam.cz', host: 'search.seznam.cz' },
  { name: 'Yep', host: 'indexnow.yep.com' },
] as const

export const MAX_URLS_PER_REQUEST = 10000

// Generate a protocol-valid key: 32 lowercase hex chars (within the 8-128 range).
export function generateKey(): string {
  return randomBytes(16).toString('hex')
}

const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/
export function isValidKey(key: string): boolean {
  return KEY_RE.test(key)
}

// Map IndexNow HTTP status → CLI error code. Codes per the protocol spec.
function mapStatus(status: number, body: string): { code: string; message: string } {
  const detail = body.slice(0, 300).trim()
  switch (status) {
    case 400: return { code: 'VALIDATION', message: `Bad request — invalid format. ${detail}`.trim() }
    case 403: return { code: 'AUTH_INVALID', message: `Forbidden — key not valid (is {key}.txt hosted and reachable?). ${detail}`.trim() }
    case 422: return { code: 'VALIDATION', message: `Unprocessable — URLs don't belong to the host, or key mismatch. ${detail}`.trim() }
    case 429: return { code: 'RATE_LIMIT', message: `Too many requests — slow down. ${detail}`.trim() }
    default:
      if (status >= 500) return { code: 'UPSTREAM', message: `Engine error (${status}). ${detail}`.trim() }
      return { code: 'UPSTREAM', message: `HTTP ${status}. ${detail}`.trim() }
  }
}

export interface SubmitResult {
  endpoint: string
  status: number
  ok: boolean
  count: number
}

export interface IndexNowClientOpts {
  endpoint?: string
  timeoutMs?: number
}

const enc = encodeURIComponent

export function makeIndexNowClient(opts: IndexNowClientOpts = {}) {
  const endpoint = opts.endpoint ?? INDEXNOW_ENDPOINT
  const timeout = opts.timeoutMs
  const userAgent = USER_AGENT + agentUserAgentSuffix()

  async function send(method: 'GET' | 'POST', url: string, body?: unknown): Promise<number> {
    const ctrl = new AbortController()
    const timer = timeout && timeout > 0 ? setTimeout(() => ctrl.abort(), timeout) : null
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: {
          'User-Agent': userAgent,
          ...(body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new ApiError(`Request timed out after ${timeout}ms`, 'TIMEOUT')
      throw new ApiError(`Network error: ${e instanceof Error ? e.message : String(e)}`, 'NETWORK')
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const { code, message } = mapStatus(res.status, text)
      throw new ApiError(message, code, res.status)
    }
    return res.status
  }

  return {
    // Single URL via GET. 200/202 both mean accepted.
    async submitOne(url: string, key: string, keyLocation?: string): Promise<SubmitResult> {
      const qs = `url=${enc(url)}&key=${enc(key)}${keyLocation ? `&keyLocation=${enc(keyLocation)}` : ''}`
      const status = await send('GET', `${endpoint}?${qs}`)
      return { endpoint, status, ok: true, count: 1 }
    },

    // Bulk via POST. Caller must keep urlList <= MAX_URLS_PER_REQUEST.
    async submitBatch(host: string, urlList: string[], key: string, keyLocation?: string): Promise<SubmitResult> {
      const status = await send('POST', endpoint, {
        host,
        key,
        ...(keyLocation ? { keyLocation } : {}),
        urlList,
      })
      return { endpoint, status, ok: true, count: urlList.length }
    },
  }
}

export type IndexNowClient = ReturnType<typeof makeIndexNowClient>

// Fetch the hosted key file and confirm it contains exactly the key.
export async function verifyKeyFile(
  keyLocation: string,
  key: string,
  timeoutMs?: number,
): Promise<{ reachable: boolean; matches: boolean; status: number; body?: string }> {
  const ctrl = new AbortController()
  const timer = timeoutMs && timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  try {
    const res = await fetch(keyLocation, { headers: { 'User-Agent': USER_AGENT }, signal: ctrl.signal })
    const body = (await res.text().catch(() => '')).trim()
    return { reachable: res.ok, matches: res.ok && body === key, status: res.status, body: body.slice(0, 200) }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ApiError(`Verify timed out`, 'TIMEOUT')
    throw new ApiError(`Could not fetch key file: ${e instanceof Error ? e.message : String(e)}`, 'NETWORK')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// Derive a bare host from a gsc --site value (sc-domain:, URL, or bare domain).
export function hostFromSite(site: string): string | null {
  const s = site.trim()
  if (s.startsWith('sc-domain:')) return s.slice('sc-domain:'.length) || null
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname || null
  } catch {
    return null
  }
}

// Parse <loc> entries out of a sitemap (or sitemap index) XML body.
export function parseSitemapLocs(xml: string): string[] {
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1]!)
  return out
}
