declare const __CLI_VERSION__: string

export const VERSION = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : '0.0.0-dev'
export const CLI_NAME = 'gsc'
export const CONFIG_DIR_NAME = 'gsc'
export const ENV_PREFIX = 'GSC'
export const CREDENTIALS_FILENAME = 'credentials.json'
export const USER_AGENT = `${CLI_NAME}/${VERSION}`

// OAuth scopes for service-account JWT minting.
export const SCOPES = {
  webmasters: 'https://www.googleapis.com/auth/webmasters',
  webmastersReadonly: 'https://www.googleapis.com/auth/webmasters.readonly',
  indexing: 'https://www.googleapis.com/auth/indexing',
} as const

// All scopes a service account needs to drive every command. The Search
// Console API enforces actual permission at the property level, so requesting
// the full `webmasters` scope is safe even for read-only service accounts.
export const DEFAULT_SCOPES = [SCOPES.webmasters, SCOPES.indexing]

// API hosts. Search Analytics / Sites / Sitemaps live on the legacy
// webmasters/v3 path; URL Inspection lives ONLY on searchconsole/v1.
export const HOSTS = {
  webmasters: 'https://www.googleapis.com/webmasters/v3',
  searchconsole: 'https://searchconsole.googleapis.com/v1',
  indexing: 'https://indexing.googleapis.com/v3',
} as const
