import { build } from 'esbuild'
import { readFileSync, statSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: true,
  banner: { js: `#!/usr/bin/env node\n// ${pkg.name} v${pkg.version} — MIT License` },
  define: { '__CLI_VERSION__': JSON.stringify(pkg.version) },
}

await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/cli.cjs' })
await build({ ...common, entryPoints: ['src/mcp/index.ts'], outfile: 'dist/mcp.cjs' })

// Size budgets: CLI stays lean (< 500 KB); MCP pulls in the SDK's ajv +
// zod-to-json-schema machinery, so we allow 800 KB for it.
const BUDGETS = { 'dist/cli.cjs': 500 * 1024, 'dist/mcp.cjs': 800 * 1024 }
for (const [f, budget] of Object.entries(BUDGETS)) {
  const stat = statSync(f)
  const sizeKb = (stat.size / 1024).toFixed(1)
  console.log(`Built ${f} — ${sizeKb} KB`)
  if (stat.size > budget) console.warn(`Warning: ${f} exceeds ${(budget/1024).toFixed(0)} KB budget`)
}
