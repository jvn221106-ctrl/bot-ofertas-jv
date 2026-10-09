import test from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('configuração padrão preserva as regras combinadas', () => {
  const c = loadConfig({}, [])
  assert.equal(c.dryRun, true)
  assert.equal(c.minDiscountPercent, 20)
  assert.equal(c.repeatBlockDays, 30)
  assert.equal(c.cron, '*/15 7-23 * * *')
  assert.equal(c.tz, 'America/Sao_Paulo')
  assert.equal(c.categoryPatterns.length, 6)
})

test('DRY_RUN vazio continua sendo simulação e um erro de digitação interrompe a inicialização', () => {
  assert.equal(loadConfig({ DRY_RUN: ' ' }, []).dryRun, true)
  assert.equal(loadConfig({ DRY_RUN: 'false' }, []).dryRun, false)
  assert.throws(() => loadConfig({ DRY_RUN: 'tru' }, []), /DRY_RUN inválida/)
  assert.equal(loadConfig({ DRY_RUN: 'false' }, ['--dry-run']).dryRun, true)
})

test('variáveis numéricas vazias usam o padrão e valores inválidos são rejeitados', () => {
  assert.equal(loadConfig({ MIN_DISCOUNT_PERCENT: '', PORT: '' }, []).minDiscountPercent, 20)
  for (const env of [{ PORT: '0' }, { PORT: '65536' }, { MIN_DISCOUNT_PERCENT: '-1' }, { MIN_DISCOUNT_PERCENT: '101' }, { CANDIDATES_PER_CATEGORY: '1.5' }, { REPEAT_BLOCK_DAYS: '-30' }]) {
    assert.throws(() => loadConfig(env, []), /inválida/)
  }
})

test('agenda, fuso, callback e grupo são validados antes de iniciar', () => {
  for (const env of [{ CRON: 'abc' }, { TZ: 'fuso-inexistente' }, { ML_REDIRECT_URI: 'javascript:alert(1)' }, { ML_REDIRECT_URI: 'https://example.com/#token' }, { WHATSAPP_GROUP_ID: '5511999999999@s.whatsapp.net' }]) {
    assert.throws(() => loadConfig(env, []), /inválid/)
  }
  assert.equal(loadConfig({ WHATSAPP_GROUP_ID: '120363000000000000@g.us' }, []).whatsappGroupId, '120363000000000000@g.us')
})
