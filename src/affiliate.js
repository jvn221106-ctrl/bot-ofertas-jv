import { saveAffiliateLink } from './db.js'

export function validateAffiliateUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'URL inválida' }
  }

  const host = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return { ok: false, reason: 'Use um link HTTPS sem credenciais ou porta alternativa' }
  }
  const allowed = host === 'meli.la' || host.endsWith('.mercadolivre.com.br') || host === 'mercadolivre.com.br'
  if (!allowed) return { ok: false, reason: 'O link não parece ser do Mercado Livre' }

  const looksAffiliate = (host === 'meli.la' && parsed.pathname.length > 1)
    || (parsed.pathname.startsWith('/social/') && parsed.pathname.length > '/social/'.length)
    || Boolean(parsed.searchParams.get('ref')?.trim())
  if (!looksAffiliate) return { ok: false, reason: 'O link não parece conter rastreamento de afiliado' }

  return { ok: true }
}

export function registerAffiliateLink({ itemId, url, label } = {}) {
  itemId = String(itemId || '').trim().toUpperCase()
  url = String(url || '').trim()
  if (!/^MLB\d+$/.test(itemId)) {
    throw new Error('itemId inválido. Exemplo: MLB5137660841')
  }
  const validation = validateAffiliateUrl(url)
  if (!validation.ok) throw new Error(validation.reason)
  saveAffiliateLink(itemId, url, String(label || '').trim().slice(0, 128) || null)
  return { ok: true, itemId }
}
