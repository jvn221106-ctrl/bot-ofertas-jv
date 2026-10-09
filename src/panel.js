import { config } from './config.js'
import { recentPosts } from './db.js'

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function renderPanel({ s, wa, sch, oauth }) {
  const rows = recentPosts(15).map((p) => `<tr><td>${esc(new Date(p.sent_at).toLocaleString('pt-BR', { timeZone: config.tz }))}</td><td>${esc(p.item_id)}</td><td>${esc(p.title)}</td><td>${esc(p.discount_percent)}%</td></tr>`).join('')
  const oauthBlock = oauth.authorized
    ? '<p>✅ Mercado Livre autorizado' + (oauth.hasRefreshToken ? ' com renovação automática.' : ' por token manual.') + '</p>'
    : oauth.configured
      ? '<p>Mercado Livre aguardando autorização. <a href="/oauth/start">Conectar Mercado Livre</a></p>'
      : '<p>Configure a aplicação do Mercado Livre no arquivo .env: <code>' + esc(oauth.missingConfig.join(', ')) + '</code>. Depois, a conexão ficará disponível aqui.</p>'
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bot de Ofertas JV</title>
<style>body{font-family:system-ui;margin:32px auto;padding:0 20px;max-width:1000px;color:#18181b;background:#fafafa}h1{margin-bottom:8px}h2{font-size:20px;margin-top:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.card,section{background:white;border:1px solid #ddd;border-radius:12px;padding:16px}.muted{color:#555}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #eee;padding:8px}.table-wrap{overflow:auto}code{background:#f4f4f5;padding:2px 5px;border-radius:5px;overflow-wrap:anywhere}a{color:#0757d8}button{background:#0757d8;color:white;border:0;border-radius:7px;padding:11px 16px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}form{display:grid;gap:10px}label{display:grid;gap:4px}input{font:inherit;padding:10px;border:1px solid #aaa;border-radius:6px;box-sizing:border-box;width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f5;padding:16px;border-radius:8px;min-height:24px}@media(max-width:600px){body{margin-top:20px}td,th{font-size:13px}}</style></head>
<body><h1>Bot de Ofertas JV</h1><p class="muted">Mercado Livre → ofertas a partir de ${config.minDiscountPercent}% de desconto → WhatsApp</p>
${oauthBlock}${oauth.storageError ? '<p>' + esc(oauth.storageError) + '</p>' : ''}
<div class="grid"><div class="card"><strong>Modo</strong><div>${config.dryRun ? 'Simulação' : 'Envio real'}</div></div><div class="card"><strong>WhatsApp</strong><div>${config.dryRun ? 'Pareamento desativado na simulação' : wa.connected ? 'Conectado' : 'Aguardando conexão'}</div><small>${wa.groupConfigured ? 'Grupo configurado' : 'Grupo ainda não escolhido'}</small></div><div class="card"><strong>Envios hoje</strong><div id="posts-today">${s.postsToday}</div></div><div class="card"><strong>Links cadastrados</strong><div id="links-count">${s.affiliateLinks}</div></div></div>
<h2>Buscar e testar</h2><section><p>${config.dryRun ? 'O teste mostra a mensagem e preserva o histórico de envios reais.' : 'O ciclo envia uma oferta com link cadastrado para o grupo configurado.'}</p><div class="actions"><button id="preview">Buscar ofertas</button><button id="cycle">${config.dryRun ? 'Simular uma oferta' : 'Enviar uma oferta'}</button><a href="/">Atualizar status</a></div><pre id="result" aria-live="polite">Os resultados aparecerão aqui.</pre></section>
<h2>Cadastrar link de afiliado</h2><section><p>Use o link oficial gerado na sua conta para o produto informado. A geração automática de links ainda está pendente.</p><form id="affiliate"><label>Número do anúncio<input name="itemId" placeholder="MLB5137660841" pattern="[mM][lL][bB][0-9]+" required></label><label>Link oficial de afiliado<input name="url" type="url" placeholder="https://meli.la/..." required></label><label>Etiqueta (opcional)<input name="label" maxlength="128" placeholder="whatsapp_esportes"></label><div><button type="submit">Salvar link</button></div></form><p id="affiliate-result" aria-live="polite"></p><p class="muted">O cadastro verifica o formato do link. Confirme na ferramenta do Mercado Livre que ele corresponde ao anúncio e à sua conta.</p></section>
<h2>Status da agenda</h2><section><p>Agenda: <code>${esc(sch.cron)}</code> · ${esc(sch.timezone)}</p><p>Última execução: <span id="last-run">${esc(sch.lastRun || 'ainda não executou')}</span></p><p>Último erro: <span id="last-error">${esc(sch.lastError || wa.lastError || 'nenhum')}</span></p></section>
<h2>Histórico de envios reais</h2><section class="table-wrap"><table><thead><tr><th>Data</th><th>Item</th><th>Produto</th><th>Desconto</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nenhum envio real ainda.</td></tr>'}</tbody></table></section>
<script>
const output = document.getElementById('result');
async function request(url, body) {
  const options = {cache:'no-store'};
  if (body !== undefined) Object.assign(options, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
async function refreshStatus() {
  try {
    const data = await request('/health');
    document.getElementById('posts-today').textContent = data.postsToday;
    document.getElementById('links-count').textContent = data.affiliateLinks;
    document.getElementById('last-run').textContent = data.scheduler.lastRun || 'ainda não executou';
    document.getElementById('last-error').textContent = data.scheduler.lastError || 'nenhum';
  } catch {}
}
document.getElementById('preview').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  output.textContent = 'Buscando ofertas…';
  try {
    const offers = await request('/api/offers/preview');
    output.textContent = offers.length ? offers.map((o) => o.itemId + ' · ' + o.title + '\\n' + o.discountPercent + '% OFF · ' + new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(o.price) + ' · ' + (o.affiliateUrl ? 'Link cadastrado' : 'Aguardando link de afiliado')).join('\\n\\n') : 'Nenhuma oferta atende aos filtros neste momento.';
  } catch (error) { output.textContent = error.message; }
  finally { button.disabled = false; }
});
document.getElementById('cycle').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  output.textContent = 'Executando ciclo…';
  try {
    const result = await request('/api/send-now', {});
    output.textContent = result.simulated ? 'Simulação concluída.\\n\\n' + result.message : result.sent ? 'Oferta enviada: ' + result.offer.title : result.skipped ? 'Já existe um ciclo em execução.' : 'Nenhuma oferta pronta com link de afiliado cadastrado.';
  } catch (error) { output.textContent = error.message; }
  finally { button.disabled = false; await refreshStatus(); }
});
document.getElementById('affiliate').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const status = document.getElementById('affiliate-result');
  button.disabled = true;
  try {
    const data = await request('/api/affiliate-link', Object.fromEntries(new FormData(form)));
    status.textContent = 'Link cadastrado para ' + data.itemId + '.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; await refreshStatus(); }
});
</script></body></html>`
}
