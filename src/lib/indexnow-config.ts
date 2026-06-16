// IndexNow keys are host-scoped and use a totally different auth model from the
// Google service-account creds in credentials.json — so they live in their own
// file (~/.config/gsc/indexnow.json) keyed by bare host.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getConfigDir } from './config.js'
import { ENV_PREFIX } from './constants.js'

const INDEXNOW_FILENAME = 'indexnow.json'

export interface IndexNowHostConfig {
  key: string
  key_location?: string
}

export interface IndexNowConfig {
  hosts: Record<string, IndexNowHostConfig>
}

export function getIndexNowPath(): string {
  return path.join(getConfigDir(), INDEXNOW_FILENAME)
}

export function readIndexNowConfig(): IndexNowConfig {
  try {
    return JSON.parse(fs.readFileSync(getIndexNowPath(), 'utf-8')) as IndexNowConfig
  } catch {
    return { hosts: {} }
  }
}

export function writeIndexNowConfig(cfg: IndexNowConfig): void {
  const dir = getConfigDir()
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const p = getIndexNowPath()
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 })
  try { fs.chmodSync(p, 0o600) } catch { /* windows */ }
}

export function setHostKey(host: string, key: string, keyLocation?: string): void {
  const cfg = readIndexNowConfig()
  cfg.hosts[host] = { key, ...(keyLocation ? { key_location: keyLocation } : {}) }
  writeIndexNowConfig(cfg)
}

export function getHostConfig(host: string): IndexNowHostConfig | null {
  return readIndexNowConfig().hosts[host] ?? null
}

// Key resolution chain: explicit flag > GSC_INDEXNOW_KEY env > stored host key.
export function resolveKey(host: string, explicit?: string): string | null {
  if (explicit) return explicit
  const env = process.env[`${ENV_PREFIX}_INDEXNOW_KEY`]
  if (env) return env
  return getHostConfig(host)?.key ?? null
}

// keyLocation chain: explicit flag > stored > default root `https://host/{key}.txt`.
export function resolveKeyLocation(host: string, key: string, explicit?: string): string {
  if (explicit) return explicit
  const stored = getHostConfig(host)?.key_location
  if (stored) return stored
  return `https://${host}/${key}.txt`
}
