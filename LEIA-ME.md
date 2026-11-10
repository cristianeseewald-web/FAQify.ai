# FAQify: app Shopify de FAQ com IA

Gera perguntas frequentes (FAQ) para as páginas de produto usando o Claude e mostra
essas perguntas na loja, com o schema `FAQPage` para o Google (SEO).

## O que já está pronto

| Parte | Arquivo |
|---|---|
| Lista de produtos, seleção em massa e botão "Generate FAQ" | `app/routes/app._index.tsx` |
| Editor de FAQ por produto (editar, reordenar, apagar) | `app/routes/app.products.$id.tsx` |
| Planos: Free (10/mês) e Pro (US$ 14/mês, 7 dias grátis) via Shopify Billing | `app/routes/app.billing.tsx`, `app/lib/plans.ts` |
| Chamada à IA (Claude, saída em JSON validada) | `app/lib/faq-ai.server.ts` |
| Gravação no metafield `faqify.items` do produto | `app/lib/faq-metafield.server.ts` |
| Bloco da loja (acordeão + schema SEO) | `extensions/faqify-block/blocks/product-faq.liquid` |
| Webhooks obrigatórios de privacidade (LGPD/GDPR) | `app/routes/webhooks.compliance.tsx` |

## Passo a passo para rodar

1. Crie uma conta grátis de parceiro: https://partners.shopify.com
2. No painel de parceiro, crie uma **loja de desenvolvimento** (dev store) para testes.
3. Crie uma chave de API em https://console.anthropic.com
4. No seu computador (Node 22+):

```bash
npm install
```

```bash
export ANTHROPIC_API_KEY="sua-chave-aqui"
```

```bash
npm run dev
```

O `npm run dev` pede login na Shopify, cria o app no seu painel de parceiro e
abre a instalação na dev store.

5. Na dev store: **Loja virtual → Temas → Personalizar → Página de produto →
   Adicionar bloco → Apps → Product FAQ**.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API do Claude (obrigatória) |
| `ANTHROPIC_MODEL` | Modelo usado. Padrão: `claude-opus-5-5`. `claude-haiku-5-5` custa bem menos por FAQ |
| `SHOPIFY_BILLING_TEST` | Em produção, defina `false` para cobrar de verdade |

## Antes de publicar na App Store

- Hospedagem: o app precisa de um servidor (Fly.io, Render, Railway…) e de um
  banco Postgres no lugar do SQLite (`prisma/schema.prisma`).
- Teste o fluxo de cobrança na dev store (cobranças de teste não custam nada).
- Ficha da App Store: ícone, capturas de tela, vídeo curto, política de privacidade.
- A revisão da Shopify leva em média de 1 a 3 semanas.
