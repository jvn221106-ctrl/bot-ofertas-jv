import { config } from './config.js'
import { wasPostedRecently, getAffiliateLink } from './db.js'
import { getAccessToken } from './ml-auth.js'

const API = 'https://api.mercadolibre.com'

async function mlGet(path) {
  let token = await getAccessToken()
  const request = () => fetch(`${API}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(config.mlRequestTimeoutMs),
  })
  let res = await request()
  if (res.status === 401) {
    await res.body?.cancel()
    token = await getAccessToken({ forceRefresh: true, rejectedToken: token })
    res = await request()
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const endpoint = path.split('?')[0]
    throw new Error(`Mercado Livre API ${res.status} em ${endpoint}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

function normalize(s = '') {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export async function resolveTargetCategories() {
  const categories = await mlGet(`/sites/${config.mlSiteId}/categories`)
  const wanted = config.categoryPatterns.map(normalize)
  const selected = categories.filter((c) => {
    const name = normalize(c.name)
    return wanted.some((p) => name.includes(p) || p.includes(name))
  })

  if (!selected.length) {
    throw new Error(`Nenhuma categoria alvo encontrada. Padrões: ${config.categoryPatterns.join(', ')}`)
  }
  return selected
}

function calcDiscount(item) {
  const price = Number(item.price)
  const original = Number(item.original_price)
  if (!Number.isFinite(price) || !Number.isFinite(original) || price <= 0 || original <= price) return 0
  return ((original - price) / original) * 100
}

function reputationBonus(item) {
  const level = String(item?.seller?.seller_reputation?.level_id || item?.seller?.reputation?.level_id || '')
  if (level.startsWith('5_')) return 25
  if (level.startsWith('4_')) return 15
  return 0
}

function score(item, discountPercent) {
  const sold = Number(item.sold_quantity || 0)
  const available = Number(item.available_quantity || 0)
  return discountPercent * 5 + Math.min(60, Math.log10(sold + 1) * 20) + reputationBonus(item) + Math.min(20, available)
}

function isNew(item) {
  return !item.condition || item.condition === 'new'
}

export async function discoverCandidates() {
  const categories = await resolveTargetCategories()
  const all = []

  for (const category of categories) {
    const params = new URLSearchParams({
      category: category.id,
      limit: String(config.candidatesPerCategory),
      sort: 'relevance',
    })
    const result = await mlGet(`/sites/${config.mlSiteId}/search?${params}`)

    for (const item of result.results || []) {
      const discountPercent = calcDiscount(item)
      if (discountPercent < config.minDiscountPercent) continue
      if (!Number.isFinite(Number(item.price)) || Number(item.price) <= 0) continue
      if (item.status && item.status !== 'active') continue
      if (item.currency_id && item.currency_id !== 'BRL') continue
      if (!isNew(item)) continue
      if (Number(item.available_quantity ?? 1) <= 0) continue
      if (wasPostedRecently(item.id, config.repeatBlockDays)) continue

      const affiliate = getAffiliateLink(item.id)
      all.push({
        itemId: item.id,
        title: item.title,
        price: Number(item.price),
        originalPrice: Number(item.original_price) || null,
        discountPercent: Math.floor(discountPercent * 10) / 10,
        categoryId: item.category_id,
        categoryName: category.name,
        permalink: item.permalink,
        thumbnail: String(item.thumbnail || '').replace('http://', 'https://'),
        sellerId: item?.seller?.id || null,
        soldQuantity: Number(item.sold_quantity || 0),
        affiliateUrl: affiliate?.url || null,
        affiliateLabel: affiliate?.label || null,
        score: score(item, discountPercent),
      })
    }
  }

  const dedup = new Map()
  for (const item of all) {
    const previous = dedup.get(item.itemId)
    if (!previous || item.score > previous.score) dedup.set(item.itemId, item)
  }

  return [...dedup.values()].sort((a, b) => b.score - a.score)
}

export async function pickBestReadyOffer() {
  const candidates = await discoverCandidates()
  return candidates.find((x) => x.affiliateUrl) || null
}
