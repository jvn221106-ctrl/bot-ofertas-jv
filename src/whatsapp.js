import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { config } from './config.js'

let socket = null
let connecting = null
let ready = false
let reconnectTimer = null
let cancelConnection = null
let loggedOut = false
let stopping = false
let lastError = null

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' })

function scheduleReconnect() {
  if (stopping || loggedOut || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWhatsApp().catch((error) => {
      console.error('[WhatsApp] Falha ao reconectar:', error.message)
      scheduleReconnect()
    })
  }, 3000)
  reconnectTimer.unref()
}

export async function connectWhatsApp() {
  if (config.dryRun) {
    console.log('[WhatsApp] DRY_RUN ativo: conexão real não será aberta.')
    return null
  }
  if (stopping) throw new Error('WhatsApp em encerramento')
  if (loggedOut) throw new Error('Sessão do WhatsApp removida. Refaça o pareamento antes de enviar.')
  if (socket && ready) return socket
  if (connecting) return connecting

  clearTimeout(reconnectTimer)
  reconnectTimer = null
  connecting = (async () => {
    fs.mkdirSync(path.resolve(config.waAuthDir), { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(config.waAuthDir)
    if (stopping) throw new Error('WhatsApp em encerramento')
    const sock = makeWASocket({ auth: state, logger, markOnlineOnConnect: false })
    socket = sock

    sock.ev.on('creds.update', () => {
      Promise.resolve().then(saveCreds).catch((error) => {
        lastError = 'Falha ao salvar a sessão do WhatsApp'
        console.error('[WhatsApp]', lastError, error.message)
      })
    })

    return new Promise((resolve, reject) => {
      let settled = false
      let timer
      const fail = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        cancelConnection = null
        reject(error)
      }
      cancelConnection = fail
      timer = setTimeout(() => {
        lastError = 'Tempo esgotado ao conectar o WhatsApp. Confira o pareamento.'
        ready = false
        socket = null
        fail(new Error(lastError))
        sock.end(new Error(lastError))
        scheduleReconnect()
      }, config.waConnectTimeoutMs)

      sock.ev.on('connection.update', (update) => {
        if (socket !== sock || stopping) return
        const { connection, lastDisconnect, qr } = update
        if (qr) {
          console.log('\n[WhatsApp] Escaneie o QR Code com o número exclusivo do bot:\n')
          qrcode.generate(qr, { small: true })
        }
        if (connection === 'open') {
          ready = true
          lastError = null
          clearTimeout(timer)
          cancelConnection = null
          settled = true
          resolve(sock)
          console.log('[WhatsApp] Conectado.')
        }
        if (connection === 'close') {
          ready = false
          socket = null
          const status = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode
          loggedOut = status === DisconnectReason.loggedOut
          lastError = loggedOut ? 'Sessão removida. Refaça o pareamento.' : 'WhatsApp desconectado; reconectando.'
          fail(new Error(lastError))
          console.warn('[WhatsApp]', lastError)
          if (!loggedOut) scheduleReconnect()
        }
      })
    })
  })()

  try {
    return await connecting
  } finally {
    connecting = null
  }
}

export function whatsappStatus() {
  return {
    connected: ready,
    dryRun: config.dryRun,
    connecting: Boolean(connecting),
    groupConfigured: Boolean(config.whatsappGroupId),
    lastError,
  }
}

export function stopWhatsApp() {
  stopping = true
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  cancelConnection?.(new Error('WhatsApp em encerramento'))
  cancelConnection = null
  const sock = socket
  socket = null
  ready = false
  sock?.end(new Error('Bot encerrado'))
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
    return { dryRun: true, messageId: null }
  }

  if (!config.whatsappGroupId) throw new Error('WHATSAPP_GROUP_ID não configurado')
  const sock = await connectWhatsApp()
  const content = offer.thumbnail
    ? { image: { url: offer.thumbnail }, caption: text }
    : { text }
  const sent = await sock.sendMessage(config.whatsappGroupId, content)
  if (!sent?.key?.id) throw new Error('WhatsApp não retornou o identificador do envio. O histórico não foi alterado.')
  return { dryRun: false, messageId: sent.key.id }
}
