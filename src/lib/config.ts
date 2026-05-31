import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { CONFIG_DIR_NAME, CREDENTIALS_FILENAME, ENV_PREFIX, CLI_NAME } from './constants.js'

export interface Profile {
  key_file?: string       // path to service-account JSON key
  default_site?: string   // default siteUrl for commands
  name?: string
}

export interface Credentials {
  active_profile: string
  profiles: Record<string, Profile>
}

export interface GlobalOpts {
  keyFile?: string
  site?: string
  profile?: string
  json?: boolean
  raw?: boolean
  format?: 'json' | 'ndjson' | 'table' | 'csv' | 'markdown'
  compact?: boolean
  quiet?: boolean
  verbose?: boolean
  yes?: boolean
  confirm?: string
  dryRun?: 'none' | 'client' | 'server'
  timeout?: number
  last?: boolean
  color?: boolean
}

export function getConfigDir(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, CONFIG_DIR_NAME)
  }
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return path.join(xdg, CONFIG_DIR_NAME)
  return path.join(os.homedir(), '.config', CONFIG_DIR_NAME)
}

export function getCredentialsPath(): string {
  return path.join(getConfigDir(), CREDENTIALS_FILENAME)
}

export function readCredentials(): Credentials | null {
  try {
    return JSON.parse(fs.readFileSync(getCredentialsPath(), 'utf-8')) as Credentials
  } catch { return null }
}

export function writeCredentials(creds: Credentials): void {
  const dir = getConfigDir()
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const p = getCredentialsPath()
  fs.writeFileSync(p, JSON.stringify(creds, null, 2), { encoding: 'utf-8', mode: 0o600 })
  try { fs.chmodSync(p, 0o600) } catch { /* windows */ }
}

function activeProfileName(opts: GlobalOpts): string {
  const creds = readCredentials()
  return opts.profile ?? process.env[`${ENV_PREFIX}_PROFILE`] ?? creds?.active_profile ?? 'default'
}

// Key-file resolution chain:
// --key-file > GSC_KEY_FILE > GOOGLE_APPLICATION_CREDENTIALS > profile.key_file
export function resolveKeyFile(opts: GlobalOpts): string | null {
  if (opts.keyFile) return opts.keyFile
  if (process.env[`${ENV_PREFIX}_KEY_FILE`]) return process.env[`${ENV_PREFIX}_KEY_FILE`] ?? null
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null
  const creds = readCredentials()
  return creds?.profiles[activeProfileName(opts)]?.key_file ?? null
}

export function getKeyFileSource(opts: GlobalOpts): string {
  if (opts.keyFile) return '--key-file flag'
  if (process.env[`${ENV_PREFIX}_KEY_FILE`]) return `${ENV_PREFIX}_KEY_FILE env`
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return 'GOOGLE_APPLICATION_CREDENTIALS env'
  return 'credentials file'
}

// Site resolution chain:
// command arg/flag > --site global > GSC_SITE > profile.default_site
export function resolveSite(opts: GlobalOpts, explicit?: string): string | null {
  if (explicit) return explicit
  if (opts.site) return opts.site
  if (process.env[`${ENV_PREFIX}_SITE`]) return process.env[`${ENV_PREFIX}_SITE`] ?? null
  const creds = readCredentials()
  return creds?.profiles[activeProfileName(opts)]?.default_site ?? null
}

export function addProfile(name: string, profile: Profile): void {
  const creds = readCredentials() ?? { active_profile: name, profiles: {} }
  creds.profiles[name] = { ...creds.profiles[name], ...profile }
  writeCredentials(creds)
}

export function setActiveProfile(name: string): void {
  const creds = readCredentials() ?? { active_profile: name, profiles: {} }
  creds.active_profile = name
  writeCredentials(creds)
}

export function removeProfile(name: string): void {
  const creds = readCredentials()
  if (!creds?.profiles[name]) throw new Error(`Profile "${name}" not found`)
  delete creds.profiles[name]
  if (creds.active_profile === name) {
    creds.active_profile = Object.keys(creds.profiles)[0] ?? 'default'
  }
  writeCredentials(creds)
}

export function getActiveProfile(): string {
  return readCredentials()?.active_profile ?? 'default'
}

// Config-file root-walk (sentry + codex pattern)
const MAX_CONFIG_BYTES = 32 * 1024

export function loadConfigChain(cwd: string = process.cwd()): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  const parts = cwd.split(path.sep)
  const dirs: string[] = []
  for (let i = 1; i <= parts.length; i++) dirs.push(parts.slice(0, i).join(path.sep) || '/')
  for (const dir of dirs) {
    for (const name of [`.${CLI_NAME}.json`, `.${CLI_NAME}.override.json`]) {
      const file = path.join(dir, name)
      try {
        const stat = fs.statSync(file)
        if (stat.size > MAX_CONFIG_BYTES) continue
        Object.assign(merged, JSON.parse(fs.readFileSync(file, 'utf-8')))
      } catch { /* skip missing */ }
    }
  }
  return merged
}
