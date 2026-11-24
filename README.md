# Plataforma GTA

Plataforma web interna da **GTA Energia** (engenharia elétrica, Goiânia/GO). Reúne,
num só lugar, as ferramentas do dia a dia da equipe: montagem e geração de propostas
comerciais (CPQ), histórico de propostas, **esteira de aprovação de orçamentos** com
controle por cargos, gestão de tarefas e planilhas técnicas — com tema claro/escuro
e controle de acesso por usuário.

## Módulos

- **Nova proposta (CPQ)** — monta a proposta de um serviço e gera o `.docx` fiel ao
  modelo da GTA. **Os 12 serviços do catálogo têm configurador com precificação
  automática**, em dois paradigmas: **custo × Fator K** (execução de subestação,
  rede MT, QGBT, carregador EV...) e **métrica/modular** (SPDA por bloco + m²,
  projeto BT por disciplina, subestação por horas × kVA, regras fixas de conexão e
  analisador). Solar tem a cadeia completa: consumo → dimensionamento → geração →
  economia/payback (Lei 14.300). Vários serviços também geram a **planilha `.xlsx`**
  de custo viva (com fórmulas).
- **Propostas** (`/propostas`) — histórico de **todas** as propostas geradas, com
  filtros (serviço, status, cliente), referência automática e quem criou.
- **Aprovações** (`/aprovacoes`) — esteira de validação de orçamentos: máquina de
  estados (rascunho → em revisão → aprovado/cancelado), pareceres obrigatórios,
  comentários, histórico de auditoria e **anexos** (PDF/planilha) com retenção
  automática (cron diário). O acesso é por **permissões de cargos dinâmicos**
  (`/admin/cargos`) — ex.: quem pode revisar, aprovar ou ver valores.
- **OneDrive** *(em desenvolvimento — dormente)* — ao aprovar um orçamento, arquiva
  as revisões + o `.docx` numa pasta no OneDrive/SharePoint com código identificador
  (`ano-mês · SERVIÇO · cliente · referência`). Ativa só com as env vars `AZURE_*`
  (veja `.env.example`); sem elas a UI mostra o recurso como "Em desenvolvimento".
- **Tarefas** (`/tarefas`) — lista com filtros por status/responsável, busca,
  prioridade, prazo com alerta de atraso e comentários. Opcionalmente envia
  **e-mail ao responsável** na criação (dormente; ative com o Resend).
- **Financeiro** (`/financeiro`) — fluxo de caixa dos sócios (visão geral, contas a
  pagar, dia a dia, lançamentos, gráficos) e **DRE** mês a mês na sequência da planilha
  de Gestão Financeira. Negociação ganha no CRM entra no DRE no mês do fechamento e no
  caixa como recebimento previsto. Acesso só com a marca "Acesso ao Financeiro" no
  cadastro, **cadeado com a senha** (fecha com 30 min sem uso e a cada 12 h),
  **auditoria só-inclusão** (gatilho no Postgres recusa UPDATE/DELETE) e alertas aos
  sócios em mudanças de acesso, senha redefinida e senhas erradas em sequência.
- **Conta e usuários** — "Minha conta", troca de senha, tema claro/escuro e, para
  administradores, gerenciamento de usuários (`/admin/usuarios`) e cargos.

**Serviços no catálogo (12):** Energia Solar, Projeto de Subestação, Execução de
Subestação, Conexão à Concessionária, Projeto de Rede MT, SPDA + Gerenciamento de
Risco, Inspeção de Subestação, Aluguel de Analisador de Energia, Carregador Veicular
(EV), Fornecimento de QGBT, Projeto Elétrico BT e Limpeza de Painéis.

## Como rodar (local)

Pré-requisitos: **Node.js 20+**.

```bash
npm install
npm run dev
```

Acesse http://localhost:3000. Login padrão de desenvolvimento:

- **E-mail:** `admin@gta.com`
- **Senha:** `gta123`

> Configure usuários e segredo reais no `.env.local` (veja `.env.example`).

## Testes e qualidade

```bash
npm test           # golden tests dos engines de preço + mappers .docx (vitest)
npm run typecheck  # tsc --noEmit
```

Os **golden tests** congelam os números que os configuradores produzem (preço,
margem, payback, dimensionamento NT.002) e os marcadores que vão para o `.docx`.
Se um snapshot mudar, uma proposta sairia diferente: confirme a intenção antes de
atualizar (`npx vitest run -u`). O CI (`.github/workflows/ci.yml`) roda typecheck +
testes em cada push/PR.

## Como usar

1. Faça login.
2. Em **Nova proposta**, escolha o serviço e preencha o configurador — totais,
   valor por extenso e dimensionamentos são calculados automaticamente.
3. Clique em **Gerar .docx** — o documento é baixado e registrado em **Propostas**.
4. (Opcional) Envie a proposta para a esteira em **Aprovações**: revisão, parecer,
   anexos de revisões e decisão final com auditoria.

## Arquitetura (modular)

Cada serviço é uma pasta isolada em `src/services/<servico>` que exporta um
`ServiceModule` (contrato em `src/services/types.ts`). O núcleo — formulário dinâmico
(`src/components/DynamicForm.tsx`), motor de geração (`src/lib/docx/generate.ts`) e
endpoint (`src/app/api/gerar`) — é genérico e dirigido pelo **registro**
(`src/services/registry.ts`).

Um serviço tem **configurador próprio** (componente em `src/components/<servico>/` +
API `/api/<servico>/calcular` com o engine puro em `src/services/<servico>/`) e gera
o `.docx` com um `template.docx` próprio (Solar, Carregador) ou com o molde
compartilhado via fábrica `criarServicoConfigurador` (`src/services/_cpq`).

```
src/
  app/                  login, dashboard, /nova/[servico], /propostas, /aprovacoes,
                        /tarefas, /conta, /admin/{usuarios,cargos}, /ajuda, /api/*
  components/           DynamicForm, AppHeader, ui.tsx (design system), configuradores
                        por serviço, orcamentos/, tasks/, propostas/, admin/, users/
  lib/
    auth.ts · session.ts  autenticação própria (scrypt + cookie HMAC) e sessão
    rbac/ · cargos/       permissões por cargos dinâmicos (guards de página e API)
    docx/                 generate.ts (docxtemplater) + patchChart.ts (gráfico Solar)
    orcamentos/           esteira de aprovação: store, máquina de estados, anexos
    onedrive/             integração Microsoft Graph (dormente por env vars)
    email/                notificações via Resend (dormente por env vars)
    propostas/ · tasks/ · users/ · settings/   stores dos demais módulos
    format.ts             moeda, datas, referência, valor por extenso
  services/
    types.ts · registry.ts   contrato ServiceModule + registro central
    <servico>/               params.ts (defaults + zod), pricing/sizing/engine
                             (funções puras), index.ts, template.docx (se próprio)
    _cpq/                    fábrica criarServicoConfigurador + mapPropostaPadrao
    _shared.ts · _shared/    identificação comum + molde padrão dos serviços
    planilha/                geração das planilhas .xlsx de custo (exceljs)
    __tests__/               golden tests (engines + mappers)
```

### Adicionar um novo serviço

1. Crie `src/services/<novo>/` com `params.ts` (defaults + schema Zod) e o engine
   de preço (função pura). Serviços que usam o molde padrão só precisam de
   `index.ts` com `criarServicoConfigurador({ key, label, description,
   referencePrefix })`; moldes próprios pedem `mapper.ts` + `template.docx`.
2. Registre-o em `src/services/registry.ts`.
3. Se tiver configurador visual, crie o componente em `src/components/<novo>/` e as
   rotas `/api/<novo>/{config,calcular}` (copie um serviço análogo).

Pronto — o dashboard, o formulário/configurador e a geração passam a reconhecê-lo.

## Persistência

Os módulos usam stores com a mesma interface e dois backends: **Postgres**
(`@vercel/postgres`) em produção e **arquivo JSON local** em desenvolvimento
(`data/*.json`, fora do git). Cobrem propostas, orçamentos, tarefas, usuários,
cargos e os parâmetros editáveis dos configuradores (`settings`). Os **anexos** dos
orçamentos vão para o **Vercel Blob** em produção (ou `data/uploads/` em dev), com
retenção automática via cron (`/api/cron/limpar-anexos`).

## Deploy

Publicado na **Vercel**, com deploy automático a cada push na `main`. Variáveis:
`AUTH_SECRET` e `APP_USERS` (obrigatórias), Postgres e Blob (criadas ao vincular os
stores), `CRON_SECRET` (cron de retenção) e as opcionais dormentes (`RESEND_*` para
e-mail, `AZURE_*`/`ONEDRIVE_*` para o OneDrive). Veja [`DEPLOY.md`](DEPLOY.md) e
[`.env.example`](.env.example).

## Custos

Stack essencialmente gratuita: Next.js + Vercel (free) + geração `.docx` local
(docxtemplater, open-source) + Postgres/Blob (free tier).
