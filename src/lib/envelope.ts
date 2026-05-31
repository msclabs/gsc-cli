import { VERSION, CLI_NAME } from './constants.js'
import { detectAgent } from './agent.js'

export interface Envelope<T = unknown> {
  version: '2'
  status: 'success' | 'partial_success' | 'no_results' | 'error'
  command?: string
  cli: { name: string; version: string }
  data?: T
  metadata?: {
    elapsed_ms?: number
    cost_usd?: number
    cached?: boolean
    provider?: string
    rate_limit_remaining?: number
    agent?: string | null
    truncated?: boolean
    continue_with?: string
    next_cursor?: string
    [key: string]: unknown
  }
  error?: {
    code: string
    message: string
    hint?: string
    retry?: { after_ms?: number; strategy?: string }
  }
}

export function buildEnvelope<T>(
  p: Partial<Envelope<T>> & { status: Envelope['status'] }
): Envelope<T> {
  return {
    version: '2',
    status: p.status,
    command: p.command,
    cli: { name: CLI_NAME, version: VERSION },
    data: p.data,
    metadata: { agent: detectAgent(), ...(p.metadata ?? {}) },
    error: p.error,
  }
}
