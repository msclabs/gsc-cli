import { Command } from '@commander-js/extra-typings'
import * as fs from 'node:fs'
import pc from 'picocolors'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope, shouldOutputJson } from '../lib/output.js'
import { outputStream, resetSequence } from '../lib/stream.js'
import { withSpinner } from '../lib/spinner.js'
import { writeLast } from '../lib/cache.js'
import { requireClient, failApi } from '../lib/run.js'
import { parseDryRun } from '../lib/dryrun.js'
import type { UrlNotificationType } from '../core/types.js'

const DAILY_QUOTA = 200
const NOTICE = 'Note: the Indexing API is officially supported only for JobPosting / BroadcastEvent pages. Other URLs may be ignored.'

function typeFor(flag: string | undefined): UrlNotificationType {
  return flag === 'deleted' ? 'URL_DELETED' : 'URL_UPDATED'
}

function sleep(ms: number) { return new Promise<void>((r) => { setTimeout(r, ms) }) }

export function makeIndexCommand(globalOpts: () => GlobalOpts): Command {
  const idx = new Command('index').description('Request (re)indexing via the Web Search Indexing API')

  idx
    .command('publish')
    .description('Notify Google a URL was updated or deleted (urlNotifications.publish)')
    .argument('<url>', 'the URL to publish')
    .option('--type <type>', 'updated | deleted', 'updated')
    .action(async (url, cmdOpts) => {
      const opts = globalOpts()
      const type = typeFor(cmdOpts.type)
      if (parseDryRun(opts.dryRun) === 'client') {
        outputEnvelope({ data: { would_publish: url, type, mode: 'client' }, command: 'index publish', metadata: { dry_run: 'client' } }, opts)
        return
      }
      const { client } = requireClient(opts)
      if (!shouldOutputJson(opts)) process.stderr.write(pc.dim(NOTICE) + '\n')
      try {
        const res = await withSpinner('Publishing…', () => client.indexPublish(url, type), opts)
        outputEnvelope({ data: { url, type, response: res }, command: 'index publish', metadata: { notice: NOTICE } }, opts)
      } catch (e) { failApi(e, opts) }
    })

  idx
    .command('publish-batch')
    .description(`Publish many URLs (quota ${DAILY_QUOTA}/day/project)`)
    .requiredOption('--urls <file>', 'newline-delimited file of URLs')
    .option('--type <type>', 'updated | deleted', 'updated')
    .option('--throttle <ms>', 'delay between publishes', (v) => parseInt(v, 10), 200)
    .option('--max <n>', `cap publishes (daily quota ${DAILY_QUOTA})`, (v) => parseInt(v, 10), DAILY_QUOTA)
    .action(async (cmdOpts) => {
      const opts = globalOpts()
      const type = typeFor(cmdOpts.type)
      let urls = fs.readFileSync(cmdOpts.urls, 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean)
      if (urls.length > cmdOpts.max) {
        process.stderr.write(`Note: ${urls.length} URLs, capping at --max ${cmdOpts.max} (daily quota ${DAILY_QUOTA}).\n`)
        urls = urls.slice(0, cmdOpts.max)
      }
      if (parseDryRun(opts.dryRun) === 'client') {
        outputEnvelope({ data: { would_publish: urls.length, type, mode: 'client' }, command: 'index publish-batch', metadata: { dry_run: 'client' } }, opts)
        return
      }
      const { client } = requireClient(opts)
      if (!shouldOutputJson(opts)) process.stderr.write(pc.dim(NOTICE) + '\n')

      const streaming = opts.format === 'ndjson'
      if (streaming) { resetSequence(); outputStream({ type: 'start', timestamp: Date.now(), payload: { count: urls.length, type } }, opts) }

      const results: Array<{ url: string; ok: boolean; error?: string }> = []
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i]!
        try {
          await client.indexPublish(u, type)
          results.push({ url: u, ok: true })
          if (streaming) outputStream({ type: 'item', timestamp: Date.now(), payload: { url: u, ok: true } }, opts)
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          results.push({ url: u, ok: false, error })
          if (streaming) outputStream({ type: 'error', timestamp: Date.now(), payload: { url: u, error } }, opts)
        }
        if (cmdOpts.throttle > 0 && i < urls.length - 1) await sleep(cmdOpts.throttle)
      }

      if (streaming) { outputStream({ type: 'end', timestamp: Date.now(), payload: { count: results.length } }, opts); return }
      const ok = results.filter((r) => r.ok).length
      writeLast(results)
      outputEnvelope({ data: { results, summary: { total: results.length, ok, failed: results.length - ok } }, command: 'index publish-batch' }, opts)
    })

  idx
    .command('status')
    .description('Get the latest notification Google received for a URL (urlNotifications.getMetadata)')
    .argument('<url>', 'the URL')
    .action(async (url) => {
      const opts = globalOpts()
      const { client } = requireClient(opts)
      try {
        const data = await client.indexGetMetadata(url)
        outputEnvelope({ data, command: 'index status' }, opts)
      } catch (e) { failApi(e, opts) }
    })

  return idx
}
