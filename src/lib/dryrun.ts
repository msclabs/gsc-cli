export type DryRunMode = 'none' | 'client' | 'server'

export function parseDryRun(v: string | boolean | undefined): DryRunMode {
  if (v === true || v === 'client' || v === '') return 'client'
  if (v === 'server') return 'server'
  return 'none'
}
