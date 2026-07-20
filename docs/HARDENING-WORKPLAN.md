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

## Candidatos a código morto/duplicado (caça do revisor 2026-07-18) — cada um precisa DECISÃO
> Detecção manual verificada (não exaustiva; um `ts-prune`/`knip` daria a lista completa). Tratar como o
> reengagement: confirmar consumidor → apagar com decisão do utilizador.

- [x] **reengagement V1** — APAGADO (`09df244`, 605 linhas). Engine/cron/domínio (`reengagementLevels`) intactos.
  Revisor validou (0 refs pendentes) e regenerou catálogo/manifest (455→448) + contrato do Front (`1bc95cc`,
  `371d22b`). Gate verde nos 2 repos. Controllers 102→90.
- [x] **`ogiCourse.controller.ts` + `ogiCourse.routes.ts`** — APAGADO (`ae9e856`). Confirmado sem imports/mounts;
  OGI vivo (`activecampaign.controller`) intacto. Nunca esteve montado → **sem impacto no catálogo** (448/448).
  Ratchet 90→88. Validado pelo revisor.
- [x] **`getDashboardStatsV3Legacy`** — APAGADO (`bf780e8`, 397 linhas). Revisor confirmou: removeu **só** essa função
  (única `-export`); `getDashboardStatsV3` vivo (linha 364, `/stats/v3`) intacto; 0 refs pendentes.
- [x] **stubs de avaliação — FEITO: preview real read-only por curso** (back `bd9643e`+`4eb2281` / front `7772a0b`).
  `dryRun` no motor bloqueia **os 3 `setCooldown` E o `executeDecisions`** (revisor: teste prova `executeDecisions`/
  `applyTag`/`removeTag`/`findByIdAndUpdate` **não chamados**, `tagsToApply/Remove` reais, `actionsExecuted:0`).
  Endpoints Clareza/OGI correm `evaluateAllUsersOfProduct(id, true)` e devolvem `{studentsEvaluated, proposedAdditions,
  proposedRemovals, errors}` reais. Front actualizou o schema (sem `tagsApplied` falso) — activecampaign 57/57, full
  893/893. "Aplicar" fica separado e desligado. Rotas inalteradas → catálogo intacto. Gate verde nos 2 repos. A mentira do UI acabou.
- [ ] ~~DECISÃO PENDENTE~~ (resolvida acima). Os botões
  "Avaliar Regras" Clareza/OGI passam a ser **pré-visualização real** (dry-run), NÃO escrevem na AC/Mongo. Aplicação
  real fica numa acção **separada, destrutiva, com confirmação e `AC_TAG_APPLY_ENABLED=true`**. Revisor confirmou a
  viabilidade e a segurança:
  - **Reuso limpo do motor:** `decisionEngine.evaluateUserProduct` computa `tagsToApply`/`tagsToRemove`
    (resolvidos, linha 452) **antes** do único write `executeDecisions()` (linha 455). → adicionar `dryRun` que
    salta a 455 dá o preview real sem escrever. Sem rewrite.
  - **Porque NÃO re-apontar ao `test-cron`** (achados do Codex, válidos): processa **todos** os produtos (não
    só o curso); `executeDecisions()` **escreve** tags reais; esse caminho **não respeita `AC_TAG_APPLY_ENABLED`**;
    e a resposta não tem o contrato do Front (`tagsApplied`) → o Front mostraria `0` apesar de ter alterado.
  - **Handoff (par Front+Back):** ver bloco abaixo. Reviewer regenera catálogo se as rotas mudarem.
- **CORREÇÃO** (regra #9, Codex+revisor 2026-07-18): os dois `cronManagement.controller.ts` servem famílias
  diferentes (o `cron/` monta config/execute/history/getJobHistory; o `syncUtilizadoresControllers/` monta o CRUD
  de jobs em `/cron`), MAS o `cron/cronManagement.controller.ts` tem **7 métodos de CRUD MORTOS** — `getAllJobs`,
  `getJobById`, `createJob`, `updateJob`, `deleteJob`, `toggleJob`, `triggerJob` — cópia da família viva (revisor
  confirmou: só definidos, não montados, refs internas são a **serviços** homónimos, não ao controller). **Apagar
  os 7** + tipar o `:id` de `getJobHistory` (esse é vivo, montado). Esperado: controllers **88→77**. Aprovado.
  - [x] FEITO (`a9afe50`, 399 linhas). Revisor: só os 7 saíram (8 métodos vivos + `getJobHistory` intactos, tipado
    `Request<{id:string}>`), twin **não tocado**, 0 casts, prune `no-console` 44→22. Ratchet **77/21**.
- **`ts-prune` correu (revisor):** 147 candidatos brutos, mas **muito ruído** (barrel re-exports em `models/index.ts`
  incl. `IdsDiferentes`/`UnmatchedUser` que **são vivos**; tipos; `default` de jobs/serviços; handlers via `import * as`).
  Guardado em `scratchpad/ts-prune-candidates.txt`. **Não apagar às cegas** — precisa triagem por-item (grep a confirmar).
  Melhor: a regra #9 apanha isto organicamente na moagem dos controllers; um passe de triagem dedicado depois.

### 🔧 Handoff — preview real por curso (Clareza/OGI) — par Front+Back
1. **Motor:** adiciona `dryRun?: boolean` a `decisionEngine.evaluateUserProduct` — quando `true`, computa tudo mas
   **salta `executeDecisions()` (linha 455)** e devolve o `DecisionResult` (com `tagsToApply`/`tagsToRemove`,
   `actionsExecuted:0`). NÃO escreve. Prova com teste: `dryRun` → `executeDecisions` não é chamado, mas
   `tagsToApply/Remove` vêm preenchidos.
2. **Backend endpoints:** `evaluateClarezaRules`/`evaluateOGIRules` deixam de ser stubs — correm o dry-run **por
   curso** (filtra os UserProducts activos dos produtos desse curso), agregam e devolvem números **reais**:
   `{ studentsEvaluated, proposedAdditions, proposedRemovals, errors }`. **Zero writes.** (Reutiliza
   `evaluateAllUsersOfProduct` com `dryRun`.)
3. **Aplicação real = acção SEPARADA:** endpoint próprio, destrutivo, atrás de `AC_TAG_APPLY_ENABLED` (default off)
   + confirmação. **Não** o mistures com o preview. (Pode ser follow-up; o preview honesto é a entrega principal.)
4. **Front (par):** actualiza `evaluationResponseSchema`/`EvaluationResponse` para os campos do preview
   (`proposedAdditions`/`proposedRemovals`/`studentsEvaluated`); relabel do botão para deixar claro que é
   pré-visualização; os números mostrados passam a ser reais. "Aplicar alterações" fica botão separado e desligado.
5. **Legacy:** os duplicados (`ogiCourse` já 410) ficam removidos/410 — sem 2ª cópia.
6. Offline: motor/http mockados; nunca AC real. Gate verde nos 2 repos. **Reviewer regenera catálogo/contrato** se rotas mudarem.

### 🧹 SWEEP de código morto — bloco em fila (executar A SEGUIR à deleção do reengagement)
> **Re-verifica tudo TU antes de apagar.** Os candidatos acima são do revisor — prova cada um contra o código;
> só é morto se **nada em `src/` o importa/monta/chama** (todas as formas de import + `registerRoutes.ts`).
1. **Inventário:** `npx knip` (ou `npx ts-prune`; **não instales**, usa `npx`). Reporta a lista crua. ⚠️ Filtra
   falsos positivos: entry points, `await import(...)` dinâmicos, jobs por side-effect, `registerModels`.
2. **Re-verifica os candidatos do revisor:** `ogiCourse.controller.ts`+`ogiCourse.routes.ts` (routes importado em
   lado nenhum? OGI vivo no `activecampaign.controller`?) e `getDashboardStatsV3Legacy` (só a definição?). Confirmados → apaga.
3. **Apaga o confirmado:** 1 commit por unidade (`chore: remove dead ...`), remove imports/mounts pendentes,
   `types:baseline:update` se tinha erros no ratchet. **NÃO toques:** `decisionEngine`, cron de tags vivo, os
   **dois** `cronManagement.controller.ts` (famílias diferentes, não são duplicados).
4. **PARA E PERGUNTA (regra 8):** os stubs vivos `evaluateClarezaRules`/`evaluateOGIRules` devolvem hardcoded e o
   Front chama-os → **decisão de comportamento**, não deleção. Reporta e espera.
5. **Gate verde + report** por candidato: *confirmado morto e apagado* / *afinal vivo, mantido* / *precisa decisão*.
   Lista também o que o knip/ts-prune achou a mais.
> **Não é teu:** regenerar `route-catalog.json` + manifest/contract do Front (deleções de rotas) — é do revisor.

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
9. **Antes de trabalhar num ficheiro, confirma que está VIVO.** Repetidamente encontrámos código morto/duplicado
   (reengagement V1, ogiCourse, `calculateHotmartProgressLegacy`, `syncComplete`, `getDashboardStatsV3Legacy`). Não
   gastes esforço a tipar/arranjar código que ninguém usa. **Ao tocar num ficheiro, verifica:** é importado/montado
   em `src/` (incluindo `registerRoutes.ts`)? Há uma 2ª cópia da mesma função/rota? É uma versão `Legacy`/`V1`
   superseded, ou um stub que devolve dados hardcoded? Se cheirar a morto/duplicado → **pára, prova com um grep, e
   reporta** em vez de o "arranjar". Apagar lixo confirmado vale mais que tipar um fantasma.

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

## ✅ F3.3 — moagem TS **FECHADA: ratchet 0/0** (2026-07-18)

`npx tsc --noEmit` = **0 erros** (verdade crua, verificado pelo revisor). 178→0 por módulo/ficheiro, **sem 1 único
`any`/cast/suppression** — o revisor injectou-testou cada bloco. Pelo caminho: **18 bugs reais** corrigidos (campos
fantasma, schema strict a descartar campos, métodos/exports inexistentes escondidos por `as any` e engolidos por
`catch`, `$ne` duplicado, misclassificação discord, etc.), **7 blocos de código morto/duplicado** eliminados
(reengagement, ogiCourse, dashboard-legacy, 7 métodos cron, 2 rotas shadowed, 4 reads AC, handlers soltos), e **1
mentira do UI** transformada em preview real. Últimos 5: `90281fc`(webhook), `9036413`(migração morta),
`ff42326`(bug16 subdomain), `c8e3b73`(bug17 engagement fora do schema), `ad4a312`(bug18 UserHistory sempre vazio).

### ✅ TOOL-01 FECHADO — falso-verde morto (`e625691`)
`build` passou de `tsc || exit 0` → `tsc`; `noEmitOnError:false → true`. **Prova negativa:** build com erro TS
injectado devolve **exit 1** (limpo exit 0). Gotcha resolvido: `noEmitOnError:true` quebrava o **ts-jest** (recusava
emitir ficheiros de teste com folga de tipos, fora do ratchet) → criado `tsconfig.jest.json` (extends principal,
`noEmitOnError:false`) só para o ts-jest; jest volta a 294/2, build fica estrito. **A dívida TS não pode voltar sem
falhar o build.**

### ▶ PRÓXIMO: **activar `strict` — 1 bloco de 22 erros** (medido pelo revisor 2026-07-18)
Surpresa boa: o `strict:true` completo dá **só 22 erros** (com `strictNullChecks` a inferência resolve muitos
`noImplicitAny`; por isso o total é < que as flags isoladas). As 5 flags sem custo (`strictFunctionTypes`,
`strictBindCallApply`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`) = **0 erros**, vêm de borla.
Distribuição dos 22: **controllers 10 · services 9 · models 2 · security 1**. Códigos: TS7006 (param implicit any) 7 ·
TS2322 5 · TS2339 3 · **TS18048 (possibly undefined) 3** · TS7053/TS2783/TS2352/TS2345 (1 cada).

- [x] **`strict:true` ACTIVADO** (`e36e6c1`). Flip + 22 fixes (controllers/services/models/security) com guards/tipos
  reais — revisor confirmou por grep: **0 non-null (`!`), 0 casts, 0 any**. `tsc --noEmit` = 0 sob strict; jest 297/2;
  build 0. `eslint no-explicit-any` fica off (comentário actualizado, migração ratcheted separada). `tsconfig.jest.json`
  herda strict via extends (suites verdes). Committado pelo revisor (sandbox do Codex bateu num lock).

### ▶ PRÓXIMO: **moer `no-explicit-any`** — ratchet ligado (`9d5d0de`)
Rule `@typescript-eslint/no-explicit-any` agora `error` + baseline de suppressions nativo. **Novo `any` falha o lint**
(provado). Medido pelo revisor (2026-07-18): **1880 violações em 184 ficheiros** — controllers 808 · services 766 ·
scripts 111 · models 60 · utils 50 · routes 41 · jobs 32 · types 10. Top: `users.controller` 108 · `classes` 72 ·
`universalSyncService` 72 · `guruSync` 65 · `guru.inactivation`/`testimonials` 46 · `hotmart.controller` 43 · `clarezaFmpService` 42.

**Distribuição actual (revisor, do baseline, 2026-07-18): 1628 em 181 ficheiros** — services 694 · controllers 628 ·
scripts 111 · models 60 · utils 50 · routes 41 · jobs 32 · types 10. **Top:** `guru/guruSync.service` 65 ·
`guru.inactivation.controller` 46 · `testimonials.controller` 46 · `syncUtiliz/hotmart.controller` 43 ·
`clareza/clarezaFmpService` 42 · `acTags/activecampaign.controller` 41 · `syncUtiliz/curseduca.controller` 40 ·
`clareza/clarezaRaioxService` 37 · `guru.analytics.controller` 33 · `analytics/analyticsCalculator` 31 ·
`cron/dailyPipeline` 26 · `activeCampaign/decisionEngine` 23 · `guru/crossReference` 22 · `curseduca.adapter` 22.
> Para contar o restante: **lê o `eslint-suppressions.json`** (o `--rule` já não força nada — a rule está `error` e
> as suppressions aplicam-se, logo o eslint reporta 0). **Prioriza runtime** (services/controllers) sobre `scripts/` (111).

**Moagem (blocos médio-grandes, maiores primeiro):** por ficheiro (os grandes 1 commit cada; agrupa 3-5 pequenos).
Por commit: substitui `any` pelo **tipo real** (onde for genuinamente dinâmico, `unknown` + narrowing, **não** outro cast);
`npm run lint:baseline:prune` (remove as suppressions já resolvidas); `npm run lint` verde; corpo com a queda
(`no-explicit-any 1880→N`). Golden rule: substituir `any` pode **revelar bugs** (o tipo real expõe mismatches) — corrige
ou pergunta. Alguns `any` são intratáveis (dados dinâmicos) → deixa suprimidos, o ratchet aceita residual. É grind longo
(pode atravessar sessões); o **valor principal já está capturado** (não entram `any` novos).

Progresso moagem:
- [x] **users.controller (108→0)** — feito (`a9861fb`). `any` → interfaces reais (`discordIds:string[]`…) + `unknown`
  com narrowing (revisor: **0 casts** adicionados). `getUsersInfinite` re-tipado (vivo); 3 handlers mortos removidos
  (clearUsersCache/warmupUsersCache/createUser — sem refs, sem rota, 0 impacto catálogo). Bugs corrigidos (student
  stats/Discord IDs/engagement) com teste. Baseline **1880→1772**. Gate verde.

- [x] **classes.controller (72→0)** — feito (`aff32fe`). `any`→tipos reais, 0 casts. **Bug real:** activação/inactivação
  escrevia/lia o campo fantasma `estado` ('ativo'/'inativo') — descartado pelo schema strict → status nunca persistia;
  agora `'combined.status'`/`'hotmart.status'` canónicos (classe recorrente de bug). TDD test. Baseline **1772→1700**. Gate verde.

- [x] **universalSyncService (1700→1628)** — feito (`5a34d2a`). Tipos reais, 0 casts. Extraiu helper canónico
  `buildCanonicalActiveUserStatusUpdate()` (só escreve campos do schema, nunca `status`/`estado` fantasmas) + teste.

---

## 🔎 CursEduca / UserProduct — desenho VALIDADO + o que está partido (revisor 2026-07-18)

**Validado contra o código (o desenho do utilizador está correcto e funciona):**
- **Inactivação é POR PRODUTO**, não por user ✅
  - *Inativar turmas (Hotmart/OGI)* — `classes.controller:1409-1412` faz `UserProduct … { $set: { status: 'INACTIVE' } }` + actualiza agregados no User (`combined.status`, `hotmart.status`).
  - *Guru → CursEduca* — `guru.inactivation.controller` opera sobre `UserProduct` (status **`PARA_INATIVAR`** como staging) e **já dedup­lica múltiplos UserProducts do mesmo membro** (mudança de plano mensal/anual, linha 81).
- Logo o `UserProduct.status: 'ACTIVE'` hardcoded (`universalSyncService:2242`) está no caminho de **criação** e é um **default aceitável** — o dono do status são os fluxos de inactivação, não o sync. **Não é bug** (alarme do revisor retirado).
- Assessment canónico correcto existe: `curseduca.memberStatus` derivado do `situation` (`universalSyncService:1558`).

**O que ESTÁ partido — a cópia denormalizada `User.curseduca.enrolledClasses`:**
1. `isActive` **hardcoded `true`** (linhas 1496 e 1527) — nunca reflecte o `situation`/status do produto.
2. **Overwrite:** sem `allCurseducaGroups` (nunca produzido pelo adapter), cai no fallback que faz
   `enrolledClasses = [umaTurma]` por item → num aluno com 2 matrículas fica **só a última processada (a mais antiga)**.
3. O `classes.controller` lista alunos da turma **por essa cópia** (`$elemMatch: { curseducaId, isActive: true }`)
   em vez do `UserProduct`, que é a fonte de verdade. → aluno aparece na turma errada e **falta** na certa.

### ▶ FIX A (agora, contido e seguro) — corrigir a cópia
- `isActive` **derivado** (reutilizar a lógica canónica da 1558: `situation` INACTIVE/SUSPENDED → inactivo), nos **dois** ramos (1496 e 1527). Nunca hardcoded.
- ⚠️ **CORRECÇÃO à spec inicial do revisor (Codex apanhou, 2026-07-18):** colapsar N→1 itens **partiria o sync dos
  UserProducts** — o serviço processa **1 item de cada vez** (`universalSyncService:461-462`) e faz **um upsert de
  UserProduct por item** (2116/2299). Com 1 item só, as matrículas secundárias deixavam de ser sincronizadas.
- **Variante correcta (aprovada):** manter os **N itens** e anexar a **cada um** o mesmo `allCurseducaGroups`
  agregado por utilizador. Assim: todos os UserProducts continuam sincronizados; cada item escreve a **mesma lista
  completa** em `enrolledClasses` → o overwrite torna-se **idempotente** (a ordem deixa de importar);
  `isPrimary`/`isDuplicate`/`duplicateCount`/logs mantêm-se intactos (continuam a existir N itens).
- Testes: 1 matrícula (inalterado); 2 matrículas com só uma activa (**só a activa fica `isActive: true`**); duplicados continuam sinalizados.

- [x] **FIX A FEITO** (`d05d40b`). Novo helper `curseducaMemberships.ts`: agrega as matrículas por utilizador e
  **anexa a mesma lista completa a cada um dos N itens** (cardinalidade intacta → UserProducts continuam todos a
  sincronizar); `isCurseducaEnrollmentActive(situation)` deriva `isActive` (`INACTIVE`/`SUSPENDED` → inactivo).
  Revisor confirmou por teste: `toHaveLength(2)` (não colapsa), `result[0].allCurseducaGroups === result[1]…`
  (**idempotente**), situations reais preservadas, `isPrimary`/`isDuplicate` intactos, derivação não invertida.
  `classes.controller` e fluxos de inactivação **não tocados**. Gate: lint 0, tsc 0, jest 305/2, build 0.

### ▶ FIX B (bloco estrutural seguinte) — listagem por `UserProduct`, matar a duplicação

**Viabilidade confirmada pelo revisor (2026-07-18):** para CursEduca, `UserProduct.classes[].classId =
String(item.groupId)` (`universalSyncService:2124-2125`) — **o mesmo valor** de `enrolledClasses[].curseducaId`.
A troca de query mapeia 1:1. E o modelo é mais correcto: **1 UserProduct por matrícula**, cada um com a sua turma
(`classes: [{classId}]`, linha 2132) e o seu **`status` próprio** (dono = os fluxos de inactivação, já validados).

**Estado actual** (`classes.controller:1895-1913`, ramo `curseduca_sync`):
```js
filter = { 'curseduca.enrolledClasses': { $elemMatch: { curseducaId: {$in:[...]}, isActive: true } } }
if (includeInactive !== 'true') filter['curseduca.memberStatus'] = 'ACTIVE'
const students = await User.find(filter).sort(sortObj).limit(Number(limit))
```

**Alvo:** obter os alunos a partir da fonte de verdade:
```js
UserProduct.find({ platform:'curseduca', 'classes.classId': String(classId),
                   ...(includeInactive !== 'true' ? { status:'ACTIVE' } : {}) })
```
- ⚠️ **Preservar sort/paginação/shape da resposta.** Recomendado **2 passos**: `UserProduct` → recolher `userId`s →
  `User.find({ _id: { $in: userIds } }).sort(sortObj).limit(...)`. Assim o sort/limit continuam sobre campos de User
  (mudar para sort sobre populate é armadilha no Mongo) e o payload devolvido não muda.
- `includeInactive` passa a filtrar pelo **`status` da matrícula** (mais correcto que o `memberStatus` do utilizador).
- **Só o ramo `curseduca_sync`.** O ramo Hotmart usa `classId` top-level no User (outra cópia denormalizada) — é
  limpeza separada (B2), **fora deste bloco**.
- **Characterization tests obrigatórios:** semear dados (aluno com 1 matrícula; aluno com 2 onde só uma é activa;
  aluno inactivo) e provar que a lista devolvida é **igual ou mais correcta** que a antiga, incluindo sort e limite.
- Só depois de verde é que `enrolledClasses` deixa de ser fonte de verdade (pode ficar como cache; remover é ARCH-03).
- [x] **FIX B FEITO** (`db0d9c3`). Ramo `curseduca_sync` passa a `UserProduct.find({ platform:'curseduca',
  'classes.classId', status })` → `.select('userId').lean()` → `User.find({_id:{$in:userIds}})` com o sort/limit
  existentes (2 passos, como especificado). `includeInactive` filtra pelo **status da matrícula**. Revisor confirmou:
  `platform` presente (sem colisão Hotmart), ramo Hotmart e `enrolledClasses` **intocados**, 3 characterization tests
  (lista por UserProduct · filtra por status de cada matrícula · preserva sort/limite/envelope). Gate: lint 0, tsc 0,
  jest 308/2, build 0.

### ❌ B2 (Hotmart) — INVESTIGADO E DESCARTADO (revisor 2026-07-18). **Não fazer.**
Trocar a listagem Hotmart para `UserProduct.classes` seria **regressão**, não limpeza:
- `User.classId` (top-level) **é a turma actual e é activamente mantida** pelo sync (`universalSyncService:1279,
  1305, 1410, 1672`) e pelo fluxo de movimento → a listagem actual (`classes.controller`, ramo `else`) **já lê a
  fonte certa**, que reflecte a Hotmart (como o desenho pretende: 1 turma actual).
- `UserProduct.classes` para Hotmart **acumula** turmas e **nunca** escreve `leftAt` (`universalSyncService:1989-2000`
  faz append com `leftAt: null` e não fecha a anterior) → uma query por `classes.classId` devolveria alunos de
  turmas **antigas**.
- O histórico de movimentos vive no `StudentClassHistory` (colecção própria), não no `classes[]`.
**Diferença-chave vs CursEduca:** lá havia uma cópia denormalizada a mentir; aqui a listagem já usa o campo correcto.

**Dívida latente (não urgente):** `getCurrentClass()` (`UserProduct.ts:424`, `classes.find(c => !c.leftAt)`) e
`isFullyLeft()` (429) são **dormentes** (0 usos fora do modelo) e dariam respostas **erradas** se usados, porque o
`leftAt` nunca é escrito. Escolha futura: ou passar a fechar a matrícula anterior (`leftAt`) no movimento, ou
**remover os métodos mortos** (regra #9). Não bloqueia nada hoje.

**Fica em fila:** remover o `enrolledClasses` como fonte quando estabilizar (ARCH-03) · moagem `no-explicit-any` (1628).

- [x] **guruSync.service + guru.inactivation.controller (1628→1517, −111)** — feito (`af745ea`, `716dd76`).
  0 casts/any novos. **Escrita fantasma removida:** `guru.totalSubscriptions` **não existe no schema** (era
  descartada pelo strict). **Ramo `PARA_INATIVAR` morto removido** — revisor **verificou a alcançabilidade**: o loop
  faz `if (status === 'PARA_INATIVAR') { alreadyMarked++; continue }` **antes** do bloco de protecção, logo o ramo
  interno nunca podia disparar. ⚠️ A **PROTECÇÃO sobrevive intacta** (`hasActiveSub` → `skipped++` + `continue`,
  protege mudanças Mensal→Anual) e o `(sub as any)` virou tipagem real. Gate: lint 0, tsc 0, jest 308/2, build 0.

- [x] **testimonials + hotmart.controller (1517→1428, −89)** — feito (`319b0e4`, `75153d5`). 0 casts/any novos.
  Leitura fantasma `Product.slug` removida (não existe no schema). **Bug real (buraco de auditoria):**
  `(req as any).user?._id` — o **cast escondia** que o auth fornece `req.user.id` (confirmado em
  `auth.middleware:13,45,51`), logo `triggeredByUser` era **sempre `undefined`** (nunca se soube que admin
  accionou cada sync Hotmart). Corrigido nos 2 sítios + teste RED/GREEN. Gate: lint 0, tsc 0, jest 309/2, build 0.

- [x] **clarezaFmpService + activecampaign.controller (1428→1345, −83)** — feito (`e3fdf0d`, `0a8bca7`).
  0 casts/any novos. Previews Clareza/OGI verificados intactos: `evaluateAllUsersOfProduct(id, true)` mantém o
  **`dryRun=true`** (o preview continua read-only — era o risco maior desta passagem). Guarda `if (!user.email)`
  real (utilizadores sem email já não geram chamadas inválidas à AC). **Bug real (progresso sempre 0):**
  `up.progress?.progressPercentage` lia um nível fundo demais — em `UserProduct.IProgress` o campo de topo é
  `percentage`; `progressPercentage` só existe **dentro de `modulesList[]`** (por módulo). Corrigido para
  `up.progress?.percentage`. *Nota de review: o report atribuiu este bug ao `e3fdf0d` (clarezaFmpService), mas
  esse serviço é Financial Modeling Prep (dados de bolsa) — o fix está no `0a8bca7`.*

**Mesma classe de bug ainda VIVA (prioridade para o próximo bloco) — campo fantasma `progress.progressPercentage`
em `UserProduct`:**
1. `dashboard.controller.ts:32-34` — `matchStage['progress.progressPercentage']` num `UserProduct.aggregate`:
   o filtro `progressMin`/`progressMax` **nunca filtra** (path inexistente). Linha 69: `avgProgress: { $avg:
   '$progress.progressPercentage' }` → **média sempre nula/0**. Deve ser `progress.percentage`.
2. `activecampaign.controller.ts:1134` — `UserProduct.create({ status: 'active', progress: { progressPercentage: 0 } })`:
   escreve campo fantasma e **nunca põe `percentage`** (obrigatório em `IProgress`). Além disso `'active'`
   minúsculo **não é** `EnrollmentStatus` válido (o tipo é `'ACTIVE'`). Ficheiro acabado de tipar — a tipagem
   não apanhou porque o lado da **escrita** (`.create()`) aceitou o objecto parcial.
3. Varrer o resto: `grep -rn "progressPercentage" src` — confirmar caso a caso se é o de topo (bug) ou o de
   dentro de `modulesList[]` (legítimo).

- [x] **Fantasma `progressPercentage` fechado + curseduca/raiox/guru.analytics (1345→1233, −112)** — feito
  (`3ae8404`, `b92ee47`, `eecdee2`, `8dc3d15`, `1519096`). 0 casts/any novos. Gate: lint 0, tsc 0, ratchet 0,
  build 0, jest 314/2 (+3 testes de regressão). Verificado contra código:
  - `dashboard.controller` :32-34, :69 e **:292 (`compareProducts`, sítio que eu não tinha apanhado)** → `progress.percentage`.
    O filtro `progressMin/Max` e as médias voltam a funcionar (antes: filtro nunca filtrava, média sempre nula).
  - `activecampaign.controller:1130-1134` → `status: 'ACTIVE'` (era `'active'`, inválido para `EnrollmentStatus`)
    e `progress: { percentage: 0 }`.
  - **Alias legacy `progressPercentage` é legítimo**: provado o produtor em `userProducts/userProductService.ts:320-325`
    (`{ ...up.progress, progressPercentage: up.progress.percentage ?? 0 }`), mais `testHistory:56`, `users:3202`,
    `userSnapshot.service:50` — todos derivam de `percentage`. Logo o filtro `hotmart.controller:215` funciona.
  - **Bug real (buraco de auditoria, sítio novo):** `triggeredByUser` lia `(req as any).user?._id` em
    `curseduca.controller` — mesma classe já corrigida em `hotmart.controller` (`319b0e4`). Auth dá `req.user.id`.
  - **Bug real (limbo permanente):** cleanup Guru em `guru.analytics.controller:678-681` só olhava para
    `memberStatus`/`INACTIVE`; matrículas `SUSPENDED` ficavam presas em `PARA_INATIVAR` para sempre. Agora lê
    `curseduca.situation` (canónico) e trata `INACTIVE`+`SUSPENDED`. Default `|| 'ACTIVE'` erra no sentido seguro.

**Dívida nova registada (duplicação de predicado — rule #9):** o predicado canónico
`isCurseducaEnrollmentActive(situation)` (`curseducaServices/curseducaMemberships.ts:16`) tem **1 só uso** — dentro
do seu próprio módulo (:38). O cleanup do Guru (`guru.analytics.controller:681`) acabou de escrever **à mão uma
segunda cópia da mesma regra** (`=== 'INACTIVE' || === 'SUSPENDED'`). Duas definições de "matrícula curseduca
inactiva" vão divergir. Próximo bloco: fazer o guru.analytics importar o helper e varrer outros sítios que
comparem `situation`/`memberStatus` a literais.

- [x] **Predicado curseduca centralizado + analytics/dailyPipeline (1233→1176, −57)** — feito (`aa6a480`,
  `9122b7b`, `357f980`). `isCurseducaEnrollmentActive` agora importado em `guru.analytics.controller` (:682, :740),
  fim da 2ª cópia da regra; teste `SUSPENDED → INACTIVE` + sonda de mutação. `dailyPipeline` ignora referências de
  produto órfãs antes do orquestrador. Gate verde.

- [x] **Última actividade real (fim do fantasma de inactividade) + decisionEngine/crossReference/adapter
  (1176→1109, −67)** — feito (`7d3a978`, `1851e04`, `cf9f04d`, `28b8a8f`). 0 casts/any novos. 4 guardas
  `if (!dryRun)` intactas. **Bug estrutural corrigido (o mais importante do bloco):** `getLastActivityDate` lia
  `communicationByCourse[code].lastActivityDate` e `user.lastLogin` — **ambos inexistentes** no schema (o `lastLogin`
  real vive dentro de `curseduca`); caía sempre em `createdAt`. Resultado: `daysSinceLastLogin`/`daysSinceLastAction`
  eram a **idade da conta**, não inactividade — as regras de inactividade disparavam nos alunos **mais antigos**, não
  nos inactivos. Substituído por helper partilhado `src/services/activity/learnerActivity.ts`
  (`getLastLearnerActivityDate`): mais recente entre `hotmart.lastAccessDate`, `curseduca.lastLogin/lastAccess`,
  `courseSpecificData.lastReportOpenedAt/lastModuleCompletedAt`; **exclui** `lastTagAppliedAt`/`lastEmailSentAt`
  (acção do sistema, ciclo auto-referencial); **sem sinal → `null`**. Consumo: `calculateDaysInactive(null)=null`;
  nível cai para 0 e a guarda de escalada exige `daysInactive !== null` → **sem sinal não escala** (antes: `999`,
  disparava no máximo). Na avaliação de regras-string, `null → NaN` → toda comparação `false` (nem activo nem
  inactivo dispara — "desconhecido" honesto e simétrico). Testes: `learnerActivity.test.ts` +
  `decisionEngineDryRun.test.ts`. **Parte B:** o mesmo fantasma `combined.lastActivity` (+ fallback
  `metadata.updatedAt`, data de sistema) em `classes.controller` migrado para o mesmo helper. Bugs extra:
  `engagement.totalActions` inexistente; serialização de condições incompletas. Dead code (regra #9):
  `fetchMemberDetails`/`enrichMemberWithDetails` removidos (substituídos pelo bulk map). Gate: lint 0, tsc 0,
  ratchet 0, build 0, jest 321/2.
  **Deixado deliberadamente fora (decisão própria pendente):** `tagOrchestrator.service.ts` mantém a **sua** noção
  de última actividade (`studentState.lastActivityDate = ctx.lastActivity`, :442/:469; leitura :487). Propagar `null`
  aí precisa de decidir o que fazer quando `ctx.lastActivity` é desconhecido nesse fluxo — **não tocar sem decisão**.

Depois: cirurgia ARCH-01/02/03.

---

## (histórico) F3.3 — moagem TS 178→0 (por módulo)

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
- [ ] **jobs (1→0)** ← **PRÓXIMO. Decisão do utilizador (2026-07-18): implementar, mas manter DESLIGADO atrás
  de flag** (padrão OPS-02 kill-switch). Bug: `applyTags.ts:176` chama `addTagsBatch` inexistente → aplicação de
  tags na AC falha em silêncio (está em try/catch). Spec:
  - **Implementar `addTagsBatch(email, tagNames, batchSize=3)`** em `activeCampaignService`, **espelhando o
    `removeTagBatch` existente** (:423): batches, `Promise.all(batch.map(t => this.addTag(email, t)))`, rate-limit
    2000ms entre batches, devolve `{ success, failed, total }`. Adapta a categorização à resposta do `addTag`
    (`ACTagResponse`, não booleano como o `removeTag`).
  - **Gate a APLICAÇÃO atrás de `AC_TAG_APPLY_ENABLED` (default OFF)**, seguindo o idioma existente
    `isMasterEnabled()`/`RENEWAL_AC_SYNC_ENABLED` (`renewalAcSync.service.ts:38`). Guarda no **caller** (`applyTags.ts`,
    antes do `if (toAdd.length > 0)`) — o `addTagsBatch` fica primitivo. Só `applyTags:176` o chama.
  - **Desligado = skip limpo:** quando off, **não chama a AC, não faz `stats.errors++`** (hoje o método em falta
    inflaciona errors); loga uma vez ou conta `stats.skipped`. Isto **preserva o comportamento actual** (tags não
    aplicadas) mas agora **intencional e sem spam de erro**, pronto a ligar quando o utilizador quiser.
  - Documenta `AC_TAG_APPLY_ENABLED` no `.env.example`. **Offline:** testa os 2 caminhos com `addTag`/http mockado
    — off ⇒ `addTag` **não** é chamado; on ⇒ batches chamam `addTag` correctamente. **Nunca** toca a AC real.
  - Golden rule cumprida: o tipo compila porque o método **existe** (0 cast/suppression). `jobs 1→0`.

- [x] **jobs (1→0)** — feito (`73937eb`). `addTagsBatch` implementado (`tagBatch.ts` puro + DI, espelha
  `removeTagBatch`, categoriza por `ACTagResponse.contactTag.id`); aplicação gated por `AC_TAG_APPLY_ENABLED`
  (default OFF) no `applyTags`; off = skip limpo sem `stats.errors++`; `.env.example` documentado. 3 testes
  offline provam off (0 chamadas, 0 erros) / on (batches) / categorização. Revisor: 0 cast/suppression. Ratchet 171/37.

### ⚠️ utils (8→0) — passe caça-bugs (decisão user 2026-07-18: fazer agora). Plano grounded pelo revisor
Todos em `studentDataConsolidator.ts` (usado por `studentCompleteService.ts`). Modelos já confirmados pelo revisor:

- **`:95/:100/:134` (3) — apagar código morto.** `calculateHotmartProgressLegacy` recebe `product` mas usa `user`
  (fora de scope) e **nunca é chamada** (grep: só a definição). → **apaga a função inteira.** 0 risco runtime.
- **`:386` — gap de timestamps.** `user.createdAt`: o interface `IUser` **não declara** `createdAt`/`updatedAt`
  top-level (mongoose `timestamps:true` cria-os em runtime). → **adiciona `createdAt?: Date; updatedAt?: Date`** ao
  `IUser`. Mecânico, 0 risco.
- **`:456`/`:461` — fallback legacy.** `getProductCode`/`getProductName` fazem `productId?.code || product.productCode
  || …`. `IUserProduct` **não tem** `productCode`/`productName` (confirmado no schema). São fallbacks para docs
  legacy denormalizados. → **preservar o comportamento**: adiciona `productCode?: string; productName?: string`
  **opcionais** ao `IUserProduct` (documenta os campos legacy, mantém o fallback vivo). **Não** removas o fallback
  (pode apanhar docs antigos). Nota: a linha já tem `product.productId as any` **pré-existente** — não adicionar mais.
- **`:44` — campo fantasma.** `role: cls.role` mas `IClassEnrollment` = `{classId, className?, joinedAt, leftAt?}`
  (**sem `role`**) → `role` é **sempre `undefined`**. Decisão: **verifica se `ConsolidatedClass.role` é consumido**
  em algum lado. Se não → remove o campo (fantasma). Se sim → é bug latente (dados nunca lá estiveram); **pergunta**.
- **`:40` — tipo estreito.** `platform: product.platform` (`PlatformType`, largo) num `ConsolidatedClass.platform`
  estreito (`'hotmart'|'curseduca'`). Aqui as turmas só vêm de hotmart/curseduca. → alarga `ConsolidatedClass.platform`
  a `PlatformType` **ou** guarda/estreita explicitamente. Sem `as any`.

- [x] **utils (8→0)** — feito (`e43aedf`). Função morta apagada; `role` fantasma removido (do uso **e** do tipo
  `ConsolidatedClass`); `createdAt?/updatedAt?` no `IUser` + fallback defensivo `|| user.metadata.createdAt`;
  `productCode?/productName?` opcionais no `IUserProduct` (fallbacks **preservados**). **Bónus — bug real
  corrigido:** o `:40` revelou que enrolments **discord/guru** eram classificados como `curseduca_sync`; fix por
  **guard** (`if platform !== hotmart && !== curseduca return`), não cast. 3 testes com instâncias mongoose reais
  provam: discord→`[]`, sem `role`, fallback metadata. Revisor: 0 cast/suppression (suppressions **pruned** 2→1).
  Gate: lint 0, ratchet 163/36, jest 275/2 skipped.

### ⬛ Restam os 2 grandes: services (~33) e controllers (124) — sub-dividir em vários commits
> **Sub-dividir** (não um commit de 124 fixes). O ratchet é por-directório mas desce **em vários commits**:
> fixa um cluster → `types:baseline:update` → commit com números → gate → repete. **services primeiro.** Golden
> rule na mesma; onde um erro TS revelar um bug (como no `:40`/jobs), **corrige o bug ou pergunta**, nunca cast.

Progresso services (clusters reportados pelo Codex):
- [x] **sync/hotmart module progress (39→33)** — feito (`b70873a`). Tipou o contrato central `UniversalProgressModule`
  + `modulesList?/totalModules?/modulesCompleted?/currentModule?` (opcionais, sem `any`) → 6 erros do serviço
  consumidor resolvidos na **definição**, não no uso. Revisor: 0 cast/suppression. Ratchet 157/35.
- [x] **ActiveCampaign (33→32)** — feito (`e9ab346`). **Bug real (3º da F3.3):** remover a 1ª tag criava
  `activeCampaignData = { tags: [] }` sem `lists` (obrigatório em `IActiveCampaignData`) → `{ tags: [], lists: [] }`.
  Fix satisfaz o tipo E a integridade. Teste RED/GREEN. 0 cast/suppression. Ratchet 156/34.
- [x] **tag-monitoring (services 32→22, controllers 124→120)** — feito (`0caf5bf`). Tipou 5 modelos
  tag-monitoring (interfaces/documents) → resolveu 14 erros nos consumidores (services+controllers). **Restaurou
  `getAllContacts()`** (paginação `/api/3/contacts`) — método que faltava e o `weeklyTagMonitoring` consumia; é
  READ e fica atrás do gate **existente** `config.enabled`+`scope==='ALL_CONTACTS'` (não force-enable). Bónus:
  removeu um `(c: any)` pré-existente. Revisor: 0 cast/suppression novos (models continua a 0). Ratchet 142/31.
- [x] **classesService (services 22→14, controllers 120→116)** — feito (`d4339fb`). **Bug real (4º):** `classId`/
  `className` estavam na interface mas **não no schema** → `strict:true` descartava-os silenciosamente ao gravar
  (fluxos de gestão/movimento de turmas perdiam dados); restaurados no schema. Removeu `syncComplete()` morto do
  serviço (referenciava `api` inexistente; a rota viva usa o **controller**, confirmado). Suppressions **pruned**:
  `no-console` 24→21 + `preserve-caught-error` (2). 0 cast/suppression novos. Ratchet 130/30.
- [x] **snapshots (services 14→7)** — feito (`84dc936`). **2 bugs reais (5º e 6º):** (a) `UserProduct` descartava
  `role` (não estava no schema) → `CLASS_ROLE_CHANGE` impossível; `role?` restaurado no schema (persistência de role
  numa função pura `classEnrollmentRole.ts`, testada: turma nova / role alterado / role inalterado). (b) snapshots
  liam `user.averageEngagement*` fantasma → `undefined`; agora `user.combined?.combinedEngagement`.
  **Consistência cross-cluster verificada:** o `role?` no schema **não** contradiz a remoção de `role` do
  `ConsolidatedClass` em utils — camadas diferentes (persistência vs DTO de display sem consumidor). 0 cast/suppression.
  Ratchet 123/28.
- [x] **studentComplete (services 7→3)** — feito (`5e3c4e1`). Retipou as funções do `studentDataConsolidator`
  para aceitar contratos **lean** via `Pick<IUserProduct, …>` (`StudentProductData`/`StudentStatsUser` — subconjuntos
  precisos, **não `any`**); largou o param `user` não usado do `consolidateClasses`. Testes actualizados, discord/role/
  fallback continuam a passar. 0 cast/suppression. Ratchet 119/27.
- [x] **UniversalSyncConfig (services 3→0)** — feito (`33ce15e`). **Bug real (7º):** snapshots liam `config.syncId`
  (nunca fornecido → sempre `undefined`, órfãos do `SyncHistory`); agora um helper `universalSyncSnapshot.ts`
  constrói o contexto com `syncId` do `SyncHistory` real do fluxo (tipado `syncId: Types.ObjectId`).
  `UniversalSyncConfig` restringido a plataformas concretas (exclui `all`). 0 cast/suppression. Ratchet 116/26.

### ✅ services, models, scripts, jobs, utils todos a 0 — **resta só controllers**
- [x] **activecampaign.controller (116→115)** — feito (`e82708e`). **Bug real (8º, gémeo do 3º):** o controller
  criava `activeCampaignData` sem `lists` (obrigatório) → `{ …, lists: [] }`. Teste HTTP boundary. 0 cast/suppression.
### controllers — reta final por ficheiro. **Progresso: 115→46.** ✅ analytics, ac-lists, cron-dead, sync-shadowed, cron-twin(`2c086ea`), product-profiles(`9313d77`), testimonials(`3778e90`, **bug 12: `onlyActive` lia `status`/`estado` fantasma→sempre true; agora `combined.status`**). 0 casts em nenhum.

### controllers 46→32 (`0b4dca4`,`2dcab35`,`63f291b`): **bug 13** (5 metadados de audit de inativação descartados pelo strict → persistidos) · **bug 14** (`createInactivationHistory` inexistente, 3 fluxos chamavam via `(UserHistory as any)` e engoliam a falha → método restaurado, **2 casts `as any` velhos removidos**) · 4 params classes + 4 `:id` notificações tipados. Testes RED/GREEN.

### controllers 32→24 (`57b2520` studentHistory, `ea8e055` guru.snapshot) — 0 casts, ratchet 24/12.

### ⚠️ acReader — DECISÃO: apagar 4 endpoints de leitura partidos (utilizador 2026-07-18)
Revisor mapeou (corrigindo scope inicial): **4** endpoints AC de leitura chamam statics **inexistentes** no model
`ACContactState` via `as any` — todos **partidos** (rebentariam em runtime) e **sem consumidor no Front**:
- `GET /api/ac/analytics/overview` (`getACOverview`) — `findOldSyncs`+`findWithInconsistencies`
- `GET /api/ac/analytics/product/:code` (`getProductACAnalytics`) — `findByProduct`
- `GET /api/ac/inconsistencies` (`getInconsistencies`) — `findWithInconsistencies`
- `POST /api/ac/maintenance/refresh-old` (`refreshOldSyncs`) — `findOldSyncs`
Decisão: **apagar os 4** (rotas + handlers + os `as any`). O **lado de escrita** (`getContactTags`, `syncContactTags`,
`getBatchContactTags`, `batchSyncContacts`, `clearACCache`) e o model `ACContactState` ficam **intactos**. Se um dia
precisar de analytics de contact-state, reconstroi-se com statics reais.
- [x] FEITO (`9ccb446` back / `0942cd9` front contrato). Codex removeu os 4 (validado: só os 4, escrita+model
  intactos); revisor regenerou catálogo/manifest (448→444), reapontou evidências das 5 rotas AC sobreviventes
  (line-shift), ajustou contagens (routeCatalog 448→444; defaultDenyAuth 448→444, authenticated 443→439),
  regenerou contrato Front (444, transportContract 10/10). **Committado verde de uma vez** (regen antes do commit,
  sem intermédio vermelho). Ratchet **23/12**.

### controllers 23→8 (7 commits `57091bd`..`53694b5`): acReader, criticalTag, lessons, tagMonitoring, guru.sync tipados; syncReports (getReportById re-tipado + `getReportsByJob` morto removido), CursEduca (`syncCurseducaByEmail` morto removido — era candidato ts-prune, apanhado pela regra #9). **Bug 15:** `hotmart.status` escrito pelos syncs mas não no schema strict → descartado; adicionado ao `user.ts` + `curseducaStatus` lê `curseduca.situation` canónico. Teste RED/GREEN. **0 casts novos, 2 velhos removidos.** Ratchet 8/5. Restam: guru.webhook 1 · sync 1 · hotmart 1 · testHistory 2 · users 3.

### controllers (8) — reta final, 1 commit por FICHEIRO (regra #9 + golden rule)
> **Não** 1 erro/commit. Agrupa **por ficheiro** — os erros de um controller partilham contexto (mesmos models,
> req/res) e formam um assunto coerente e revisível. Ordem sugerida: maiores primeiro.

Distribuição (revisor, `tsc --noEmit`, 2026-07-18):
- **Por ficheiro:** analytics 13 · reengagement 12 · cron/cronManagement 11 · syncStats 8 · syncUtiliz/cronManagement 8 ·
  productProfile 8 · testimonials 7 · classes 5 · guru.inactivation 5 · tagNotification 4 · studentHistory 4 ·
  acReader 4 · guru.snapshot 4 · criticalTag 3 · guru.sync 3 · +cauda (~2-1 cada).
- **Por tipo de erro:** TS2345 46 · TS2339 43 · TS2769 16 · TS2551 4 · **TS1117 4** · TS2307 1 · TS2352 1.

⚠️ **Regra de ouro reforçada nos controllers** (é onde vivem os bugs):
- **TS2339 (43, "propriedade não existe")** é a classe que já revelou 8 bugs reais (campos fantasma / schema a
  descartar). Em cada um: **é bug de dados ou gap de tipo?** Corrige a raiz, **não** casta para compilar.
- **TS1117 (4, chaves duplicadas num literal)** = **bug garantido** (a 2ª chave sobrescreve a 1ª em silêncio).
  Investiga o que era pretendido, corrige. Nunca só apagar uma chave sem perceber qual é a correcta.
- TS2345/TS2769 (argumento/overload): normalmente tipo mal-casado → corrige o tipo na fronteira.

- [ ] 1 commit por ficheiro, `types:baseline:update` a cada, número no corpo (`controllers 115→N`), gate verde.
  Podes entregar vários ficheiros num report. Se um erro revelar um bug (esp. TS2339/TS1117), **corrige ou pergunta**.

Progresso controllers:
- [ ] **syncStats — rotas shadowed (regra #9, aprovado 2026-07-18):** `GET /api/sync/stats` e `/api/sync/history`
  são servidas pelo `sync.routes` (montado 1º, `index.ts:53`); as cópias no `syncStats.routes` (montado 2º, `:94`)
  são **inalcançáveis**. Revisor confirmou a ordem **e** que o `getSyncStats` do `guru.routes` vem de
  `guru.sync.controller` (colisão de nome, NÃO dependência) → apagar os do `syncStats.controller` é seguro. Aprovado:
  remover as 2 rotas shadowed + os handlers `getSyncStats`/`getSyncHistory` duplicados + tipar os 4 handlers `:id`
  vivos (`getSyncById`, `getConflictById`, `resolveConflict`, `ignoreConflict`) como `Request<{id:string}>`.
  Esperado: controllers **77→69**.
  - [x] FEITO (`fe8c02f`). Revisor: 2 rotas+handlers shadowed fora, 4 `:id` tipados sem cast, sync/guru/manifest
    intactos. Evidência do catálogo reapontada para as declarações vivas (`sync.routes.ts:50/60`) — **sem mudança
    de count** (as rotas continuam a existir, só se deduplicou) → sem regen de manifest/contrato. Ratchet **69/20**.
- [x] **analytics (115→102)** — feito (`183427e`). **3 bugs reais (9º/10º/11º):** `$ne` duplicado no mesmo literal
  (`{$ne:null, $ne:''}` → 2º sobrescrevia o 1º; só excluía `''`, não `null`) → `$nin:[null,'']`; `require` de
  path inexistente (`../services/engagementService`) → import correcto; `setInterval` sem ref prendia o Jest →
  `.unref()`. 0 cast/suppression (suppressions pruned). Ratchet 102/24.
- [x] **reengagement (12→0) — APAGADO** (`09df244`, decisão utilizador 2026-07-18). Duplicado morto/superseded do
  cron de tags (`/test-cron`, já endurecido na F3.1). 605 linhas removidas (controller+routes+schema+teste+mount).
  Engine `decisionEngine` + cron + domínio `reengagementLevels` **intactos** (revisor: 0 refs pendentes). Revisor
  regenerou `route-catalog.json`+`route-manifest.json` (455→448) e o contrato do Front (`1bc95cc`, `371d22b`),
  ajustou contagens nos testes (routeCatalog 455→448, defaultDenyAuth 450→443). Gate verde nos 2 repos. **Controllers 102→90.**

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
