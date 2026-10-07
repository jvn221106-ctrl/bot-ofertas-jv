import 'dotenv/config'

function num(name, fallback) {
  const v = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(v)) throw new Error(`Variável ${name} inválida`)
  return v
}

function bool(name, fallback = false) {
  const raw = String(process.env[name] ?? fallback).toLowerCase()
  return ['1', 'true', 'yes', 'sim', 'on'].includes(raw)
}

export const config = {
  tz: process.env.TZ || 'America/Sao_Paulo',
  cron: process.env.CRON || '*/15 7-23 * * *',
  port: num('PORT', 3000),
  mlSiteId: process.env.ML_SITE_ID || 'MLB',
  mlAccessToken: process.env.ML_ACCESS_TOKEN || '',
  minDiscountPercent: num('MIN_DISCOUNT_PERCENT', 20),
  candidatesPerCategory: num('CANDIDATES_PER_CATEGORY', 30),
  categoryPatterns: String(process.env.CATEGORY_PATTERNS || 'Esportes e Fitness,Calçados Roupas e Bolsas,Games,Eletrônicos Áudio e Vídeo,Celulares e Telefones,Informática')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
  whatsappGroupId: process.env.WHATSAPP_GROUP_ID || '',
  waAuthDir: process.env.WA_AUTH_DIR || './data/wa-auth',
  affiliateProfile: process.env.AFFILIATE_PROFILE || 'jvn2211',
  affiliateLabelPrefix: process.env.AFFILIATE_LABEL_PREFIX || 'whatsapp',
  dryRun: bool('DRY_RUN', true),
  repeatBlockDays: num('REPEAT_BLOCK_DAYS', 30),
}
