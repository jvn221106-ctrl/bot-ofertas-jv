import { config } from './config.js'
import { connectWhatsApp } from './whatsapp.js'
import { startScheduler } from './scheduler.js'
import { startServer } from './server.js'

console.log('=== Bot de Ofertas Mercado Livre → WhatsApp ===')
console.log(`Desconto mínimo: ${config.minDiscountPercent}%`)
console.log(`Agenda: ${config.cron} (${config.tz})`)
console.log(`Modo: ${config.dryRun ? 'DRY RUN' : 'PRODUÇÃO'}`)

startServer()
startScheduler()
connectWhatsApp().catch((e) => console.error('[WhatsApp] Erro inicial:', e.message))
