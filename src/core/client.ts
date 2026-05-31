// HTTP client for the Google Search Console + Indexing APIs.
// Auth: service-account JWT → OAuth2 access token (see auth.ts). The token
// carries both webmasters + indexing scopes; the API enforces actual
// property-level permission at call time.
import { USER_AGENT, HOSTS, DEFAULT_SCOPES } from '../lib/constants.js'
import { agentUserAgentSuffix } from '../lib/agent.js'
import { getAccessToken, type Credential } from './auth.js'
import type {
  SitesListResult, SiteEntry, SearchAnalyticsQuery, SearchAnalyticsResult,
  SitemapsListResult, WmxSitemap, UrlInspectionResult,
  UrlNotificationType, UrlNotificationMetadata,
} from './types.js'

export class ApiError extends Error {
  code: string
  status?: number
  constructor(message: string, code: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

function mapStatus(status: number, body: string): { code: string; message: string } {
  const snippet = body.slice(0, 400)
  // Try to surface Google's structured error message.
  let detail = snippet
  try {
    const j = JSON.parse(body) as { error?: { message?: string; status?: string } }
    if (j.error?.message) detail = j.error.message
  } catch { /* keep snippet */ }
  if (status === 401) return { code: 'AUTH_INVALID', message: `Unauthorized: ${detail}` }
  if (status === 403) {
    if (/quota|rate/i.test(detail)) return { code: 'RATE_LIMIT', message: `Quota/rate limit: ${detail}` }
    return { code: 'UPSTREAM', message: `Forbidden (permission?): ${detail}` }
  }
  if (status === 404) return { code: 'NOT_FOUND', message: detail || 'Not found' }
  if (status === 429) return { code: 'RATE_LIMIT', message: `Rate limited: ${detail}` }
  if (status === 400) return { code: 'VALIDATION', message: detail || 'Bad request' }
  if (status >= 500) return { code: 'UPSTREAM', message: `Server error (${status}): ${detail}` }
  return { code: 'UPSTREAM', message: `HTTP ${status}: ${detail}` }
}

export interface ClientOpts {
  timeoutMs?: number
  scopes?: string[]
}

const enc = encodeURIComponent

export function makeClient(key: Credential, clientOpts: ClientOpts = {}) {
  const userAgent = USER_AGENT + agentUserAgentSuffix()
  const timeout = clientOpts.timeoutMs
  const scopes = clientOpts.scopes ?? DEFAULT_SCOPES
  // User (authorized_user) credentials require a quota/billing project header.
  const quotaProject = key.type === 'authorized_user' ? key.project_id : undefined

  async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const token = await getAccessToken(key, scopes, timeout)
    const ctrl = new AbortController()
    const timer = timeout && timeout > 0 ? setTimeout(() => ctrl.abort(), timeout) : null
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': userAgent,
          ...(quotaProject ? { 'x-goog-user-project': quotaProject } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
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
    // PUT/DELETE writes return empty bodies.
    const text = await res.text()
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      return undefined as T
    }
  }

  return {
    // --- Sites ---
    async listSites(): Promise<SiteEntry[]> {
      const r = await request<SitesListResult>('GET', `${HOSTS.webmasters}/sites`)
      return r.siteEntry ?? []
    },
    async getSite(siteUrl: string): Promise<SiteEntry> {
      return request<SiteEntry>('GET', `${HOSTS.webmasters}/sites/${enc(siteUrl)}`)
    },
    async addSite(siteUrl: string): Promise<void> {
      await request<void>('PUT', `${HOSTS.webmasters}/sites/${enc(siteUrl)}`)
    },
    async deleteSite(siteUrl: string): Promise<void> {
      await request<void>('DELETE', `${HOSTS.webmasters}/sites/${enc(siteUrl)}`)
    },

    // --- Search Analytics ---
    async searchAnalytics(siteUrl: string, query: SearchAnalyticsQuery): Promise<SearchAnalyticsResult> {
      return request<SearchAnalyticsResult>(
        'POST',
        `${HOSTS.webmasters}/sites/${enc(siteUrl)}/searchAnalytics/query`,
        query,
      )
    },

    // --- Sitemaps ---
    async listSitemaps(siteUrl: string, sitemapIndex?: string): Promise<WmxSitemap[]> {
      const q = sitemapIndex ? `?sitemapIndex=${enc(sitemapIndex)}` : ''
      const r = await request<SitemapsListResult>('GET', `${HOSTS.webmasters}/sites/${enc(siteUrl)}/sitemaps${q}`)
      return r.sitemap ?? []
    },
    async getSitemap(siteUrl: string, feedpath: string): Promise<WmxSitemap> {
      return request<WmxSitemap>('GET', `${HOSTS.webmasters}/sites/${enc(siteUrl)}/sitemaps/${enc(feedpath)}`)
    },
    async submitSitemap(siteUrl: string, feedpath: string): Promise<void> {
      await request<void>('PUT', `${HOSTS.webmasters}/sites/${enc(siteUrl)}/sitemaps/${enc(feedpath)}`)
    },
    async deleteSitemap(siteUrl: string, feedpath: string): Promise<void> {
      await request<void>('DELETE', `${HOSTS.webmasters}/sites/${enc(siteUrl)}/sitemaps/${enc(feedpath)}`)
    },

    // --- URL Inspection (note: searchconsole/v1 host) ---
    async inspectUrl(siteUrl: string, inspectionUrl: string, languageCode = 'en-US'): Promise<UrlInspectionResult> {
      return request<UrlInspectionResult>(
        'POST',
        `${HOSTS.searchconsole}/urlInspection/index:inspect`,
        { inspectionUrl, siteUrl, languageCode },
      )
    },

    // --- Indexing API ---
    async indexPublish(url: string, type: UrlNotificationType): Promise<unknown> {
      return request<unknown>('POST', `${HOSTS.indexing}/urlNotifications:publish`, { url, type })
    },
    async indexGetMetadata(url: string): Promise<UrlNotificationMetadata> {
      return request<UrlNotificationMetadata>('GET', `${HOSTS.indexing}/urlNotifications/metadata?url=${enc(url)}`)
    },
  }
}

export type GscClient = ReturnType<typeof makeClient>
