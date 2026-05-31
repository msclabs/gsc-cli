import { Command } from '@commander-js/extra-typings'
import * as fs from 'node:fs'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope, outputError, shouldOutputJson, ExitCode } from '../lib/output.js'
import { outputStream, resetSequence } from '../lib/stream.js'
import { withSpinner } from '../lib/spinner.js'
import { writeLast } from '../lib/cache.js'
import { requireClient, requireSite, failApi } from '../lib/run.js'
import type { UrlInspectionResult } from '../core/types.js'
import type { GscClient } from '../core/client.js'

const DAILY_QUOTA = 2000

// Flatten the inspection result to the fields people actually care about.
function summarize(url: string, r: UrlInspectionResult) {
  const idx = r.inspectionResult?.indexStatusResult ?? {}
  return {
    url,
    verdict: idx.verdict ?? null,
    coverageState: idx.coverageState ?? null,
    indexingState: idx.indexingState ?? null,
    robotsTxtState: idx.robotsTxtState ?? null,
    pageFetchState: idx.pageFetchState ?? null,
    lastCrawlTime: idx.lastCrawlTime ?? null,
    googleCanonical: idx.googleCanonical ?? null,
    crawledAs: idx.crawledAs ?? null,
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => { setTimeout(resolve, ms) })
}

function parseLocsFromXml(xml: string): string[] {
  const out: string[] = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1]!)
  return out
}

async function gatherUrls(opts: GlobalOpts, cmdOpts: { urls?: string; fromSitemap?: string; fromPerf?: boolean }, site: string, client: GscClient): Promise<string[]> {
  if (cmdOpts.urls) {
    return fs.readFileSync(cmdOpts.urls, 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean)
  }
  if (cmdOpts.fromSitemap) {
    const res = await fetch(cmdOpts.fromSitemap)
    if (!res.ok) throw new Error(`Failed to fetch sitemap (${res.status}): ${cmdOpts.fromSitemap}`)
    return parseLocsFromXml(await res.text())
  }
  if (cmdOpts.fromPerf) {
    const endDate = new Date().toISOString().slice(0, 10)
    const start = new Date(); start.setUTCDate(start.getUTCDate() - 28)
    const r = await client.searchAnalytics(site, { startDate: start.toISOString().slice(0, 10), endDate, dimensions: ['page'], rowLimit: 1000 })
    return (r.rows ?? []).map((row) => row.keys?.[0] ?? '').filter(Boolean)
  }
  return []
}

export function makeInspectCommand(globalOpts: () => GlobalOpts) {
  return new Command('inspect')
    .description('Inspect URL index status / coverage / errors (urlInspection.index.inspect)')
    .argument('[url]', 'single URL to inspect')
    .option('--site <siteUrl>', 'property (or use global --site)')
    .option('--lang <code>', 'BCP-47 language for issue messages', 'en-US')
    .option('--full', 'emit the full inspection result, not the summary')
    .option('--urls <file>', 'BULK: newline-delimited file of URLs')
    .option('--from-sitemap <url>', 'BULK: fetch + parse a sitemap XML for URLs')
    .option('--from-perf', 'BULK: inspect top pages from the last 28d of performance')
    .option('--throttle <ms>', 'BULK: delay between inspections', (v) => parseInt(v, 10), 250)
    .option('--max <n>', `BULK: cap inspections (daily quota ${DAILY_QUOTA}/property)`, (v) => parseInt(v, 10), DAILY_QUOTA)
    .action(async (url, cmdOpts) => {
      const opts = globalOpts()
      const site = requireSite(opts, cmdOpts.site)
      const { client } = requireClient(opts)
      const bulk = Boolean(cmdOpts.urls || cmdOpts.fromSitemap || cmdOpts.fromPerf)

      if (!bulk) {
        if (!url) {
          outputError({ code: 'VALIDATION', message: 'Provide a <url>, or a bulk source (--urls / --from-sitemap / --from-perf).' }, opts)
          process.exit(ExitCode.VALIDATION)
        }
        try {
          const res = await withSpinner('Inspecting…', () => client.inspectUrl(site, url, cmdOpts.lang), opts)
          const data = cmdOpts.full ? res : summarize(url, res)
          writeLast(data)
          outputEnvelope({ data, command: 'inspect' }, opts)
        } catch (e) { failApi(e, opts) }
        return
      }

      // --- bulk ---
      let urls: string[]
      try {
        urls = await gatherUrls(opts, cmdOpts, site, client)
      } catch (e) { failApi(e, opts) }
      if (urls.length > cmdOpts.max) {
        process.stderr.write(`Note: ${urls.length} URLs found, capping at --max ${cmdOpts.max} (daily quota ${DAILY_QUOTA}).\n`)
        urls = urls.slice(0, cmdOpts.max)
      }

      const streaming = opts.format === 'ndjson'
      if (streaming) { resetSequence(); outputStream({ type: 'start', timestamp: Date.now(), payload: { count: urls.length } }, opts) }

      const results: ReturnType<typeof summarize>[] = []
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i]!
        try {
          const res = await client.inspectUrl(site, u, cmdOpts.lang)
          const s = summarize(u, res)
          results.push(s)
          if (streaming) outputStream({ type: 'item', timestamp: Date.now(), payload: s }, opts)
        } catch (e) {
          const errPayload = { url: u, verdict: 'ERROR', error: e instanceof Error ? e.message : String(e) }
          if (streaming) outputStream({ type: 'error', timestamp: Date.now(), payload: errPayload }, opts)
          else results.push({ ...summarize(u, {}), verdict: 'ERROR' })
        }
        if (cmdOpts.throttle > 0 && i < urls.length - 1) await sleep(cmdOpts.throttle)
      }

      if (streaming) { outputStream({ type: 'end', timestamp: Date.now(), payload: { count: results.length } }, opts); return }

      // Non-stream: summary by verdict + coverageState.
      const byVerdict: Record<string, number> = {}
      const byCoverage: Record<string, number> = {}
      for (const r of results) {
        byVerdict[r.verdict ?? 'UNKNOWN'] = (byVerdict[r.verdict ?? 'UNKNOWN'] ?? 0) + 1
        if (r.coverageState) byCoverage[r.coverageState] = (byCoverage[r.coverageState] ?? 0) + 1
      }
      writeLast(results)
      outputEnvelope({
        data: { results, summary: { total: results.length, byVerdict, byCoverage } },
        command: 'inspect bulk',
        metadata: { total: results.length },
      }, opts)
    })
}
