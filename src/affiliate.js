import { saveAffiliateLink } from './db.js'

export function validateAffiliateUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'URL inválida' }
  }

  const host = parsed.hostname.toLowerCase()
  const allowed = host === 'meli.la' || host.endsWith('.mercadolivre.com.br') || host === 'mercadolivre.com.br'
  if (!allowed) return { ok: false, reason: 'O link não parece ser do Mercado Livre' }

  const looksAffiliate = host === 'meli.la' || parsed.pathname.startsWith('/social/') || parsed.searchParams.has('ref')
  if (!looksAffiliate) return { ok: false, reason: 'O link não parece conter rastreamento de afiliado' }

  return { ok: true }
}

export function registerAffiliateLink({ itemId, url, label }) {
  if (!/^MLB[A-Z0-9]+$/i.test(itemId)) {
    throw new Error('itemId inválido. Exemplo: MLB5137660841')
  }
  const validation = validateAffiliateUrl(url)
  if (!validation.ok) throw new Error(validation.reason)
  saveAffiliateLink(itemId.toUpperCase(), url, label || null)
  return { ok: true }
}
