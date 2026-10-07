import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { config } from './config.js'

let socket = null
let connecting = null
let ready = false

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' })

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

export async function connectWhatsApp() {
  if (config.dryRun) {
    ready = true
    console.log('[WhatsApp] DRY_RUN ativo: conexão real não será aberta.')
    return null
  }
  if (socket && ready) return socket
  if (connecting) return connecting

  connecting = (async () => {
    fs.mkdirSync(path.resolve(config.waAuthDir), { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(config.waAuthDir)

    const sock = makeWASocket({
      auth: state,
      logger,
      markOnlineOnConnect: false,
      printQRInTerminal: false,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update
      if (qr) {
        console.log('\n[WhatsApp] Escaneie o QR Code com o número exclusivo do bot:\n')
        qrcode.generate(qr, { small: true })
      }
      if (connection === 'open') {
        ready = true
        socket = sock
        console.log('[WhatsApp] Conectado.')
      }
      if (connection === 'close') {
        ready = false
        const status = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode
        const loggedOut = status === DisconnectReason.loggedOut
        console.warn(`[WhatsApp] Conexão fechada${loggedOut ? ' (logout)' : ''}.`)
        if (!loggedOut) {
          await sleep(3000)
          socket = null
          connecting = null
          connectWhatsApp().catch((e) => console.error('[WhatsApp] Falha ao reconectar:', e.message))
        }
      }
    })

    socket = sock
    return sock
  })()

  try {
    return await connecting
  } finally {
    connecting = null
  }
}

export function whatsappStatus() {
  return { connected: ready, dryRun: config.dryRun }
}

export async function listGroups() {
  if (config.dryRun) return []
  const sock = await connectWhatsApp()
  const groups = await sock.groupFetchAllParticipating()
  return Object.values(groups).map((g) => ({ id: g.id, subject: g.subject, size: g.participants?.length || 0 }))
}

export async function sendOffer(offer, text) {
  if (config.dryRun) {
    console.log('\n[DRY RUN] Mensagem que seria enviada:\n')
    console.log(text)
    console.log('\nOferta:', offer.permalink)
    return { messageId: 'dry-run' }
  }

  if (!config.whatsappGroupId) throw new Error('WHATSAPP_GROUP_ID não configurado')
  const sock = await connectWhatsApp()

  let content = { text }
  if (offer.thumbnail) {
    content = {
      image: { url: offer.thumbnail },
      caption: text,
    }
  }

  const sent = await sock.sendMessage(config.whatsappGroupId, content)
  return { messageId: sent?.key?.id || null }
}
