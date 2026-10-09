import { config } from './config.js'
import { connectWhatsApp, stopWhatsApp } from './whatsapp.js'
import db from './db.js'
import { startScheduler } from './scheduler.js'
import { startServer } from './server.js'

console.log('=== Bot de Ofertas Mercado Livre → WhatsApp ===')
console.log(`Desconto mínimo: ${config.minDiscountPercent}%`)
console.log(`Agenda: ${config.cron} (${config.tz})`)
console.log(`Modo: ${config.dryRun ? 'DRY RUN' : 'PRODUÇÃO'}`)

const server = startServer()
const task = startScheduler()
connectWhatsApp().catch((e) => console.error('[WhatsApp] Erro inicial:', e.message))

function shutdown() {
  task.stop()
  stopWhatsApp()
  server.close(() => { db.close(); process.exit(0) })
  setTimeout(() => process.exit(0), 5000).unref()
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
