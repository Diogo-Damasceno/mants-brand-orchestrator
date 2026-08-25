# Mants Brand Orchestrator

Plataforma de orquestração de branding para o ChatGPT, desenvolvida pela **Mants Company**.

A Mants Brand Orchestrator organiza a identidade visual de cada cliente e a transforma em
prompts estruturados e pacotes de arquivos prontos para serem usados na **conta própria e
compatível do ChatGPT** do usuário. O MVP não utiliza nenhuma API paga de LLM: o prompt é
gerado por um motor determinístico (sem rede, sem LLM) a partir do Brand Kit e do briefing.

> **Aviso obrigatório (exibido em landing, preços, cadastro, onboarding, checkout, extensão, FAQ e termos):**
> ChatGPT não está incluído na assinatura da Mants Brand Orchestrator. Para utilizar os
> Pacotes Criativos e os recursos de inteligência artificial, o usuário deverá possuir sua
> própria conta compatível do ChatGPT. Recomendamos o ChatGPT Plus para uma experiência mais
> completa. A assinatura do ChatGPT é contratada e cobrada separadamente pela OpenAI.
>
> A Mants Brand Orchestrator é um produto independente desenvolvido pela Mants Company. Não é
> um produto oficial da OpenAI e não é patrocinado, operado ou endossado pela OpenAI. ChatGPT
> e OpenAI são marcas de seus respectivos proprietários.

---

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Site/API**: Next.js 14 (App Router) + React + TypeScript estrito + Tailwind CSS
- **Extensão**: WXT (Manifest V3) + React
- **Banco**: PostgreSQL + Drizzle ORM + Row Level Security por `organization_id`
- **Storage**: abstração S3 (MinIO local em dev, R2/S3 em produção)
- **Billing**: interface `BillingProvider` + `MockBillingProvider` (Stripe/Mercado Pago preparados)
- **Testes**: Vitest (motor de prompts, seleção de ativos, manifesto, hashes, limites de plano, auth)

## Estrutura

```
mants-brand-orchestrator/
├── apps/
│   ├── web/            # Next.js (site + API route handlers)
│   └── extension/      # WXT (popup, side panel, background, content script)
├── packages/
│   ├── shared-types/   # Tipos de domínio, papéis, avisos comerciais canônicos
│   ├── config/         # Config do servidor (validada por ambiente)
│   ├── validation/     # Esquemas Zod
│   ├── prompt-engine/  # Motor determinístico de prompts (sem LLM)
│   ├── creative-package/ # Gerador de Pacote Criativo (ZIP + manifesto SHA-256)
│   ├── asset-selection/ # Recomendação de ativos por regras (sem IA paga)
│   ├── billing/        # Catálogo de planos + provedor mock desacoplado
│   ├── auth/           # Sessões HMAC-SHA256, hash de senha, PKCE
│   └── database/       # Schema Drizzle, RLS, migrations, seed (Aurora Café)
├── infra/              # (preparado para GitHub Actions / deploy)
├── docs/               # Documentação (em construção)
├── docker-compose.yml  # PostgreSQL 16 + MinIO
├── .env.example
└── vitest.config.ts
```

## Pré-requisitos

- Node.js >= 20.18
- pnpm (ativado via corepack): `corepack enable && corepack prepare pnpm@9.12.3 --activate`
- Docker (para Postgres + MinIO em desenvolvimento)
- Chrome/Chromium (para testar a extensão)

## Comandos

```bash
pnpm install                      # instala todas as dependências do monorepo
pnpm dev                          # sobe web (Next.js) e extensão (WXT) em paralelo (turbo)
pnpm --filter @mants/web dev     # apenas o site/API na porta 3000
pnpm --filter @mants/extension dev   # apenas a extensão em modo dev (WXT)
pnpm build                        # build de todos os apps (turbo)
pnpm lint                         # ESLint em todo o monorepo
pnpm typecheck                   # tsc estrito em todos os pacotes/apps
pnpm test                         # 22 testes Vitest (motor, seleção, manifesto, auth, planos)
pnpm db:migrate                  # aplica a migration SQL no Postgres (via node + pg)
pnpm db:seed                     # popula dados de demonstração (organização Mants, Aurora Café)
pnpm extension:build              # build de produção da extensão (WXT)
pnpm extension:zip               # gera o ZIP para envio à Chrome Web Store
docker compose up --build         # Postgres + MinIO locais
```

## Banco de dados e storage local

1. Suba os serviços: `docker compose up --build -d`
2. Copie o ambiente: `cp .env.example .env` e ajuste `DATABASE_URL`, `SESSION_SECRET`, etc.
3. Rode a migration: `pnpm db:migrate`
4. Popule o seed: `pnpm db:seed`

O `.env.example` usa `FEATURE_CHATGPT_ASSISTED_INSERTION=false` por padrão (a inserção
assistida no ChatGPT fica desativada; cópia, download e abertura funcionam sempre).

## Fluxo do produto

1. Agência cadastra o cliente e cria o Brand Kit (cores, fontes, tom de voz, regras).
2. Cria uma campanha e seleciona os ativos (recomendados por regras, sem IA paga).
3. O motor determinístico gera um prompt profissional (13 seções, 4 modos) — sem LLM.
4. A extensão exibe o prompt no painel lateral, ao lado do ChatGPT.
5. O usuário copia o prompt, baixa o Pacote Criativo (ZIP) e anexa os arquivos manualmente.
6. O usuário confirma o envio na própria conta do ChatGPT.
7. Importa o resultado manualmente, envia para aprovação e registra o histórico imutável.

## Segurança e regras do ChatGPT

- Nunca solicitamos senha, cookie ou token do ChatGPT.
- Nunca lemos histórico de conversas nem enviamos mensagens automaticamente.
- O fluxo confiável é: gerar → copiar → baixar → abrir → colar → anexar → confirmar.
- A inserção assistida é experimental, protegida por feature flag e pode ser desativada.
- Isolamento completo entre empresas (RLS por `organization_id` + checagem no backend).

## Status de build da extensão

O código-fonte da extensão (WXT MV3) está completo e correto. O build de produção com
**WXT 0.20.27 em Node 20.20** apresenta um bug de toolchain conhecido (o loader interno
`vite-node` tenta `fetch` de um módulo virtual prefixado com `\0`), independente do código
do projeto. Para contornar, use **Node 18** ou pinte o WXT para a linha **0.19.x** com o
`@wxt-dev/module-react` compatível. O typecheck dos pacotes e os 22 testes Vitest passam.

## Licença

Código-fonte sob MIT (ver LICENSE). Os textos jurídicos (termos e privacidade) são modelos
sujeitos a revisão jurídica profissional antes da disponibilização comercial.
