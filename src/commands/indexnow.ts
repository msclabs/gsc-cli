import { Command } from '@commander-js/extra-typings'
import * as fs from 'node:fs'
import pc from 'picocolors'
import { resolveSite, type GlobalOpts } from '../lib/config.js'
import { outputEnvelope, outputError, shouldOutputJson, ExitCode } from '../lib/output.js'
import { outputStream, resetSequence } from '../lib/stream.js'
import { withSpinner } from '../lib/spinner.js'
import { writeLast } from '../lib/cache.js'
import { failApi } from '../lib/run.js'
import { parseDryRun } from '../lib/dryrun.js'
import {
  makeIndexNowClient, generateKey, isValidKey, verifyKeyFile,
  hostFromSite, parseSitemapLocs, INDEXNOW_ENGINES, INDEXNOW_ENDPOINT, MAX_URLS_PER_REQUEST,
} from '../core/indexnow.js'
import {
  setHostKey, getHostConfig, resolveKey, resolveKeyLocation,
} from '../lib/indexnow-config.js'

// Resolve a bare host from --host or the gsc --site chain. Exits with a clear
// hint if neither is available.
function requireHost(opts: GlobalOpts, explicit?: string): string {
  if (explicit) {
    const h = hostFromSite(explicit)
    if (h) return h
  }
  const site = resolveSite(opts)
  const h = site ? hostFromSite(site) : null
  if (!h) {
    outputError({
      code: 'VALIDATION',
      message: 'No host specified.',
      hint: 'Pass --host <domain>, or set a --site / default site (sc-domain:example.com).',
    }, opts)
    process.exit(ExitCode.VALIDATION)
  }
  return h
}

function readStdinLines(): string[] {
  try {
    return fs.readFileSync(0, 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function makeIndexNowCommand(globalOpts: () => GlobalOpts): Command {
  const inow = new Command('indexnow')
    .description('Instant-index URLs via IndexNow (Bing, Yandex, Naver, Seznam, Yep — not Google)')

  // --- key management ------------------------------------------------------
  const key = new Command('key').description('Manage IndexNow keys (generate | set | show | verify)')

  key
    .command('generate')
    .description('Print a fresh protocol-valid key (32 hex chars)')
    .action(() => {
      const opts = globalOpts()
      const k = generateKey()
      if (shouldOutputJson(opts)) outputEnvelope({ data: { key: k }, command: 'indexnow key generate' }, opts)
      else process.stdout.write(k + '\n')
    })

  key
    .command('set')
    .description('Store a key for a host (generates one if --key is omitted) and print the file to host')
    .option('--host <domain>', 'the bare host (defaults to --site)')
    .option('--key <key>', 'an existing key to store (8-128 chars of a-z A-Z 0-9 -)')
    .option('--key-location <url>', 'where the key file is hosted (default: https://host/{key}.txt)')
    .action((cmdOpts) => {
      const opts = globalOpts()
      const host = requireHost(opts, cmdOpts.host)
      const k = cmdOpts.key ?? generateKey()
      if (!isValidKey(k)) {
        outputError({ code: 'VALIDATION', message: `Invalid key "${k}". Use 8-128 chars: a-z A-Z 0-9 and dashes.` }, opts)
        process.exit(ExitCode.VALIDATION)
      }
      const keyLocation = resolveKeyLocation(host, k, cmdOpts.keyLocation)
      setHostKey(host, k, cmdOpts.keyLocation ?? keyLocation)
      const fileName = `${k}.txt`
      const data = { host, key: k, key_location: keyLocation, file_name: fileName, file_contents: k }
      if (shouldOutputJson(opts)) {
        outputEnvelope({ data, command: 'indexnow key set' }, opts)
      } else {
        process.stdout.write(pc.green(`Stored key for ${host}.\n`))
        process.stdout.write(`\nHost this file so engines can verify ownership:\n`)
        process.stdout.write(pc.bold(`  ${keyLocation}\n`))
        process.stdout.write(`  containing exactly: ${pc.bold(k)}\n`)
        process.stdout.write(pc.dim(`\nThen: gsc indexnow key verify --host ${host}\n`))
      }
    })

  key
    .command('show')
    .description('Show the stored key + key location for a host')
    .option('--host <domain>', 'the bare host (defaults to --site)')
    .action((cmdOpts) => {
      const opts = globalOpts()
      const host = requireHost(opts, cmdOpts.host)
      const cfg = getHostConfig(host)
      if (!cfg) {
        outputError({ code: 'NOT_FOUND', message: `No key stored for ${host}.`, hint: `Run: gsc indexnow key set --host ${host}` }, opts)
        process.exit(ExitCode.NOT_FOUND)
      }
      const keyLocation = resolveKeyLocation(host, cfg.key)
      outputEnvelope({ data: { host, key: cfg.key, key_location: keyLocation }, command: 'indexnow key show' }, opts)
    })

  key
    .command('verify')
    .description('Fetch the hosted key file and confirm it matches')
    .option('--host <domain>', 'the bare host (defaults to --site)')
    .option('--key <key>', 'override the stored key')
    .option('--key-location <url>', 'override the key file URL')
    .action(async (cmdOpts) => {
      const opts = globalOpts()
      const host = requireHost(opts, cmdOpts.host)
      const k = resolveKey(host, cmdOpts.key)
      if (!k) {
        outputError({ code: 'NOT_FOUND', message: `No key for ${host}.`, hint: `Run: gsc indexnow key set --host ${host}` }, opts)
        process.exit(ExitCode.NOT_FOUND)
      }
      const keyLocation = resolveKeyLocation(host, k, cmdOpts.keyLocation)
      try {
        const r = await withSpinner('Verifying…', () => verifyKeyFile(keyLocation, k, opts.timeout), opts)
        const status = r.matches ? 'success' as const : 'error' as const
        outputEnvelope({
          data: { host, key_location: keyLocation, reachable: r.reachable, matches: r.matches, http_status: r.status },
          status,
          command: 'indexnow key verify',
        }, opts)
        if (!r.matches) process.exit(r.reachable ? ExitCode.VALIDATION : ExitCode.NOT_FOUND)
      } catch (e) { failApi(e, opts) }
    })

  inow.addCommand(key)

  // --- submit --------------------------------------------------------------
  inow
    .command('submit')
    .description('Submit one or more URLs (1 = GET, many = batched POST, <=10k/request)')
    .argument('[urls...]', 'URLs to submit')
    .option('--host <domain>', 'the bare host (defaults to --site)')
    .option('--key <key>', 'override the stored/env key')
    .option('--key-location <url>', 'override the key file URL')
    .option('--from-sitemap <url>', 'fetch + parse a sitemap (or sitemap index) for URLs')
    .option('--urls <file>', 'newline-delimited file of URLs')
    .option('--from-stdin', 'read newline-delimited URLs from stdin')
    .option('--endpoint <url>', `engine endpoint (default: ${INDEXNOW_ENDPOINT})`)
    .action(async (urlArgs, cmdOpts) => {
      const opts = globalOpts()
      const host = requireHost(opts, cmdOpts.host)
      const k = resolveKey(host, cmdOpts.key)
      if (!k) {
        outputError({ code: 'AUTH_MISSING', message: `No IndexNow key for ${host}.`, hint: `Run: gsc indexnow key set --host ${host}` }, opts)
        process.exit(ExitCode.AUTH)
      }
      const keyLocation = resolveKeyLocation(host, k, cmdOpts.keyLocation)

      // Gather URLs from all sources.
      let urls: string[] = [...(urlArgs ?? [])]
      if (cmdOpts.urls) urls.push(...fs.readFileSync(cmdOpts.urls, 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean))
      if (cmdOpts.fromStdin) urls.push(...readStdinLines())
      if (cmdOpts.fromSitemap) {
        try {
          const res = await fetch(cmdOpts.fromSitemap)
          if (!res.ok) throw new Error(`Failed to fetch sitemap (${res.status}): ${cmdOpts.fromSitemap}`)
          urls.push(...parseSitemapLocs(await res.text()))
        } catch (e) { failApi(e, opts) }
      }
      // Dedup, keep only http(s).
      urls = [...new Set(urls)].filter((u) => /^https?:\/\//i.test(u))

      if (urls.length === 0) {
        outputError({ code: 'VALIDATION', message: 'No URLs to submit.', hint: 'Pass URLs as args, or --urls / --from-sitemap / --from-stdin.' }, opts)
        process.exit(ExitCode.VALIDATION)
      }

      if (parseDryRun(opts.dryRun) === 'client') {
        outputEnvelope({ data: { would_submit: urls.length, host, key_location: keyLocation, sample: urls.slice(0, 5) }, command: 'indexnow submit', metadata: { dry_run: 'client' } }, opts)
        return
      }

      const client = makeIndexNowClient({ endpoint: cmdOpts.endpoint, timeoutMs: opts.timeout })
      const batches = chunk(urls, MAX_URLS_PER_REQUEST)
      const streaming = opts.format === 'ndjson'
      if (streaming) { resetSequence(); outputStream({ type: 'start', timestamp: Date.now(), payload: { count: urls.length, host, batches: batches.length } }, opts) }

      try {
        // Single URL → GET; otherwise one POST per <=10k batch.
        if (urls.length === 1) {
          const r = await withSpinner('Submitting…', () => client.submitOne(urls[0]!, k, keyLocation), opts)
          const data = { host, submitted: 1, http_status: r.status, endpoint: r.endpoint }
          writeLast(data)
          if (streaming) { outputStream({ type: 'end', timestamp: Date.now(), payload: data }, opts); return }
          outputEnvelope({ data, command: 'indexnow submit' }, opts)
          return
        }
        let submitted = 0
        const results: Array<{ batch: number; count: number; http_status: number }> = []
        for (let i = 0; i < batches.length; i++) {
          const b = batches[i]!
          const r = await withSpinner(`Submitting batch ${i + 1}/${batches.length} (${b.length})…`, () => client.submitBatch(host, b, k, keyLocation), opts)
          submitted += b.length
          results.push({ batch: i + 1, count: b.length, http_status: r.status })
          if (streaming) outputStream({ type: 'item', timestamp: Date.now(), payload: { batch: i + 1, count: b.length, http_status: r.status } }, opts)
        }
        const data = { host, submitted, batches: results, endpoint: cmdOpts.endpoint ?? INDEXNOW_ENDPOINT }
        writeLast(data)
        if (streaming) { outputStream({ type: 'end', timestamp: Date.now(), payload: { submitted } }, opts); return }
        outputEnvelope({ data, command: 'indexnow submit' }, opts)
      } catch (e) { failApi(e, opts) }
    })

  // --- engines -------------------------------------------------------------
  inow
    .command('engines')
    .description('List participating IndexNow search engines')
    .action(() => {
      const opts = globalOpts()
      outputEnvelope({ data: { endpoint: INDEXNOW_ENDPOINT, engines: INDEXNOW_ENGINES, note: 'Google does not participate — use `gsc index` / `gsc sitemaps` for Google.' }, command: 'indexnow engines' }, opts)
    })

  return inow
}
