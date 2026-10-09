import { test, mock, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { setImmediate as tick } from 'node:timers/promises'
import { config } from '../src/config.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-pipeline-'))
Object.assign(config, { dataDir: dir, waAuthDir: path.join(dir, 'wa'), mlAccessToken: 'fake-token', categoryPatterns: ['Esportes e Fitness', 'Games'] })
const sockets = []
let messageId = 'fake-message-id'
let sendError = null
function makeSocket() {
  const sock = {
    ev: new EventEmitter(), calls: [],
    end() {},
    async sendMessage(group, content) {
      sock.calls.push({ group, content })
      if (sendError) throw sendError
      return { key: { id: messageId } }
    },
    async groupFetchAllParticipating() { return { group: { id: config.whatsappGroupId, subject: 'Grupo de teste', participants: [] } } },
  }
  sockets.push(sock)
  return sock
}
mock.module('@whiskeysockets/baileys', {
  defaultExport: makeSocket,
  namedExports: { DisconnectReason: { loggedOut: 401 }, useMultiFileAuthState: async () => ({ state: {}, saveCreds: async () => {} }) },
})
const { default: db, stats, savePost, saveAffiliateLink, wasPostedRecently, recentPosts } = await import('../src/db.js')
const { discoverCandidates } = await import('../src/mercadolivre.js')
const { runCycle } = await import('../src/scheduler.js')
const { sendOffer, connectWhatsApp, whatsappStatus, stopWhatsApp } = await import('../src/whatsapp.js')
const baseItem = { id: 'MLB111', title: 'Produto de teste', price: 80, original_price: 100, available_quantity: 2, condition: 'new', status: 'active', currency_id: 'BRL', category_id: 'MLB1276', permalink: 'https://produto.mercadolivre.com.br/MLB-111' }
const items = [
  baseItem,
  { ...baseItem, id: 'MLB222', available_quantity: 0 },
  { ...baseItem, id: 'MLB333', price: 80.04 },
  { ...baseItem, id: 'MLB444', condition: 'used' },
  { ...baseItem, id: 'MLB555', price: -10 },
  { ...baseItem, id: 'MLB666', status: 'paused' },
  { ...baseItem, id: 'MLB777', currency_id: 'USD' },
]

beforeEach((t) => {
  db.exec('DELETE FROM posts; DELETE FROM affiliate_links;')
  Object.assign(config, { dryRun: true, whatsappGroupId: '120363000000000000@g.us', waConnectTimeoutMs: 1000 })
  messageId = 'fake-message-id'
  sendError = null
  t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'warn', () => {})
  t.mock.method(console, 'error', () => {})
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('/categories')) return Response.json([{ id: 'MLB1276', name: 'Esportes e Fitness' }, { id: 'MLB1144', name: 'Games' }])
    if (String(url).includes('/search?')) return Response.json({ results: items })
    throw new Error('Requisição externa inesperada: ' + url)
  })
  saveAffiliateLink('MLB111', 'https://meli.la/fake-link')
})
after(() => { stopWhatsApp(); db.close(); fs.rmSync(dir, { recursive: true, force: true }) })
async function waitForSocket(count) {
  for (let i = 0; i < 100; i++) {
    if (sockets.length >= count) return sockets.at(-1)
    await tick()
  }
  throw new Error('Socket de teste não foi criado')
}

test('filtro exclui falta de estoque, desconto de 19,96%, usados e anúncios inválidos; categorias são deduplicadas', async () => {
  const offers = await discoverCandidates()
  assert.deepEqual(offers.map((o) => o.itemId), ['MLB111'])
  assert.equal(offers[0].discountPercent, 20)
})

test('simular duas vezes não cria histórico nem bloqueia o anúncio', async () => {
  for (let i = 0; i < 2; i++) {
    const result = await runCycle('test')
    assert.equal(result.sent, false)
    assert.equal(result.simulated, true)
    assert.match(result.message, /20% OFF/)
    assert.match(result.message, /\n\n/)
    assert.ok(result.offer.simulatedAt)
    assert.equal(result.offer.sentAt, undefined)
  }
  assert.equal(stats().totalPosts, 0)
  assert.equal(wasPostedRecently('MLB111', 30), false)
  assert.deepEqual(recentPosts(), [])
  assert.equal(whatsappStatus().connected, false)
})

test('simulações de versões antigas não contam como envio nem bloqueiam ofertas', async () => {
  savePost({ itemId: 'MLB111', title: 'Teste antigo', price: 80, discountPercent: 20, affiliateUrl: 'https://meli.la/fake-link', whatsappMessageId: 'dry-run' })
  assert.equal(stats().totalPosts, 0)
  assert.equal(wasPostedRecently('MLB111', 30), false)
  assert.deepEqual(recentPosts(NaN), [])
  assert.equal((await runCycle('test')).simulated, true)
})

test('ciclos concorrentes não geram duas operações de envio', async (t) => {
  let release
  const wait = new Promise((resolve) => { release = resolve })
  t.mock.method(globalThis, 'fetch', async (url) => {
    await wait
    return String(url).endsWith('/categories') ? Response.json([{ id: 'MLB1276', name: 'Esportes e Fitness' }]) : Response.json({ results: [baseItem] })
  })
  const first = runCycle('test')
  assert.deepEqual(await runCycle('test'), { skipped: true, reason: 'already-running' })
  release()
  assert.equal((await first).simulated, true)
})

test('envio aguarda a conexão do WhatsApp e só depois registra o histórico', async () => {
  config.dryRun = false
  const resultPromise = runCycle('test')
  const sock = await waitForSocket(1)
  assert.equal(sock.calls.length, 0)
  assert.equal(stats().totalPosts, 0)
  assert.equal(whatsappStatus().connecting, true)
  sock.ev.emit('connection.update', { connection: 'open' })
  const result = await resultPromise
  assert.equal(result.sent, true)
  assert.ok(result.offer.sentAt)
  assert.equal(sock.calls.length, 1)
  assert.equal(sock.calls[0].group, config.whatsappGroupId)
  assert.equal(stats().totalPosts, 1)
  assert.equal(wasPostedRecently('MLB111', 30), true)
  assert.equal((await runCycle('test')).reason, 'no-ready-offer')
})

test('falha do WhatsApp preserva o histórico e mantém o item elegível', async () => {
  config.dryRun = false
  sendError = new Error('Falha de envio simulada')
  const result = await runCycle('test')
  assert.equal(result.sent, false)
  assert.match(result.error, /Falha de envio simulada/)
  assert.equal(stats().totalPosts, 0)
  assert.equal(wasPostedRecently('MLB111', 30), false)
})

test('resposta sem identificador não é contada como envio', async () => {
  config.dryRun = false
  messageId = null
  const result = await runCycle('test')
  assert.equal(result.sent, false)
  assert.match(result.error, /identificador/)
  assert.equal(stats().totalPosts, 0)
})

test('grupo ausente impede envio mesmo com conexão disponível', async () => {
  config.dryRun = false
  config.whatsappGroupId = ''
  await assert.rejects(sendOffer({}, 'Teste'), /WHATSAPP_GROUP_ID/)
})

test('conexão sem pareamento expira e uma sessão removida exige novo pareamento', async () => {
  config.dryRun = false
  sockets.at(-1).ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { statusCode: 503 } } })
  config.waConnectTimeoutMs = 20
  const count = sockets.length + 1
  const pending = connectWhatsApp()
  await waitForSocket(count)
  await assert.rejects(pending, /Tempo esgotado/)
  assert.equal(whatsappStatus().connected, false)
  config.waConnectTimeoutMs = 1000
  const count2 = sockets.length + 1
  const retry = connectWhatsApp()
  const sock = await waitForSocket(count2)
  sock.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { statusCode: 401 } } })
  await assert.rejects(retry, /Sessão removida/)
  await assert.rejects(connectWhatsApp(), /Sessão do WhatsApp removida/)
})
