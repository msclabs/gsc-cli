import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CLI_NAME, VERSION } from '../lib/constants.js'
import { ALL_TOOLS } from './tools.js'

const server = new McpServer(
  { name: CLI_NAME, version: VERSION },
  { capabilities: { tools: {} } }
)

// Register each tool via the high-level API. The SDK derives JSON Schema
// from the Zod inputSchema automatically and validates arguments before
// invoking the handler.

for (const tool of ALL_TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      const envelope = await tool.handler(args)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(envelope, null, 2) }],
        structuredContent: envelope as unknown as Record<string, unknown>,
        isError: envelope.status === 'error',
      }
    }
  )
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`MCP fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
