import type { GlobalOpts } from './config.js'
import { shouldOutputJson } from './output.js'

export type StreamEventType =
  | 'start' | 'item' | 'progress' | 'partial' | 'end'
  | 'tool_use' | 'step_start' | 'reasoning' | 'text' | 'error'

export interface StreamEvent<T = unknown> {
  type: StreamEventType
  timestamp: number
  sessionId?: string
  sequence?: number
  payload?: T
}

let _seq = 0

export function outputStream<T>(event: Omit<StreamEvent<T>, 'sequence'>, opts: GlobalOpts): void {
  if (!shouldOutputJson(opts) && opts.format !== 'ndjson') return
  const withSeq: StreamEvent<T> = { ...event, sequence: ++_seq }
  process.stdout.write(JSON.stringify(withSeq) + '\n')
}

export function resetSequence(): void { _seq = 0 }
