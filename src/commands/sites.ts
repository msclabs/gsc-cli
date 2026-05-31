import { Command } from '@commander-js/extra-typings'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope } from '../lib/output.js'
import { requireConfirm } from '../lib/confirm.js'
import { parseDryRun } from '../lib/dryrun.js'
import { withSpinner } from '../lib/spinner.js'
import { outputRows } from '../lib/rows.js'
import { writeLast } from '../lib/cache.js'
import { requireClient, failApi } from '../lib/run.js'
import { normalizeSiteUrl } from '../lib/gsc.js'

export function makeSitesCommand(globalOpts: () => GlobalOpts): Command {
  const sites = new Command('sites').description('Manage Search Console properties')

  sites
    .command('list')
    .description('List all properties (sites.list)')
    .action(async () => {
      const opts = globalOpts()
      const { client } = requireClient(opts)
      try {
        const data = await withSpinner('Fetching properties…', () => client.listSites(), opts)
        writeLast(data)
        outputRows(
          data as unknown as Record<string, unknown>[],
          [{ key: 'siteUrl', header: 'Property' }, { key: 'permissionLevel', header: 'Permission' }],
          'sites list',
          opts,
          { count: data.length },
          'No properties. Add the service-account email as a user in Search Console.',
        )
      } catch (e) { failApi(e, opts) }
    })

  sites
    .command('get')
    .description('Get one property (sites.get)')
    .argument('<siteUrl>', 'property URL or sc-domain:example.com')
    .action(async (siteUrl) => {
      const opts = globalOpts()
      const { client } = requireClient(opts)
      try {
        const data = await client.getSite(normalizeSiteUrl(siteUrl))
        outputEnvelope({ data, command: 'sites get' }, opts)
      } catch (e) { failApi(e, opts) }
    })

  sites
    .command('add')
    .description('Add a property to the account (sites.add — does NOT verify)')
    .argument('<siteUrl>', 'property URL or sc-domain:example.com')
    .action(async (siteUrl) => {
      const opts = globalOpts()
      const site = normalizeSiteUrl(siteUrl)
      requireConfirm(opts.confirm, site, opts)
      if (parseDryRun(opts.dryRun) === 'client') {
        outputEnvelope({ data: { would_add: site, mode: 'client' }, command: 'sites add', metadata: { dry_run: 'client' } }, opts)
        return
      }
      const { client } = requireClient(opts)
      try {
        await client.addSite(site)
        outputEnvelope({ data: { siteUrl: site, added: true }, command: 'sites add' }, opts)
      } catch (e) { failApi(e, opts) }
    })

  sites
    .command('remove')
    .description('Remove a property from the account (sites.delete — destructive)')
    .argument('<siteUrl>', 'property URL or sc-domain:example.com')
    .action(async (siteUrl) => {
      const opts = globalOpts()
      const site = normalizeSiteUrl(siteUrl)
      requireConfirm(opts.confirm, site, opts)
      if (parseDryRun(opts.dryRun) === 'client') {
        outputEnvelope({ data: { would_remove: site, mode: 'client' }, command: 'sites remove', metadata: { dry_run: 'client' } }, opts)
        return
      }
      const { client } = requireClient(opts)
      try {
        await client.deleteSite(site)
        outputEnvelope({ data: { siteUrl: site, removed: true }, command: 'sites remove' }, opts)
      } catch (e) { failApi(e, opts) }
    })

  return sites
}
