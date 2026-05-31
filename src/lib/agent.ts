import * as fs from 'node:fs'

export type DetectedAgent =
  | 'claude-code' | 'cursor' | 'codex' | 'gemini' | 'copilot'
  | 'replit' | 'devin' | 'opencode' | 'augment' | 'antigravity' | 'cowork' | null

export function detectAgent(env: NodeJS.ProcessEnv = process.env): DetectedAgent {
  if (env.AI_AGENT) return (env.AI_AGENT as DetectedAgent) || null
  if (env.CLAUDE_CODE_IS_COWORK) return 'cowork'
  if (env.CLAUDECODE || env.CLAUDE_CODE) return 'claude-code'
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID || env.CURSOR_EXTENSION_HOST_ROLE === 'agent-exec') return 'cursor'
  if (env.GEMINI_CLI) return 'gemini'
  if (env.CODEX_SANDBOX || env.CODEX_CI || env.CODEX_THREAD_ID || env.CODEX_SANDBOX_NETWORK_DISABLED) return 'codex'
  if (env.ANTIGRAVITY_AGENT || env.ANTIGRAVITY_CLI_ALIAS) return 'antigravity'
  if (env.AUGMENT_AGENT) return 'augment'
  if (env.OPENCODE_CLIENT || env.OPENCODE || env.OPENCLAW_SHELL) return 'opencode'
  if (env.REPL_ID) return 'replit'
  if (env.COPILOT_MODEL || env.COPILOT_ALLOW_ALL || env.COPILOT_GITHUB_TOKEN) return 'copilot'
  if (env.CLINE_ACTIVE) return 'cursor'
  try { if (fs.existsSync('/opt/.devin')) return 'devin' } catch { /* ignore */ }
  return null
}

export function agentUserAgentSuffix(): string {
  const a = detectAgent()
  return a ? ` AIAgent/${a}` : ''
}

export function isUnderAgent(): boolean {
  return detectAgent() !== null
}
