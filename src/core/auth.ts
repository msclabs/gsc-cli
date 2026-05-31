// Auth: mint a Google OAuth2 access token from either
//  (a) a service-account JSON key — sign a JWT (RS256) and exchange it, or
//  (b) an authorized_user file (gcloud ADC) — refresh-token grant.
// Done by hand with node:crypto + fetch — no google-auth-library dependency.
// Tokens are cached in-memory until ~60s before expiry.
//
// The authorized_user path exists because Google has a standing bug (ack'd
// 2026-05) that rejects newly-created service-account emails in the Search
// Console "Add user" UI. Authenticating as the property owner via
// `gcloud auth application-default login --scopes=…webmasters…` sidesteps it.
import * as fs from 'node:fs'
import * as crypto from 'node:crypto'

export interface ServiceAccountKey {
  type: 'service_account'
  client_email: string
  private_key: string
  token_uri?: string
  project_id?: string
}

export interface AuthorizedUser {
  type: 'authorized_user'
  client_id: string
  client_secret: string
  refresh_token: string
  token_uri?: string
  project_id?: string
}

export type Credential = ServiceAccountKey | AuthorizedUser

export class AuthError extends Error {
  code: string
  constructor(message: string, code = 'AUTH_INVALID') {
    super(message)
    this.code = code
  }
}

const TOKEN_URI = 'https://oauth2.googleapis.com/token'

export function loadCredential(p: string): Credential {
  let raw: string
  try {
    raw = fs.readFileSync(p, 'utf-8')
  } catch {
    throw new AuthError(`Cannot read key file: ${p}`, 'AUTH_MISSING')
  }
  let json: Record<string, unknown>
  try {
    json = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new AuthError(`Key file is not valid JSON: ${p}`)
  }
  // authorized_user (gcloud ADC) — explicit type or the telltale refresh_token.
  if (json.type === 'authorized_user' || (json.refresh_token && json.client_id && json.client_secret)) {
    if (!json.client_id || !json.client_secret || !json.refresh_token) {
      throw new AuthError(`Authorized-user file missing client_id / client_secret / refresh_token: ${p}`)
    }
    return {
      type: 'authorized_user',
      client_id: String(json.client_id),
      client_secret: String(json.client_secret),
      refresh_token: String(json.refresh_token),
      token_uri: typeof json.token_uri === 'string' ? json.token_uri : undefined,
      project_id: typeof json.quota_project_id === 'string' ? json.quota_project_id
        : typeof json.project_id === 'string' ? json.project_id : undefined,
    }
  }
  // service_account
  if (json.client_email && json.private_key) {
    return {
      type: 'service_account',
      client_email: String(json.client_email),
      private_key: String(json.private_key),
      token_uri: typeof json.token_uri === 'string' ? json.token_uri : undefined,
      project_id: typeof json.project_id === 'string' ? json.project_id : undefined,
    }
  }
  throw new AuthError(`Unrecognized credential file (not a service account or authorized_user): ${p}`)
}

// Back-compat alias.
export const loadKeyFile = loadCredential

export function credentialLabel(c: Credential): string {
  return c.type === 'service_account' ? c.client_email : `authorized user (${c.client_id.split('-')[0]}…)`
}

interface CachedToken { token: string; exp: number }
const tokenCache = new Map<string, CachedToken>()

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

async function tokenPost(uri: string, body: URLSearchParams, timeoutMs?: number): Promise<{ access_token: string; expires_in: number }> {
  const ctrl = new AbortController()
  const timer = timeoutMs && timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  let res: Response
  try {
    res = await fetch(uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: ctrl.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AuthError('Token request timed out', 'TIMEOUT')
    throw new AuthError(`Token request failed: ${e instanceof Error ? e.message : String(e)}`, 'NETWORK')
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AuthError(`Token exchange failed (HTTP ${res.status}): ${text.slice(0, 300)}`)
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new AuthError('Token endpoint returned no access_token')
  return { access_token: json.access_token, expires_in: json.expires_in ?? 3600 }
}

export async function getAccessToken(cred: Credential, scopes: string[], timeoutMs?: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  if (cred.type === 'authorized_user') {
    // Refresh-token grant. The granted scopes are fixed at consent time, so
    // `scopes` here is informational only (used for the cache key).
    const cacheKey = `user|${cred.client_id}`
    const cached = tokenCache.get(cacheKey)
    if (cached && cached.exp - 60 > now) return cached.token
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
    })
    const { access_token, expires_in } = await tokenPost(cred.token_uri ?? TOKEN_URI, body, timeoutMs)
    tokenCache.set(cacheKey, { token: access_token, exp: now + expires_in })
    return access_token
  }

  // service_account — sign + exchange a JWT.
  const cacheKey = `sa|${cred.client_email}|${[...scopes].sort().join(' ')}`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.exp - 60 > now) return cached.token

  const tokenUri = cred.token_uri ?? TOKEN_URI
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: cred.client_email,
    scope: scopes.join(' '),
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }))
  const signingInput = `${header}.${claim}`
  let signature: string
  try {
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(signingInput)
    signature = signer.sign(cred.private_key).toString('base64url')
  } catch (e) {
    throw new AuthError(`Failed to sign JWT (bad private_key?): ${e instanceof Error ? e.message : String(e)}`)
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${signingInput}.${signature}`,
  })
  const { access_token, expires_in } = await tokenPost(tokenUri, body, timeoutMs)
  tokenCache.set(cacheKey, { token: access_token, exp: now + expires_in })
  return access_token
}
