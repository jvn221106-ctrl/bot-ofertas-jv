# Bot de Ofertas Mercado Livre → WhatsApp

Primeira versão do projeto definido na conversa.

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

O bot **não inventa** um link de afiliado. Ele só publica um item quando existe um link de afiliado validado para aquele `item_id` no banco local.

Isso é intencional: o link completo que você forneceu contém um `ref` específico gerado pelo Mercado Livre. Sem um mecanismo oficial/publicamente documentado para gerar esse token por API, montar a URL na mão pode abrir o produto sem garantir atribuição da comissão.

A próxima etapa do projeto é ligar o módulo `affiliate` ao método de geração que sua conta aceitar (ferramenta oficial ou automação validada). Todo o restante do fluxo já fica independente dessa implementação.

## 1. Instalar

Requisitos: Node.js 20+.

```bash
cp .env.example .env
npm install
npm start
```

Por segurança, o `.env.example` vem com `DRY_RUN=true`, então nenhum WhatsApp é acionado.

## 2. Mercado Livre

Crie/autorize uma aplicação no portal de desenvolvedores do Mercado Livre e coloque o token em:

```env
ML_ACCESS_TOKEN=SEU_TOKEN
```

A integração usa a árvore de categorias do site `MLB` e a busca por categoria. O projeto foi preparado para a API atual e evita depender dos endpoints antigos de consulta múltipla `/items?ids=`.

## 3. Cadastrar um link de afiliado para teste

Para o produto do exemplo (`MLB5137660841`), com o servidor rodando:

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
- `http://localhost:3000/` — painel simples de status.

Para forçar um ciclo:

```bash
curl -X POST http://localhost:3000/api/send-now
```

Com `DRY_RUN=true`, a mensagem é impressa no terminal e não vai para o WhatsApp.

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

Configure o provedor para reiniciar o container automaticamente. O `docker-compose.yml` já usa `restart: unless-stopped`.

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

## Próximas etapas

1. Conseguir o `ML_ACCESS_TOKEN` da sua aplicação do Mercado Livre.
2. Validar a busca real de ofertas e os campos de preço/desconto.
3. Implementar o gerador automático de link de afiliado por um método seguro e aceito pela conta.
4. Comprar/ativar o chip e parear o novo WhatsApp.
5. Selecionar o grupo e executar alguns envios em `DRY_RUN=false`.
6. Subir o container no servidor 24h.
