import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { CONFIG_DIR_NAME } from './constants.js'

const CACHE_DIR = path.join(os.homedir(), '.cache', CONFIG_DIR_NAME)
const LAST_FILE = path.join(CACHE_DIR, 'last.json')

export function writeLast(value: unknown): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(LAST_FILE, JSON.stringify(value, null, 2))
  } catch { /* cache failures never fail the command */ }
}

export function readLast<T = unknown>(): T | null {
  try { return JSON.parse(fs.readFileSync(LAST_FILE, 'utf-8')) as T } catch { return null }
}
