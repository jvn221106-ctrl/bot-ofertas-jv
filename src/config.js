import 'dotenv/config'
import path from 'node:path'
import cron from 'node-cron'

export function loadConfig(env = process.env, args = process.argv.slice(2)) {
  const value = (name, fallback = '') => String(env[name] ?? '').trim() || fallback
  function num(name, fallback, min, max, integer = false) {
    const v = Number(value(name, String(fallback)))
    if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
      throw new Error(`Variável ${name} inválida: use ${integer ? 'um inteiro' : 'um número'} entre ${min} e ${max}`)
    }
    return v
  }

  function bool(name, fallback) {
    const raw = value(name, String(fallback)).toLowerCase()
    if (['1', 'true', 'yes', 'sim', 'on'].includes(raw)) return true
    if (['0', 'false', 'no', 'nao', 'não', 'off'].includes(raw)) return false
    throw new Error(`Variável ${name} inválida: use true ou false`)
  }

  const tz = value('TZ', 'America/Sao_Paulo')
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: tz }) }
  catch { throw new Error('Variável TZ inválida: use um fuso como America/Sao_Paulo') }
  const schedule = value('CRON', '*/15 7-23 * * *')
  if (!cron.validate(schedule)) throw new Error('Variável CRON inválida')
  const groupId = value('WHATSAPP_GROUP_ID')
  if (groupId && !/^\d+(?:-\d+)?@g\.us$/.test(groupId)) {
    throw new Error('WHATSAPP_GROUP_ID inválido: copie o ID retornado por /api/groups')
  }
  const redirectUri = value('ML_REDIRECT_URI')
  if (redirectUri) {
    let parsed
    try { parsed = new URL(redirectUri) } catch { throw new Error('ML_REDIRECT_URI inválida: use uma URL completa') }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hash || parsed.username || parsed.password) {
      throw new Error('ML_REDIRECT_URI inválida: use uma URL HTTP/HTTPS sem fragmento ou credenciais')
    }
  }
  const dataDir = value('DATA_DIR', './data')
  return {
    tz,
    cron: schedule,
    port: num('PORT', 3000, 1, 65535, true),
    dataDir,
    mlSiteId: value('ML_SITE_ID', 'MLB'),
    mlAccessToken: value('ML_ACCESS_TOKEN'),
    mlClientId: value('ML_CLIENT_ID'),
    mlClientSecret: value('ML_CLIENT_SECRET'),
    mlRedirectUri: redirectUri,
    mlRequestTimeoutMs: num('ML_REQUEST_TIMEOUT_MS', 20000, 1000, 120000, true),
    minDiscountPercent: num('MIN_DISCOUNT_PERCENT', 20, 0, 100),
    candidatesPerCategory: num('CANDIDATES_PER_CATEGORY', 30, 1, 50, true),
    categoryPatterns: value('CATEGORY_PATTERNS', 'Esportes e Fitness,Calçados Roupas e Bolsas,Games,Eletrônicos Áudio e Vídeo,Celulares e Telefones,Informática')
      .split(',').map((x) => x.trim()).filter(Boolean),
    whatsappGroupId: groupId,
    waAuthDir: value('WA_AUTH_DIR', path.join(dataDir, 'wa-auth')),
    waConnectTimeoutMs: num('WA_CONNECT_TIMEOUT_MS', 60000, 1000, 180000, true),
    affiliateProfile: value('AFFILIATE_PROFILE', 'jvn2211'),
    affiliateLabelPrefix: value('AFFILIATE_LABEL_PREFIX', 'whatsapp'),
    dryRun: args.includes('--dry-run') || bool('DRY_RUN', true),
    repeatBlockDays: num('REPEAT_BLOCK_DAYS', 30, 0, 3650, true),
  }
}

export const config = loadConfig()
process.env.TZ = config.tz
