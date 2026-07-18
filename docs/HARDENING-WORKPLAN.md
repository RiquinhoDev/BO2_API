# BO2_API — Plano de trabalho do endurecimento (Codex)

> **Codex: lê isto primeiro.** É a tua lista de trabalho e as regras. O contexto profundo (o porquê, o método
> de revisão, o histórico) vive no repo **Front**, em `docs/superpowers/` — se tiveres acesso, lê o
> `REVIEWER-PLAYBOOK.md` e o `CONTINUITY-front-remake-review.md` §7d. Auditoria local: `API_AUDIT.md` (raiz).
>
> **Missão:** elevar esta API a arquitetura/segurança/código limpo/operacionalidade de alto nível, por
> **refactor incremental (strangler), NÃO rewrite.** Trabalho na branch `remake`.
>
> **O nível técnico-alvo (a régua de aceitação) está no fim: "Estado-alvo (Definition of Done)".** Nada se
> declara "feito" sem bater esses critérios, provados contra o código.

---

## Regras a respeitar (não negociáveis)

1. **Tudo offline.** NUNCA tocar nas APIs reais (Guru, Hotmart, ActiveCampaign, CursEduca, Discord) nem em
   Mongo de produção. Constrói e testa a fronteira; não chames o serviço real.
2. **Antes de cada bloco:** `git fetch && git reset --hard origin/remake`. A história foi reescrita (scrub de
   segredos) — **nunca merge/pull por cima**.
3. **Não corras `npm install`.** Se precisares mesmo de uma dependência nova, **pára e pede ao revisor** — ele
   instala e atualiza os **dois** lockfiles (`package-lock.json` p/ `npm ci` do Dockerfile **e** `yarn.lock`
   p/ `yarn --frozen-lockfile` do nixpacks). Mexer só num parte um dos caminhos de build.
4. **Não toques** em `scripts/git-hooks/`, `URGENT_KEY_REPLACEMENT.md` nem `RENOVACAO_*.md` — são de outra
   sessão de segurança.
5. **Fonte única.** Reutiliza o que já existe; não cries uma segunda cópia de nada (redação, boundary de
   validação, decisão de CORS). Divergência entre duas cópias é a classe de bug que já mordeu este projeto.
6. **Um assunto por commit.** Conventional Commits, **subject em minúscula** (o commitlint rejeita maiúscula),
   trailer `Co-Authored-By`. Há um secret-scanner no pre-commit; bypass `--no-verify` só se for falso positivo.
7. **Nunca desligar uma regra/guarda sem GATILHO escrito** (na config e no commit).
8. Se uma rota exigir uma **decisão** (formato de param não óbvio, semântica destrutiva), **pára e pergunta** —
   não adivinhes.

## Gate (verde antes de reportar)

```bash
npm run lint            # exit 0. NUNCA --pass-on-unpruned-suppressions
npm run types:check     # ratchet TS: 182 erros / 44 ficheiros. SÓ pode descer
npx jest --ci           # verde, egress guard ativo
npm run build           # exit 0
```

A regeneração do manifest de rotas e o contract test correm no Front — **isso é do revisor**, não teu.

---

## ✅ F3.1 — SEC-09 (validação de input nas rotas destrutivas) — **FECHADA (39/39)**

**Concluída 2026-07-17.** As 39 rotas destrutivas têm boundary strict (37 wrappers `withValidatedInput` em 16
ficheiros — cron-tags cobre 4 rotas via 2 montagens duplas). Gate final validado pelo revisor: lint 0,
ratchet **178/44**, jest **249 passed / 2 skipped**, build exit 0. As 3 variantes da armadilha cobertas
(path param, body `actor`, query `days`) e os 2 params string-key (`classId`, `code`) preservados como negócio.
**Fase atual passa a F3.2 (ver "A seguir").**

### Registo do boundary (referência para o padrão)

Boundary aprovado: usa `withValidatedInput(schema, handler)` + `validatedSchema({ params, query, body })`
(o builder aplica `.strict()` sozinho — dás só as *shapes*). Controllers recebem o **DTO inferido**, nunca
`req.body/params/query` crus.

**Por rota, 3 testes:** (a) DTO válido chega ao handler; (b) campo extra (`role`) → **400** sem chamar o
handler; (c) operador NoSQL aninhado (`$where` / `__proto__`) → **400**.

### 🔴 A armadilha (vale para quase todas as que faltam)

Muitas rotas têm **path params** (`:id`, `:productId`, `:year/:month`, `:key`, `:code`, `:userId`, `:classId`).
O `validatedSchema` faz `params.strict()` — se deixares `params: {}`, o `.strict()` **dá 400 a TODOS os pedidos
válidos** porque `req.params` traz o param. **Modela cada param na shape** (ex.: `id: z.string()`) e **prova com
um teste** que o param real chega ao handler (não 400). O padrão já está feito nas Users com `:id`.

### Progresso das 39 rotas destrutivas (um commit por família)

- [x] **Users (6)** — feito (`48bdc2f`)
- [x] **cron-tags (4)** — feito (`0f76dc6`); as duas montagens (`/api/cron-tags` e `/cron-tags`) cobertas
- [x] **activecampaign (5)** — feito (`1fac3cf`); params `:id`/`:productId` modelados como ObjectId, validado pelo revisor
- [x] **guru (4)** — feito (`c42800f`); `:year`/`:month` modelados, `asyncRoute`→`withValidatedInput`, validado pelo revisor
- [x] **discord-renewal (4)** — feito (`dcbee9d`); handlers inline migrados, `:key` modelado, `actor` preservado
  via param explícito no `actor()` refactorado, validado pelo revisor (Front sempre envia `mentionRoleIds`)
- [x] **cron (3)** — feito (`4730cd7`); `:id` ObjectId, sem wrapper→`withValidatedInput`, checks internos mantidos, validado pelo revisor
- [x] **renewal-ac (2)** — feito (`2698421`); inline migrados, `:id` ObjectId (confirmado `findById`), `actor` preservado nas duas, validado pelo revisor
- [x] **sync (2)** — feito (`9435038`); query `days` modelado (variante query da armadilha), default 90 preservado, negativos `?days=abc`/`?foo=1` provados, validado pelo revisor
- [x] **tag-monitoring (2)** — feito (`9d3970e`); `authenticate` preservado antes do boundary, `:id` ObjectId, mock do authenticate no teste, validado pelo revisor
- **↓ PRÓXIMO BLOCO: as 7 famílias singleton (ver formatos verificados abaixo) ↓**

#### 🔴 As 7 singleton finais — formatos de param JÁ VERIFICADOS pelo revisor (não adivinhes)

> **Podem ir numa só sessão, mas mantém 1 commit por família** (gate + revisão por família). Atenção: **2
> destes params NÃO são ObjectId** — são chaves de negócio (string). Modelar como ObjectId dá 400 a tudo.

- [x] **classes (1)** — feito (`ba429c9`); `:classId` string de negócio preservada
- [x] **product-profiles (1)** — feito (`ab9e5c6`); `:code` string + query `hardDelete`
- [x] **events (1)** — feito (`a489d61`); `:id` ObjectId, handler inline migrado
- [x] **reengagement (1)** — feito (`682985b`); `:userId` ObjectId + body `{ productCode, dryRun? }`
- [x] **testimonials (1)** — feito (`470cb06`); `:id` ObjectId
- [x] **curseduca (1)** — feito (`44cf6a5`); stub 501, empty input
- [x] **test (1)** — feito (`f6486f8`); body `{ email }`; **`localDebugOnly` confirmado no mount** (`runtime/registerRoutes.ts:42`)

> ⚠️ Todos validados pelo revisor contra o código. F3.1 fechada.

---

## ✅ F3.2 — ARCH-05 (paginação) — **FECHADA (2026-07-18)**

Concluída em 3 passos: helper puro (`446b3e0`) → listas backend-only (`a7886e8`) → telas Guru
(webhooks `7c0aed9` + subscriptions par back `2a01ca3`/front `cf9c080`). Caps de 10 000 eliminados sem partir
funcionalidade (export por paginação + sort server-side). Bónus: 4 extrações para controllers pequenos
testáveis (ARCH-02) e 3 prunes `no-console`. **Fase atual passa a F3.3.**

**Objetivo:** um **helper único** de paginação (fonte única — regra 5), offset agora + cursor como evolução
aditiva depois. Eliminar caps insanos (`limit=10000`) e `find({})` cru **sem partir funcionalidade viva**.

**Decisão aprovada pelo utilizador (2026-07-18):** offset `defaultLimit=50` / teto absoluto `200`, cursor
aditivo mais tarde. Mas o **clamp isolado no backend PARTE o Front** — o revisor verificou contra o código
(abaixo). Por isso a fase entrega-se em 3 passos, e as 2 telas Guru são **mudança emparelhada Front+Back**.

### ⚠️ O que o revisor JÁ verificou no Front (não repetir a análise, agir sobre ela)

As telas Guru já têm **paginação, filtros (status/email/data) e re-fetch server-side wired**; o `limit:10000`
(`Front/src/features/guru/hooks/useGuruCore.ts:8`) só faz uma "página gigante" que esconde os controlos.
**Clamp a 200 é seguro para a tabela + filtros + paginação.** MAS duas operações correm sobre o **array
carregado inteiro** e clamp cego parte-as em silêncio:
- **Export CSV** (`Front/src/pages/guru/GuruDashboard.tsx:397` → `downloadCSV(sortedSubscriptions, …)`): hoje
  exporta tudo; com 200 exportaria **só 200 linhas** → perda de dados.
- **Sort global** (`GuruDashboard.tsx:226`, `sortedSubscriptions` é `useMemo` client-side; `toggleSort` **não**
  re-fetcha): hoje ordena o conjunto; com 200 ordenaria **só a página**.
- `rawData`/`__v`: **verificado que o Front NUNCA os lê** (`grep rawData Front/src` = 0) → excluir da projeção
  webhooks é seguro e desejável (`rawData` é o campo pesado).

### Passo 1 — helper puro + testes (backend, não muda comportamento) — ✅ FEITO (`446b3e0`)
- [x] `src/utils/pagination.ts`: `paginate({ page, limit }, { defaultLimit=50, maxLimit=200 })` →
  `{ page, limit, skip, metadata(total) → { page, limit, total, pages } }`. **Puro** (sem Express/Mongoose).
  Inválidos → default; fora do intervalo → clamp; teto absoluto 200 **inultrapassável** (provado com teste
  `maxLimit:10000`→200). Substituiu a `PaginationHelper` legada (código morto) e o cap conflituoso `MAX_LIMIT:100`
  de `config/constants.ts` (revisor confirmou: nada consumia nenhum dos dois). Validado: lint 0, ratchet 178/44,
  7 testes, full jest 256/2 skipped.

### Passo 2 — listas backend-only (seguras, sem Front) ← **EM CURSO**

**Classificação dos 18 `find({})` (Codex 2026-07-18, revisor confirmou):**
- **Paginar (listagem HTTP sem consumidor "carregar tudo"):** `users.controller.ts:1722` (`getIdsDiferentes`)
  e `:1798` (`getUnmatchedUsers`). Revisor confirmou: **Front tem 0 chamadas vivas** a estes paths
  (`grep idsDiferentes|unmatchedUsers Front/src` = 0; catálogo `consumer:front` está **stale**). Ambos os
  modelos têm `detectedAt` **com índice** → sort `{ detectedAt: -1, _id: -1 }` é estável **e** index-backed.
  → **1º commit do Passo 2 (aprovado).**
- **NÃO paginar — full-scan interno (cursor/batch, nunca `.limit(200)`):** `scripts/fix-status-inconsistencies.ts:20`,
  `scripts/sync-status-from-userproducts.ts:21`, `jobs/dailyPipeline/tagEvaluation/applyTags.ts:81`,
  `services/analytics/analyticsCache.service.ts:288` (melhor → agregação/count no Mongo),
  `services/renewal/discordRolesSync.service.ts:203` (reconciliação — preservar deteção de remoções),
  `services/renewal/discordScheduledMessages.service.ts:138`, `services/renewal/renewalPerformance.service.ts:78`,
  `services/syncUtilizadoresServices/hotmartServices/classesService.ts:532`.
- **NÃO paginar — full-set de config/cálculo (Front consome o todo, ou não é a lista devolvida):**
  `cronManagement.controller.ts:46` (`/cron/jobs` legacy completo), `routes/discordRenewal.routes.ts:115`
  (templates), `services/renewal/discordScheduledMessages.service.ts:212` (estado UI), `routes/users.routes.ts:241`
  (revisor confirmou: alimenta o cálculo de `/v2/engagement/comparison`, **não** é a lista de resposta).
- **Falsos positivos (já limitados):** `scripts/diagnose-classes.ts:127` (`.limit(10)`),
  `populateHistory.controller.ts:328` (`.limit(limit)` def 100), `contactTagReader.service.ts:264` (batch def 100),
  `routes/discordRenewal.routes.ts:163` (def 20, máx 100).

**Regras do commit:** sort estável (`_id` desempate), projeção **explícita** com todos os campos atuais (inclui
`_id`/timestamps/`__v` — não reduzir contrato), `{ idsDiferentes }`/`{ unmatchedUsers }` preservados + campo
`pagination` aditivo, `countDocuments({})`. Testes: defaults, clamp `10000→200`, ordenação, projeção, envelope.

- [x] 1º commit: as 2 listagens de `users.controller.ts` — feito (`a7886e8`). Handlers **extraídos** para
  `usersReviewLists.controller.ts` (re-export mantém as rotas; mini-ARCH-02). Revisor confirmou **campo-a-campo**
  contra os 2 modelos que as projeções são completas (0 redução de contrato); sort index-backed; clamp
  `10000→200` provado; envelope + `pagination` aditivo. Gate: lint 0, ratchet 178/44, jest 258/2 skipped.
- [x] **Não há mais listagens HTTP puras** na classificação → Passo 2 esgotado. Segue o Passo 3.

### Passo 3 — telas Guru. **O revisor mapeou os 2 lados; o risco divide-se em 3a (seguro) e 3b (delicado).**

> Contexto verificado pelo revisor (2026-07-18), agir sobre isto:
> - Ambos os controllers **já devolvem** `pagination:{page,limit,total,pages}` — igual ao `paginationSchema` do
>   Front. Logo `helper.metadata(total)` encaixa **sem mudar envelope**.
> - **Webhooks NÃO tem consumidor vivo:** o hook `useGuruWebhooks` está **órfão** (não há tab webhooks —
>   `GuruTab = 'overview'|'churn'|'sync'|'subscriptions'`; nenhum componente o importa). Sem UI = sem break
>   client-side possível. → **backend-only, seguro.**
> - **Só subscriptions é o par real:** tem export CSV (`GuruDashboard.tsx:397`) e sort client-side
>   (`GuruDashboard.tsx:226`, `useMemo`; `toggleSort:289` não re-fetcha).

#### Passo 3a — webhooks (backend-only, seguro, SEM Front) — ✅ FEITO (`7c0aed9`)
- [x] `listGuruWebhooks` **extraído** para `guruWebhookList.controller.ts` (re-export mantém a rota; mini-ARCH-02).
  Clamp 50/200 via helper; sort `{ receivedAt: -1, _id: -1 }`; `.select('_id email event status processed receivedAt')`
  (os 6 campos do schema estrito). Bónus: `console.error`→`logger.error` (baseline `no-console` 19→18, pruned).
- [x] Contract test com **Mongo efémero** (não mock): insere 205 docs com `rawData:{token}`+`__v`, prova
  `limit=10000`→200/`pages:2`, sort `_id` desc estável, e **`rawData`/`__v` ausentes** (prova negativa real de
  não-fuga). Gate: lint 0, ratchet 178/44, jest 259/2 skipped. Validado pelo revisor.

#### Passo 3b — subscriptions (par Front+Back) — ✅ FEITO (back `2a01ca3` / front `cf9c080`)
- [x] **Backend** `2a01ca3`: `listSubscriptions` **extraído** para `guruSubscriptionList.controller.ts` (factory
  com DI `createListSubscriptions({model})`, re-export mantém a rota). Clamp helper; `.select('email name guru')`
  mantido; sort server-side com o mapa exacto + `_id` desempate; **4 índices parciais compostos** em `user.ts`
  (`{campo:1,_id:1}` com `partialFilterExpression:{guru:{$exists:true}}` → index-backed, resolve o teto 32MB).
  Prune `no-console` 14→13 (console→logger). Suite Mongo efémero **10/10** incl. "sort desc sem duplicar/perder
  entre páginas". Gate: lint 0, ratchet 178/44, jest 269/2 skipped.
- [x] **Front** `cf9c080`: removido `defaultLimit=10_000` (→ `fallbackLimit=50`); `sortedSubscriptions` useMemo
  **removido**; `toggleSort` re-fetcha server-side; `useGuruSubscriptions({limit:50, sortField, sortDirection})`;
  **`fetchAllSubscriptions`** percorre páginas a 200 respeitando filtros+sort; export = `downloadCSV(await
  fetchAllSubscriptions())`. Contract test prova: export traz **405/405 únicos**, chama pág 1/2/3 a limit 200,
  e **`not.toHaveBeenCalledWith({limit:10_000})`**. Front: **893/893**, lint 0, Vite build verde.
  (Nota: prettier `--check` global fica vermelho por **92 ficheiros preexistentes**; os tocados passam — dívida
  separada, não regressão desta entrega.)

**Regra da fase (cumprida):** correcção antes de elegância; provas negativas dos dois lados; gate verde.

## ▶ Fase atual: F3.3 — moagem TS 178→0 (por módulo)

**Objetivo:** baixar o ratchet TypeScript até **0**, **por directório/módulo**, um commit por módulo, com os
números antes/depois no corpo. `npm run types:baseline:update` regrava a baseline (**nunca à mão**). Só no fim
(zero em tudo) se remove `noEmitOnError:false`/`tsc || exit 0` e arranca `strict` em ondas.

### 🔴 REGRA DE OURO (o revisor vai injectar-testar cada fix)
**Baixa o ratchet FIXANDO o tipo, NUNCA silenciando-o.** Proibido `any`, `@ts-ignore`, `@ts-expect-error`, cast
`as X`/`as unknown as X` que **esconda** um bug. Porquê tão duro: a dívida TS aqui **já esconde bugs reais de
runtime** (o revisor encontrou 2 ao mapear) — um `as any` fá-los-ia desaparecer do compilador **deixando o bug
vivo**. Se um erro TS revelar um bug, **corrige o bug** (ou, se for decisão de negócio, **pára e pergunta** —
regra 8). Se um tipo estiver genuinamente errado, corrige o **tipo**, não o local de uso.

### Mapa dos erros por directório (revisor, `tsc --noEmit`)
Início: `controllers:124 · services:39 · utils:8 · models:5 · jobs:1 · scripts:1` (178). **Agora: 173/39**
(`controllers:124 · services:39 · utils:8 · jobs:1 · scripts:1` — models a 0). Ordem: **pequenos e coesos
primeiro**, depois services, controllers por último.

- [x] **models (5→0)** — feito (`16ef3b1`). Interfaces separadas do `Document` via `HydratedDocument<I>`;
  `IStudent` perdeu o `_id: string` manual (a causa do TS2430); `user.ts` `sourcesAvailable` ganhou `"guru"`
  **na declaração do tipo** (não cast no uso). Revisor confirmou por grep: **0** `any`/`@ts-ignore`/cast/suppression
  adicionados, 0 mudança runtime. Gate: lint 0, ratchet 173/39, jest 269/2, build 0.
- [x] **scripts (1→0)** — feito (`963545a`); `import { User }` → `import User` (default export, que é o que
  `User.find()` usa). Revisor: 0 cast/suppression, só a linha do import. Ratchet 172/38.
- [ ] **jobs (1→0)** ← **PRÓXIMO, MAS PRECISA DECISÃO (regra 8)**: `applyTags.ts:176` chama
  `activeCampaignService.addTagsBatch(user.email, toAdd)` — método **inexistente**. O serviço tem `addTag`
  (single, :257) e `removeTagBatch` (batch, :423) mas **falta o `addTagsBatch` simétrico**. É um **bug real de
  runtime** (`is not a function`) que a dívida TS escondia. **Não é fix mecânico** — implementar o método liga
  comportamento de aplicação de tags na AC (integração viva). Decisão pendente do utilizador (ver abaixo).

### ⚠️ Módulos com BUGS REAIS escondidos (o revisor já os viu — trata com cuidado, NÃO com `any`)
- **utils (8)** — todos em `studentDataConsolidator.ts` (usado por `services/studentCompleteService.ts`, **não é
  morto**). Inclui `TS2304 Cannot find name 'user'` **×3** (linhas 95/100/134) → **ReferenceError latente em
  código vivo**. Fixar exige perceber a lógica (o que `user` devia ser). Também `productCode`→`productId`
  (TS2551) e `createdAt`/`productName` inexistentes. **Não silenciar** — é aqui que se corrige um bug real.
- **jobs (1)** — `applyTags.ts:176` chama `activeCampaignService.addTagsBatch(...)` que **não existe** em lado
  nenhum → `is not a function` em runtime. Decisão (regra 8): implementar o método ou corrigir a chamada? **Pergunta.**
- **scripts (1)** — `investigate-classes.ts:5` importa `{ User }` inexistente (é `IUser`/default). Trivial.

### Depois da F3.3
- **Cirurgia de arquitectura** (ARCH-01 god-file, ARCH-02 módulos gigantes, ARCH-03 envelope) — ver a régua em
  **"Estado-alvo (Definition of Done)"**. ARCH-01 **já arrancou** (`src/runtime/registerRoutes.ts`); ARCH-02
  a ganhar terreno (controllers pequenos extraídos: `usersReviewLists`, `guruWebhookList`, `guruSubscriptionList`).

**Cada família/bloco entregue → reporta ao utilizador, que passa ao revisor. O revisor valida contra o código
(nunca contra o report) e desbloqueia o próximo.**

---

## Estado-alvo (Definition of Done) — a régua

> **Para que serve.** Isto é o nível técnico que a API tem de atingir. Não é aspiração: é a **régua de
> aceitação**. Nenhum item se declara "feito" sem **bater estes critérios, provados contra o código** — a
> mesma disciplina que já aplicamos às rotas. Qualquer agente/sessão mede contra esta secção. Decisão do
> utilizador (2026-07-17): estratégia aprovada.
>
> **Regra de ouro do alvo:** não se troca correcção por elegância. Cada critério entra por **refactor
> incremental** atrás dos contratos vivos (Front, webhooks, CRON), com **characterization tests primeiro**.

### 1. Arquitectura & bootstrap
- [ ] `src/index.ts` deixa de ser god-file: separado em `config`, `app`, `routes`, `database`, `jobs`, `server` (ARCH-01).
- [ ] `createApp(deps)` **puro** — não liga rede/BD nem arranca jobs no import; `bootstrap()` coordena as dependências explicitamente.
- [ ] Modelos e jobs registados **explicitamente**, nunca por side-effect de import. Startup order e shutdown testáveis.

### 2. Ficheiros pequenos & módulos por domínio
- [ ] **Nenhum ficheiro novo/tocado > ~400 linhas.** Os monstros existentes (`clarezaCarteiraService` 4692, `users.controller` 3649, `universalSyncService` 2585, `classes.controller` 2347) partidos **verticalmente por domínio** (use cases + adapters), não reorganização cosmética (ARCH-02).
- [ ] Cada módulo tem uma responsabilidade clara; sem "controller-que-faz-tudo".

### 3. Estrutura de pastas & higiene
- [ ] Docs em `docs/` com índice/estado; raiz limpa (DOC-02). Metadata do `package.json` corrigida (`name`, `main`).
- [ ] Sem artefactos locais commitados; imagens de compose fixadas por versão/digest, sem credenciais default.

### 4. Middleware & funções
- [ ] **Helmet + rate limiting** (login, webhooks, operações pesadas separados) + limites de body/upload + timeouts + container **não-root** (SEC-08).
- [ ] **Error handler central** `(err,req,res,next)` — mensagem pública estável + correlation ID; detalhe só no logger redigido (SEC-10). *(base já entregue — validar cobertura em todas as rotas.)*
- [ ] Redação PII/tokens **numa só função** partilhada (logger + error handler). Sem `console.*` novo (ESLint `no-console` global).

### 5. Segurança & rotas protegidas
- [x] **Default-deny** derivado do catálogo (SEC-01) — feito.
- [ ] **Matriz de papéis** ADMIN/SUPER_ADMIN/só-consulta com `authorize(...)` por rota + audit log; gating equivalente no Front (fica **depois** da F3.1).
- [ ] **Toda rota destrutiva:** auth + role + **validação de input strict** (F3.1) + **idempotência/cap/kill-switch/dry-run** onde escreve em sistemas externos (OPS-02).
- [ ] JWT sem defaults, segredo forte validado no arranque (SEC-02). Debug routes fora de produção (SEC-03). Upload endurecido (SEC-05).
- [ ] **CORS** por `ALLOWED_ORIGINS`, fail-closed fora de local (SEC-11 — bloqueador D3 do deploy).

### 6. Escalabilidade
- [ ] **Helper único de paginação** (min/max, cursor onde precisa, projeção explícita). Zero defaults de 10 000, zero `find({})` sem limite (ARCH-05 / F3.2).
- [ ] Idempotência e caps como **política transversal**, não caso-a-caso (OPS-02).

### 7. Contrato de resposta
- [ ] Envelope/versionamento **único** para código novo; adaptado feature a feature preservando o Front (ARCH-03). Sem mistura de arrays crus / `{success,data}` / `{error}`.

### 8. Metodologias 2026 (toolchain & qualidade)
- [ ] **TypeScript `strict` a zero erros**, ratchet removido, `noEmitOnError:true`, sem `tsc || exit 0` (TOOL-01 / F3.3).
- [ ] **ESLint** `--max-warnings=0`, baseline podada a zero; `no-explicit-any` ratchetado quando `strict` entrar (TOOL-02).
- [ ] **Um** package manager autoritativo (decisão: npm; migrar Nixpacks num commit isolado) (TOOL-03).
- [ ] Suites separadas unit/integration/load/e2e, mocks por defeito, **egress guard**; cobertura honesta e a subir (TEST-01/02).
- [ ] Config validada e tipada com **fail-fast** no arranque (OPS-01).

### Como se mede
Cada caixa fecha com **prova contra o código** (comando/teste), não com report. O revisor regrava o estado
aqui ao validar. Ordem macro: **conter segurança → validar rotas (F3.1) → paginação (F3.2) → TS zero (F3.3)
→ cirurgia de arquitectura (ARCH-01/02/03) → strict em ondas.** Correcção nunca cede a prazo.
