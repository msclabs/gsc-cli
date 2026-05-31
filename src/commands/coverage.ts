import { Command } from '@commander-js/extra-typings'
import * as fs from 'node:fs'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope, shouldOutputJson } from '../lib/output.js'
import { withSpinner } from '../lib/spinner.js'
import { renderTable } from '../lib/table.js'
import { writeLast } from '../lib/cache.js'
import { requireClient, requireSite, failApi } from '../lib/run.js'
import { resolveDateRange } from '../lib/gsc.js'
import type { GscClient } from '../core/client.js'

function sleep(ms: number) { return new Promise<void>((r) => { setTimeout(r, ms) }) }

function parseLocs(xml: string): string[] {
  const out: string[] = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1]!)
  return out
}

async function sourceUrls(
  client: GscClient,
  site: string,
  cmdOpts: { urls?: string; fromSitemap?: string; range?: string; top: number },
): Promise<string[]> {
  if (cmdOpts.urls) {
    return fs.readFileSync(cmdOpts.urls, 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, cmdOpts.top)
  }
  if (cmdOpts.fromSitemap) {
    const res = await fetch(cmdOpts.fromSitemap)
    if (!res.ok) throw new Error(`Failed to fetch sitemap (${res.status})`)
    return parseLocs(await res.text()).slice(0, cmdOpts.top)
  }
  // default: top pages from performance
  const { startDate, endDate } = resolveDateRange({ range: cmdOpts.range })
  const r = await client.searchAnalytics(site, { startDate, endDate, dimensions: ['page'], rowLimit: cmdOpts.top })
  return (r.rows ?? []).map((row) => row.keys?.[0] ?? '').filter(Boolean)
}

export function makeCoverageCommand(globalOpts: () => GlobalOpts): Command {
  return new Command('coverage')
    .description('Index-coverage audit: inspect top pages, group by indexed vs. excluded + reason')
    .option('--site <siteUrl>', 'property (or use global --site)')
    .option('--from-sitemap <url>', 'source URLs from a sitemap XML')
    .option('--urls <file>', 'source URLs from a newline-delimited file')
    .option('--range <preset>', 'date preset for top-pages source (default last-28d)')
    .option('--top <n>', 'number of pages to inspect (quota 2000/day)', (v) => parseInt(v, 10), 100)
    .option('--throttle <ms>', 'delay between inspections', (v) => parseInt(v, 10), 250)
    .option('--problems-only', 'only return pages that are not indexed')
    .action(async (cmdOpts) => {
      const opts = globalOpts()
      const site = requireSite(opts, cmdOpts.site)
      const { client } = requireClient(opts)

      try {
        const urls = await withSpinner('Sourcing URLs…', () => sourceUrls(client, site, cmdOpts), opts)
        const indexed: string[] = []
        const problems: Array<{ url: string; coverageState: string | null; verdict: string | null }> = []
        const byCoverage: Record<string, number> = {}

        for (let i = 0; i < urls.length; i++) {
          const u = urls[i]!
          try {
            const res = await client.inspectUrl(site, u, 'en-US')
            const idx = res.inspectionResult?.indexStatusResult ?? {}
            const cov = idx.coverageState ?? 'Unknown'
            byCoverage[cov] = (byCoverage[cov] ?? 0) + 1
            const isIndexed = idx.verdict === 'PASS' && /indexed/i.test(cov)
            if (isIndexed) indexed.push(u)
            else problems.push({ url: u, coverageState: idx.coverageState ?? null, verdict: idx.verdict ?? null })
          } catch (e) {
            problems.push({ url: u, coverageState: `ERROR: ${e instanceof Error ? e.message : String(e)}`, verdict: 'ERROR' })
            byCoverage.ERROR = (byCoverage.ERROR ?? 0) + 1
          }
          if (cmdOpts.throttle > 0 && i < urls.length - 1) await sleep(cmdOpts.throttle)
        }

        const data = {
          summary: { inspected: urls.length, indexed: indexed.length, problems: problems.length, byCoverage },
          problems,
          ...(cmdOpts.problemsOnly ? {} : { indexed }),
        }
        writeLast(data)

        if (shouldOutputJson(opts)) {
          outputEnvelope({ data, command: 'coverage', metadata: { inspected: urls.length } }, opts)
        } else {
          process.stdout.write(
            `Inspected ${urls.length} · ${indexed.length} indexed · ${problems.length} problems\n\n`,
          )
          if (problems.length) {
            process.stdout.write(renderTable(
              problems as unknown as Record<string, unknown>[],
              [{ key: 'verdict', header: 'Verdict' }, { key: 'coverageState', header: 'State' }, { key: 'url', header: 'URL' }],
            ) + '\n')
          } else {
            process.stdout.write('All inspected pages are indexed. 🎉\n')
          }
        }
      } catch (e) { failApi(e, opts) }
    })
}
