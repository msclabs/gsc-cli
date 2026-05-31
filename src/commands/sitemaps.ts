import { Command } from '@commander-js/extra-typings'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope } from '../lib/output.js'
import { requireConfirm } from '../lib/confirm.js'
import { parseDryRun } from '../lib/dryrun.js'
import { withSpinner } from '../lib/spinner.js'
import { outputRows } from '../lib/rows.js'
import { writeLast } from '../lib/cache.js'
import { requireClient, requireSite, failApi } from '../lib/run.js'

export function makeSitemapsCommand(globalOpts: () => GlobalOpts): Command {
  const sm = new Command('sitemaps').description('Manage sitemaps (sitemaps.*)')

  sm
    .command('list')
    .description('List sitemaps for a property')
    .option('--site <siteUrl>', 'property (or use global --site)')
    .option('--index <indexUrl>', 'list child sitemaps of this sitemap-index')
    .action(async (cmdOpts) => {
      const opts = globalOpts()
      const site = requireSite(opts, cmdOpts.site)
      const { client } = requireClient(opts)
      try {
        const data = await withSpinner('Fetching sitemaps…', () => client.listSitemaps(site, cmdOpts.index), opts)
        writeLast(data)
        outputRows(
          data as unknown as Record<string, unknown>[],
          [
            { key: 'path', header: 'Path' },
            { key: 'isPending', header: 'Pending' },
            { key: 'errors', header: 'Errors' },
            { key: 'warnings', header: 'Warnings' },
            { key: 'lastSubmitted', header: 'Submitted' },
          ],
          'sitemaps list',
          opts,
          { count: data.length },
          'No sitemaps submitted for this property.',
        )
      } catch (e) { failApi(e, opts) }
    })

  sm
    .command('get')
    .description('Get one sitemap (errors, warnings, contents)')
    .argument('<feedpath>', 'sitemap URL, e.g. https://example.com/sitemap.xml')
    .option('--site <siteUrl>', 'property (or use global --site)')
    .action(async (feedpath, cmdOpts) => {
      const opts = globalOpts()
      const site = requireSite(opts, cmdOpts.site)
      const { client } = requireClient(opts)
      try {
        const data = await client.getSitemap(site, feedpath)
        outputEnvelope({ data, command: 'sitemaps get' }, opts)
      } catch (e) { failApi(e, opts) }
    })

  sm
    .command('submit')
    .description('Submit a sitemap (sitemaps.submit)')
    .argument('<feedpath>', 'sitemap URL to submit')
    .option('--site <siteUrl>', 'property (or use global --site)')
    .action(async (feedpath, cmdOpts) => {
      const opts = globalOpts()
      const site = requireSite(opts, cmdOpts.site)
      if (parseDryRun(opts.dryRun) === 'client') {
        outputEnvelope({ data: { would_submit: feedpath, site, mode: 'client' }, command: 'sitemaps submit', metadata: { dry_run: 'client' } }, opts)
        return
      }
      const { client } = requireClient(opts)
      try {
        await client.submitSitemap(site, feedpath)
        outputEnvelope({ data: { feedpath, site, submitted: true }, command: 'sitemaps submit' }, opts)
      } catch (e) { failApi(e, opts) }
    })

  sm
    .command('delete')
    .description('Delete (unsubmit) a sitemap (destructive — requires --confirm <feedpath>)')
    .argument('<feedpath>', 'sitemap URL to delete')
    .option('--site <siteUrl>', 'property (or use global --site)')
    .action(async (feedpath, cmdOpts) => {
      const opts = globalOpts()
      const site = requireSite(opts, cmdOpts.site)
      requireConfirm(opts.confirm, feedpath, opts)
      if (parseDryRun(opts.dryRun) === 'client') {
        outputEnvelope({ data: { would_delete: feedpath, site, mode: 'client' }, command: 'sitemaps delete', metadata: { dry_run: 'client' } }, opts)
        return
      }
      const { client } = requireClient(opts)
      try {
        await client.deleteSitemap(site, feedpath)
        outputEnvelope({ data: { feedpath, site, deleted: true }, command: 'sitemaps delete' }, opts)
      } catch (e) { failApi(e, opts) }
    })

  return sm
}
