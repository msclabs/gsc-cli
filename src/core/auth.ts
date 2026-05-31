// Service-account auth: mint a Google OAuth2 access token from a service
// account JSON key by signing a JWT (RS256) and exchanging it at the token
// endpoint. Done by hand with node:crypto — no google-auth-library dependency,
// keeping the bundle lean. Tokens are cached in-memory until ~60s before expiry.
import * as fs from 'node:fs'
import * as crypto from 'node:crypto'

export interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri?: string
  project_id?: string
  type?: string
}

export class AuthError extends Error {
  code: string
  constructor(message: string, code = 'AUTH_INVALID') {
    super(message)
    this.code = code
  }
}

export function loadKeyFile(p: string): ServiceAccountKey {
  let raw: string
  try {
    raw = fs.readFileSync(p, 'utf-8')
  } catch {
    throw new AuthError(`Cannot read key file: ${p}`, 'AUTH_MISSING')
  }
  let key: ServiceAccountKey
  try {
    key = JSON.parse(raw) as ServiceAccountKey
  } catch {
    throw new AuthError(`Key file is not valid JSON: ${p}`)
  }
  if (!key.client_email || !key.private_key) {
    throw new AuthError(`Key file missing client_email / private_key (is this a service-account key?): ${p}`)
  }
  return key
}

interface CachedToken { token: string; exp: number }
const tokenCache = new Map<string, CachedToken>()

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

export async function getAccessToken(
  key: ServiceAccountKey,
  scopes: string[],
  timeoutMs?: number,
): Promise<string> {
  const cacheKey = `${key.client_email}|${[...scopes].sort().join(' ')}`
  const now = Math.floor(Date.now() / 1000)
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.exp - 60 > now) return cached.token

  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token'
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
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
    signature = signer.sign(key.private_key).toString('base64url')
  } catch (e) {
    throw new AuthError(`Failed to sign JWT (bad private_key?): ${e instanceof Error ? e.message : String(e)}`)
  }
  const assertion = `${signingInput}.${signature}`

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const ctrl = new AbortController()
  const timer = timeoutMs && timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  let res: Response
  try {
    res = await fetch(tokenUri, {
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
  tokenCache.set(cacheKey, { token: json.access_token, exp: now + (json.expires_in ?? 3600) })
  return json.access_token
}
