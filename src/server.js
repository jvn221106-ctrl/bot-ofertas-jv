import express from 'express'
import { config } from './config.js'
import { stats, recentPosts } from './db.js'
import { registerAffiliateLink } from './affiliate.js'
import { discoverCandidates } from './mercadolivre.js'
import { listGroups, whatsappStatus } from './whatsapp.js'
import { runCycle, schedulerStatus } from './scheduler.js'
import { buildAuthorizationUrl, exchangeAuthorizationCode, oauthStatus } from './ml-auth.js'

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
    const s = stats()
    const wa = whatsappStatus()
    const sch = schedulerStatus()
    const oauth = oauthStatus()
    const rows = recentPosts(15).map((p) => `<tr><td>${esc(p.sent_at)}</td><td>${esc(p.item_id)}</td><td>${esc(p.title)}</td><td>${p.discount_percent}%</td></tr>`).join('')
    const oauthBlock = oauth.authorized
      ? `<p>✅ Mercado Livre autorizado${oauth.userId ? ` (usuário ${esc(oauth.userId)})` : ''}</p>`
      : `<p>⚠️ Mercado Livre ainda não autorizado. <a href="/oauth/start">Conectar agora</a></p>`

    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bot de Ofertas</title><style>body{font-family:system-ui;margin:32px;max-width:1000px;color:#18181b}h1{margin-bottom:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.card{border:1px solid #ddd;border-radius:12px;padding:16px}.muted{color:#666}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{text-align:left;border-bottom:1px solid #eee;padding:8px}code{background:#f4f4f5;padding:2px 5px;border-radius:5px}a{color:#0757d8}</style></head><body><h1>Bot de Ofertas</h1><p class="muted">Mercado Livre → filtro ≥ ${config.minDiscountPercent}% → WhatsApp, ${esc(config.cron)}, ${esc(config.tz)}</p>${oauthBlock}<div class="grid"><div class="card"><strong>Modo</strong><div>${config.dryRun ? 'DRY RUN' : 'PRODUÇÃO'}</div></div><div class="card"><strong>WhatsApp</strong><div>${wa.connected ? 'Conectado' : 'Desconectado'}</div></div><div class="card"><strong>Posts hoje</strong><div>${s.postsToday}</div></div><div class="card"><strong>Links de afiliado</strong><div>${s.affiliateLinks}</div></div></div><h2>Status</h2><p>Última execução: <code>${esc(sch.lastRun || 'ainda não executou')}</code></p><p>Último erro: <code>${esc(sch.lastError || 'nenhum')}</code></p><h2>Histórico recente</h2><table><thead><tr><th>Data</th><th>Item</th><th>Produto</th><th>Desc.</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nenhum envio ainda.</td></tr>'}</tbody></table></body></html>`)
  })

  return app.listen(config.port, '0.0.0.0', () => {
    console.log(`[Web] Painel em http://localhost:${config.port}`)
  })
}
