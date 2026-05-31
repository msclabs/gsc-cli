import { Command } from '@commander-js/extra-typings'
import type { GlobalOpts } from '../lib/config.js'
import { outputStream, resetSequence } from '../lib/stream.js'
import { withSpinner } from '../lib/spinner.js'
import { outputRows } from '../lib/rows.js'
import { writeLast } from '../lib/cache.js'
import { requireClient, requireSite, failApi } from '../lib/run.js'
import { parseFilters, resolveDateRange, RANGE_KEYS, parseDimensions, flattenRows } from '../lib/gsc.js'
import type { Dimension, SearchType, DataState, SearchAnalyticsQuery, SearchAnalyticsRow } from '../core/types.js'
import type { GscClient } from '../core/client.js'

const MAX_ROWS = 25000

interface QueryOpts {
  site?: string
  start?: string; end?: string; range?: string
  dim?: string; type?: string; filter?: string[]
  limit?: number; startRow?: number; dataState?: string
  aggregation?: string; all?: boolean
}

interface OppOpts extends QueryOpts {
  minImpressions?: number; minPosition?: number; maxPosition?: number; top?: number
}

function buildQuery(o: QueryOpts, dims: Dimension[]): SearchAnalyticsQuery {
  const { startDate, endDate } = resolveDateRange(o)
  const q: SearchAnalyticsQuery = {
    startDate,
    endDate,
    dimensions: dims,
    type: (o.type as SearchType) ?? 'web',
  }
  const groups = parseFilters(o.filter)
  if (groups) q.dimensionFilterGroups = groups
  if (o.dataState) q.dataState = o.dataState as DataState
  if (o.aggregation) q.aggregationType = o.aggregation as SearchAnalyticsQuery['aggregationType']
  return q
}

// Fetch all rows, paginating by startRow until a short page (buildkite-style
// boundary handling: stop when fewer rows than the page size come back).
async function fetchAll(client: GscClient, site: string, base: SearchAnalyticsQuery, pageSize: number) {
  const rows: SearchAnalyticsRow[] = []
  let startRow = 0
  let aggregation: string | undefined
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await client.searchAnalytics(site, { ...base, rowLimit: pageSize, startRow })
    aggregation = res.responseAggregationType
    const batch = res.rows ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
    startRow += pageSize
  }
  return { rows, responseAggregationType: aggregation }
}

function dimColumns(dims: Dimension[]) {
  return [
    ...dims.map((d) => ({ key: d as string, header: d })),
    { key: 'clicks', header: 'Clicks' },
    { key: 'impressions', header: 'Impr' },
    { key: 'ctr', header: 'CTR%' },
    { key: 'position', header: 'Pos' },
  ]
}

function attachQueryOpts(cmd: Command): Command {
  return cmd
    .option('--site <siteUrl>', 'property (or use global --site)')
    .option('--start <date>', 'start date YYYY-MM-DD')
    .option('--end <date>', 'end date YYYY-MM-DD (default: today)')
    .option('--range <preset>', `date preset: ${RANGE_KEYS.join(', ')} (default: last-28d)`)
    .option('--type <type>', 'web | image | video | news | googleNews | discover', 'web')
    .option('--filter <expr...>', 'filter e.g. country=usa, device=MOBILE, query~calc, page!~/blog')
    .option('--limit <n>', 'rowLimit per request (1-25000)', (v) => parseInt(v, 10))
    .option('--start-row <n>', 'pagination offset', (v) => parseInt(v, 10))
    .option('--data-state <state>', 'final | all | hourly_all')
    .option('--aggregation <type>', 'auto | byPage | byProperty')
    .option('--all', 'auto-paginate all rows')
}

async function runAndOutput(
  globalOpts: () => GlobalOpts,
  cmdOpts: QueryOpts,
  dims: Dimension[],
  command: string,
) {
  const opts = globalOpts()
  const site = requireSite(opts, cmdOpts.site)
  const { client } = requireClient(opts)
  const base = buildQuery(cmdOpts, dims)

  try {
    // NDJSON streaming path (big exports).
    if (cmdOpts.all && opts.format === 'ndjson') {
      resetSequence()
      outputStream({ type: 'start', timestamp: Date.now(), payload: { command, site, ...base } }, opts)
      const pageSize = Math.min(cmdOpts.limit ?? MAX_ROWS, MAX_ROWS)
      let startRow = 0
      let total = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await client.searchAnalytics(site, { ...base, rowLimit: pageSize, startRow })
        const batch = flattenRows(res.rows, dims)
        for (const row of batch) { outputStream({ type: 'item', timestamp: Date.now(), payload: row }, opts); total++ }
        if ((res.rows?.length ?? 0) < pageSize) break
        startRow += pageSize
      }
      outputStream({ type: 'end', timestamp: Date.now(), payload: { count: total } }, opts)
      return
    }

    let flat
    let aggregation: string | undefined
    if (cmdOpts.all) {
      const pageSize = Math.min(cmdOpts.limit ?? MAX_ROWS, MAX_ROWS)
      const res = await withSpinner('Querying Search Analytics…', () => fetchAll(client, site, base, pageSize), opts)
      flat = flattenRows(res.rows, dims)
      aggregation = res.responseAggregationType
    } else {
      const single: SearchAnalyticsQuery = {
        ...base,
        rowLimit: Math.min(cmdOpts.limit ?? 1000, MAX_ROWS),
        startRow: cmdOpts.startRow ?? 0,
      }
      const res = await withSpinner('Querying Search Analytics…', () => client.searchAnalytics(site, single), opts)
      flat = flattenRows(res.rows, dims)
      aggregation = res.responseAggregationType
    }

    writeLast(flat)
    outputRows(
      flat as unknown as Record<string, unknown>[],
      dimColumns(dims),
      command,
      opts,
      { count: flat.length, range: { start: base.startDate, end: base.endDate }, aggregation, type: base.type },
      'No rows. (Data lags 2-3 days; try --range last-7d or widen filters.)',
    )
  } catch (e) { failApi(e, opts) }
}

export function makePerfCommand(globalOpts: () => GlobalOpts): Command {
  const perf = new Command('perf').description('Search performance / keywords (searchanalytics.query)')

  attachQueryOpts(
    perf
      .command('query')
      .description('Raw Search Analytics query with custom dimensions')
      .option('--dim <list>', 'comma dimensions: query,page,country,device,date,searchAppearance', 'query'),
  ).action(async (raw) => {
    const cmdOpts = raw as unknown as QueryOpts
    const dims = parseDimensions(cmdOpts.dim, ['query'])
    await runAndOutput(globalOpts, cmdOpts, dims, 'perf query')
  })

  attachQueryOpts(
    perf.command('keywords').description('Top queries by clicks (dim=query)'),
  ).action(async (raw) => {
    await runAndOutput(globalOpts, raw as unknown as QueryOpts, ['query'], 'perf keywords')
  })

  attachQueryOpts(
    perf.command('pages').description('Top pages by clicks (dim=page)'),
  ).action(async (raw) => {
    await runAndOutput(globalOpts, raw as unknown as QueryOpts, ['page'], 'perf pages')
  })

  attachQueryOpts(
    perf.command('dates').description('Clicks/impressions by date (dim=date) — probe data freshness'),
  ).action(async (raw) => {
    await runAndOutput(globalOpts, raw as unknown as QueryOpts, ['date'], 'perf dates')
  })

  // Derived: "what to improve" — queries with high impressions, page 1-2
  // (position 5-20), but low CTR. Striking-distance opportunities.
  attachQueryOpts(
    perf
      .command('opportunities')
      .description('Striking-distance keywords: high impressions, position 5-20, low CTR')
      .option('--min-impressions <n>', 'minimum impressions threshold', (v) => parseInt(v, 10), 100)
      .option('--min-position <n>', 'min average position', (v) => parseFloat(v), 5)
      .option('--max-position <n>', 'max average position', (v) => parseFloat(v), 20)
      .option('--top <n>', 'return top N opportunities', (v) => parseInt(v, 10), 50),
  ).action(async (raw) => {
    const cmdOpts = raw as unknown as OppOpts
    const opts = globalOpts()
    const site = requireSite(opts, cmdOpts.site)
    const { client } = requireClient(opts)
    const base = buildQuery(cmdOpts, ['query', 'page'])
    try {
      const res = await withSpinner('Finding opportunities…', () =>
        fetchAll(client, site, base, Math.min(cmdOpts.limit ?? MAX_ROWS, MAX_ROWS)), opts)
      const flat = flattenRows(res.rows, ['query', 'page'])
      const minImp = cmdOpts.minImpressions ?? 100
      const minPos = cmdOpts.minPosition ?? 5
      const maxPos = cmdOpts.maxPosition ?? 20
      const opportunities = flat
        .filter((r) => (r.impressions as number) >= minImp && (r.position as number) >= minPos && (r.position as number) <= maxPos)
        .sort((a, b) => (b.impressions as number) - (a.impressions as number))
        .slice(0, cmdOpts.top ?? 50)
      writeLast(opportunities)
      outputRows(
        opportunities as unknown as Record<string, unknown>[],
        dimColumns(['query', 'page']),
        'perf opportunities',
        opts,
        { count: opportunities.length, criteria: { minImpressions: minImp, position: [minPos, maxPos] }, range: { start: base.startDate, end: base.endDate } },
        'No striking-distance opportunities in range. Try lowering --min-impressions.',
      )
    } catch (e) { failApi(e, opts) }
  })

  return perf
}
