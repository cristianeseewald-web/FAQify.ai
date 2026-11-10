# FAQify: plano de evolução

Ordem pensada para validar rápido e só construir o que o mercado pedir.

---

## Fase 0: escolher o modelo de IA (1 dia)

- Gerar FAQ dos mesmos 20 produtos com `claude-opus-5-5` e com `claude-haiku-5-5`
  (variável `ANTHROPIC_MODEL`).
- Comparar lado a lado: as respostas inventam algo? soam naturais em inglês? são específicas do produto?
- Custo estimado por produto: Opus ≈ US$ 0,02 | Haiku ≈ US$ 0,0006.
- **Decisão:** se o Haiku for "bom o suficiente", ele vira o padrão e o custo de IA deixa de ser problema.

---

## Fase 1: geração do catálogo inteiro com um clique

**Por que importa:** é o "momento uau" da instalação. O lojista instala e, minutos depois,
todos os produtos têm FAQ.

**Problema técnico:** 500 produtos não cabem em uma requisição (o navegador desiste em ~30 s).
Precisa virar um trabalho em segundo plano.

**Como fazer:**

1. Botão **"Generate FAQ for all products"** (opção: pular produtos que já têm FAQ).
2. Buscar o catálogo com a **Bulk Operation** da Shopify (exporta milhares de produtos de uma vez).
3. Enviar tudo para a **Message Batches API** do Claude:
   - custa **50% menos** que a chamada normal;
   - processa de forma assíncrona (normalmente minutos; no máximo 24 h).
4. Um processo periódico verifica o lote. Quando termina, grava os FAQs na Shopify
   em grupos de 25 (`metafieldsSet`).
5. Tela de progresso: "312 de 500 produtos prontos".
6. Novas tabelas no banco: `Job` (status, total, concluídos, falhas) e `JobItem`.

**Bônus de baixo esforço que gera valor recorrente:**
- Webhook `products/create`: produto novo → FAQ gerado automaticamente (opção ligável).
- Webhook `products/update`: descrição mudou → avisa "FAQ pode estar desatualizado".

---

## Fase 2: cobrança com créditos extras

Ver a seção "Modelo de cobrança" abaixo. Implementar **depois** de ter os primeiros
clientes pagantes, quando houver dados reais de uso.

---

## Fase 3: FAQ a partir de perguntas reais dos clientes

**Por que importa:** é o diferencial que os concorrentes não têm, e é o que dá
motivo para o lojista continuar pagando todo mês.

### Etapa 3.1: formulário "Não achou sua resposta? Pergunte" (começar por aqui)
- Fica no próprio bloco de FAQ da loja. Nenhuma integração externa necessária.
- O cliente envia a pergunta → chega no painel do app (via App Proxy da Shopify).
- A IA sugere uma resposta → o lojista aprova com um clique → vira FAQ público.
- O lojista recebe aviso por e-mail de pergunta nova.
- ⚠️ Passamos a guardar dados de clientes (e-mail): os webhooks de privacidade
  `customers/data_request` e `customers/redact` passam a ter que apagar/exportar esses dados de verdade.

### Etapa 3.2: e-mails de suporte
- Cada loja recebe um endereço exclusivo (ex.: `loja123@inbox.faqify.ai`).
- O lojista encaminha (ou coloca em cópia) os e-mails de suporte.
- A IA agrupa perguntas parecidas ("12 clientes perguntaram se serve no iPhone 16")
  e sugere novos FAQs para o produto certo.

### Etapa 3.3: integrações (só se clientes pedirem)
- Gorgias, Zendesk, Gmail, perguntas de apps de avaliação (Judge.me).

---

## Modelo de cobrança (decisão sobre "pay as you go")

A Shopify permite 3 formatos, todos cobrados na fatura da própria Shopify:

| Formato | Como funciona | Aprovação do lojista |
|---|---|---|
| Assinatura fixa | US$ 14/mês | 1 vez |
| Assinatura + uso (`usage`) | Fixo + cobrança por uso até um **teto mensal** que o lojista aprova | 1 vez (e de novo se o teto subir) |
| Compra avulsa (`one-time`) | Pacote de créditos, ex.: "+500 gerações por US$ 9" | A cada compra |

**Recomendação:**
- **Free:** 10 gerações/mês.
- **Pro US$ 14/mês:** 300 gerações/mês + recursos recorrentes (FAQ automático em produtos novos,
  perguntas de clientes).
- **Excedente por uso:** US$ 0,03 por geração além do incluso, com teto aprovado pelo lojista
  (ex.: US$ 30/mês). Aviso no painel ao atingir 80% e 100%.
- **Opcional:** pacote avulso "Catálogo inteiro" para a primeira geração de lojas grandes.

Pontos de atenção:
- O uso deste app é **concentrado na instalação** (catálogo inteiro uma vez) e baixo depois.
  O risco real não é o custo da IA, é o lojista **gerar tudo e cancelar**.
  As Fases 1 (bônus) e 3 existem para dar valor todo mês.
- Para aumentar o teto de uso, o lojista precisa aprovar de novo na Shopify. O app só mostra o botão.
- O "Managed Pricing" (planos configurados só no painel de parceiro) é mais simples,
  mas não serve para cobrança por uso. Para o excedente, continua a Billing API, que já está no código.
