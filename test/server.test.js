import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import vm from 'node:vm'
import { config } from '../src/config.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-http-'))
Object.assign(config, { dataDir: dir, port: 0, dryRun: true, mlAccessToken: 'fake-token', mlClientId: '', mlClientSecret: '', mlRedirectUri: '', categoryPatterns: ['Esportes e Fitness'] })
const { startServer } = await import('../src/server.js')
const { default: db } = await import('../src/db.js')
let server
let base
before(async () => {
  server = startServer()
  await once(server, 'listening')
  base = 'http://127.0.0.1:' + server.address().port
})
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('painel e healthcheck iniciam sem conta conectada e o JavaScript do painel é válido', async () => {
  const res = await fetch(base)
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /id="affiliate"/)
  assert.match(html, /Simular uma oferta/)
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  assert.doesNotThrow(() => new vm.Script(script))
  const health = await fetch(base + '/health').then((r) => r.json())
  assert.equal(health.ok, true)
  assert.equal(health.whatsapp.connected, false)
  assert.equal(health.whatsapp.dryRun, true)
  assert.equal(JSON.stringify(health).includes('fake-token'), false)
})

test('cadastro rejeita domínio falso, HTTP e link sem rastreamento; aceita link oficial HTTPS', async () => {
  for (const url of ['https://meli.la.evil.example/a', 'http://meli.la/a', 'https://mercadolivre.com.br/produto', 'https://meli.la/', 'https://mercadolivre.com.br/produto?ref=']) {
    const res = await fetch(base + '/api/affiliate-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'MLB111', url }) })
    assert.equal(res.status, 400)
  }
  const res = await fetch(base + '/api/affiliate-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'mlb111', url: 'https://meli.la/fake-link' }) })
  assert.deepEqual(await res.json(), { ok: true, itemId: 'MLB111' })
})

test('rotas de busca e simulação funcionam com oferta fictícia sem gravar envio', async (t) => {
  const realFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith(base)) return realFetch(url, options)
    if (String(url).endsWith('/categories')) return Response.json([{ id: 'MLB1276', name: 'Esportes e Fitness' }])
    if (String(url).includes('/search?')) return Response.json({ results: [{ id: 'MLB111', title: 'Produto fictício', price: 80, original_price: 100, available_quantity: 2, condition: 'new', currency_id: 'BRL' }] })
    throw new Error('Requisição externa inesperada')
  })
  t.mock.method(console, 'log', () => {})
  const offers = await fetch(base + '/api/offers/preview').then((r) => r.json())
  assert.equal(offers.length, 1)
  assert.equal(offers[0].affiliateUrl, 'https://meli.la/fake-link')
  const result = await fetch(base + '/api/send-now', { method: 'POST' }).then((r) => r.json())
  assert.equal(result.simulated, true)
  assert.equal(result.sent, false)
  assert.deepEqual(await fetch(base + '/api/history?limit=abc').then((r) => r.json()), [])
})

test('OAuth sem configuração retorna uma pendência clara em vez de tentar autorizar', async () => {
  const res = await fetch(base + '/oauth/start', { redirect: 'manual' })
  assert.equal(res.status, 500)
  assert.match(await res.text(), /ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI/)
})
