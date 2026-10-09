# Bot de Ofertas Mercado Livre → WhatsApp

Versão 0.2.1 do bot-ofertas-jv. Instalação com dependências fixadas, autorização OAuth com renovação de token, painel de testes e histórico apenas de envios reais.

## Regras já configuradas

- Mercado Livre Brasil (`MLB`).
- Categorias: esportes, roupas/moda, tênis/calçados, games, eletrônicos, celulares e informática.
- Desconto mínimo: **20%**.
- Uma tentativa de postagem a cada **15 minutos**.
- Janela diária: **07:00 até 23:45**, fuso `America/Sao_Paulo`.
- Até 68 horários de postagem por dia.
- Não repete o mesmo item por 30 dias (configurável).
- Guarda histórico em SQLite.
- Pode rodar 24h em Docker/VPS, sem computador pessoal ligado.
- WhatsApp conectado como dispositivo vinculado por QR Code.

## Importante sobre os links de afiliado

O bot só publica um item quando existe um link oficial de afiliado cadastrado para aquele `item_id` no banco local. O cadastro verifica o formato HTTPS e o domínio; não verifica a atribuição da comissão ou a correspondência entre o link e o anúncio. Confira essas informações na ferramenta do Mercado Livre antes de cadastrar.

Isso é intencional: o link completo que você forneceu contém um `ref` específico gerado pelo Mercado Livre. Sem um mecanismo oficial/publicamente documentado para gerar esse token por API, montar a URL na mão pode abrir o produto sem garantir atribuição da comissão.

A próxima etapa do projeto é ligar o módulo `affiliate` ao método de geração que sua conta aceitar (ferramenta oficial ou automação validada). Todo o restante do fluxo já fica independente dessa implementação.

## 1. Instalar

Requisitos: Node.js 22.9 ou superior. O Docker usa Node.js 24. As dependências são fixadas no `package-lock.json`.

```bash
cp .env.example .env
npm ci
npm start
```

Por segurança, o `.env.example` vem com `DRY_RUN=true`, então nenhum WhatsApp é acionado.

Para verificar a configuração, execute `npm run doctor`. O diagnóstico mostra pendências sem imprimir tokens ou segredos. Para iniciar sempre em simulação, inclusive no Windows, use `npm run dry-run`.

O modo de simulação mostra a mensagem, não grava um envio e não bloqueia o anúncio por 30 dias. Registros de simulação de versões antigas também são ignorados pelo histórico e pelo bloqueio de repetição.

## 2. Mercado Livre

Crie uma aplicação no [portal de desenvolvedores do Mercado Livre](https://developers.mercadolivre.com.br/) e preencha no `.env`:

```env
ML_CLIENT_ID=APP_ID_DA_SUA_APLICACAO
ML_CLIENT_SECRET=SECRET_KEY_DA_SUA_APLICACAO
ML_REDIRECT_URI=https://SEU_DOMINIO/oauth/callback
```

Use em `ML_REDIRECT_URI` exatamente a mesma URL cadastrada no aplicativo. Ela precisa apontar para este bot. Quando habilitar PKCE no aplicativo, mantenha o método S256, usado pelo bot.

Com o servidor rodando, clique em **Conectar Mercado Livre** no painel ou abra `/oauth/start`. Após a autorização, os tokens ficam em `data/ml-oauth.json`, com acesso restrito e gravação atômica. O bot renova tokens próximos do vencimento e compartilha uma única renovação entre requisições concorrentes. Uma resposta HTTP 401 provoca uma renovação e uma nova tentativa.

Para um teste temporário, também é possível preencher `ML_ACCESS_TOKEN`. Um token manual não oferece renovação automática.

A descoberta usa as categorias de `MLB` e a busca por categoria. O acesso real a esses recursos e os campos de preço/desconto ainda precisam ser validados com a aplicação autorizada. Um erro de permissão da API é mostrado no painel; o bot não publica nesse caso.

## 3. Cadastrar um link de afiliado para teste

No painel `http://localhost:3000/`, use o formulário **Cadastrar link de afiliado**. Também é possível usar a API, como no exemplo abaixo; confirme que o link corresponde ao produto e à sua conta antes de utilizar:

```bash
curl -X POST http://localhost:3000/api/affiliate-link \
  -H 'content-type: application/json' \
  -d '{
    "itemId":"MLB5137660841",
    "url":"https://meli.la/1tMUpyd",
    "label":"whatsapp_esportes"
  }'
```

O bot só seleciona para envio ofertas que atendam ao desconto mínimo **e** tenham link de afiliado cadastrado.

## 4. Testar a busca

Abra:

- `http://localhost:3000/api/offers/preview` — até 20 candidatos.
- `http://localhost:3000/` — painel com status, busca, cadastro de links e botão de simulação/envio.

Para forçar um ciclo:

```bash
curl -X POST http://localhost:3000/api/send-now
```

Com `DRY_RUN=true`, a mensagem aparece no painel/terminal e a resposta indica `simulated: true` e `sent: false`. O histórico permanece reservado aos envios reais.

As ofertas precisam ter preço válido, desconto real de pelo menos 20%, estoque e link cadastrado. Anúncios usados, pausados ou em outra moeda são descartados. Um desconto de 19,96% não é arredondado para passar pelo filtro de 20%.

## 5. Conectar o novo número do WhatsApp

Quando o chip/número exclusivo estiver pronto:

1. Ative o WhatsApp nesse número.
2. Entre com ele no grupo público de ofertas.
3. Altere `DRY_RUN=false`.
4. Rode o bot; um QR Code aparecerá no terminal.
5. No celular do número do bot, use **Aparelhos conectados** e leia o QR.
6. A sessão fica persistida em `data/wa-auth`.
7. Consulte `GET /api/groups` e copie o `id` do grupo desejado para `WHATSAPP_GROUP_ID`.
8. Reinicie o bot.

O envio aguarda a conexão do WhatsApp e só registra o histórico depois que a biblioteca retorna um identificador de mensagem. Se o dispositivo vinculado for removido, será necessário parear novamente; a sessão antiga não é apagada automaticamente.

> A automação de grupo por biblioteca de WhatsApp Web não é uma API oficial da Meta. Ela pode exigir reconexão e pode sofrer mudanças/bloqueios. Use o número exclusivo do bot, como planejado.

## 6. Hospedar sem deixar PC ligado

A forma mais simples é Docker em uma VPS/serviço com volume persistente:

```bash
docker compose up -d --build
```

O volume `./data:/app/data` preserva:

- sessão do WhatsApp;
- histórico de posts;
- links de afiliado cadastrados.
- tokens OAuth do Mercado Livre.

Configure o provedor para reiniciar o container automaticamente. O `docker-compose.yml` já usa `restart: unless-stopped`.

Mantenha `DATA_DIR=./data` para usar esse volume. O arquivo `.dockerignore` exclui `.env`, sessões e o banco da imagem. O painel controla operações do bot e deve ficar em uma rede privada ou atrás de controle de acesso no servidor.

## Verificações

```bash
npm run check
npm test
```

Os testes usam dados fictícios, SQLite temporário e conexões simuladas. Não acessam contas reais nem enviam mensagens. O GitHub Actions executa as verificações em Node.js 22 e 24 a cada atualização.

## Agenda

O padrão é:

```env
CRON=*/15 7-23 * * *
TZ=America/Sao_Paulo
```

Isso dispara às 07:00, 07:15, ..., 23:45. Não dispara de 00:00 a 06:59.

## Estrutura

- `src/mercadolivre.js`: descoberta e pontuação das ofertas.
- `src/affiliate.js`: valida/cadastra links de afiliado.
- `src/whatsapp.js`: QR, sessão e envio ao grupo.
- `src/scheduler.js`: ciclo de 15 minutos e mensagem.
- `src/db.js`: SQLite, histórico e bloqueio de repetição.
- `src/server.js`: painel/healthcheck e endpoints de teste.
- `src/panel.js`: formulário de links, busca e simulação no navegador.
- `src/ml-auth.js`: autorização PKCE, persistência e renovação dos tokens.
- `src/doctor.js`: diagnóstico local da configuração.

## Próximas etapas

1. Configurar e autorizar a aplicação do Mercado Livre pelo painel.
2. Validar a busca real de ofertas e os campos de preço/desconto.
3. Implementar o gerador automático de link de afiliado por um método seguro e aceito pela conta.
4. Comprar/ativar o chip e parear o novo WhatsApp.
5. Selecionar o grupo e executar alguns envios em `DRY_RUN=false`.
6. Subir o container no servidor 24h.
