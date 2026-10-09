import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { config } from './config.js'

const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const AUTH_URL = 'https://auth.mercadolivre.com.br/authorization'
const TOKEN_FILE = path.resolve(config.dataDir, 'ml-oauth.json')
const pending = new Map()
let refreshing = null

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function ensureDataDir() {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true })
}

function readStoredToken() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error('Não foi possível ler data/ml-oauth.json. Verifique o arquivo de tokens e autorize novamente.')
  }
}

function writeStoredToken(token) {
  const lifetime = Number(token.expires_in)
  if (typeof token.access_token !== 'string' || !token.access_token
    || typeof token.refresh_token !== 'string' || !token.refresh_token
    || !Number.isFinite(lifetime) || lifetime <= 0) {
    throw new Error('OAuth Mercado Livre: resposta de tokens incompleta. Os tokens anteriores foram preservados.')
  }
  ensureDataDir()
  const safe = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type || 'bearer',
    expires_in: lifetime,
    expires_at: Date.now() + lifetime * 1000,
    user_id: token.user_id || null,
    scope: token.scope || null,
    updated_at: new Date().toISOString(),
  }
  const tempFile = TOKEN_FILE + '.' + crypto.randomUUID() + '.tmp'
  try {
    fs.writeFileSync(tempFile, JSON.stringify(safe, null, 2), { mode: 0o600 })
    fs.renameSync(tempFile, TOKEN_FILE)
  } finally {
    fs.rmSync(tempFile, { force: true })
  }
  return safe
}

function missingOAuthConfig() {
  const missing = []
  if (!config.mlClientId) missing.push('ML_CLIENT_ID')
  if (!config.mlClientSecret) missing.push('ML_CLIENT_SECRET')
  if (!config.mlRedirectUri) missing.push('ML_REDIRECT_URI')
  return missing
}

function requireOAuthConfig() {
  const missing = missingOAuthConfig()
  if (missing.length) throw new Error(`Faltam variáveis OAuth: ${missing.join(', ')}`)
}

async function tokenRequest(params) {
  requireOAuthConfig()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(config.mlRequestTimeoutMs),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.message || data?.error_description || data?.error || `HTTP ${res.status}`
    throw new Error(`OAuth Mercado Livre: ${msg}`)
  }
  return writeStoredToken(data)
}

export function buildAuthorizationUrl() {
  requireOAuthConfig()

  const state = base64url(crypto.randomBytes(24))
  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())

  pending.set(state, { verifier, createdAt: Date.now() })
  for (const [key, value] of pending) {
    if (Date.now() - value.createdAt > 10 * 60 * 1000) pending.delete(key)
  }

  const url = new URL(AUTH_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.mlClientId)
  url.searchParams.set('redirect_uri', config.mlRedirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export async function exchangeAuthorizationCode({ code, state }) {
  if (!code) throw new Error('Código de autorização ausente')
  if (!state) throw new Error('State ausente')

  const entry = pending.get(state)
  pending.delete(state)
  if (!entry || Date.now() - entry.createdAt > 10 * 60 * 1000) {
    throw new Error('State inválido ou expirado. Inicie a autorização novamente.')
  }

  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: config.mlClientId,
    client_secret: config.mlClientSecret,
    code,
    redirect_uri: config.mlRedirectUri,
    code_verifier: entry.verifier,
  })
}

async function refresh(stored) {
  if (!stored?.refresh_token) throw new Error('Refresh token ausente. Autorize o Mercado Livre novamente.')
  return tokenRequest({
    grant_type: 'refresh_token',
    client_id: config.mlClientId,
    client_secret: config.mlClientSecret,
    refresh_token: stored.refresh_token,
  })
}

export async function getAccessToken({ forceRefresh = false, rejectedToken = null } = {}) {
  const stored = readStoredToken()
  if (stored?.access_token) {
    const fresh = Number(stored.expires_at) - Date.now() > 2 * 60 * 1000
    const alreadyRenewed = rejectedToken && stored.access_token !== rejectedToken
    if (fresh && (!forceRefresh || alreadyRenewed)) return stored.access_token
    if (!refreshing) refreshing = refresh(stored).finally(() => { refreshing = null })
    return (await refreshing).access_token
  }

  if (forceRefresh) throw new Error('Token manual recusado pelo Mercado Livre. Autorize novamente em /oauth/start ou atualize ML_ACCESS_TOKEN.')
  if (config.mlAccessToken) return config.mlAccessToken
  throw new Error('Mercado Livre ainda não autorizado. Abra /oauth/start no painel do bot.')
}

export function oauthStatus() {
  let stored = null
  let storageError = null
  try { stored = readStoredToken() } catch (error) { storageError = error.message }
  const missingConfig = missingOAuthConfig()
  const expiresAt = Number(stored?.expires_at)
  const fresh = Number.isFinite(expiresAt) && expiresAt > Date.now()
  const canRefresh = Boolean(stored?.refresh_token && !missingConfig.length)
  return {
    configured: !missingConfig.length,
    missingConfig,
    authorized: Boolean(stored?.access_token ? fresh || canRefresh : config.mlAccessToken && !storageError),
    source: stored?.access_token ? 'oauth' : config.mlAccessToken ? 'manual' : null,
    userId: stored?.user_id || null,
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? new Date(expiresAt).toISOString() : null,
    hasRefreshToken: Boolean(stored?.refresh_token),
    storageError,
  }
}
