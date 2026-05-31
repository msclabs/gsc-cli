// Search Console-specific helpers: siteUrl normalization, terse filter parsing,
// date-range presets, and row flattening.
import type {
  Dimension, DimensionFilter, DimensionFilterGroup, FilterOperator,
  FlatRow, SearchAnalyticsRow,
} from '../core/types.js'

// --- siteUrl ---------------------------------------------------------------

// Accept `sc-domain:example.com`, `https://example.com/`, or a bare
// `example.com` (treated as a URL-prefix property over https). Ensures a
// trailing slash for URL-prefix properties.
export function normalizeSiteUrl(input: string): string {
  const s = input.trim()
  if (s.startsWith('sc-domain:')) return s
  let url = s
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  if (!url.endsWith('/')) url += '/'
  return url
}

export function isDomainProperty(siteUrl: string): boolean {
  return siteUrl.startsWith('sc-domain:')
}

// --- filters ---------------------------------------------------------------

const FILTER_OPS: Array<[token: string, op: FilterOperator]> = [
  ['!~', 'excludingRegex'],
  ['~', 'includingRegex'],
  ['!=', 'notEquals'],
  ['=', 'equals'],
]

const VALID_FILTER_DIMENSIONS = new Set(['country', 'device', 'page', 'query', 'searchAppearance'])

// Parse repeatable `--filter` tokens into a single AND group.
// Syntax: `key=val` (equals), `key!=val` (notEquals),
//         `key~val` (includingRegex), `key!~val` (excludingRegex).
export function parseFilters(filters: string[] | undefined): DimensionFilterGroup[] | undefined {
  if (!filters || filters.length === 0) return undefined
  const parsed: DimensionFilter[] = []
  for (const raw of filters) {
    let matched = false
    for (const [token, op] of FILTER_OPS) {
      const idx = raw.indexOf(token)
      if (idx > 0) {
        const dimension = raw.slice(0, idx).trim()
        const expression = raw.slice(idx + token.length).trim()
        if (!VALID_FILTER_DIMENSIONS.has(dimension)) {
          throw new Error(`Invalid filter dimension "${dimension}". Valid: ${[...VALID_FILTER_DIMENSIONS].join(', ')}`)
        }
        parsed.push({ dimension, operator: op, expression })
        matched = true
        break
      }
    }
    if (!matched) {
      throw new Error(`Cannot parse filter "${raw}". Use key=val, key!=val, key~regex, or key!~regex.`)
    }
  }
  return [{ groupType: 'and', filters: parsed }]
}

// --- dates -----------------------------------------------------------------

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

const RANGE_PRESETS: Record<string, number> = {
  'last-7d': 7,
  'last-28d': 28,
  'last-30d': 30,
  'last-90d': 90,
  'last-3mo': 90,
  'last-6mo': 180,
  'last-12mo': 365,
  'last-16mo': 485,
}

// Resolve a date range from explicit start/end or a --range preset.
// Defaults to last-28d ending today (matching the Search Console UI default).
export function resolveDateRange(opts: { start?: string; end?: string; range?: string }): { startDate: string; endDate: string } {
  const end = opts.end ?? fmtDate(new Date())
  if (opts.start) return { startDate: opts.start, endDate: end }
  const preset = opts.range ?? 'last-28d'
  const days = RANGE_PRESETS[preset]
  if (days === undefined) {
    throw new Error(`Unknown --range "${preset}". Use one of: ${Object.keys(RANGE_PRESETS).join(', ')} — or pass --start/--end.`)
  }
  return { startDate: fmtDate(daysAgo(days)), endDate: end }
}

export const RANGE_KEYS = Object.keys(RANGE_PRESETS)

// --- rows ------------------------------------------------------------------

// Flatten API rows (keys[] positional array) into named dimension columns
// plus metrics. The single most important UX detail — raw keys[] is unusable.
export function flattenRows(rows: SearchAnalyticsRow[] | undefined, dimensions: Dimension[]): FlatRow[] {
  if (!rows) return []
  return rows.map((r) => {
    const out: FlatRow = {}
    dimensions.forEach((dim, i) => { out[dim] = r.keys?.[i] ?? '' })
    out.clicks = r.clicks
    out.impressions = r.impressions
    out.ctr = Number((r.ctr * 100).toFixed(2)) // expose CTR as a percentage
    out.position = Number(r.position.toFixed(2))
    return out
  })
}

export function parseDimensions(input: string | undefined, fallback: Dimension[]): Dimension[] {
  if (!input) return fallback
  return input.split(',').map((s) => s.trim()).filter(Boolean) as Dimension[]
}
