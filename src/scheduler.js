import cron from 'node-cron'
import { config } from './config.js'
import { pickBestReadyOffer } from './mercadolivre.js'
import { sendOffer } from './whatsapp.js'
import { savePost } from './db.js'

let running = false
let lastRun = null
let lastError = null
let lastOffer = null

function brl(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatOfferMessage(offer) {
  const categoryEmoji = /game/i.test(offer.categoryName) ? '🎮'
    : /esporte/i.test(offer.categoryName) ? '🏃'
      : /roup|calç|tenis|tênis/i.test(offer.categoryName) ? '👟'
        : '⚡'

  return [
    `${categoryEmoji} *OFERTA COM ${Math.round(offer.discountPercent)}% OFF* 🔥`,
    '',
    `*${offer.title}*`,
    '',
    offer.originalPrice ? `De: ~${brl(offer.originalPrice)}~` : null,
    `💰 *Por ${brl(offer.price)}*`,
    '',
    `🛒 *PEGAR OFERTA:*`,
    offer.affiliateUrl,
    '',
    '📢 Publicidade | Link de afiliado',
    '⚠️ Preço e disponibilidade podem mudar sem aviso.',
  ].filter(Boolean).join('\n')
}

export async function runCycle(reason = 'cron') {
  if (running) return { skipped: true, reason: 'already-running' }
  running = true
  lastRun = new Date().toISOString()
  lastError = null

  try {
    const offer = await pickBestReadyOffer()
    if (!offer) {
      console.log(`[Scheduler] ${reason}: nenhuma oferta pronta com link de afiliado validado.`)
      return { sent: false, reason: 'no-ready-offer' }
    }

    const text = formatOfferMessage(offer)
    const result = await sendOffer(offer, text)
    savePost({ ...offer, whatsappMessageId: result.messageId })
    lastOffer = { ...offer, sentAt: new Date().toISOString() }
    console.log(`[Scheduler] Enviado: ${offer.itemId} - ${offer.title}`)
    return { sent: true, offer: lastOffer }
  } catch (error) {
    lastError = error?.message || String(error)
    console.error('[Scheduler] Erro:', lastError)
    return { sent: false, error: lastError }
  } finally {
    running = false
  }
}

export function startScheduler() {
  const task = cron.schedule(config.cron, () => runCycle('cron'), {
    timezone: config.tz,
    noOverlap: true,
  })
  console.log(`[Scheduler] Ativo: ${config.cron} (${config.tz})`)
  return task
}

export function schedulerStatus() {
  return { running, lastRun, lastError, lastOffer, cron: config.cron, timezone: config.tz }
}
