import { config } from './config.js'
import { oauthStatus } from './ml-auth.js'

const oauth = oauthStatus()
console.log('Bot de Ofertas JV — diagnóstico')
console.log('Modo: ' + (config.dryRun ? 'simulação, sem enviar mensagens' : 'envio real'))
console.log('Agenda: ' + config.cron + ' (' + config.tz + ')')
console.log('Desconto mínimo: ' + config.minDiscountPercent + '%')
console.log('Dados persistentes: ' + config.dataDir)
console.log('Painel: http://localhost:' + config.port)
if (oauth.storageError) console.log('PENDENTE: ' + oauth.storageError)
if (oauth.authorized) {
  console.log('OK: credenciais do Mercado Livre disponíveis')
  console.log(oauth.hasRefreshToken ? 'OK: renovação automática configurada' : 'ATENÇÃO: token manual sem renovação automática')
} else {
  console.log('PENDENTE: autorizar o Mercado Livre em /oauth/start')
}
if (oauth.missingConfig.length) console.log('PENDENTE: preencher no .env: ' + oauth.missingConfig.join(', '))
console.log(config.whatsappGroupId ? 'OK: grupo do WhatsApp configurado' : 'PENDENTE: parear o WhatsApp e escolher o grupo')
console.log('Links de afiliado: cadastre os links oficiais no painel; geração automática ainda pendente.')
if (!oauth.authorized) process.exitCode = 1
