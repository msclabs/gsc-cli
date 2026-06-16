// 1:1 mapping of GSC CLI commands to MCP tools, using the high-level
// McpServer.registerTool API with Zod input schemas.
import { z } from 'zod'
import { resolveKeyFile, resolveSite } from '../lib/config.js'
import { buildEnvelope, type Envelope } from '../lib/envelope.js'
import { loadCredential, credentialLabel } from '../core/auth.js'
import { makeClient, type GscClient } from '../core/client.js'
import { ENV_PREFIX } from '../lib/constants.js'
import { parseFilters, resolveDateRange, flattenRows, normalizeSiteUrl } from '../lib/gsc.js'
import { makeIndexNowClient, hostFromSite, MAX_URLS_PER_REQUEST } from '../core/indexnow.js'
import { resolveKey, resolveKeyLocation } from '../lib/indexnow-config.js'
import type { Dimension, SearchType } from '../core/types.js'

export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string
  title: string
  description: string
  inputSchema: Shape
  handler(args: z.infer<z.ZodObject<Shape>>): Promise<Envelope>
}

function clientOrError(): GscClient | Envelope {
  const keyFile = resolveKeyFile({})
  if (!keyFile) {
    return buildEnvelope({
      status: 'error',
      error: { code: 'AUTH_MISSING', message: 'No service-account key configured.', hint: `Set ${ENV_PREFIX}_KEY_FILE or GOOGLE_APPLICATION_CREDENTIALS.` },
    })
  }
  try {
    return makeClient(loadCredential(keyFile))
  } catch (e) {
    return buildEnvelope({ status: 'error', error: { code: 'AUTH_INVALID', message: e instanceof Error ? e.message : String(e) } })
  }
}

function siteOrError(argSite?: string): string | Envelope {
  const site = resolveSite({}, argSite)
  if (!site) {
    return buildEnvelope({ status: 'error', error: { code: 'VALIDATION', message: 'No site. Pass `site`, or set GSC_SITE.' } })
  }
  return normalizeSiteUrl(site)
}

function fail(command: string, e: unknown): Envelope {
  const code = (e as { code?: string }).code ?? 'UPSTREAM'
  return buildEnvelope({ status: 'error', command, error: { code, message: e instanceof Error ? e.message : String(e) } })
}

export const sitesListTool: ToolDef<Record<string, never>> = {
  name: 'sites_list',
  title: 'List properties',
  description: 'List all Search Console properties the service account can access.',
  inputSchema: {},
  async handler() {
    const client = clientOrError(); if (!(typeof client === 'object' && 'listSites' in client)) return client as Envelope
    try { return buildEnvelope({ status: 'success', command: 'sites list', data: await client.listSites() }) }
    catch (e) { return fail('sites list', e) }
  },
}

export const searchAnalyticsTool: ToolDef<{
  site: z.ZodOptional<z.ZodString>
  dimensions: z.ZodOptional<z.ZodArray<z.ZodString>>
  start: z.ZodOptional<z.ZodString>
  end: z.ZodOptional<z.ZodString>
  range: z.ZodOptional<z.ZodString>
  type: z.ZodOptional<z.ZodString>
  filters: z.ZodOptional<z.ZodArray<z.ZodString>>
  rowLimit: z.ZodOptional<z.ZodNumber>
}> = {
  name: 'search_analytics',
  title: 'Search analytics query',
  description: 'Query the Performance report. Returns flattened rows with the requested dimensions plus clicks/impressions/ctr(%)/position. Filters: key=val, key!=val, key~regex, key!~regex.',
  inputSchema: {
    site: z.string().optional().describe('siteUrl or sc-domain:example.com (falls back to GSC_SITE)'),
    dimensions: z.array(z.string()).optional().describe('query, page, country, device, date, searchAppearance'),
    start: z.string().optional().describe('YYYY-MM-DD'),
    end: z.string().optional().describe('YYYY-MM-DD (default today)'),
    range: z.string().optional().describe('preset e.g. last-28d, last-7d, last-3mo'),
    type: z.string().optional().describe('web | image | video | news | googleNews | discover'),
    filters: z.array(z.string()).optional(),
    rowLimit: z.number().int().min(1).max(25000).optional(),
  },
  async handler(args) {
    const client = clientOrError(); if (!(typeof client === 'object' && 'searchAnalytics' in client)) return client as Envelope
    const site = siteOrError(args.site); if (typeof site !== 'string') return site
    try {
      const dims = (args.dimensions ?? ['query']) as Dimension[]
      const { startDate, endDate } = resolveDateRange({ start: args.start, end: args.end, range: args.range })
      const res = await client.searchAnalytics(site, {
        startDate, endDate, dimensions: dims,
        type: (args.type as SearchType) ?? 'web',
        dimensionFilterGroups: parseFilters(args.filters),
        rowLimit: args.rowLimit ?? 1000,
      })
      const data = flattenRows(res.rows, dims)
      return buildEnvelope({ status: 'success', command: 'perf query', data, metadata: { count: data.length, range: { start: startDate, end: endDate } } })
    } catch (e) { return fail('perf query', e) }
  },
}

export const urlInspectTool: ToolDef<{ url: z.ZodString; site: z.ZodOptional<z.ZodString>; lang: z.ZodOptional<z.ZodString> }> = {
  name: 'url_inspect',
  title: 'Inspect URL',
  description: 'Inspect a URL\'s index status, coverage state, canonicals, and errors.',
  inputSchema: { url: z.string(), site: z.string().optional(), lang: z.string().optional() },
  async handler(args) {
    const client = clientOrError(); if (!(typeof client === 'object' && 'inspectUrl' in client)) return client as Envelope
    const site = siteOrError(args.site); if (typeof site !== 'string') return site
    try {
      const res = await client.inspectUrl(site, args.url, args.lang ?? 'en-US')
      const idx = res.inspectionResult?.indexStatusResult ?? {}
      return buildEnvelope({ status: 'success', command: 'inspect', data: { url: args.url, ...idx } })
    } catch (e) { return fail('inspect', e) }
  },
}

export const sitemapsListTool: ToolDef<{ site: z.ZodOptional<z.ZodString> }> = {
  name: 'sitemaps_list',
  title: 'List sitemaps',
  description: 'List sitemaps for a property with errors/warnings/pending status.',
  inputSchema: { site: z.string().optional() },
  async handler(args) {
    const client = clientOrError(); if (!(typeof client === 'object' && 'listSitemaps' in client)) return client as Envelope
    const site = siteOrError(args.site); if (typeof site !== 'string') return site
    try { return buildEnvelope({ status: 'success', command: 'sitemaps list', data: await client.listSitemaps(site) }) }
    catch (e) { return fail('sitemaps list', e) }
  },
}

export const sitemapSubmitTool: ToolDef<{ feedpath: z.ZodString; site: z.ZodOptional<z.ZodString>; confirm: z.ZodString }> = {
  name: 'sitemap_submit',
  title: 'Submit sitemap',
  description: 'Submit (register) a sitemap. `confirm` must equal `feedpath` to proceed.',
  inputSchema: { feedpath: z.string(), site: z.string().optional(), confirm: z.string().describe('must equal feedpath') },
  async handler(args) {
    if (args.confirm !== args.feedpath) return buildEnvelope({ status: 'error', command: 'sitemaps submit', error: { code: 'VALIDATION', message: 'confirm must equal feedpath' } })
    const client = clientOrError(); if (!(typeof client === 'object' && 'submitSitemap' in client)) return client as Envelope
    const site = siteOrError(args.site); if (typeof site !== 'string') return site
    try { await client.submitSitemap(site, args.feedpath); return buildEnvelope({ status: 'success', command: 'sitemaps submit', data: { feedpath: args.feedpath, submitted: true } }) }
    catch (e) { return fail('sitemaps submit', e) }
  },
}

export const indexPublishTool: ToolDef<{ url: z.ZodString; type: z.ZodOptional<z.ZodEnum<{ updated: 'updated'; deleted: 'deleted' }>> }> = {
  name: 'index_publish',
  title: 'Request indexing',
  description: 'Notify Google a URL was updated/deleted via the Indexing API. Officially JobPosting/BroadcastEvent only.',
  inputSchema: { url: z.string(), type: z.enum({ updated: 'updated', deleted: 'deleted' }).optional() },
  async handler(args) {
    const client = clientOrError(); if (!(typeof client === 'object' && 'indexPublish' in client)) return client as Envelope
    try {
      const res = await client.indexPublish(args.url, args.type === 'deleted' ? 'URL_DELETED' : 'URL_UPDATED')
      return buildEnvelope({ status: 'success', command: 'index publish', data: { url: args.url, response: res } })
    } catch (e) { return fail('index publish', e) }
  },
}

export const indexNowSubmitTool: ToolDef<{
  urls: z.ZodArray<z.ZodString>
  host: z.ZodOptional<z.ZodString>
  key: z.ZodOptional<z.ZodString>
}> = {
  name: 'indexnow_submit',
  title: 'Submit URLs to IndexNow',
  description: 'Instant-index URLs via IndexNow (Bing, Yandex, Naver, Seznam, Yep — NOT Google). Needs a key stored for the host (or GSC_INDEXNOW_KEY).',
  inputSchema: {
    urls: z.array(z.string()).min(1).describe('http(s) URLs to submit'),
    host: z.string().optional().describe('bare host; falls back to GSC_SITE'),
    key: z.string().optional().describe('override stored/env key'),
  },
  async handler(args) {
    const siteVal = resolveSite({}, args.host)
    const host = args.host ? hostFromSite(args.host) : (siteVal ? hostFromSite(siteVal) : null)
    if (!host) return buildEnvelope({ status: 'error', command: 'indexnow submit', error: { code: 'VALIDATION', message: 'No host. Pass `host`, or set GSC_SITE.' } })
    const key = resolveKey(host, args.key)
    if (!key) return buildEnvelope({ status: 'error', command: 'indexnow submit', error: { code: 'AUTH_MISSING', message: `No IndexNow key for ${host}.`, hint: `Run: gsc indexnow key set --host ${host}` } })
    const urls = [...new Set(args.urls)].filter((u) => /^https?:\/\//i.test(u))
    if (urls.length === 0) return buildEnvelope({ status: 'error', command: 'indexnow submit', error: { code: 'VALIDATION', message: 'No valid http(s) URLs.' } })
    const keyLocation = resolveKeyLocation(host, key)
    const client = makeIndexNowClient()
    try {
      if (urls.length === 1) {
        const r = await client.submitOne(urls[0]!, key, keyLocation)
        return buildEnvelope({ status: 'success', command: 'indexnow submit', data: { host, submitted: 1, http_status: r.status } })
      }
      let submitted = 0
      for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
        const batch = urls.slice(i, i + MAX_URLS_PER_REQUEST)
        await client.submitBatch(host, batch, key, keyLocation)
        submitted += batch.length
      }
      return buildEnvelope({ status: 'success', command: 'indexnow submit', data: { host, submitted } })
    } catch (e) { return fail('indexnow submit', e) }
  },
}

export const whoamiTool: ToolDef<Record<string, never>> = {
  name: 'whoami',
  title: 'Auth status',
  description: 'Report whether a service account is configured and which property is the default.',
  inputSchema: {},
  async handler() {
    const keyFile = resolveKeyFile({})
    let email: string | null = null
    if (keyFile) { try { email = credentialLabel(loadCredential(keyFile)) } catch { /* ignore */ } }
    return buildEnvelope({ status: 'success', command: 'whoami', data: { authenticated: Boolean(email), identity: email, default_site: resolveSite({}) } })
  },
}

export const ALL_TOOLS = [
  sitesListTool, searchAnalyticsTool, urlInspectTool, sitemapsListTool,
  sitemapSubmitTool, indexPublishTool, indexNowSubmitTool, whoamiTool,
] as const
