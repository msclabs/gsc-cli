import { Command } from '@commander-js/extra-typings'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import type { GlobalOpts } from '../lib/config.js'
import { outputEnvelope } from '../lib/output.js'
import { CLI_NAME, VERSION } from '../lib/constants.js'

export function makeMcpCommand(globalOpts: () => GlobalOpts): Command {
  const mcp = new Command('mcp').description('MCP server management')

  mcp
    .command('serve')
    .description('Run as stdio MCP server (co-binary dist/mcp.cjs)')
    .action(async () => {
      // Spawn the MCP co-binary so this process's stdio becomes the MCP transport.
      // In dev (tsx), resolve to src/mcp/index.ts via `tsx`; in built form, dist/mcp.cjs.
      const distMcp = path.join(path.dirname(process.argv[1] ?? ''), 'mcp.cjs')
      const child = spawn(process.execPath, [distMcp], {
        stdio: ['inherit', 'inherit', 'inherit'],
        env: process.env,
      })
      child.on('exit', (code) => process.exit(code ?? 0))
    })

  mcp
    .command('info')
    .description('Show MCP configuration info')
    .action(async () => {
      const opts = globalOpts()
      outputEnvelope({
        data: {
          name: CLI_NAME,
          version: VERSION,
          transport: 'stdio',
          invocation: `${CLI_NAME} mcp serve`,
          tools_source: 'Derived 1:1 from CLI commands (see src/mcp/tools.ts)',
        },
        command: 'mcp info',
      }, opts)
    })

  return mcp
}
