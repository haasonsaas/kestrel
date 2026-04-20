import { safeStorage, shell } from 'electron'
import crypto from 'crypto'
import http from 'http'
import type { AddressInfo } from 'net'
import { EVALOPS_AUTH_SESSION_KEY, type EvalOpsConfig, getEvalOpsConfig } from './config'
import { deleteSettingValue, getSettingValue, setSettingValue } from './settings'
import type { EvalOpsAuthStatus, EvalOpsLoginOptions } from '../../shared/ipc'

const OAUTH_CALLBACK_PATH = '/oauth/callback'
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000

interface OAuthMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  revocation_endpoint?: string
  scopes_supported?: string[]
}

interface OAuthClientRegistration {
  client_id: string
  client_name?: string
  redirect_uris?: string[]
  grant_types?: string[]
  response_types?: string[]
  token_endpoint_auth_method?: string
}

interface OAuthTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  refresh_expires_at?: string
  scope?: string
  organization_id?: string
  audience?: string | string[]
}

interface StoredAuthSession {
  accessToken: string
  refreshToken?: string
  tokenType: string
  expiresAt: number
  refreshExpiresAt?: string
  organizationId?: string
  scopes: string[]
  audience: string[]
  clientId: string
  identityBaseUrl: string
  resource: string
  createdAt: number
  updatedAt: number
}

interface EncodedSession {
  encrypted: boolean
  data: string
}

interface OAuthCallbackResult {
  code?: string
  error?: string
  errorDescription?: string
  state?: string
}

export async function getEvalOpsAuthStatus(): Promise<EvalOpsAuthStatus> {
  const config = getEvalOpsConfig()
  const session = await getFreshSession().catch(() => getStoredSession())

  if (!session) {
    return {
      authenticated: false,
      identityBaseUrl: config.identityBaseUrl,
      resource: config.resource,
      scopes: config.scopes
    }
  }

  return {
    authenticated: Date.now() < session.expiresAt,
    identityBaseUrl: session.identityBaseUrl,
    resource: session.resource,
    organizationId: session.organizationId,
    scopes: session.scopes,
    expiresAt: session.expiresAt,
    refreshExpiresAt: session.refreshExpiresAt
  }
}

export async function loginEvalOps(options: EvalOpsLoginOptions = {}): Promise<EvalOpsAuthStatus> {
  const config = withLoginOverrides(getEvalOpsConfig(), options)
  const callback = await createCallbackServer()

  try {
    const metadata = await fetchOAuthMetadata(config.identityBaseUrl)
    const client = await registerPublicClient(metadata, callback.redirectUri)
    const verifier = randomBase64Url(32)
    const challenge = pkceChallenge(verifier)
    const state = randomBase64Url(32)
    const authorizationUrl = buildAuthorizationUrl(metadata.authorization_endpoint, {
      clientId: client.client_id,
      redirectUri: callback.redirectUri,
      scopes: config.scopes,
      state,
      codeChallenge: challenge,
      resource: config.resource,
      loginHint: options.loginHint,
      organizationId: options.organizationId,
      prompt: options.prompt
    })

    await shell.openExternal(authorizationUrl)

    const result = await callback.waitForCallback
    if (result.state !== state) {
      throw new Error('EvalOps login failed: OAuth state did not match.')
    }
    if (result.error) {
      throw new Error(`EvalOps login failed: ${result.errorDescription || result.error}`)
    }
    if (!result.code) {
      throw new Error('EvalOps login failed: no authorization code returned.')
    }

    const token = await exchangeAuthorizationCode(metadata, {
      code: result.code,
      clientId: client.client_id,
      redirectUri: callback.redirectUri,
      verifier,
      resource: config.resource
    })
    storeSession(sessionFromToken(token, client.client_id, config))
    return getEvalOpsAuthStatus()
  } finally {
    callback.close()
  }
}

export async function logoutEvalOps(): Promise<EvalOpsAuthStatus> {
  const session = getStoredSession()
  if (session?.refreshToken) {
    try {
      const metadata = await fetchOAuthMetadata(session.identityBaseUrl)
      if (metadata.revocation_endpoint) {
        const form = new URLSearchParams({
          token: session.refreshToken,
          token_type_hint: 'refresh_token',
          client_id: session.clientId
        })
        const response = await fetch(metadata.revocation_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form
        })
        if (!response.ok) {
          throw new Error(`EvalOps token revocation failed (${response.status}): ${await response.text()}`)
        }
      }
    } catch (err) {
      console.warn('[evalops:auth] Token revocation failed:', err)
    }
  }

  deleteSettingValue(EVALOPS_AUTH_SESSION_KEY)
  return getEvalOpsAuthStatus()
}

export async function getEvalOpsAccessToken(minValidityMs = 60_000): Promise<string> {
  const session = await getFreshSession(minValidityMs)
  if (!session) {
    throw new Error('EvalOps authentication required. Sign in from Settings > EvalOps.')
  }
  return session.accessToken
}

export function getStoredEvalOpsSession(): StoredAuthSession | null {
  return getStoredSession()
}

async function getFreshSession(minValidityMs = 60_000): Promise<StoredAuthSession | null> {
  const session = getStoredSession()
  if (!session) return null
  if (Date.now() + minValidityMs < session.expiresAt) return session
  if (!session.refreshToken) return null
  return refreshSession(session)
}

async function refreshSession(session: StoredAuthSession): Promise<StoredAuthSession> {
  const metadata = await fetchOAuthMetadata(session.identityBaseUrl)
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken ?? '',
    client_id: session.clientId
  })
  if (session.resource) form.set('resource', session.resource)

  const token = await postTokenRequest(metadata.token_endpoint, form)
  const next = sessionFromToken(token, session.clientId, {
    identityBaseUrl: session.identityBaseUrl,
    llmGatewayBaseUrl: '',
    resource: session.resource,
    scopes: session.scopes
  })
  next.createdAt = session.createdAt
  if (!next.refreshToken) next.refreshToken = session.refreshToken
  storeSession(next)
  return next
}

async function fetchOAuthMetadata(identityBaseUrl: string): Promise<OAuthMetadata> {
  const response = await fetch(`${identityBaseUrl}/.well-known/oauth-authorization-server`, {
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) {
    throw new Error(`EvalOps identity metadata failed (${response.status}): ${await response.text()}`)
  }

  const payload = await response.json() as Partial<OAuthMetadata>
  if (!payload.authorization_endpoint || !payload.token_endpoint) {
    throw new Error('EvalOps identity metadata is missing authorization or token endpoints.')
  }
  return payload as OAuthMetadata
}

async function registerPublicClient(
  metadata: OAuthMetadata,
  redirectUri: string
): Promise<OAuthClientRegistration> {
  if (!metadata.registration_endpoint) {
    throw new Error('EvalOps identity metadata is missing dynamic client registration endpoint.')
  }

  const response = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_name: 'Kestrel Desktop',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    })
  })
  if (!response.ok) {
    throw new Error(`EvalOps OAuth client registration failed (${response.status}): ${await response.text()}`)
  }

  const client = await response.json() as Partial<OAuthClientRegistration>
  if (!client.client_id) {
    throw new Error('EvalOps OAuth client registration did not return a client_id.')
  }
  return client as OAuthClientRegistration
}

async function exchangeAuthorizationCode(
  metadata: OAuthMetadata,
  input: {
    code: string
    clientId: string
    redirectUri: string
    verifier: string
    resource: string
  }
): Promise<OAuthTokenResponse> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier
  })
  if (input.resource) form.set('resource', input.resource)
  return postTokenRequest(metadata.token_endpoint, form)
}

async function postTokenRequest(tokenEndpoint: string, form: URLSearchParams): Promise<OAuthTokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  })
  if (!response.ok) {
    throw new Error(`EvalOps token exchange failed (${response.status}): ${await response.text()}`)
  }

  const token = await response.json() as Partial<OAuthTokenResponse>
  if (!token.access_token) {
    throw new Error('EvalOps token response did not include an access_token.')
  }
  return token as OAuthTokenResponse
}

function sessionFromToken(
  token: OAuthTokenResponse,
  clientId: string,
  config: EvalOpsConfig
): StoredAuthSession {
  const now = Date.now()
  const expiresInMs = Math.max(token.expires_in ?? 3600, 0) * 1000
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type || 'Bearer',
    expiresAt: now + expiresInMs,
    refreshExpiresAt: token.refresh_expires_at,
    organizationId: token.organization_id,
    scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : config.scopes,
    audience: Array.isArray(token.audience) ? token.audience : token.audience ? [token.audience] : [],
    clientId,
    identityBaseUrl: config.identityBaseUrl,
    resource: config.resource,
    createdAt: now,
    updatedAt: now
  }
}

function storeSession(session: StoredAuthSession): void {
  setSettingValue(EVALOPS_AUTH_SESSION_KEY, encodeSession(session))
}

function getStoredSession(): StoredAuthSession | null {
  const encoded = getSettingValue<EncodedSession | StoredAuthSession>(EVALOPS_AUTH_SESSION_KEY)
  if (!encoded) return null
  if (!('encrypted' in encoded)) return encoded

  try {
    const json = encoded.encrypted
      ? safeStorage.decryptString(Buffer.from(encoded.data, 'base64'))
      : encoded.data
    return JSON.parse(json) as StoredAuthSession
  } catch (err) {
    console.warn('[evalops:auth] Stored session could not be decoded:', err)
    return null
  }
}

function encodeSession(session: StoredAuthSession): EncodedSession {
  const json = JSON.stringify(session)
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: true,
      data: safeStorage.encryptString(json).toString('base64')
    }
  }
  return { encrypted: false, data: json }
}

async function createCallbackServer(): Promise<{
  redirectUri: string
  waitForCallback: Promise<OAuthCallbackResult>
  close: () => void
}> {
  let settled = false
  let timeout: ReturnType<typeof setTimeout> | null = null

  let resolveCallback!: (result: OAuthCallbackResult) => void
  let rejectCallback!: (err: Error) => void
  const waitForCallback = new Promise<OAuthCallbackResult>((resolve, reject) => {
    resolveCallback = resolve
    rejectCallback = reject
  })

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
    if (url.pathname !== OAUTH_CALLBACK_PATH) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }

    if (!settled) {
      settled = true
      if (timeout) clearTimeout(timeout)
      resolveCallback({
        code: url.searchParams.get('code') ?? undefined,
        error: url.searchParams.get('error') ?? undefined,
        errorDescription: url.searchParams.get('error_description') ?? undefined,
        state: url.searchParams.get('state') ?? undefined
      })
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(callbackHtml())
  })

  const redirectUri = await new Promise<string>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${address.port}${OAUTH_CALLBACK_PATH}`)
    })
  })

  timeout = setTimeout(() => {
    if (!settled) {
      settled = true
      rejectCallback(new Error('EvalOps login timed out waiting for browser callback.'))
      server.close()
    }
  }, OAUTH_TIMEOUT_MS)

  return {
    redirectUri,
    waitForCallback,
    close: () => {
      if (timeout) clearTimeout(timeout)
      if (server.listening) server.close()
    }
  }
}

function buildAuthorizationUrl(
  endpoint: string,
  input: {
    clientId: string
    redirectUri: string
    scopes: string[]
    state: string
    codeChallenge: string
    resource: string
    loginHint?: string
    organizationId?: string
    prompt?: string
  }
): string {
  const url = new URL(endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('scope', input.scopes.join(' '))
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (input.resource) url.searchParams.set('resource', input.resource)
  if (input.loginHint) url.searchParams.set('login_hint', input.loginHint)
  if (input.organizationId) url.searchParams.set('organization_id', input.organizationId)
  if (input.prompt) url.searchParams.set('prompt', input.prompt)
  return url.toString()
}

function withLoginOverrides(config: EvalOpsConfig, options: EvalOpsLoginOptions): EvalOpsConfig {
  return {
    ...config,
    identityBaseUrl: options.identityBaseUrl?.trim() || config.identityBaseUrl,
    resource: options.resource?.trim() || config.resource,
    scopes: options.scopes?.length ? options.scopes : config.scopes
  }
}

function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function randomBase64Url(bytes: number): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

function callbackHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Kestrel EvalOps Login</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px;">
    <h1>EvalOps login complete</h1>
    <p>You can close this window and return to Kestrel.</p>
  </body>
</html>`
}
