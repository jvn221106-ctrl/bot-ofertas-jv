import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { config } from '../src/config.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-oauth-'))
config.dataDir = dir
const { buildAuthorizationUrl, exchangeAuthorizationCode, getAccessToken, oauthStatus } = await import('../src/ml-auth.js')
const tokenFile = path.join(dir, 'ml-oauth.json')
const oldToken = { access_token: 'fake-old-token', refresh_token: 'fake-old-refresh', expires_at: Date.now() - 1000 }

beforeEach(() => {
  fs.rmSync(tokenFile, { force: true })
  Object.assign(config, { mlClientId: '123', mlClientSecret: 'fake-secret', mlRedirectUri: 'https://example.com/oauth/callback', mlAccessToken: '' })
})
after(() => fs.rmSync(dir, { recursive: true, force: true }))

test('autorização usa PKCE e um state só pode ser consumido uma vez', async (t) => {
  const url = new URL(buildAuthorizationUrl())
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.body.get('grant_type'), 'authorization_code')
    assert.equal(crypto.createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), url.searchParams.get('code_challenge'))
    return Response.json({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 21600 })
  })
  const payload = { code: 'fake-code', state: url.searchParams.get('state') }
  await exchangeAuthorizationCode(payload)
  assert.equal(await getAccessToken(), 'fake-access')
  assert.equal(oauthStatus().hasRefreshToken, true)
  await assert.rejects(exchangeAuthorizationCode(payload), /State inválido/)
  assert.equal(fs.statSync(tokenFile).mode & 0o777, 0o600)
})

test('requisições concorrentes renovam o refresh token uma única vez', async (t) => {
  fs.writeFileSync(tokenFile, JSON.stringify(oldToken))
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++
    assert.equal(options.body.get('refresh_token'), 'fake-old-refresh')
    await delay(10)
    return Response.json({ access_token: 'fake-new-token', refresh_token: 'fake-new-refresh', expires_in: 21600 })
  })
  assert.deepEqual(await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]), ['fake-new-token', 'fake-new-token', 'fake-new-token'])
  assert.equal(calls, 1)
  assert.equal(JSON.parse(fs.readFileSync(tokenFile)).refresh_token, 'fake-new-refresh')
  assert.equal(await getAccessToken({ forceRefresh: true, rejectedToken: 'fake-old-token' }), 'fake-new-token')
  assert.equal(calls, 1)
  assert.deepEqual(fs.readdirSync(dir), ['ml-oauth.json'])
})

test('falha de renovação preserva os tokens anteriores e permite tentar novamente', async (t) => {
  fs.writeFileSync(tokenFile, JSON.stringify(oldToken))
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return calls === 1
      ? Response.json({ error: 'invalid_grant' }, { status: 400 })
      : Response.json({ access_token: 'fake-new', refresh_token: 'fake-refresh', expires_in: 21600 })
  })
  await assert.rejects(getAccessToken(), /invalid_grant/)
  assert.deepEqual(JSON.parse(fs.readFileSync(tokenFile)), oldToken)
  assert.equal(await getAccessToken(), 'fake-new')
})

test('resposta incompleta não substitui um arquivo de tokens válido', async (t) => {
  fs.writeFileSync(tokenFile, JSON.stringify(oldToken))
  t.mock.method(globalThis, 'fetch', async () => Response.json({ access_token: 'fake-new', expires_in: 21600 }))
  await assert.rejects(getAccessToken(), /resposta de tokens incompleta/)
  assert.deepEqual(JSON.parse(fs.readFileSync(tokenFile)), oldToken)
})

test('o status explica pendências e não expõe os tokens ou o segredo', async () => {
  config.mlClientSecret = ''
  assert.deepEqual(oauthStatus().missingConfig, ['ML_CLIENT_SECRET'])
  await assert.rejects(getAccessToken(), /ainda não autorizado/)
  config.mlAccessToken = 'fake-manual-token'
  assert.equal(await getAccessToken(), 'fake-manual-token')
  assert.equal(oauthStatus().source, 'manual')
  assert.equal(JSON.stringify(oauthStatus()).includes('fake-manual-token'), false)
  await assert.rejects(getAccessToken({ forceRefresh: true }), /Token manual recusado/)
})

test('arquivo de tokens corrompido aparece no diagnóstico e impede uso silencioso', async () => {
  fs.writeFileSync(tokenFile, '{broken')
  assert.equal(oauthStatus().authorized, false)
  assert.match(oauthStatus().storageError, /arquivo de tokens/)
  await assert.rejects(getAccessToken(), /arquivo de tokens/)
})
