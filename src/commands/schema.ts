import { Command } from '@commander-js/extra-typings'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope, outputError, ExitCode } from '../lib/output.js'

const DRAFT = 'https://json-schema.org/draft/2020-12/schema'

const perfRow = {
  type: 'object',
  description: 'Flattened Search Analytics row. Dimension columns vary by --dim.',
  properties: {
    query: { type: 'string' },
    page: { type: 'string' },
    clicks: { type: 'number' },
    impressions: { type: 'number' },
    ctr: { type: 'number', description: 'CTR as a percentage (0-100)' },
    position: { type: 'number' },
  },
}

const SCHEMAS: Record<string, unknown> = {
  'sites list': {
    $schema: DRAFT,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        siteUrl: { type: 'string' },
        permissionLevel: { enum: ['siteOwner', 'siteFullUser', 'siteRestrictedUser', 'siteUnverifiedUser'] },
      },
      required: ['siteUrl', 'permissionLevel'],
    },
  },
  'perf query': { $schema: DRAFT, type: 'array', items: perfRow },
  'perf keywords': { $schema: DRAFT, type: 'array', items: perfRow },
  'perf pages': { $schema: DRAFT, type: 'array', items: perfRow },
  'perf opportunities': { $schema: DRAFT, type: 'array', items: perfRow },
  inspect: {
    $schema: DRAFT,
    type: 'object',
    properties: {
      url: { type: 'string' },
      verdict: { type: ['string', 'null'], enum: ['PASS', 'FAIL', 'NEUTRAL', 'PARTIAL', null] },
      coverageState: { type: ['string', 'null'] },
      indexingState: { type: ['string', 'null'] },
      robotsTxtState: { type: ['string', 'null'] },
      pageFetchState: { type: ['string', 'null'] },
      lastCrawlTime: { type: ['string', 'null'] },
      googleCanonical: { type: ['string', 'null'] },
      crawledAs: { type: ['string', 'null'] },
    },
    required: ['url'],
  },
  coverage: {
    $schema: DRAFT,
    type: 'object',
    properties: {
      summary: { type: 'object', properties: { inspected: { type: 'integer' }, indexed: { type: 'integer' }, problems: { type: 'integer' }, byCoverage: { type: 'object' } } },
      problems: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, coverageState: { type: ['string', 'null'] }, verdict: { type: ['string', 'null'] } } } },
    },
  },
  'sitemaps list': {
    $schema: DRAFT,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        isPending: { type: 'boolean' },
        isSitemapsIndex: { type: 'boolean' },
        errors: { type: 'string' },
        warnings: { type: 'string' },
        lastSubmitted: { type: 'string' },
        lastDownloaded: { type: 'string' },
        contents: { type: 'array' },
      },
    },
  },
  'index status': {
    $schema: DRAFT,
    type: 'object',
    properties: {
      url: { type: 'string' },
      latestUpdate: { type: 'object' },
      latestRemove: { type: 'object' },
    },
  },
}

export function makeSchemaCommand(globalOpts: () => GlobalOpts) {
  return new Command('schema')
    .description('Emit JSON schema for a command output')
    .argument('<command>', 'command (e.g. "perf keywords", "inspect", "sites list")')
    .action(async (cmd) => {
      const opts = globalOpts()
      const s = SCHEMAS[cmd]
      if (!s) {
        outputError({
          code: 'NOT_FOUND',
          message: `No schema for "${cmd}"`,
          hint: `Known: ${Object.keys(SCHEMAS).map((k) => `"${k}"`).join(', ')}`,
        }, opts)
        process.exit(ExitCode.NOT_FOUND)
      }
      outputEnvelope({ data: s, command: `schema ${cmd}` }, opts)
    })
}
