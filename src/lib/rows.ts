// Unified tabular output: routes an array of row objects to the right
// renderer based on --format (csv | markdown | table | json/envelope).
import type { GlobalOpts } from './config.js'
import { shouldOutputJson, outputEnvelope } from './output.js'
import { renderTable, type TableColumn } from './table.js'
import { formatCsv, formatMarkdown } from './format.js'

export function outputRows(
  rows: Record<string, unknown>[],
  columns: TableColumn[],
  command: string,
  opts: GlobalOpts,
  metadata?: Record<string, unknown>,
  emptyHint?: string,
): void {
  if (opts.format === 'csv' || opts.format === 'markdown') {
    const headers = columns.map((c) => c.header)
    const matrix = rows.map((r) => columns.map((c) => String(r[c.key] ?? '')))
    process.stdout.write(opts.format === 'csv' ? formatCsv(headers, matrix) : formatMarkdown(headers, matrix))
    return
  }
  if (shouldOutputJson(opts)) {
    outputEnvelope({ data: rows, command, metadata }, opts)
    return
  }
  if (rows.length === 0) {
    process.stdout.write((emptyHint ?? 'No rows.') + '\n')
    return
  }
  process.stdout.write(renderTable(rows, columns) + '\n')
}
