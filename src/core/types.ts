// Types for the Google Search Console + Indexing APIs.

export interface SiteEntry {
  siteUrl: string
  permissionLevel: 'siteOwner' | 'siteFullUser' | 'siteRestrictedUser' | 'siteUnverifiedUser'
}

export interface SitesListResult {
  siteEntry?: SiteEntry[]
}

export type SearchType = 'web' | 'image' | 'video' | 'news' | 'googleNews' | 'discover'
export type Dimension = 'query' | 'page' | 'country' | 'device' | 'searchAppearance' | 'date' | 'hour'
export type DataState = 'final' | 'all' | 'hourly_all'
export type FilterOperator = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'includingRegex' | 'excludingRegex'

export interface DimensionFilter {
  dimension: string
  operator: FilterOperator
  expression: string
}

export interface DimensionFilterGroup {
  groupType: 'and'
  filters: DimensionFilter[]
}

export interface SearchAnalyticsQuery {
  startDate: string
  endDate: string
  dimensions?: Dimension[]
  type?: SearchType
  dimensionFilterGroups?: DimensionFilterGroup[]
  aggregationType?: 'auto' | 'byPage' | 'byProperty' | 'byNewsShowcasePanel'
  rowLimit?: number
  startRow?: number
  dataState?: DataState
}

export interface SearchAnalyticsRow {
  keys?: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchAnalyticsResult {
  rows?: SearchAnalyticsRow[]
  responseAggregationType?: string
  metadata?: { first_incomplete_date?: string; first_incomplete_hour?: string }
}

// A row flattened from keys[] into named dimension columns + metrics.
export type FlatRow = Record<string, string | number>

export interface SitemapContent {
  type: string
  submitted: string
  indexed: string
}

export interface WmxSitemap {
  path: string
  lastSubmitted?: string
  isPending?: boolean
  isSitemapsIndex?: boolean
  type?: string
  lastDownloaded?: string
  warnings?: string
  errors?: string
  contents?: SitemapContent[]
}

export interface SitemapsListResult {
  sitemap?: WmxSitemap[]
}

export interface UrlInspectionResult {
  inspectionResult?: {
    inspectionResultLink?: string
    indexStatusResult?: {
      verdict?: string
      coverageState?: string
      robotsTxtState?: string
      indexingState?: string
      lastCrawlTime?: string
      pageFetchState?: string
      googleCanonical?: string
      userCanonical?: string
      sitemap?: string[]
      referringUrls?: string[]
      crawledAs?: string
    }
    ampResult?: Record<string, unknown>
    mobileUsabilityResult?: Record<string, unknown>
    richResultsResult?: Record<string, unknown>
  }
}

export type UrlNotificationType = 'URL_UPDATED' | 'URL_DELETED'

export interface UrlNotificationMetadata {
  url?: string
  latestUpdate?: { url: string; type: string; notifyTime: string }
  latestRemove?: { url: string; type: string; notifyTime: string }
}
