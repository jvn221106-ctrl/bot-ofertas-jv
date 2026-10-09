import express from 'express'
import { config } from './config.js'
import { stats, recentPosts } from './db.js'
import { registerAffiliateLink } from './affiliate.js'
import { discoverCandidates } from './mercadolivre.js'
import { listGroups, whatsappStatus } from './whatsapp.js'
import { runCycle, schedulerStatus } from './scheduler.js'
import { buildAuthorizationUrl, exchangeAuthorizationCode, oauthStatus } from './ml-auth.js'
import { renderPanel } from './panel.js'

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function startServer() {
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false }))

  app.get('/health', (_req, res) => res.json({ ok: true, ...stats(), oauth: oauthStatus(), whatsapp: whatsappStatus(), scheduler: schedulerStatus() }))

  app.get('/oauth/start', (_req, res) => {
    try { res.redirect(buildAuthorizationUrl()) }
    catch (e) { res.status(500).type('text').send(e.message) }
  })

  app.get('/oauth/callback', async (req, res) => {
    try {
      if (req.query.error) throw new Error(String(req.query.error_description || req.query.error))
      await exchangeAuthorizationCode({ code: String(req.query.code || ''), state: String(req.query.state || '') })
      res.type('html').send('<!doctype html><meta charset="utf-8"><title>Mercado Livre conectado</title><body style="font-family:system-ui;margin:40px"><h1>✅ Mercado Livre conectado</h1><p>O Access Token e o Refresh Token foram salvos no servidor. Você pode fechar esta página e voltar ao painel do bot.</p><p><a href="/">Voltar ao painel</a></p></body>')
    } catch (e) {
      res.status(400).type('html').send(`<!doctype html><meta charset="utf-8"><title>Falha OAuth</title><body style="font-family:system-ui;margin:40px"><h1>❌ Não foi possível conectar</h1><p>${esc(e.message)}</p><p><a href="/oauth/start">Tentar novamente</a></p></body>`)
    }
  })

  app.get('/oauth/status', (_req, res) => res.json(oauthStatus()))

  app.get('/api/history', (req, res) => {
    res.json(recentPosts(Number(req.query.limit || 50)))
  })

  app.get('/api/groups', async (_req, res) => {
    try { res.json(await listGroups()) }
    catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/offers/preview', async (_req, res) => {
    try {
      const offers = await discoverCandidates()
      res.json(offers.slice(0, 20))
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.post('/api/affiliate-link', (req, res) => {
    try {
      res.json(registerAffiliateLink(req.body))
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })

  app.post('/api/send-now', async (_req, res) => {
    res.json(await runCycle('manual'))
  })

  app.get('/', (_req, res) => {
    res.type('html').send(renderPanel({ s: stats(), wa: whatsappStatus(), sch: schedulerStatus(), oauth: oauthStatus() }))
  })

  return app.listen(config.port, '0.0.0.0', () => {
    console.log(`[Web] Painel em http://localhost:${config.port}`)
  })
}
