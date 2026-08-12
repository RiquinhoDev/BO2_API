# BO2_API â€” Plano de trabalho do endurecimento (Codex)

> **Codex: lÃª isto primeiro.** Ã‰ a tua lista de trabalho e as regras. O contexto profundo (o porquÃª, o mÃ©todo
> de revisÃ£o, o histÃ³rico) vive no repo **Front**, em `docs/superpowers/` â€” se tiveres acesso, lÃª o
> `REVIEWER-PLAYBOOK.md` e o `CONTINUITY-front-remake-review.md` Â§7d. Auditoria local: `archive/API_AUDIT_2026-07-15.md`.
>
> **MissÃ£o:** elevar esta API a arquitetura/seguranÃ§a/cÃ³digo limpo/operacionalidade de alto nÃ­vel, por
> **refactor incremental (strangler), NÃƒO rewrite.** Trabalho na branch `remake`.
>
> **O nÃ­vel tÃ©cnico-alvo (a rÃ©gua de aceitaÃ§Ã£o) estÃ¡ no fim: "Estado-alvo (Definition of Done)".** Nada se
> declara "feito" sem bater esses critÃ©rios, provados contra o cÃ³digo.

---

## Candidatos a cÃ³digo morto/duplicado (caÃ§a do revisor 2026-07-18) â€” cada um precisa DECISÃƒO
> DetecÃ§Ã£o manual verificada (nÃ£o exaustiva; um `ts-prune`/`knip` daria a lista completa). Tratar como o
> reengagement: confirmar consumidor â†’ apagar com decisÃ£o do utilizador.

- [x] **reengagement V1** â€” APAGADO (`09df244`, 605 linhas). Engine/cron/domÃ­nio (`reengagementLevels`) intactos.
  Revisor validou (0 refs pendentes) e regenerou catÃ¡logo/manifest (455â†’448) + contrato do Front (`1bc95cc`,
  `371d22b`). Gate verde nos 2 repos. Controllers 102â†’90.
- [x] **`ogiCourse.controller.ts` + `ogiCourse.routes.ts`** â€” APAGADO (`ae9e856`). Confirmado sem imports/mounts;
  OGI vivo (`activecampaign.controller`) intacto. Nunca esteve montado â†’ **sem impacto no catÃ¡logo** (448/448).
  Ratchet 90â†’88. Validado pelo revisor.
- [x] **`getDashboardStatsV3Legacy`** â€” APAGADO (`bf780e8`, 397 linhas). Revisor confirmou: removeu **sÃ³** essa funÃ§Ã£o
  (Ãºnica `-export`); `getDashboardStatsV3` vivo (linha 364, `/stats/v3`) intacto; 0 refs pendentes.
- [x] **stubs de avaliaÃ§Ã£o â€” FEITO: preview real read-only por curso** (back `bd9643e`+`4eb2281` / front `7772a0b`).
  `dryRun` no motor bloqueia **os 3 `setCooldown` E o `executeDecisions`** (revisor: teste prova `executeDecisions`/
  `applyTag`/`removeTag`/`findByIdAndUpdate` **nÃ£o chamados**, `tagsToApply/Remove` reais, `actionsExecuted:0`).
  Endpoints Clareza/OGI correm `evaluateAllUsersOfProduct(id, true)` e devolvem `{studentsEvaluated, proposedAdditions,
  proposedRemovals, errors}` reais. Front actualizou o schema (sem `tagsApplied` falso) â€” activecampaign 57/57, full
  893/893. "Aplicar" fica separado e desligado. Rotas inalteradas â†’ catÃ¡logo intacto. Gate verde nos 2 repos. A mentira do UI acabou.
- [x] ~~DECISÃƒO PENDENTE~~ (resolvida acima). Os botÃµes
  "Avaliar Regras" Clareza/OGI passam a ser **prÃ©-visualizaÃ§Ã£o real** (dry-run), NÃƒO escrevem na AC/Mongo. AplicaÃ§Ã£o
  real fica numa acÃ§Ã£o **separada, destrutiva, com confirmaÃ§Ã£o e `AC_TAG_APPLY_ENABLED=true`**. Revisor confirmou a
  viabilidade e a seguranÃ§a:
  - **Reuso limpo do motor:** `decisionEngine.evaluateUserProduct` computa `tagsToApply`/`tagsToRemove`
    (resolvidos em `src/services/activeCampaign/decisionEngine.service.ts:505-511`) **antes** do Ãºnico write
    `executeDecisions()`. â†’ adicionar `dryRun` que salta esse write dÃ¡ o preview real sem escrever. Sem rewrite.
  - **Porque NÃƒO re-apontar ao `test-cron`** (achados do Codex, vÃ¡lidos): processa **todos** os produtos (nÃ£o
    sÃ³ o curso); `executeDecisions()` **escreve** tags reais; esse caminho **nÃ£o respeita `AC_TAG_APPLY_ENABLED`**;
    e a resposta nÃ£o tem o contrato do Front (`tagsApplied`) â†’ o Front mostraria `0` apesar de ter alterado.
  - **Handoff (par Front+Back):** ver bloco abaixo. Reviewer regenera catÃ¡logo se as rotas mudarem.
- **CORREÃ‡ÃƒO** (regra #9, Codex+revisor 2026-07-18): os dois `cronManagement.controller.ts` servem famÃ­lias
  diferentes (o `cron/` monta config/execute/history/getJobHistory; o `syncUtilizadoresControllers/` monta o CRUD
  de jobs em `/cron`), MAS o `cron/cronManagement.controller.ts` tem **7 mÃ©todos de CRUD MORTOS** â€” `getAllJobs`,
  `getJobById`, `createJob`, `updateJob`, `deleteJob`, `toggleJob`, `triggerJob` â€” cÃ³pia da famÃ­lia viva (revisor
  confirmou: sÃ³ definidos, nÃ£o montados, refs internas sÃ£o a **serviÃ§os** homÃ³nimos, nÃ£o ao controller). **Apagar
  os 7** + tipar o `:id` de `getJobHistory` (esse Ã© vivo, montado). Esperado: controllers **88â†’77**. Aprovado.
  - [x] FEITO (`a9afe50`, 399 linhas). Revisor: sÃ³ os 7 saÃ­ram (8 mÃ©todos vivos + `getJobHistory` intactos, tipado
    `Request<{id:string}>`), twin **nÃ£o tocado**, 0 casts, prune `no-console` 44â†’22. Ratchet **77/21**.
- **`ts-prune` correu (revisor):** 147 candidatos brutos, mas **muito ruÃ­do** (barrel re-exports em `models/index.ts`
  incl. `IdsDiferentes`/`UnmatchedUser` que **sÃ£o vivos**; tipos; `default` de jobs/serviÃ§os; handlers via `import * as`).
  Guardado em `scratchpad/ts-prune-candidates.txt`. **NÃ£o apagar Ã s cegas** â€” precisa triagem por-item (grep a confirmar).
  Melhor: a regra #9 apanha isto organicamente na moagem dos controllers; um passe de triagem dedicado depois.

### ðŸ”§ Handoff â€” preview real por curso (Clareza/OGI) â€” par Front+Back
1. **Motor:** adiciona `dryRun?: boolean` a `decisionEngine.evaluateUserProduct` â€” quando `true`, computa tudo mas
   **salta `executeDecisions()`** e devolve o `DecisionResult` (com `tagsToApply`/`tagsToRemove`,
   `actionsExecuted:0`). NÃƒO escreve. Prova com teste: `dryRun` â†’ `executeDecisions` nÃ£o Ã© chamado, mas
   `tagsToApply/Remove` vÃªm preenchidos.
2. **Backend endpoints:** `evaluateClarezaRules`/`evaluateOGIRules` deixam de ser stubs â€” correm o dry-run **por
   curso** (filtra os UserProducts activos dos produtos desse curso), agregam e devolvem nÃºmeros **reais**:
   `{ studentsEvaluated, proposedAdditions, proposedRemovals, errors }`. **Zero writes.** (Reutiliza
   `evaluateAllUsersOfProduct` com `dryRun`.)
3. **AplicaÃ§Ã£o real = acÃ§Ã£o SEPARADA:** endpoint prÃ³prio, destrutivo, atrÃ¡s de `AC_TAG_APPLY_ENABLED` (default off)
   + confirmaÃ§Ã£o. **NÃ£o** o mistures com o preview. (Pode ser follow-up; o preview honesto Ã© a entrega principal.)
4. **Front (par):** actualiza `evaluationResponseSchema`/`EvaluationResponse` para os campos do preview
   (`proposedAdditions`/`proposedRemovals`/`studentsEvaluated`); relabel do botÃ£o para deixar claro que Ã©
   prÃ©-visualizaÃ§Ã£o; os nÃºmeros mostrados passam a ser reais. "Aplicar alteraÃ§Ãµes" fica botÃ£o separado e desligado.
5. **Legacy:** os duplicados (`ogiCourse` jÃ¡ 410) ficam removidos/410 â€” sem 2Âª cÃ³pia.
6. Offline: motor/http mockados; nunca AC real. Gate verde nos 2 repos. **Reviewer regenera catÃ¡logo/contrato** se rotas mudarem.

### ðŸ§¹ SWEEP de cÃ³digo morto â€” bloco em fila (executar A SEGUIR Ã  deleÃ§Ã£o do reengagement)
> **Re-verifica tudo TU antes de apagar.** Os candidatos acima sÃ£o do revisor â€” prova cada um contra o cÃ³digo;
> sÃ³ Ã© morto se **nada em `src/` o importa/monta/chama** (todas as formas de import + `registerRoutes.ts`).
1. **InventÃ¡rio:** `npx knip` (ou `npx ts-prune`; **nÃ£o instales**, usa `npx`). Reporta a lista crua. âš ï¸ Filtra
   falsos positivos: entry points, `await import(...)` dinÃ¢micos, jobs por side-effect, `registerModels`.
2. **Re-verifica os candidatos do revisor:** `ogiCourse.controller.ts`+`ogiCourse.routes.ts` (routes importado em
   lado nenhum? OGI vivo no `activecampaign.controller`?) e `getDashboardStatsV3Legacy` (sÃ³ a definiÃ§Ã£o?). Confirmados â†’ apaga.
3. **Apaga o confirmado:** 1 commit por unidade (`chore: remove dead ...`), remove imports/mounts pendentes,
   `types:baseline:update` se tinha erros no ratchet. **NÃƒO toques:** `decisionEngine`, cron de tags vivo, os
   **dois** `cronManagement.controller.ts` (famÃ­lias diferentes, nÃ£o sÃ£o duplicados).
4. **PARA E PERGUNTA (regra 8):** os stubs vivos `evaluateClarezaRules`/`evaluateOGIRules` devolvem hardcoded e o
   Front chama-os â†’ **decisÃ£o de comportamento**, nÃ£o deleÃ§Ã£o. Reporta e espera.
5. **Gate verde + report** por candidato: *confirmado morto e apagado* / *afinal vivo, mantido* / *precisa decisÃ£o*.
   Lista tambÃ©m o que o knip/ts-prune achou a mais.
> **NÃ£o Ã© teu:** regenerar `route-catalog.json` + manifest/contract do Front (deleÃ§Ãµes de rotas) â€” Ã© do revisor.

### [x] Dead one-off scripts â€” FEITO (2026-08-03)

- Removidos os dezasseis programas top-level nÃ£o registados de `src/scripts/` (1 789 linhas de cÃ³digo-fonte).
  O directÃ³rio top-level ficou vazio; `src/scripts/maintenance/` permaneceu inalterado e contÃ©m exactamente
  `backfill-ac-webhook-receipt-leases.ts` e `ensure-users-v2-indexes.ts`.
- Criado `tests/tooling/registeredScripts.test.ts`: cada `src/scripts/**/*.ts` tem de aparecer como caminho-fonte
  ou caminho compilado em `package.json#scripts`. O RED listou exactamente os dezasseis candidatos; apÃ³s a remoÃ§Ã£o,
  GREEN passou. A mutaÃ§Ã£o `&&`â†’`||` falhou listando os dois programas de maintenance; `&&` foi restaurado e GREEN
  voltou a passar.
- `npm run lint:baseline:prune` removeu apenas as suppressions dos dezasseis ficheiros apagados. Grep negativo dos
  dezasseis caminhos em `src/`, `tests/`, `scripts/` e `package.json`: zero referÃªncias.
- Gates frescos (seriais): `npm run lint` exit 0; `npm run types:check` ratchet 0 erros/0 ficheiros; com
  `MONGOMS_RUNTIME_DOWNLOAD=false`, Jest `161 passed / 1 skipped` suites e `812 passed / 2 skipped` testes; build
  exit 0.
- EvidÃªncia offline: nenhum programa removido foi executado; nenhum Mongo de produÃ§Ã£o nem API externa
  (ActiveCampaign, Discord, Guru, Hotmart ou CursEduca) foi contactado; o egress guard permaneceu activo.

---

## Regras a respeitar (nÃ£o negociÃ¡veis)

1. **Tudo offline.** NUNCA tocar nas APIs reais (Guru, Hotmart, ActiveCampaign, CursEduca, Discord) nem em
   Mongo de produÃ§Ã£o. ConstrÃ³i e testa a fronteira; nÃ£o chames o serviÃ§o real.
2. **Antes de cada bloco:** faz apenas verificaÃ§Ãµes de leitura â€” `git status -sb`, `git branch -vv` e um log curto decorado (`git log --oneline --decorate -5`). Se as histÃ³rias divergirem ou houver suspeita de reescrita, pÃ¡ra e obtÃ©m autorizaÃ§Ã£o explÃ­cita para recuperaÃ§Ã£o. No default offline nÃ£o Ã© necessÃ¡rio `git fetch`.
3. **NÃ£o corras `npm install`.** Se precisares mesmo de uma dependÃªncia nova, **pÃ¡ra e pede ao revisor** â€” ele
   instala e atualiza o Ãºnico lockfile autoritativo (`package-lock.json`) com npm. O `yarn.lock` foi removido e
   Nixpacks usa `npm ci`; mexer apenas no `package.json` sem a correspondente revisÃ£o do lockfile parte o build.
4. **NÃ£o toques** em `scripts/git-hooks/`, `active/URGENT_KEY_REPLACEMENT.md` nem `reference/renewal/RENOVACAO_*.md` â€” sÃ£o de outra
   sessÃ£o de seguranÃ§a.
5. **Fonte Ãºnica.** Reutiliza o que jÃ¡ existe; nÃ£o cries uma segunda cÃ³pia de nada (redaÃ§Ã£o, boundary de
   validaÃ§Ã£o, decisÃ£o de CORS). DivergÃªncia entre duas cÃ³pias Ã© a classe de bug que jÃ¡ mordeu este projeto.
6. **Um assunto por commit.** Conventional Commits, **subject em minÃºscula** (o commitlint rejeita maiÃºscula),
   trailer `Co-Authored-By`. HÃ¡ um secret-scanner no pre-commit; bypass `--no-verify` sÃ³ se for falso positivo.
7. **Nunca desligar uma regra/guarda sem GATILHO escrito** (na config e no commit).
8. Se uma rota exigir uma **decisÃ£o** (formato de param nÃ£o Ã³bvio, semÃ¢ntica destrutiva), **pÃ¡ra e pergunta** â€”
   nÃ£o adivinhes.
9. **Antes de trabalhar num ficheiro, confirma que estÃ¡ VIVO.** Repetidamente encontrÃ¡mos cÃ³digo morto/duplicado
   (reengagement V1, ogiCourse, `calculateHotmartProgressLegacy`, `syncComplete`, `getDashboardStatsV3Legacy`). NÃ£o
   gastes esforÃ§o a tipar/arranjar cÃ³digo que ninguÃ©m usa. **Ao tocar num ficheiro, verifica:** Ã© importado/montado
   em `src/` (incluindo `registerRoutes.ts`)? HÃ¡ uma 2Âª cÃ³pia da mesma funÃ§Ã£o/rota? Ã‰ uma versÃ£o `Legacy`/`V1`
   superseded, ou um stub que devolve dados hardcoded? Se cheirar a morto/duplicado â†’ **pÃ¡ra, prova com um grep, e
   reporta** em vez de o "arranjar". Apagar lixo confirmado vale mais que tipar um fantasma.

## Gate (verde antes de reportar)

```bash
npm run lint            # exit 0. NUNCA --pass-on-unpruned-suppressions
npm run types:check     # direct tsc --noEmit --pretty false; exit 0 with zero diagnostics
npx jest --ci           # verde, egress guard ativo
npm run build           # exit 0
```

A regeneraÃ§Ã£o do manifest de rotas e o contract test correm no Front â€” **isso Ã© do revisor**, nÃ£o teu.

---

## âœ… F3.1 â€” SEC-09 (validaÃ§Ã£o de input nas rotas destrutivas) â€” **FECHADA (39/39)**

**ConcluÃ­da 2026-07-17.** As 39 rotas destrutivas tÃªm boundary strict (37 wrappers `withValidatedInput` em 16
ficheiros â€” cron-tags cobre 4 rotas via 2 montagens duplas). Gate final validado pelo revisor: lint 0,
ratchet **178/44**, jest **249 passed / 2 skipped**, build exit 0. As 3 variantes da armadilha cobertas
(path param, body `actor`, query `days`) e os 2 params string-key (`classId`, `code`) preservados como negÃ³cio.
**Fase atual passa a F3.2 (ver "A seguir").**

### Registo do boundary (referÃªncia para o padrÃ£o)

Boundary aprovado: usa `withValidatedInput(schema, handler)` + `validatedSchema({ params, query, body })`
(o builder aplica `.strict()` sozinho â€” dÃ¡s sÃ³ as *shapes*). Controllers recebem o **DTO inferido**, nunca
`req.body/params/query` crus.

**Por rota, 3 testes:** (a) DTO vÃ¡lido chega ao handler; (b) campo extra (`role`) â†’ **400** sem chamar o
handler; (c) operador NoSQL aninhado (`$where` / `__proto__`) â†’ **400**.

### ðŸ”´ A armadilha (vale para quase todas as que faltam)

Muitas rotas tÃªm **path params** (`:id`, `:productId`, `:year/:month`, `:key`, `:code`, `:userId`, `:classId`).
O `validatedSchema` faz `params.strict()` â€” se deixares `params: {}`, o `.strict()` **dÃ¡ 400 a TODOS os pedidos
vÃ¡lidos** porque `req.params` traz o param. **Modela cada param na shape** (ex.: `id: z.string()`) e **prova com
um teste** que o param real chega ao handler (nÃ£o 400). O padrÃ£o jÃ¡ estÃ¡ feito nas Users com `:id`.

### Progresso das 39 rotas destrutivas (um commit por famÃ­lia)

- [x] **Users (6)** â€” feito (`48bdc2f`)
- [x] **cron-tags (4)** â€” feito (`0f76dc6`); as duas montagens (`/api/cron-tags` e `/cron-tags`) cobertas
- [x] **activecampaign (5)** â€” feito (`1fac3cf`); params `:id`/`:productId` modelados como ObjectId, validado pelo revisor
- [x] **guru (4)** â€” feito (`c42800f`); `:year`/`:month` modelados, `asyncRoute`â†’`withValidatedInput`, validado pelo revisor
- [x] **discord-renewal (4)** â€” feito (`dcbee9d`); handlers inline migrados, `:key` modelado, `actor` preservado
  via param explÃ­cito no `actor()` refactorado, validado pelo revisor (Front sempre envia `mentionRoleIds`)
- [x] **cron (3)** â€” feito (`4730cd7`); `:id` ObjectId, sem wrapperâ†’`withValidatedInput`, checks internos mantidos, validado pelo revisor
- [x] **renewal-ac (2)** â€” feito (`2698421`); inline migrados, `:id` ObjectId (confirmado `findById`), `actor` preservado nas duas, validado pelo revisor
- [x] **sync (2)** â€” feito (`9435038`); query `days` modelado (variante query da armadilha), default 90 preservado, negativos `?days=abc`/`?foo=1` provados, validado pelo revisor
- [x] **tag-monitoring (2)** â€” feito (`9d3970e`); `authenticate` preservado antes do boundary, `:id` ObjectId, mock do authenticate no teste, validado pelo revisor
- **â†“ PRÃ“XIMO BLOCO: as 7 famÃ­lias singleton (ver formatos verificados abaixo) â†“**

#### ðŸ”´ As 7 singleton finais â€” formatos de param JÃ VERIFICADOS pelo revisor (nÃ£o adivinhes)

> **Podem ir numa sÃ³ sessÃ£o, mas mantÃ©m 1 commit por famÃ­lia** (gate + revisÃ£o por famÃ­lia). AtenÃ§Ã£o: **2
> destes params NÃƒO sÃ£o ObjectId** â€” sÃ£o chaves de negÃ³cio (string). Modelar como ObjectId dÃ¡ 400 a tudo.

- [x] **classes (1)** â€” feito (`ba429c9`); `:classId` string de negÃ³cio preservada
- [x] **product-profiles (1)** â€” feito (`ab9e5c6`); `:code` string + query `hardDelete`
- [x] **events (1)** â€” feito (`a489d61`); `:id` ObjectId, handler inline migrado
- [x] **reengagement (1)** â€” feito (`682985b`); `:userId` ObjectId + body `{ productCode, dryRun? }`
- [x] **testimonials (1)** â€” feito (`470cb06`); `:id` ObjectId
- [x] **curseduca (1)** â€” feito (`44cf6a5`); stub 501, empty input
- [x] **test (1)** â€” feito (`f6486f8`); body `{ email }`; **`localDebugOnly` confirmado no mount** (`runtime/registerRoutes.ts:42`)

> âš ï¸ Todos validados pelo revisor contra o cÃ³digo. F3.1 fechada.

---

## âœ… F3.2 â€” ARCH-05 (paginaÃ§Ã£o) â€” **FECHADA (2026-07-18)**

ConcluÃ­da em 3 passos: helper puro (`446b3e0`) â†’ listas backend-only (`a7886e8`) â†’ telas Guru
(webhooks `7c0aed9` + subscriptions par back `2a01ca3`/front `cf9c080`). Caps de 10 000 eliminados sem partir
funcionalidade (export por paginaÃ§Ã£o + sort server-side). BÃ³nus: 4 extraÃ§Ãµes para controllers pequenos
testÃ¡veis (ARCH-02) e 3 prunes `no-console`. **Fase atual passa a F3.3.**

**Objetivo:** um **helper Ãºnico** de paginaÃ§Ã£o (fonte Ãºnica â€” regra 5), offset agora + cursor como evoluÃ§Ã£o
aditiva depois. Eliminar caps insanos (`limit=10000`) e `find({})` cru **sem partir funcionalidade viva**.

**DecisÃ£o aprovada pelo utilizador (2026-07-18):** offset `defaultLimit=50` / teto absoluto `200`, cursor
aditivo mais tarde. Mas o **clamp isolado no backend PARTE o Front** â€” o revisor verificou contra o cÃ³digo
(abaixo). Por isso a fase entrega-se em 3 passos, e as 2 telas Guru sÃ£o **mudanÃ§a emparelhada Front+Back**.

### âš ï¸ O que o revisor JÃ verificou no Front (nÃ£o repetir a anÃ¡lise, agir sobre ela)

As telas Guru jÃ¡ tÃªm **paginaÃ§Ã£o, filtros (status/email/data) e re-fetch server-side wired**; o `limit:10000`
(`Front/src/features/guru/hooks/useGuruCore.ts:8`) sÃ³ faz uma "pÃ¡gina gigante" que esconde os controlos.
**Clamp a 200 Ã© seguro para a tabela + filtros + paginaÃ§Ã£o.** MAS duas operaÃ§Ãµes correm sobre o **array
carregado inteiro** e clamp cego parte-as em silÃªncio:
- **Export CSV** (`Front/src/pages/guru/GuruDashboard.tsx:397` â†’ `downloadCSV(sortedSubscriptions, â€¦)`): hoje
  exporta tudo; com 200 exportaria **sÃ³ 200 linhas** â†’ perda de dados.
- **Sort global** (`GuruDashboard.tsx:226`, `sortedSubscriptions` Ã© `useMemo` client-side; `toggleSort` **nÃ£o**
  re-fetcha): hoje ordena o conjunto; com 200 ordenaria **sÃ³ a pÃ¡gina**.
- `rawData`/`__v`: **verificado que o Front NUNCA os lÃª** (`grep rawData Front/src` = 0) â†’ excluir da projeÃ§Ã£o
  webhooks Ã© seguro e desejÃ¡vel (`rawData` Ã© o campo pesado).

### Passo 1 â€” helper puro + testes (backend, nÃ£o muda comportamento) â€” âœ… FEITO (`446b3e0`)
- [x] `src/utils/pagination.ts`: `paginate({ page, limit }, { defaultLimit=50, maxLimit=200 })` â†’
  `{ page, limit, skip, metadata(total) â†’ { page, limit, total, pages } }`. **Puro** (sem Express/Mongoose).
  InvÃ¡lidos â†’ default; fora do intervalo â†’ clamp; teto absoluto 200 **inultrapassÃ¡vel** (provado com teste
  `maxLimit:10000`â†’200). Substituiu a `PaginationHelper` legada (cÃ³digo morto) e o cap conflituoso `MAX_LIMIT:100`
  de `config/constants.ts` (revisor confirmou: nada consumia nenhum dos dois). Validado: lint 0, ratchet 178/44,
  7 testes, full jest 256/2 skipped.

### Passo 2 â€” listas backend-only (seguras, sem Front) â† **EM CURSO**

**ClassificaÃ§Ã£o dos 18 `find({})` (Codex 2026-07-18, revisor confirmou):**
- **Paginar (listagem HTTP sem consumidor "carregar tudo"):** `users.controller.ts:1722` (`getIdsDiferentes`)
  e `:1798` (`getUnmatchedUsers`). Revisor confirmou: **Front tem 0 chamadas vivas** a estes paths
  (`grep idsDiferentes|unmatchedUsers Front/src` = 0; catÃ¡logo `consumer:front` estÃ¡ **stale**). Ambos os
  modelos tÃªm `detectedAt` **com Ã­ndice** â†’ sort `{ detectedAt: -1, _id: -1 }` Ã© estÃ¡vel **e** index-backed.
  â†’ **1Âº commit do Passo 2 (aprovado).**
- **NÃƒO paginar â€” full-scan interno (cursor/batch, nunca `.limit(200)`):**
  `services/analytics/analyticsCache.service.ts:288` (melhor â†’ agregaÃ§Ã£o/count no Mongo),
  `services/renewal/discordRolesSync.service.ts:203` (reconciliaÃ§Ã£o â€” preservar deteÃ§Ã£o de remoÃ§Ãµes),
  `services/renewal/discordScheduledMessages.service.ts:138`, `services/renewal/renewalPerformance.service.ts:78`,
  `services/syncUtilizadoresServices/hotmartServices/classesService.ts:532`.
- **NÃƒO paginar â€” full-set de config/cÃ¡lculo (Front consome o todo, ou nÃ£o Ã© a lista devolvida):**
  `cronManagement.controller.ts:46` (`/cron/jobs` legacy completo), `routes/discordRenewal.routes.ts:115`
  (templates), `services/renewal/discordScheduledMessages.service.ts:212` (estado UI), `routes/users.routes.ts:241`
  (revisor confirmou: alimenta o cÃ¡lculo de `/v2/engagement/comparison`, **nÃ£o** Ã© a lista de resposta).
- **Falsos positivos (jÃ¡ limitados):** `populateHistory.controller.ts:328` (`.limit(limit)` def 100),
  `contactTagReader.service.ts:264` (batch def 100),
  `routes/discordRenewal.routes.ts:163` (def 20, mÃ¡x 100).

**Regras do commit:** sort estÃ¡vel (`_id` desempate), projeÃ§Ã£o **explÃ­cita** com todos os campos atuais (inclui
`_id`/timestamps/`__v` â€” nÃ£o reduzir contrato), `{ idsDiferentes }`/`{ unmatchedUsers }` preservados + campo
`pagination` aditivo, `countDocuments({})`. Testes: defaults, clamp `10000â†’200`, ordenaÃ§Ã£o, projeÃ§Ã£o, envelope.

- [x] 1Âº commit: as 2 listagens de `users.controller.ts` â€” feito (`a7886e8`). Handlers **extraÃ­dos** para
  `usersReviewLists.controller.ts` (re-export mantÃ©m as rotas; mini-ARCH-02). Revisor confirmou **campo-a-campo**
  contra os 2 modelos que as projeÃ§Ãµes sÃ£o completas (0 reduÃ§Ã£o de contrato); sort index-backed; clamp
  `10000â†’200` provado; envelope + `pagination` aditivo. Gate: lint 0, ratchet 178/44, jest 258/2 skipped.
- [x] **NÃ£o hÃ¡ mais listagens HTTP puras** na classificaÃ§Ã£o â†’ Passo 2 esgotado. Segue o Passo 3.

### Passo 3 â€” telas Guru. **O revisor mapeou os 2 lados; o risco divide-se em 3a (seguro) e 3b (delicado).**

> Contexto verificado pelo revisor (2026-07-18), agir sobre isto:
> - Ambos os controllers **jÃ¡ devolvem** `pagination:{page,limit,total,pages}` â€” igual ao `paginationSchema` do
>   Front. Logo `helper.metadata(total)` encaixa **sem mudar envelope**.
> - **Webhooks NÃƒO tem consumidor vivo:** o hook `useGuruWebhooks` estÃ¡ **Ã³rfÃ£o** (nÃ£o hÃ¡ tab webhooks â€”
>   `GuruTab = 'overview'|'churn'|'sync'|'subscriptions'`; nenhum componente o importa). Sem UI = sem break
>   client-side possÃ­vel. â†’ **backend-only, seguro.**
> - **SÃ³ subscriptions Ã© o par real:** tem export CSV (`GuruDashboard.tsx:397`) e sort client-side
>   (`GuruDashboard.tsx:226`, `useMemo`; `toggleSort:289` nÃ£o re-fetcha).

#### Passo 3a â€” webhooks (backend-only, seguro, SEM Front) â€” âœ… FEITO (`7c0aed9`)
- [x] `listGuruWebhooks` **extraÃ­do** para `guruWebhookList.controller.ts` (re-export mantÃ©m a rota; mini-ARCH-02).
  Clamp 50/200 via helper; sort `{ receivedAt: -1, _id: -1 }`; `.select('_id email event status processed receivedAt')`
  (os 6 campos do schema estrito). BÃ³nus: `console.error`â†’`logger.error` (baseline `no-console` 19â†’18, pruned).
- [x] Contract test com **Mongo efÃ©mero** (nÃ£o mock): insere 205 docs com `rawData:{token}`+`__v`, prova
  `limit=10000`â†’200/`pages:2`, sort `_id` desc estÃ¡vel, e **`rawData`/`__v` ausentes** (prova negativa real de
  nÃ£o-fuga). Gate: lint 0, ratchet 178/44, jest 259/2 skipped. Validado pelo revisor.

#### Passo 3b â€” subscriptions (par Front+Back) â€” âœ… FEITO (back `2a01ca3` / front `cf9c080`)
- [x] **Backend** `2a01ca3`: `listSubscriptions` **extraÃ­do** para `guruSubscriptionList.controller.ts` (factory
  com DI `createListSubscriptions({model})`, re-export mantÃ©m a rota). Clamp helper; `.select('email name guru')`
  mantido; sort server-side com o mapa exacto + `_id` desempate; **4 Ã­ndices parciais compostos** em `user.ts`
  (`{campo:1,_id:1}` com `partialFilterExpression:{guru:{$exists:true}}` â†’ index-backed, resolve o teto 32MB).
  Prune `no-console` 14â†’13 (consoleâ†’logger). Suite Mongo efÃ©mero **10/10** incl. "sort desc sem duplicar/perder
  entre pÃ¡ginas". Gate: lint 0, ratchet 178/44, jest 269/2 skipped.
- [x] **Front** `cf9c080`: removido `defaultLimit=10_000` (â†’ `fallbackLimit=50`); `sortedSubscriptions` useMemo
  **removido**; `toggleSort` re-fetcha server-side; `useGuruSubscriptions({limit:50, sortField, sortDirection})`;
  **`fetchAllSubscriptions`** percorre pÃ¡ginas a 200 respeitando filtros+sort; export = `downloadCSV(await
  fetchAllSubscriptions())`. Contract test prova: export traz **405/405 Ãºnicos**, chama pÃ¡g 1/2/3 a limit 200,
  e **`not.toHaveBeenCalledWith({limit:10_000})`**. Front: **893/893**, lint 0, Vite build verde.
  (Nota: prettier `--check` global fica vermelho por **92 ficheiros preexistentes**; os tocados passam â€” dÃ­vida
  separada, nÃ£o regressÃ£o desta entrega.)

**Regra da fase (cumprida):** correcÃ§Ã£o antes de elegÃ¢ncia; provas negativas dos dois lados; gate verde.

## âœ… F3.3 â€” moagem TS **FECHADA: ratchet 0/0** (2026-07-18)

`npx tsc --noEmit` = **0 erros** (verdade crua, verificado pelo revisor). 178â†’0 por mÃ³dulo/ficheiro, **sem 1 Ãºnico
`any`/cast/suppression** â€” o revisor injectou-testou cada bloco. Pelo caminho: **18 bugs reais** corrigidos (campos
fantasma, schema strict a descartar campos, mÃ©todos/exports inexistentes escondidos por `as any` e engolidos por
`catch`, `$ne` duplicado, misclassificaÃ§Ã£o discord, etc.), **7 blocos de cÃ³digo morto/duplicado** eliminados
(reengagement, ogiCourse, dashboard-legacy, 7 mÃ©todos cron, 2 rotas shadowed, 4 reads AC, handlers soltos), e **1
mentira do UI** transformada em preview real. Ãšltimos 5: `90281fc`(webhook), `9036413`(migraÃ§Ã£o morta),
`ff42326`(bug16 subdomain), `c8e3b73`(bug17 engagement fora do schema), `ad4a312`(bug18 UserHistory sempre vazio).

### âœ… TOOL-01 FECHADO â€” falso-verde morto (`e625691`)
`build` passou de `tsc || exit 0` â†’ `tsc`; `noEmitOnError:false â†’ true`. **Prova negativa:** build com erro TS
injectado devolve **exit 1** (limpo exit 0). Gotcha resolvido: `noEmitOnError:true` quebrava o **ts-jest** (recusava
emitir ficheiros de teste com folga de tipos, fora do ratchet) â†’ criado `tsconfig.jest.json` (extends principal,
`noEmitOnError:false`) sÃ³ para o ts-jest; jest volta a 294/2, build fica estrito. **A dÃ­vida TS nÃ£o pode voltar sem
falhar o build.**

### â–¶ PRÃ“XIMO: **activar `strict` â€” 1 bloco de 22 erros** (medido pelo revisor 2026-07-18)
Surpresa boa: o `strict:true` completo dÃ¡ **sÃ³ 22 erros** (com `strictNullChecks` a inferÃªncia resolve muitos
`noImplicitAny`; por isso o total Ã© < que as flags isoladas). As 5 flags sem custo (`strictFunctionTypes`,
`strictBindCallApply`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`) = **0 erros**, vÃªm de borla.
DistribuiÃ§Ã£o dos 22: **controllers 10 Â· services 9 Â· models 2 Â· security 1**. CÃ³digos: TS7006 (param implicit any) 7 Â·
TS2322 5 Â· TS2339 3 Â· **TS18048 (possibly undefined) 3** Â· TS7053/TS2783/TS2352/TS2345 (1 cada).

- [x] **`strict:true` ACTIVADO** (`e36e6c1`). Flip + 22 fixes (controllers/services/models/security) com guards/tipos
  reais â€” revisor confirmou por grep: **0 non-null (`!`), 0 casts, 0 any**. `tsc --noEmit` = 0 sob strict; jest 297/2;
  build 0. `eslint no-explicit-any` fica off (comentÃ¡rio actualizado, migraÃ§Ã£o ratcheted separada). `tsconfig.jest.json`
  herda strict via extends (suites verdes). Committado pelo revisor (sandbox do Codex bateu num lock).

### â–¶ PRÃ“XIMO: **moer `no-explicit-any`** â€” ratchet ligado (`9d5d0de`)
Rule `@typescript-eslint/no-explicit-any` agora `error` + baseline de suppressions nativo. **Novo `any` falha o lint**
(provado). Medido pelo revisor (2026-07-18): **1880 violaÃ§Ãµes em 184 ficheiros** â€” controllers 808 Â· services 766 Â·
scripts 111 Â· models 60 Â· utils 50 Â· routes 41 Â· jobs 32 Â· types 10. Top: `users.controller` 108 Â· `classes` 72 Â·
`universalSyncService` 72 Â· `guruSync` 65 Â· `guru.inactivation`/`testimonials` 46 Â· `hotmart.controller` 43 Â· `clarezaFmpService` 42.

**DistribuiÃ§Ã£o actual (revisor, do baseline, 2026-07-18): 1628 em 181 ficheiros** â€” services 694 Â· controllers 628 Â·
scripts 111 Â· models 60 Â· utils 50 Â· routes 41 Â· jobs 32 Â· types 10. **Top:** `guru/guruSync.service` 65 Â·
`guru.inactivation.controller` 46 Â· `testimonials.controller` 46 Â· `syncUtiliz/hotmart.controller` 43 Â·
`clareza/clarezaFmpService` 42 Â· `acTags/activecampaign.controller` 41 Â· `syncUtiliz/curseduca.controller` 40 Â·
`clareza/clarezaRaioxService` 37 Â· `guru.analytics.controller` 33 Â· `analytics/analyticsCalculator` 31 Â·
`cron/dailyPipeline` 26 Â· `activeCampaign/decisionEngine` 23 Â· `guru/crossReference` 22 Â· `curseduca.adapter` 22.
> Para contar o restante: **lÃª o `eslint-suppressions.json`** (o `--rule` jÃ¡ nÃ£o forÃ§a nada â€” a rule estÃ¡ `error` e
> as suppressions aplicam-se, logo o eslint reporta 0). **Prioriza runtime** (services/controllers) sobre `scripts/` (111).

**Moagem (blocos mÃ©dio-grandes, maiores primeiro):** por ficheiro (os grandes 1 commit cada; agrupa 3-5 pequenos).
Por commit: substitui `any` pelo **tipo real** (onde for genuinamente dinÃ¢mico, `unknown` + narrowing, **nÃ£o** outro cast);
`npm run lint:baseline:prune` (remove as suppressions jÃ¡ resolvidas); `npm run lint` verde; corpo com a queda
(`no-explicit-any 1880â†’N`). Golden rule: substituir `any` pode **revelar bugs** (o tipo real expÃµe mismatches) â€” corrige
ou pergunta. Alguns `any` sÃ£o intratÃ¡veis (dados dinÃ¢micos) â†’ deixa suprimidos, o ratchet aceita residual. Ã‰ grind longo
(pode atravessar sessÃµes); o **valor principal jÃ¡ estÃ¡ capturado** (nÃ£o entram `any` novos).

Progresso moagem:
- [x] **users.controller (108â†’0)** â€” feito (`a9861fb`). `any` â†’ interfaces reais (`discordIds:string[]`â€¦) + `unknown`
  com narrowing (revisor: **0 casts** adicionados). `getUsersInfinite` re-tipado (vivo); 3 handlers mortos removidos
  (clearUsersCache/warmupUsersCache/createUser â€” sem refs, sem rota, 0 impacto catÃ¡logo). Bugs corrigidos (student
  stats/Discord IDs/engagement) com teste. Baseline **1880â†’1772**. Gate verde.

- [x] **classes.controller (72â†’0)** â€” feito (`aff32fe`). `any`â†’tipos reais, 0 casts. **Bug real:** activaÃ§Ã£o/inactivaÃ§Ã£o
  escrevia/lia o campo fantasma `estado` ('ativo'/'inativo') â€” descartado pelo schema strict â†’ status nunca persistia;
  agora `'combined.status'`/`'hotmart.status'` canÃ³nicos (classe recorrente de bug). TDD test. Baseline **1772â†’1700**. Gate verde.

- [x] **universalSyncService (1700â†’1628)** â€” feito (`5a34d2a`). Tipos reais, 0 casts. Extraiu helper canÃ³nico
  `buildCanonicalActiveUserStatusUpdate()` (sÃ³ escreve campos do schema, nunca `status`/`estado` fantasmas) + teste.

- [x] **universalSyncService DISSOLVIDO (ficheiro apagado)** â€” missÃ£o terminal concluÃ­da. O monÃ³lito foi partido
  verticalmente em `src/services/syncUtilizadoresServices/universalSync/*` (characterization-first, 100% offline via
  MongoMemoryServer): `fieldUtils`, `productsCache`, `hotmartExpiration`,
  `engagement/engagementMetrics`, builders puros `builders/hotmartMutationPlan` + `builders/curseducaMutationPlan`
  (item+estado â†’ plano explÃ­cito, sem I/O), `debugLog`, `canonicalUserStatus`, `processSyncItem` (use case por item),
  `executeUniversalSync` (orquestraÃ§Ã£o) e o barril `index.ts`. O ramo Discord do universal sync provou-se **morto**
  (regra #9) e foi removido; `UniversalSyncType` Ã© agora uniÃ£o fechada `'hotmart' | 'curseduca'`. Todos os consumidores
  (sync/curseduca/hotmart controllers, cron dailyPipeline/scheduler, recalculate-engagement-metrics) e testes passaram
  a importar de `.../universalSync`; `universalSyncService.ts` ficou sem importadores e foi **apagado**. Gate final
  verde: lint 0, types 0, `MONGOMS_RUNTIME_DOWNLOAD=false npm test` 225 suites/1302 testes, build 0, diff limpo.

---

## ðŸ”Ž CursEduca / UserProduct â€” desenho VALIDADO + o que estÃ¡ partido (revisor 2026-07-18)

**Validado contra o cÃ³digo (o desenho do utilizador estÃ¡ correcto e funciona):**
- **InactivaÃ§Ã£o Ã© POR PRODUTO**, nÃ£o por user âœ…
  - *Inativar turmas (Hotmart/OGI)* â€” `classes.controller:1409-1412` faz `UserProduct â€¦ { $set: { status: 'INACTIVE' } }` + actualiza agregados no User (`combined.status`, `hotmart.status`).
  - *Guru â†’ CursEduca* â€” `guru.inactivation.controller` opera sobre `UserProduct` (status **`PARA_INATIVAR`** como staging) e **jÃ¡ dedupÂ­lica mÃºltiplos UserProducts do mesmo membro** (mudanÃ§a de plano mensal/anual, linha 81).
- Logo o `UserProduct.status: 'ACTIVE'` hardcoded (`universalSyncService:2242`) estÃ¡ no caminho de **criaÃ§Ã£o** e Ã© um **default aceitÃ¡vel** â€” o dono do status sÃ£o os fluxos de inactivaÃ§Ã£o, nÃ£o o sync. **NÃ£o Ã© bug** (alarme do revisor retirado).
- Assessment canÃ³nico correcto existe: `curseduca.memberStatus` derivado do `situation` (`universalSyncService:1558`).

**O que ESTÃ partido â€” a cÃ³pia denormalizada `User.curseduca.enrolledClasses`:**
1. `isActive` **hardcoded `true`** (linhas 1496 e 1527) â€” nunca reflecte o `situation`/status do produto.
2. **Overwrite:** sem `allCurseducaGroups` (nunca produzido pelo adapter), cai no fallback que faz
   `enrolledClasses = [umaTurma]` por item â†’ num aluno com 2 matrÃ­culas fica **sÃ³ a Ãºltima processada (a mais antiga)**.
3. O `classes.controller` lista alunos da turma **por essa cÃ³pia** (`$elemMatch: { curseducaId, isActive: true }`)
   em vez do `UserProduct`, que Ã© a fonte de verdade. â†’ aluno aparece na turma errada e **falta** na certa.

### â–¶ FIX A (agora, contido e seguro) â€” corrigir a cÃ³pia
- `isActive` **derivado** (reutilizar a lÃ³gica canÃ³nica da 1558: `situation` INACTIVE/SUSPENDED â†’ inactivo), nos **dois** ramos (1496 e 1527). Nunca hardcoded.
- âš ï¸ **CORRECÃ‡ÃƒO Ã  spec inicial do revisor (Codex apanhou, 2026-07-18):** colapsar Nâ†’1 itens **partiria o sync dos
  UserProducts** â€” o serviÃ§o processa **1 item de cada vez** (`universalSyncService:461-462`) e faz **um upsert de
  UserProduct por item** (2116/2299). Com 1 item sÃ³, as matrÃ­culas secundÃ¡rias deixavam de ser sincronizadas.
- **Variante correcta (aprovada):** manter os **N itens** e anexar a **cada um** o mesmo `allCurseducaGroups`
  agregado por utilizador. Assim: todos os UserProducts continuam sincronizados; cada item escreve a **mesma lista
  completa** em `enrolledClasses` â†’ o overwrite torna-se **idempotente** (a ordem deixa de importar);
  `isPrimary`/`isDuplicate`/`duplicateCount`/logs mantÃªm-se intactos (continuam a existir N itens).
- Testes: 1 matrÃ­cula (inalterado); 2 matrÃ­culas com sÃ³ uma activa (**sÃ³ a activa fica `isActive: true`**); duplicados continuam sinalizados.

- [x] **FIX A FEITO** (`d05d40b`). Novo helper `curseducaMemberships.ts`: agrega as matrÃ­culas por utilizador e
  **anexa a mesma lista completa a cada um dos N itens** (cardinalidade intacta â†’ UserProducts continuam todos a
  sincronizar); `isCurseducaEnrollmentActive(situation)` deriva `isActive` (`INACTIVE`/`SUSPENDED` â†’ inactivo).
  Revisor confirmou por teste: `toHaveLength(2)` (nÃ£o colapsa), `result[0].allCurseducaGroups === result[1]â€¦`
  (**idempotente**), situations reais preservadas, `isPrimary`/`isDuplicate` intactos, derivaÃ§Ã£o nÃ£o invertida.
  `classes.controller` e fluxos de inactivaÃ§Ã£o **nÃ£o tocados**. Gate: lint 0, tsc 0, jest 305/2, build 0.

### â–¶ FIX B (bloco estrutural seguinte) â€” listagem por `UserProduct`, matar a duplicaÃ§Ã£o

**Viabilidade confirmada pelo revisor (2026-07-18):** para CursEduca, `UserProduct.classes[].classId =
String(item.groupId)` (`universalSyncService:2124-2125`) â€” **o mesmo valor** de `enrolledClasses[].curseducaId`.
A troca de query mapeia 1:1. E o modelo Ã© mais correcto: **1 UserProduct por matrÃ­cula**, cada um com a sua turma
(`classes: [{classId}]`, linha 2132) e o seu **`status` prÃ³prio** (dono = os fluxos de inactivaÃ§Ã£o, jÃ¡ validados).

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
- âš ï¸ **Preservar sort/paginaÃ§Ã£o/shape da resposta.** Recomendado **2 passos**: `UserProduct` â†’ recolher `userId`s â†’
  `User.find({ _id: { $in: userIds } }).sort(sortObj).limit(...)`. Assim o sort/limit continuam sobre campos de User
  (mudar para sort sobre populate Ã© armadilha no Mongo) e o payload devolvido nÃ£o muda.
- `includeInactive` passa a filtrar pelo **`status` da matrÃ­cula** (mais correcto que o `memberStatus` do utilizador).
- **SÃ³ o ramo `curseduca_sync`.** O ramo Hotmart usa `classId` top-level no User (outra cÃ³pia denormalizada) â€” Ã©
  limpeza separada (B2), **fora deste bloco**.
- **Characterization tests obrigatÃ³rios:** semear dados (aluno com 1 matrÃ­cula; aluno com 2 onde sÃ³ uma Ã© activa;
  aluno inactivo) e provar que a lista devolvida Ã© **igual ou mais correcta** que a antiga, incluindo sort e limite.
- SÃ³ depois de verde Ã© que `enrolledClasses` deixa de ser fonte de verdade (pode ficar como cache; remover Ã© ARCH-03).
- [x] **FIX B FEITO** (`db0d9c3`). Ramo `curseduca_sync` passa a `UserProduct.find({ platform:'curseduca',
  'classes.classId', status })` â†’ `.select('userId').lean()` â†’ `User.find({_id:{$in:userIds}})` com o sort/limit
  existentes (2 passos, como especificado). `includeInactive` filtra pelo **status da matrÃ­cula**. Revisor confirmou:
  `platform` presente (sem colisÃ£o Hotmart), ramo Hotmart e `enrolledClasses` **intocados**, 3 characterization tests
  (lista por UserProduct Â· filtra por status de cada matrÃ­cula Â· preserva sort/limite/envelope). Gate: lint 0, tsc 0,
  jest 308/2, build 0.

### âŒ B2 (Hotmart) â€” INVESTIGADO E DESCARTADO (revisor 2026-07-18). **NÃ£o fazer.**
Trocar a listagem Hotmart para `UserProduct.classes` seria **regressÃ£o**, nÃ£o limpeza:
- `User.classId` (top-level) **Ã© a turma actual e Ã© activamente mantida** pelo sync (`universalSyncService:1279,
  1305, 1410, 1672`) e pelo fluxo de movimento â†’ a listagem actual (`classes.controller`, ramo `else`) **jÃ¡ lÃª a
  fonte certa**, que reflecte a Hotmart (como o desenho pretende: 1 turma actual).
- `UserProduct.classes` para Hotmart **acumula** turmas e **nunca** escreve `leftAt` (`universalSyncService:1989-2000`
  faz append com `leftAt: null` e nÃ£o fecha a anterior) â†’ uma query por `classes.classId` devolveria alunos de
  turmas **antigas**.
- O histÃ³rico de movimentos vive no `StudentClassHistory` (colecÃ§Ã£o prÃ³pria), nÃ£o no `classes[]`.
**DiferenÃ§a-chave vs CursEduca:** lÃ¡ havia uma cÃ³pia denormalizada a mentir; aqui a listagem jÃ¡ usa o campo correcto.

**DÃ­vida latente (nÃ£o urgente):** `getCurrentClass()` (`UserProduct.ts:424`, `classes.find(c => !c.leftAt)`) e
`isFullyLeft()` (429) sÃ£o **dormentes** (0 usos fora do modelo) e dariam respostas **erradas** se usados, porque o
`leftAt` nunca Ã© escrito. Escolha futura: ou passar a fechar a matrÃ­cula anterior (`leftAt`) no movimento, ou
**remover os mÃ©todos mortos** (regra #9). NÃ£o bloqueia nada hoje.

**Fica em fila:** remover o `enrolledClasses` como fonte quando estabilizar (ARCH-03) Â· moagem `no-explicit-any` (1628).

- [x] **guruSync.service + guru.inactivation.controller (1628â†’1517, âˆ’111)** â€” feito (`af745ea`, `716dd76`).
  0 casts/any novos. **Escrita fantasma removida:** `guru.totalSubscriptions` **nÃ£o existe no schema** (era
  descartada pelo strict). **Ramo `PARA_INATIVAR` morto removido** â€” revisor **verificou a alcanÃ§abilidade**: o loop
  faz `if (status === 'PARA_INATIVAR') { alreadyMarked++; continue }` **antes** do bloco de protecÃ§Ã£o, logo o ramo
  interno nunca podia disparar. âš ï¸ A **PROTECÃ‡ÃƒO sobrevive intacta** (`hasActiveSub` â†’ `skipped++` + `continue`,
  protege mudanÃ§as Mensalâ†’Anual) e o `(sub as any)` virou tipagem real. Gate: lint 0, tsc 0, jest 308/2, build 0.

- [x] **testimonials + hotmart.controller (1517â†’1428, âˆ’89)** â€” feito (`319b0e4`, `75153d5`). 0 casts/any novos.
  Leitura fantasma `Product.slug` removida (nÃ£o existe no schema). **Bug real (buraco de auditoria):**
  `(req as any).user?._id` â€” o **cast escondia** que o auth fornece `req.user.id` (confirmado em
  `auth.middleware:13,45,51`), logo `triggeredByUser` era **sempre `undefined`** (nunca se soube que admin
  accionou cada sync Hotmart). Corrigido nos 2 sÃ­tios + teste RED/GREEN. Gate: lint 0, tsc 0, jest 309/2, build 0.

- [x] **clarezaFmpService + activecampaign.controller (1428â†’1345, âˆ’83)** â€” feito (`e3fdf0d`, `0a8bca7`).
  0 casts/any novos. Previews Clareza/OGI verificados intactos: `evaluateAllUsersOfProduct(id, true)` mantÃ©m o
  **`dryRun=true`** (o preview continua read-only â€” era o risco maior desta passagem). Guarda `if (!user.email)`
  real (utilizadores sem email jÃ¡ nÃ£o geram chamadas invÃ¡lidas Ã  AC). **Bug real (progresso sempre 0):**
  `up.progress?.progressPercentage` lia um nÃ­vel fundo demais â€” em `UserProduct.IProgress` o campo de topo Ã©
  `percentage`; `progressPercentage` sÃ³ existe **dentro de `modulesList[]`** (por mÃ³dulo). Corrigido para
  `up.progress?.percentage`. *Nota de review: o report atribuiu este bug ao `e3fdf0d` (clarezaFmpService), mas
  esse serviÃ§o Ã© Financial Modeling Prep (dados de bolsa) â€” o fix estÃ¡ no `0a8bca7`.*

**Mesma classe de bug ainda VIVA (prioridade para o prÃ³ximo bloco) â€” campo fantasma `progress.progressPercentage`
em `UserProduct`:**
1. `dashboard.controller.ts:32-34` â€” `matchStage['progress.progressPercentage']` num `UserProduct.aggregate`:
   o filtro `progressMin`/`progressMax` **nunca filtra** (path inexistente). Linha 69: `avgProgress: { $avg:
   '$progress.progressPercentage' }` â†’ **mÃ©dia sempre nula/0**. Deve ser `progress.percentage`.
2. `activecampaign.controller.ts:1134` â€” `UserProduct.create({ status: 'active', progress: { progressPercentage: 0 } })`:
   escreve campo fantasma e **nunca pÃµe `percentage`** (obrigatÃ³rio em `IProgress`). AlÃ©m disso `'active'`
   minÃºsculo **nÃ£o Ã©** `EnrollmentStatus` vÃ¡lido (o tipo Ã© `'ACTIVE'`). Ficheiro acabado de tipar â€” a tipagem
   nÃ£o apanhou porque o lado da **escrita** (`.create()`) aceitou o objecto parcial.
3. Varrer o resto: `grep -rn "progressPercentage" src` â€” confirmar caso a caso se Ã© o de topo (bug) ou o de
   dentro de `modulesList[]` (legÃ­timo).

- [x] **Fantasma `progressPercentage` fechado + curseduca/raiox/guru.analytics (1345â†’1233, âˆ’112)** â€” feito
  (`3ae8404`, `b92ee47`, `eecdee2`, `8dc3d15`, `1519096`). 0 casts/any novos. Gate: lint 0, tsc 0, ratchet 0,
  build 0, jest 314/2 (+3 testes de regressÃ£o). Verificado contra cÃ³digo:
  - `dashboard.controller` :32-34, :69 e **:292 (`compareProducts`, sÃ­tio que eu nÃ£o tinha apanhado)** â†’ `progress.percentage`.
    O filtro `progressMin/Max` e as mÃ©dias voltam a funcionar (antes: filtro nunca filtrava, mÃ©dia sempre nula).
  - `activecampaign.controller:1130-1134` â†’ `status: 'ACTIVE'` (era `'active'`, invÃ¡lido para `EnrollmentStatus`)
    e `progress: { percentage: 0 }`.
  - **Alias legacy `progressPercentage` Ã© legÃ­timo**: provado o produtor em `userProducts/userProductService.ts:320-325`
    (`{ ...up.progress, progressPercentage: up.progress.percentage ?? 0 }`), mais `testHistory:56`, `users:3202`,
    `userSnapshot.service:50` â€” todos derivam de `percentage`. Logo o filtro `hotmart.controller:215` funciona.
  - **Bug real (buraco de auditoria, sÃ­tio novo):** `triggeredByUser` lia `(req as any).user?._id` em
    `curseduca.controller` â€” mesma classe jÃ¡ corrigida em `hotmart.controller` (`319b0e4`). Auth dÃ¡ `req.user.id`.
  - **Bug real (limbo permanente):** cleanup Guru em `guru.analytics.controller:678-681` sÃ³ olhava para
    `memberStatus`/`INACTIVE`; matrÃ­culas `SUSPENDED` ficavam presas em `PARA_INATIVAR` para sempre. Agora lÃª
    `curseduca.situation` (canÃ³nico) e trata `INACTIVE`+`SUSPENDED`. Default `|| 'ACTIVE'` erra no sentido seguro.

**DÃ­vida nova registada (duplicaÃ§Ã£o de predicado â€” rule #9):** o predicado canÃ³nico
`isCurseducaEnrollmentActive(situation)` (`curseducaServices/curseducaMemberships.ts:16`) tem **1 sÃ³ uso** â€” dentro
do seu prÃ³prio mÃ³dulo (:38). O cleanup do Guru (`guru.analytics.controller:681`) acabou de escrever **Ã  mÃ£o uma
segunda cÃ³pia da mesma regra** (`=== 'INACTIVE' || === 'SUSPENDED'`). Duas definiÃ§Ãµes de "matrÃ­cula curseduca
inactiva" vÃ£o divergir. PrÃ³ximo bloco: fazer o guru.analytics importar o helper e varrer outros sÃ­tios que
comparem `situation`/`memberStatus` a literais.

- [x] **Predicado curseduca centralizado + analytics/dailyPipeline (1233â†’1176, âˆ’57)** â€” feito (`aa6a480`,
  `9122b7b`, `357f980`). `isCurseducaEnrollmentActive` agora importado em `guru.analytics.controller` (:682, :740),
  fim da 2Âª cÃ³pia da regra; teste `SUSPENDED â†’ INACTIVE` + sonda de mutaÃ§Ã£o. `dailyPipeline` ignora referÃªncias de
  produto Ã³rfÃ£s antes do orquestrador. Gate verde.

- [x] **Ãšltima actividade real (fim do fantasma de inactividade) + decisionEngine/crossReference/adapter
  (1176â†’1109, âˆ’67)** â€” feito (`7d3a978`, `1851e04`, `cf9f04d`, `28b8a8f`). 0 casts/any novos. 4 guardas
  `if (!dryRun)` intactas. **Bug estrutural corrigido (o mais importante do bloco):** `getLastActivityDate` lia
  `communicationByCourse[code].lastActivityDate` e `user.lastLogin` â€” **ambos inexistentes** no schema (o `lastLogin`
  real vive dentro de `curseduca`); caÃ­a sempre em `createdAt`. Resultado: `daysSinceLastLogin`/`daysSinceLastAction`
  eram a **idade da conta**, nÃ£o inactividade â€” as regras de inactividade disparavam nos alunos **mais antigos**, nÃ£o
  nos inactivos. SubstituÃ­do por helper partilhado `src/services/activity/learnerActivity.ts`
  (`getLastLearnerActivityDate`): mais recente entre `hotmart.lastAccessDate`, `curseduca.lastLogin/lastAccess`,
  `courseSpecificData.lastReportOpenedAt/lastModuleCompletedAt`; **exclui** `lastTagAppliedAt`/`lastEmailSentAt`
  (acÃ§Ã£o do sistema, ciclo auto-referencial); **sem sinal â†’ `null`**. Consumo: `calculateDaysInactive(null)=null`;
  nÃ­vel cai para 0 e a guarda de escalada exige `daysInactive !== null` â†’ **sem sinal nÃ£o escala** (antes: `999`,
  disparava no mÃ¡ximo). Na avaliaÃ§Ã£o de regras-string, `null â†’ NaN` â†’ toda comparaÃ§Ã£o `false` (nem activo nem
  inactivo dispara â€” "desconhecido" honesto e simÃ©trico). Testes: `learnerActivity.test.ts` +
  `decisionEngineDryRun.test.ts`. **Parte B:** o mesmo fantasma `combined.lastActivity` (+ fallback
  `metadata.updatedAt`, data de sistema) em `classes.controller` migrado para o mesmo helper. Bugs extra:
  `engagement.totalActions` inexistente; serializaÃ§Ã£o de condiÃ§Ãµes incompletas. Dead code (regra #9):
  `fetchMemberDetails`/`enrichMemberWithDetails` removidos (substituÃ­dos pelo bulk map). Gate: lint 0, tsc 0,
  ratchet 0, build 0, jest 321/2.
  **Deixado deliberadamente fora â†’ agora DECIDIDO (prÃ³ximo bloco):** `tagOrchestrator.service.ts` tem a **sua** noÃ§Ã£o
  de Ãºltima actividade. **Investigado (nÃ£o Ã© decisÃ£o nova, Ã© o MESMO bug numa 2Âª cÃ³pia):** `getUserLastActivity`
  (:482-490) Ã© o gÃ©meo exacto do bug corrigido no decisionEngine â€” lÃª `courseData.lastActivityDate` e `user.lastLogin`
  (ambos fantasmas) e cai sempre em `createdAt`; o `daysInactive` resultante (:99) alimenta
  `studentState.daysSinceLastLogin` (:443, :470) que **decide tags**. Mesmo motor de bug, mesma direcÃ§Ã£o errada.
  **DecisÃ£o: OpÃ§Ã£o A â€” unificar.** O orchestrator passa a consumir `getLastLearnerActivityDate` e trata `null` como
  "desconhecido â‰  inactivo", igual ao decisionEngine. Uma sÃ³ fonte de verdade, uma sÃ³ semÃ¢ntica.
  **âœ… FEITO (2026-07-20):** `getUserLastActivity` (fantasma) removido; os 3 sÃ­tios que montam `OrchestrationContext`
  (`orchestrateUserProduct` :98 + 2 fluxos de execuÃ§Ã£o mÃºltipla) passam a `getLastLearnerActivityDate(user, product.code)`;
  `calculateDaysInactive(Date|null): number|null` com `if (!lastActivity) return null`; `OrchestrationContext.lastActivity`/
  `daysInactive` agora nullÃ¡veis â†’ `studentState.daysSinceLastLogin` = `null` quando desconhecido (jÃ¡ nÃ£o fabrica inatividade
  a partir de `createdAt`). Teste RED/GREEN novo: `tests/services/tagOrchestratorActivity.test.ts` (sem sinal â†’ null;
  actividade real 15d â†’ 15). **Gate: lint 0, tsc 0, ratchet (1 `any` podado, 12â†’11), build 0, jest 323/2.**

- [x] **Sweep de cÃ³digo morto â€” 18 ficheiros, âˆ’2380 linhas (17 commits atÃ³micos `3554ebd`..`3d4b3fe`)** â€” validado.
  0 imports Ã³rfÃ£os: prova = **tsc 0 erros** (um sÃ³ import pendente para qualquer das 18 unidades teria feito falhar
  a compilaÃ§Ã£o). Gate meu: lint 0, tsc 0, ratchet 0/0, build 0, jest 323/2 (76 suites/1 skipped), incl.
  `routeCatalog.test.ts` e `defaultDenyAuth.test.ts` **PASS** (nÃ£o foi preciso regenerar catÃ¡logo/manifest porque a
  rota removida nunca foi viva). Removidos: `tagRuleEstimate.routes.ts` (duplicado morto â€” os handlers
  `estimate/preview/fields` continuam montados em `routes/index.ts:80-82` via controller, **endpoints vivos
  intactos**), barrel `tagEvaluation/index.ts`, `middleware/multer.ts`, `users.service.ts`, `userHelpers.ts`,
  `config/constants.ts`, class/history/response helpers, jobs cleanupHistory/precompute/rebuildProductSalesStats,
  `types/api.types.ts`, loggers debug/detailed/sync, `TagCronManagement.service.ts` (nÃ£o agendado), `discordSync`
  aninhado. Knip pÃ³s-sweep: 122 restantes, todos em scripts/harnesses/configs/`discord-analytics` â€” nada em `src/`
  normal.

  **âš ï¸ CORRECÃ‡ÃƒO AO REGISTO (o relatÃ³rio do sweep descreveu mal â€” fica aqui para ninguÃ©m agir sobre isto):**
  `evaluateClarezaRules`/`evaluateOGIRules` **NÃƒO sÃ£o stubs "a precisar de decisÃ£o"**. SÃ£o o **preview dry-run real
  por curso** que construÃ­mos (`bd9643e`/`4eb2281`/`7772a0b`); verificado no HEAD actual:
  `activecampaign.controller.ts:642-646` chama `decisionEngine.evaluateAllUsersOfProduct(product._id, true)` com
  `dryRun=true`. Montados em `activecampaign.routes.ts` e `course.routes.ts` â€” **Ã© o comportamento correcto, nÃ£o hÃ¡
  decisÃ£o pendente aqui**. NÃ£o gutar.

- [x] **`tagOrchestrator` â€” gÃ©meo do bug de actividade FECHADO** (commit `e2efb90`, jÃ¡ em `origin/remake`; validado
  a posteriori â€” tinha entrado na histÃ³ria sem eu o ter revisto explicitamente). `getUserLastActivity` (campos
  fantasma â†’ `createdAt`) **removido**, substituÃ­do por `getLastLearnerActivityDate`; `calculateDaysInactive` devolve
  `number | null` (`if (!lastActivity) return null`). Efeito lateral positivo: o cÃ³digo antigo chamava
  `getUserLastActivity` 2Ã— por avaliaÃ§Ã£o â€” agora 1Ã—.
  **Verificado que NÃƒO hÃ¡ misfire de tags:** o orchestrator nÃ£o compara `daysInactive` a thresholds â€” aplica via
  `studentState.applyTag(tag, level)` com o `level` decidido a montante. Os thresholds (`>= X`) vivem sÃ³ no
  `decisionEngine` (:834), que lÃª `metrics ?? Number.NaN` (nullâ†’NaN, comparaÃ§Ãµes todas `false`). O `null` do
  orchestrator sÃ³ aterra em `StudentEngagementState.daysSinceLastLogin`, campo **de reporting** (indexado/ordenado por
  `.sort({daysSinceLastLogin:-1})` :387). Guardar `null` Ã© **mais** correcto que a mentira do `createdAt`: antes as
  contas sem sinal tinham nÂº gigante e apareciam no topo dos "mais inactivos" (o bug); agora ordenam em baixo.

  **Pontas soltas de BAIXA severidade (mascaradas por tipagem frouxa â€” prÃ³ximo bloco, nÃ£o bloqueiam):**
  1. `tagOrchestrator` :399/:460 â€” `let studentState: any = await StudentEngagementState.findOne(...)`. O `any`
     mascarou a escrita de `number | null` num campo `Number`. Tipar `StudentEngagementState` corrige e teria
     apanhado isto. (ratchet + correctness)
  2. `activecampaign.controller.ts` `buildReason` :1394/:1397 â€” guarda `!== undefined` **nÃ£o apanha `null`** â†’ um
     `userStateSnapshot.daysSinceLastLogin` nulo renderiza a string literal `"null dias sem login"`. Trocar por
     `!= null` (ou `typeof === 'number'`) nos dois ramos (daysSinceLastLogin e daysSinceLastAction).
  3. `StudentEngagementState.ts:45,146` â€” campo `daysSinceLastLogin: number` nÃ£o-opcional mas agora por vezes `null`.
     Reflectir no schema (`?: number` / permitir null) OU saltar a escrita quando `null`. Decidir ao tipar o modelo.

- [x] **ConsolidaÃ§Ã£o `cron-tags` (2026-07-29).** O serviÃ§o duplicado de 895
  linhas e os resultados hardcoded foram removidos. As 18 montagens
  depreciadas continuam observÃ¡veis; os quatro aliases de execuÃ§Ã£o devolvem
  `410` e nÃ£o alcanÃ§am motores de escrita. Leituras/config/status usam um caso
  de uso injetado, ports tipados e adapters Mongoose/scheduler canÃ³nicos; as
  nove rotas tÃªm schemas strict. O inventÃ¡rio foi regenerado de fonte real
  (**444â†’437**) e eliminou sete entradas `class-management` Ã³rfÃ£s. O gerador do
  Front passou a seguir router factories. `no-explicit-any` **872â†’845**.

- [x] **ARCH-01 bootstrap/runtime fechado (2026-07-29).** `src/index.ts`
  permanece entrypoint de 11 linhas; `createApp(deps)` continua puro; bootstrap
  carrega config â†’ infraestrutura â†’ modelos â†’ rotas â†’ jobs â†’ listener por
  dependÃªncias explÃ­citas. O Ãºltimo acoplamento de `startJobs.ts` foi separado
  em factory pura, provisionador idempotente de cron seeds, repository Mongoose
  e shutdown injetÃ¡vel. Testes cobrem ordem, polÃ­tica production-only,
  tolerÃ¢ncia a falhas, criaÃ§Ã£o/reparaÃ§Ã£o dos seeds e sinais. Removidos
  `jobs/index.ts` (startAll que nÃ£o agendava nada) e `dailyPipeline.job.ts`
  (zero consumidores); os jobs vivos chamados pelo scheduler permanecem.
  `startJobs.ts` **160â†’48 linhas**, `no-explicit-any` **845â†’844**, oito
  suppressions `no-console` removidas.

Depois: cirurgia ARCH-02/03.

---

## (histÃ³rico) F3.3 â€” moagem TS 178â†’0 (por mÃ³dulo)

**Objetivo:** baixar o ratchet TypeScript atÃ© **0**, **por directÃ³rio/mÃ³dulo**, um commit por mÃ³dulo, com os
nÃºmeros antes/depois no corpo. `npm run types:baseline:update` regrava a baseline (**nunca Ã  mÃ£o**). SÃ³ no fim
(zero em tudo) se remove `noEmitOnError:false`/`tsc || exit 0` e arranca `strict` em ondas.

### ðŸ”´ REGRA DE OURO (o revisor vai injectar-testar cada fix)
**Baixa o ratchet FIXANDO o tipo, NUNCA silenciando-o.** Proibido `any`, `@ts-ignore`, `@ts-expect-error`, cast
`as X`/`as unknown as X` que **esconda** um bug. PorquÃª tÃ£o duro: a dÃ­vida TS aqui **jÃ¡ esconde bugs reais de
runtime** (o revisor encontrou 2 ao mapear) â€” um `as any` fÃ¡-los-ia desaparecer do compilador **deixando o bug
vivo**. Se um erro TS revelar um bug, **corrige o bug** (ou, se for decisÃ£o de negÃ³cio, **pÃ¡ra e pergunta** â€”
regra 8). Se um tipo estiver genuinamente errado, corrige o **tipo**, nÃ£o o local de uso.

### Mapa dos erros por directÃ³rio (revisor, `tsc --noEmit`)
InÃ­cio: `controllers:124 Â· services:39 Â· utils:8 Â· models:5 Â· jobs:1 Â· scripts:1` (178). **Agora: 173/39**
(`controllers:124 Â· services:39 Â· utils:8 Â· jobs:1 Â· scripts:1` â€” models a 0). Ordem: **pequenos e coesos
primeiro**, depois services, controllers por Ãºltimo.

- [x] **models (5â†’0)** â€” feito (`16ef3b1`). Interfaces separadas do `Document` via `HydratedDocument<I>`;
  `IStudent` perdeu o `_id: string` manual (a causa do TS2430); `user.ts` `sourcesAvailable` ganhou `"guru"`
  **na declaraÃ§Ã£o do tipo** (nÃ£o cast no uso). Revisor confirmou por grep: **0** `any`/`@ts-ignore`/cast/suppression
  adicionados, 0 mudanÃ§a runtime. Gate: lint 0, ratchet 173/39, jest 269/2, build 0.
- [x] **scripts (1â†’0)** â€” feito (`963545a`); `import { User }` â†’ `import User` (default export, que Ã© o que
  `User.find()` usa). Revisor: 0 cast/suppression, sÃ³ a linha do import. Ratchet 172/38.

### âš ï¸ utils (8â†’0) â€” passe caÃ§a-bugs (decisÃ£o user 2026-07-18: fazer agora). Plano grounded pelo revisor
Todos em `studentDataConsolidator.ts` (usado por `studentCompleteService.ts`). Modelos jÃ¡ confirmados pelo revisor:

- **`:95/:100/:134` (3) â€” apagar cÃ³digo morto.** `calculateHotmartProgressLegacy` recebe `product` mas usa `user`
  (fora de scope) e **nunca Ã© chamada** (grep: sÃ³ a definiÃ§Ã£o). â†’ **apaga a funÃ§Ã£o inteira.** 0 risco runtime.
- **`:386` â€” gap de timestamps.** `user.createdAt`: o interface `IUser` **nÃ£o declara** `createdAt`/`updatedAt`
  top-level (mongoose `timestamps:true` cria-os em runtime). â†’ **adiciona `createdAt?: Date; updatedAt?: Date`** ao
  `IUser`. MecÃ¢nico, 0 risco.
- **`:456`/`:461` â€” fallback legacy.** `getProductCode`/`getProductName` fazem `productId?.code || product.productCode
  || â€¦`. `IUserProduct` **nÃ£o tem** `productCode`/`productName` (confirmado no schema). SÃ£o fallbacks para docs
  legacy denormalizados. â†’ **preservar o comportamento**: adiciona `productCode?: string; productName?: string`
  **opcionais** ao `IUserProduct` (documenta os campos legacy, mantÃ©m o fallback vivo). **NÃ£o** removas o fallback
  (pode apanhar docs antigos). Nota: a linha jÃ¡ tem `product.productId as any` **prÃ©-existente** â€” nÃ£o adicionar mais.
- **`:44` â€” campo fantasma.** `role: cls.role` mas `IClassEnrollment` = `{classId, className?, joinedAt, leftAt?}`
  (**sem `role`**) â†’ `role` Ã© **sempre `undefined`**. DecisÃ£o: **verifica se `ConsolidatedClass.role` Ã© consumido**
  em algum lado. Se nÃ£o â†’ remove o campo (fantasma). Se sim â†’ Ã© bug latente (dados nunca lÃ¡ estiveram); **pergunta**.
- **`:40` â€” tipo estreito.** `platform: product.platform` (`PlatformType`, largo) num `ConsolidatedClass.platform`
  estreito (`'hotmart'|'curseduca'`). Aqui as turmas sÃ³ vÃªm de hotmart/curseduca. â†’ alarga `ConsolidatedClass.platform`
  a `PlatformType` **ou** guarda/estreita explicitamente. Sem `as any`.

- [x] **utils (8â†’0)** â€” feito (`e43aedf`). FunÃ§Ã£o morta apagada; `role` fantasma removido (do uso **e** do tipo
  `ConsolidatedClass`); `createdAt?/updatedAt?` no `IUser` + fallback defensivo `|| user.metadata.createdAt`;
  `productCode?/productName?` opcionais no `IUserProduct` (fallbacks **preservados**). **BÃ³nus â€” bug real
  corrigido:** o `:40` revelou que enrolments **discord/guru** eram classificados como `curseduca_sync`; fix por
  **guard** (`if platform !== hotmart && !== curseduca return`), nÃ£o cast. 3 testes com instÃ¢ncias mongoose reais
  provam: discordâ†’`[]`, sem `role`, fallback metadata. Revisor: 0 cast/suppression (suppressions **pruned** 2â†’1).
  Gate: lint 0, ratchet 163/36, jest 275/2 skipped.

### â¬› Restam os 2 grandes: services (~33) e controllers (124) â€” sub-dividir em vÃ¡rios commits
> **Sub-dividir** (nÃ£o um commit de 124 fixes). O ratchet Ã© por-directÃ³rio mas desce **em vÃ¡rios commits**:
> fixa um cluster â†’ `types:baseline:update` â†’ commit com nÃºmeros â†’ gate â†’ repete. **services primeiro.** Golden
> rule na mesma; onde um erro TS revelar um bug (como no `:40`/jobs), **corrige o bug ou pergunta**, nunca cast.

Progresso services (clusters reportados pelo Codex):
- [x] **sync/hotmart module progress (39â†’33)** â€” feito (`b70873a`). Tipou o contrato central `UniversalProgressModule`
  + `modulesList?/totalModules?/modulesCompleted?/currentModule?` (opcionais, sem `any`) â†’ 6 erros do serviÃ§o
  consumidor resolvidos na **definiÃ§Ã£o**, nÃ£o no uso. Revisor: 0 cast/suppression. Ratchet 157/35.
- [x] **ActiveCampaign (33â†’32)** â€” feito (`e9ab346`). **Bug real (3Âº da F3.3):** remover a 1Âª tag criava
  `activeCampaignData = { tags: [] }` sem `lists` (obrigatÃ³rio em `IActiveCampaignData`) â†’ `{ tags: [], lists: [] }`.
  Fix satisfaz o tipo E a integridade. Teste RED/GREEN. 0 cast/suppression. Ratchet 156/34.
- [x] **tag-monitoring (services 32â†’22, controllers 124â†’120)** â€” feito (`0caf5bf`). Tipou 5 modelos
  tag-monitoring (interfaces/documents) â†’ resolveu 14 erros nos consumidores (services+controllers). **Restaurou
  `getAllContacts()`** (paginaÃ§Ã£o `/api/3/contacts`) â€” mÃ©todo que faltava e o `weeklyTagMonitoring` consumia; Ã©
  READ e fica atrÃ¡s do gate **existente** `config.enabled`+`scope==='ALL_CONTACTS'` (nÃ£o force-enable). BÃ³nus:
  removeu um `(c: any)` prÃ©-existente. Revisor: 0 cast/suppression novos (models continua a 0). Ratchet 142/31.
- [x] **classesService (services 22â†’14, controllers 120â†’116)** â€” feito (`d4339fb`). **Bug real (4Âº):** `classId`/
  `className` estavam na interface mas **nÃ£o no schema** â†’ `strict:true` descartava-os silenciosamente ao gravar
  (fluxos de gestÃ£o/movimento de turmas perdiam dados); restaurados no schema. Removeu `syncComplete()` morto do
  serviÃ§o (referenciava `api` inexistente; a rota viva usa o **controller**, confirmado). Suppressions **pruned**:
  `no-console` 24â†’21 + `preserve-caught-error` (2). 0 cast/suppression novos. Ratchet 130/30.
- [x] **snapshots (services 14â†’7)** â€” feito (`84dc936`). **2 bugs reais (5Âº e 6Âº):** (a) `UserProduct` descartava
  `role` (nÃ£o estava no schema) â†’ `CLASS_ROLE_CHANGE` impossÃ­vel; `role?` restaurado no schema (persistÃªncia de role
  numa funÃ§Ã£o pura `classEnrollmentRole.ts`, testada: turma nova / role alterado / role inalterado). (b) snapshots
  liam `user.averageEngagement*` fantasma â†’ `undefined`; agora `user.combined?.combinedEngagement`.
  **ConsistÃªncia cross-cluster verificada:** o `role?` no schema **nÃ£o** contradiz a remoÃ§Ã£o de `role` do
  `ConsolidatedClass` em utils â€” camadas diferentes (persistÃªncia vs DTO de display sem consumidor). 0 cast/suppression.
  Ratchet 123/28.
- [x] **studentComplete (services 7â†’3)** â€” feito (`5e3c4e1`). Retipou as funÃ§Ãµes do `studentDataConsolidator`
  para aceitar contratos **lean** via `Pick<IUserProduct, â€¦>` (`StudentProductData`/`StudentStatsUser` â€” subconjuntos
  precisos, **nÃ£o `any`**); largou o param `user` nÃ£o usado do `consolidateClasses`. Testes actualizados, discord/role/
  fallback continuam a passar. 0 cast/suppression. Ratchet 119/27.
- [x] **UniversalSyncConfig (services 3â†’0)** â€” feito (`33ce15e`). **Bug real (7Âº):** snapshots liam `config.syncId`
  (nunca fornecido â†’ sempre `undefined`, Ã³rfÃ£os do `SyncHistory`); agora um helper `universalSyncSnapshot.ts`
  constrÃ³i o contexto com `syncId` do `SyncHistory` real do fluxo (tipado `syncId: Types.ObjectId`).
  `UniversalSyncConfig` restringido a plataformas concretas (exclui `all`). 0 cast/suppression. Ratchet 116/26.

### âœ… services, models, scripts, jobs, utils todos a 0 â€” **resta sÃ³ controllers**
- [x] **activecampaign.controller (116â†’115)** â€” feito (`e82708e`). **Bug real (8Âº, gÃ©meo do 3Âº):** o controller
  criava `activeCampaignData` sem `lists` (obrigatÃ³rio) â†’ `{ â€¦, lists: [] }`. Teste HTTP boundary. 0 cast/suppression.
### controllers â€” reta final por ficheiro. **Progresso: 115â†’46.** âœ… analytics, ac-lists, cron-dead, sync-shadowed, cron-twin(`2c086ea`), product-profiles(`9313d77`), testimonials(`3778e90`, **bug 12: `onlyActive` lia `status`/`estado` fantasmaâ†’sempre true; agora `combined.status`**). 0 casts em nenhum.

### controllers 46â†’32 (`0b4dca4`,`2dcab35`,`63f291b`): **bug 13** (5 metadados de audit de inativaÃ§Ã£o descartados pelo strict â†’ persistidos) Â· **bug 14** (`createInactivationHistory` inexistente, 3 fluxos chamavam via `(UserHistory as any)` e engoliam a falha â†’ mÃ©todo restaurado, **2 casts `as any` velhos removidos**) Â· 4 params classes + 4 `:id` notificaÃ§Ãµes tipados. Testes RED/GREEN.

### controllers 32â†’24 (`57b2520` studentHistory, `ea8e055` guru.snapshot) â€” 0 casts, ratchet 24/12.

### âš ï¸ acReader â€” DECISÃƒO: apagar 4 endpoints de leitura partidos (utilizador 2026-07-18)
Revisor mapeou (corrigindo scope inicial): **4** endpoints AC de leitura chamam statics **inexistentes** no model
`ACContactState` via `as any` â€” todos **partidos** (rebentariam em runtime) e **sem consumidor no Front**:
- `GET /api/ac/analytics/overview` (`getACOverview`) â€” `findOldSyncs`+`findWithInconsistencies`
- `GET /api/ac/analytics/product/:code` (`getProductACAnalytics`) â€” `findByProduct`
- `GET /api/ac/inconsistencies` (`getInconsistencies`) â€” `findWithInconsistencies`
- `POST /api/ac/maintenance/refresh-old` (`refreshOldSyncs`) â€” `findOldSyncs`
DecisÃ£o: **apagar os 4** (rotas + handlers + os `as any`). O **lado de escrita** (`getContactTags`, `syncContactTags`,
`getBatchContactTags`, `batchSyncContacts`, `clearACCache`) e o model `ACContactState` ficam **intactos**. Se um dia
precisar de analytics de contact-state, reconstroi-se com statics reais.
- [x] FEITO (`9ccb446` back / `0942cd9` front contrato). Codex removeu os 4 (validado: sÃ³ os 4, escrita+model
  intactos); revisor regenerou catÃ¡logo/manifest (448â†’444), reapontou evidÃªncias das 5 rotas AC sobreviventes
  (line-shift), ajustou contagens (routeCatalog 448â†’444; defaultDenyAuth 448â†’444, authenticated 443â†’439),
  regenerou contrato Front (444, transportContract 10/10). **Committado verde de uma vez** (regen antes do commit,
  sem intermÃ©dio vermelho). Ratchet **23/12**.

### controllers 23â†’8 (7 commits `57091bd`..`53694b5`): acReader, criticalTag, lessons, tagMonitoring, guru.sync tipados; syncReports (getReportById re-tipado + `getReportsByJob` morto removido), CursEduca (`syncCurseducaByEmail` morto removido â€” era candidato ts-prune, apanhado pela regra #9). **Bug 15:** `hotmart.status` escrito pelos syncs mas nÃ£o no schema strict â†’ descartado; adicionado ao `user.ts` + `curseducaStatus` lÃª `curseduca.situation` canÃ³nico. Teste RED/GREEN. **0 casts novos, 2 velhos removidos.** Ratchet 8/5. Restam: guru.webhook 1 Â· sync 1 Â· hotmart 1 Â· testHistory 2 Â· users 3.

### controllers (8) â€” reta final, 1 commit por FICHEIRO (regra #9 + golden rule)
> **NÃ£o** 1 erro/commit. Agrupa **por ficheiro** â€” os erros de um controller partilham contexto (mesmos models,
> req/res) e formam um assunto coerente e revisÃ­vel. Ordem sugerida: maiores primeiro.

DistribuiÃ§Ã£o (revisor, `tsc --noEmit`, 2026-07-18):
- **Por ficheiro:** analytics 13 Â· reengagement 12 Â· cron/cronManagement 11 Â· syncStats 8 Â· syncUtiliz/cronManagement 8 Â·
  productProfile 8 Â· testimonials 7 Â· classes 5 Â· guru.inactivation 5 Â· tagNotification 4 Â· studentHistory 4 Â·
  acReader 4 Â· guru.snapshot 4 Â· criticalTag 3 Â· guru.sync 3 Â· +cauda (~2-1 cada).
- **Por tipo de erro:** TS2345 46 Â· TS2339 43 Â· TS2769 16 Â· TS2551 4 Â· **TS1117 4** Â· TS2307 1 Â· TS2352 1.

âš ï¸ **Regra de ouro reforÃ§ada nos controllers** (Ã© onde vivem os bugs):
- **TS2339 (43, "propriedade nÃ£o existe")** Ã© a classe que jÃ¡ revelou 8 bugs reais (campos fantasma / schema a
  descartar). Em cada um: **Ã© bug de dados ou gap de tipo?** Corrige a raiz, **nÃ£o** casta para compilar.
- **TS1117 (4, chaves duplicadas num literal)** = **bug garantido** (a 2Âª chave sobrescreve a 1Âª em silÃªncio).
  Investiga o que era pretendido, corrige. Nunca sÃ³ apagar uma chave sem perceber qual Ã© a correcta.
- TS2345/TS2769 (argumento/overload): normalmente tipo mal-casado â†’ corrige o tipo na fronteira.

- [x] Gate atual comprovado: `strict:true`, `noEmitOnError:true`, `types:check` directo sem erros e build verde. A disciplina histÃ³rica de 1 commit por ficheiro/`types:baseline:update` fica apenas como histÃ³rico, nÃ£o requisito presente.
  Podes entregar vÃ¡rios ficheiros num report. Se um erro revelar um bug (esp. TS2339/TS1117), **corrige ou pergunta**.

Progresso controllers:
- [x] **syncStats â€” rotas shadowed (regra #9, aprovado 2026-07-18):** `GET /api/sync/stats` e `/api/sync/history`
  sÃ£o servidas pelo `sync.routes` (montado 1Âº, `index.ts:53`); as cÃ³pias no `syncStats.routes` (montado 2Âº, `:94`)
  sÃ£o **inalcanÃ§Ã¡veis**. Revisor confirmou a ordem **e** que o `getSyncStats` do `guru.routes` vem de
  `guru.sync.controller` (colisÃ£o de nome, NÃƒO dependÃªncia) â†’ apagar os do `syncStats.controller` Ã© seguro. Aprovado:
  remover as 2 rotas shadowed + os handlers `getSyncStats`/`getSyncHistory` duplicados + tipar os 4 handlers `:id`
  vivos (`getSyncById`, `getConflictById`, `resolveConflict`, `ignoreConflict`) como `Request<{id:string}>`.
  Esperado: controllers **77â†’69**.
  - [x] FEITO (`fe8c02f`). Revisor: 2 rotas+handlers shadowed fora, 4 `:id` tipados sem cast, sync/guru/manifest
    intactos. EvidÃªncia do catÃ¡logo reapontada para as declaraÃ§Ãµes vivas (`sync.routes.ts:50/60`) â€” **sem mudanÃ§a
    de count** (as rotas continuam a existir, sÃ³ se deduplicou) â†’ sem regen de manifest/contrato. Ratchet histÃ³rico prÃ©-remoÃ§Ã£o: **69/20**; gates atuais: strict/noEmitOnError, `types:check` e build sem erros. Tooling evidence (fresh): `controllerClosureEvidence.test.ts` â€” 1 suite/1 test passed (GREEN).
- [x] **analytics (115â†’102)** â€” feito (`183427e`). **3 bugs reais (9Âº/10Âº/11Âº):** `$ne` duplicado no mesmo literal
  (`{$ne:null, $ne:''}` â†’ 2Âº sobrescrevia o 1Âº; sÃ³ excluÃ­a `''`, nÃ£o `null`) â†’ `$nin:[null,'']`; `require` de
  path inexistente (`../services/engagementService`) â†’ import correcto; `setInterval` sem ref prendia o Jest â†’
  `.unref()`. 0 cast/suppression (suppressions pruned). Ratchet 102/24.
- [x] **reengagement (12â†’0) â€” APAGADO** (`09df244`, decisÃ£o utilizador 2026-07-18). Duplicado morto/superseded do
  cron de tags (`/test-cron`, jÃ¡ endurecido na F3.1). 605 linhas removidas (controller+routes+schema+teste+mount).
  Engine `decisionEngine` + cron + domÃ­nio `reengagementLevels` **intactos** (revisor: 0 refs pendentes). Revisor
  regenerou `route-catalog.json`+`route-manifest.json` (455â†’448) e o contrato do Front (`1bc95cc`, `371d22b`),
  ajustou contagens nos testes (routeCatalog 455â†’448, defaultDenyAuth 450â†’443). Gate verde nos 2 repos. **Controllers 102â†’90.**

### Depois da F3.3
- **Cirurgia de arquitectura** (ARCH-01 god-file, ARCH-02 mÃ³dulos gigantes, ARCH-03 envelope) â€” ver a rÃ©gua em
  **"Estado-alvo (Definition of Done)"**. ARCH-01 **jÃ¡ arrancou** (`src/runtime/registerRoutes.ts`); ARCH-02
  a ganhar terreno (controllers pequenos extraÃ­dos: `usersReviewLists`, `guruWebhookList`, `guruSubscriptionList`).

**Cada famÃ­lia/bloco entregue â†’ reporta ao utilizador, que passa ao revisor. O revisor valida contra o cÃ³digo
(nunca contra o report) e desbloqueia o prÃ³ximo.**

---

## Estado-alvo (Definition of Done) â€” a rÃ©gua

> **Para que serve.** Isto Ã© o nÃ­vel tÃ©cnico que a API tem de atingir. NÃ£o Ã© aspiraÃ§Ã£o: Ã© a **rÃ©gua de
> aceitaÃ§Ã£o**. Nenhum item se declara "feito" sem **bater estes critÃ©rios, provados contra o cÃ³digo** â€” a
> mesma disciplina que jÃ¡ aplicamos Ã s rotas. Qualquer agente/sessÃ£o mede contra esta secÃ§Ã£o. DecisÃ£o do
> utilizador (2026-07-17): estratÃ©gia aprovada.
>
> **Regra de ouro do alvo:** nÃ£o se troca correcÃ§Ã£o por elegÃ¢ncia. Cada critÃ©rio entra por **refactor
> incremental** atrÃ¡s dos contratos vivos (Front, webhooks, CRON), com **characterization tests primeiro**.

### Progresso estimado por pilar (2026-08-12)

Esta tabela dÃ¡ o mesmo peso aos oito pilares e Ã© uma **estimativa de engenharia**, nÃ£o uma contagem de
checkboxes nem prova de prontidÃ£o operacional. Esta reconciliaÃ§Ã£o macro incorpora SEC-10/ARCH-03 e SCALE-01/SCALE-02/SCALE-03 sem declarar fecho operacional.

| Pilar | Antes da missÃ£o | Atual | Delta | Base da estimativa |
| --- | ---: | ---: | ---: | --- |
| 1. Arquitectura & bootstrap | 100% | 100% | 0 pp | ARCH-01 e lifecycle fechados no cÃ³digo |
| 2. Ficheiros & domÃ­nios | 100% | 100% | 0 pp | teto ARCH-02 em 0; fronteira de controllers com baseline 0 |
| 3. Pastas & higiene | 100% | 100% | 0 pp | DOC-02 e artefactos fechados |
| 4. Middleware & funÃ§Ãµes | 100% | 100% | 0 pp | SEC-10 mantÃ©m 0 respostas 500 locais e 0 detalhes tÃ©cnicos pÃºblicos |
| 5. SeguranÃ§a & rotas | 70% | 70% | 0 pp | default-deny/JWT/CORS fechados; matriz de papÃ©is e OPS-02 abertos |
| 6. Escalabilidade | 61% | 66% | +5 pp | SCALE-03 credita sÃ³ 9/24 mudanÃ§as revistas; 15 decisÃµes de cÃ³digo e o gate operacional real continuam pendentes |
| 7. Contrato de resposta | 84,3% | 100% | +15,7 pp | 409/409 identidades tÃªm contrato terminal revisto; 0 pendentes |
| 8. Toolchain & qualidade | 75% | 75% | 0 pp | TS/tests/package manager fechados; ESLint debt e validaÃ§Ã£o operacional abertos |
| **Total, mÃ©dia simples** | **86,3%** | **88,9%** | **+2,6 pp** | `(100 + 100 + 100 + 100 + 70 + 66 + 100 + 75) / 8 = 88,875%` |

Contratos fecha em **100%** porque as **409/409** identidades montadas tÃªm uma decisÃ£o terminal revista e o inventÃ¡rio mantÃ©m **0 pendentes**. A mÃ©dia simples final Ã© `(100 + 100 + 100 + 100 + 70 + 66 + 100 + 75) / 8 = 88,875%`, apresentada como **88,9%**. O ponto de partida desta ronda era **86,3%**; o avanÃ§o Ã© **+2,6 pp** apÃ³s arredondamento.

Na contagem mecÃ¢nica, as duas missÃµes reconciliam `102/112 -> 105/112` (`91,1% -> 93,8%`). SEC-10 e o
boundary de responsabilidade ARCH-02 sÃ£o os deltas de cÃ³digo; SCALE-01 e os 10 dÃ©bitos removidos em SCALE-02 A melhoram a estimativa sem fechar a caixa ampla de paginaÃ§Ã£o restante. Outra caixa corrigiu estado ARCH-02 jÃ¡ provado no ledger abaixo. Nenhuma das
duas mÃ©tricas inclui deploy, observaÃ§Ã£o, equivalÃªncia de payloads ou prontidÃ£o operacional.

**EvidÃªncia desta reconciliaÃ§Ã£o (2026-08-12, offline):** a topologia final tem **409 rotas**, **409 contratos completos** e **0 pendentes**. A taxonomia terminal Ã© **390 `success-data` / 15 `public-document` / 3 `webhook-ack` / 1 `redirect`**; o acesso Ã© **403 autenticadas / 3 pÃºblicas / 3 webhook-ack**. Os ratchets encontram **0** segmentos de rota `v1`/`v2`/`v3`/`legacy`/`debug`, **0** `status(501)` no runtime e **0** decisÃµes `501-only`. Checkers de rotas e respostas, lint, TypeScript, builds e a prova focada de **53 testes** passaram; a revisÃ£o independente terminou em **PASS** e o estado estÃ¡ pronto para push, sem o executar. `git diff --check` ficou limpo e os lockfiles nÃ£o mudaram. O gate Jest completo com diagnÃ³stico de open handles nÃ£o Ã© reclamado nesta ronda; os resultados continuam a ser prova offline de cÃ³digo e inventÃ¡rio, nÃ£o deploy ou observaÃ§Ã£o operacional.

### EvidÃªncia focada (2026-08-03; offline)

- PerÃ­metro/upload/observabilidade/paginaÃ§Ã£o: **14 suites / 65 testes**. Command exacto do corte de controller:
  `npm.cmd test -- --runInBand tests/security/httpPerimeter.test.ts tests/security/deploymentPerimeter.test.ts tests/security/usersImportUpload.test.ts tests/bootstrap/serverTimeouts.test.ts tests/security/redaction.test.ts tests/security/logger.test.ts tests/security/errorHandling.test.ts tests/utils/pagination.test.ts tests/controllers/usersReviewLists.controller.test.ts tests/controllers/guruWebhookList.controller.test.ts tests/controllers/guruSubscriptionList.controller.test.ts tests/controllers/usersSimpleList.controller.test.ts tests/services/users/usersSimpleList.service.test.ts tests/services/users/mongooseUsersSimpleList.repository.test.ts`
  Resultado: **14 suites passed / 65 tests passed**.
- JWT/CORS/Helmet: **5 suites / 27 testes**. Command exacto da auditoria Luna:
  `npm.cmd test -- --runInBand tests/bootstrap/config.test.ts tests/bootstrap/bootstrap.test.ts tests/security/jwt.test.ts tests/security/cors.test.ts tests/security/httpPerimeter.test.ts`
  Resultado: **5 suites passed / 27 tests passed**.
- Startup security boundaries (2026-08-04; offline): dedicated `OLD_API_JWT_SECRET` and `STUDENT_ACCESS_JWT_SECRET` authorities are distinct and required; production CORS uses only the explicit normalized `ALLOWED_ORIGINS` list; and the then-mounted `/api/curseduca/debug` route was gated by `localDebugOnly` (historical checkpoint; the final 2026-08-12 topology removes debug routes).
  Focused route evidence: `MONGOMS_RUNTIME_DOWNLOAD=false; node_modules\.bin\jest.cmd --ci --runInBand tests/security/curseducaDestructiveValidation.test.ts tests/security/debugRoutes.test.ts` - **2 suites passed / 6 tests passed**. The test mounts the real router and uses the existing mocked controller/noop boundary.
  These slices are code-complete only: production still requires provisioning of all mandatory secrets and the complete origin list, followed by deployment and observation. No production system or external API was contacted.
  OPS-01 remains operationally open until mandatory configuration is provisioned and startup is observed in the target environment; the code-side raw-environment migration is closed below.
  Renewal configuration wave (2026-08-08; `39aecee`): all renewal/Discord switches, caps, channels and the optional OGI Hotmart product ID now come from the immutable startup boundary; implicit production bot URL/channel fallbacks were removed. The machine inventory fell **77â†’59 raw-env reads** and **29â†’24 files**; `src/services/renewal` is at zero. Focused offline proof: **6 suites / 70 tests**, TypeScript/lint/build 0; major gate **227/227 suites / 1321/1321 tests**. OPS-01 remains open for the other 59 reads and operational provisioning.
  Request-driven integration wave (2026-08-09): Guru user/account tokens, Guru-CursEduca helpers and consumers, the direct CursEduca adapter/controller, Slack notifications and student-summary access now read the immutable runtime config at call time. Import-time credential capture and the implicit CursEduca production URL were removed; student-summary comparison is timing-safe. The machine inventory fell **59â†’45 raw-env reads** and **24â†’17 files**; local 500 debt also fell **336â†’334**. Offline proof includes configured/unconfigured consumers, zero HTTP when Slack is disabled and a restored RED mutation against ambient Slack env.
  Market-data integration wave (2026-08-09): FMP and Hotmart credentials, subdomain aliases and the optional lesson-sync user are parsed once into the immutable startup boundary. FMP/Raio-X, Hotmart sync/helpers/lessons and the course lesson catalog no longer read ambient credentials; the embedded production club fallback was removed, while the explicit product subdomain fallback remains. Required settings fail with IntegrationUnavailableError before HTTP; parser priority is COURSE_LESSON_SUBDOMAIN â†’ HOTMART_SUBDOMAIN â†’ legacy subdomain. The machine inventory fell **45â†’8 raw-env reads** and **17â†’4 files**. Offline gate: lint 0, TypeScript 0, **231/231 suites and 1332/1332 tests**, build 0; lockfiles unchanged.
  Runtime-boundary closure wave (2026-08-09): Clareza refresh authorization now uses one timing-safe helper over immutable runtime config; `OLD_API_URL` and Hotmart club configuration are resolved through call-time providers; development checks use typed `nodeEnv`. The inventory matcher now catches both property and bare-object `process.env` reads, closing its previous blind spot. Runtime debt fell **8â†’0 reads** and **4â†’0 files** outside explicit composition roots. TDD included missing-contract RED, configured/unconfigured GREEN, and a restored timing-safe mutation. Offline gate: lint 0, TypeScript 0, **231/231 suites and 1332/1332 tests**, build 0, `git diff --check` clean; lockfiles unchanged. Independent leak diagnosis with `--runInBand --detectOpenHandles` also passed **231/231 / 1332/1332** with zero open handles, so no teardown or `--forceExit` change was made.

- ContradiÃ§Ãµes ainda abertas: a matriz de papÃ©is SEC-01, a polÃ­tica transversal de idempotÃªncia/caps, a dÃ­vida ESLint e o inventÃ¡rio/migraÃ§Ã£o de listagens HTTP nÃ£o canÃ³nicas + scans `find({})`. O error handler central estÃ¡ fechado no cÃ³digo em **0** respostas 500 locais e **0** detalhes tÃ©cnicos pÃºblicos; distributed limiter/429/CSP, JWT dedicado, CORS explÃ­cito, ausÃªncia de rotas debug e o boundary raw-env tambÃ©m estÃ£o fechados no cÃ³digo. Provisioning/deploy/observaÃ§Ã£o continuam separados.
- ProveniÃªncia de gates no checkpoint `39aecee`: lint e TypeScript **0**, Jest offline completo **227/227 suites / 1321/1321 tests**, build **0** e `git diff --check` limpo. Ã‰ evidÃªncia de repositÃ³rio/sandbox; nÃ£o reclama deploy nem observaÃ§Ã£o operacional.
- Nenhum runtime nem sistema externo foi tocado; os resultados sÃ£o focados e offline.

### 1. Arquitectura & bootstrap
- [x] `src/index.ts` deixa de ser god-file: separado em `config`, `app`, `routes`, `database`, `jobs`, `server` (ARCH-01).
- [x] `createApp(deps)` **puro** â€” nÃ£o liga rede/BD nem arranca jobs no import; `bootstrap()` coordena as dependÃªncias explicitamente.
- [x] Modelos e jobs registados **explicitamente**, nunca por side-effect de import. Startup order e shutdown testÃ¡veis.

### 2. Ficheiros pequenos & mÃ³dulos por domÃ­nio
- [x] **Limite aprovado: nenhum ficheiro TypeScript manuscrito em `src/` acima de 500 linhas fÃ­sicas.** ARCH-02 fechou **39 -> 0** em 2026-08-10. O ratchet machine-checked permanece fail-closed contra ficheiros novos acima do limite, crescimento, dÃ­vida movida e baseline nÃ£o podada; artefactos gerados exigem exceÃ§Ã£o explÃ­cita. CoesÃ£o e testabilidade continuam a poder exigir extraÃ§Ãµes antes do teto.
- [x] **Cada mÃ³dulo tem uma responsabilidade clara; sem "controller-que-faz-tudo".** Fecho ARCH-02 de 2026-08-11: os **10â†’0** mÃ³dulos de suporte, mapping, serviÃ§o e error forwarding alojados em `src/controllers` foram movidos para owners canÃ³nicos em `src/services/**` e `src/security/**`, sem fachadas legacy. O ratchet `controllerResponsibilityBoundary.test.ts` mantÃ©m baseline **0**, permite apenas `*.controller.ts`, barrels `index.ts` e os dois adapters HTTP legacy explicitamente classificados, e tem mutaÃ§Ã£o fail-closed contra novos `support.ts`, `mapping.ts` e `*.service.ts`. O movimento expÃ´s e eliminou **4** `any` no mapping de tags e **1** `console` direto no suporte CursEduca; as cinco suppressions correspondentes foram podadas. Contratos, rotas e efeitos permanecem inalterados; isto fecha a fronteira estrutural no cÃ³digo, nÃ£o deploy ou observaÃ§Ã£o operacional.
- [x] **ARCH-02 â€” controller Hotmart dissolvido (2026-08-10):** `syncUtilizadoresControllers/hotmart.controller.ts` foi fisicamente apagado apÃ³s caracterizaÃ§Ã£o RED/GREEN dos adapters de diagnÃ³stico e Universal Sync. As **10 rotas montadas** consomem agora um barrel explÃ­cito e owners coesos; `testDatabaseConnection` saiu por prova negativa de zero consumidores. O controller original caiu **1233â†’304â†’0 linhas**; os mÃ³dulos finais tÃªm **475/161/84/75/13/7 linhas**, todos abaixo do teto de 500. A mutaÃ§Ã£o de `triggeredByUser` deu RED com `admin-id` esperado e `undefined` recebido; o inventÃ¡rio SEC-10 caiu **283â†’282** e 16 suppressions `no-console` do ficheiro morto foram removidas. Gate final offline: lint 0, TypeScript 0, **276/276 suites e 1576/1576 testes**, build 0, `git diff --check` limpo e lockfiles intactos. Nenhuma API ou BD real foi chamada.
- [x] **ARCH-02 â€” persistÃªncia UserProduct extraÃ­da do universal sync (2026-08-08):** resoluÃ§Ã£o de produto, mÃ©tricas, create/update e reassignment CursEduca passaram para universalSync/userProductPersistence.ts (267 linhas), mantendo os builders puros e a ordem de efeitos. processSyncItem.ts caiu **649â†’401 linhas**;
  no-console **1518â†’1504** sem suppressions novas. A caracterizaÃ§Ã£o pÃºblica provou create/update, dedup de turma, primary reassignment e missing-product; mutaÃ§Ã£o removendo o $set deu RED (77 esperado, 10 recebido). Gate offline: 4 suites/34 testes focados, 227/227 suites e 1325/1325 testes totais, lint/types/build 0.

- [x] **ARCH-02/regra #9 â€” auto-inativaÃ§Ã£o Hotmart morta removida (2026-08-08):** o executor estava permanentemente atrÃ¡s de `const false`; o collector sÃ³ alimentava esse ramo e nÃ£o tinha saÃ­da operacional. A deteÃ§Ã£o de expiraÃ§Ã£o e o log de revisÃ£o manual foram preservados, mas os writes inalcanÃ§Ã¡veis sobre User/UserProduct/Class/UserHistory, o collector e os testes Ã³rfÃ£os foram apagados. `executeUniversalSync.ts` caiu **507â†’287 linhas** e `processSyncItem.ts` **401â†’394**; no-console do executor **25â†’13**. MutaÃ§Ã£o `falseâ†’true` deu RED ao inativar o aluno expirado; rede Hotmart/shared 2 suites/15 testes e gate maior: lint/types/build 0 e 226/226 suites, 1318/1318 testes.
  **Follow-up ambiental para Claude:** o helper `apply_patch` do sandbox falhou repetidamente ao aplicar ACLs de leitura; a ediÃ§Ã£o foi revista e aplicada por fallback local. `npx prettier --check` ficou em timeout porque este repo nÃ£o tem binÃ¡rio Prettier local; foi terminado, nÃ£o instalou dependÃªncias e nÃ£o alterou lockfiles. Repetir apenas num ambiente com a ferramenta jÃ¡ disponÃ­vel; os gates oficiais lint/types/Jest/build ficaram verdes.

- [x] **ARCH-02/SEC-10 â€” Guru inactivation dissolvido (2026-08-09):** o barrel residual `guru.inactivation.controller.ts` (286 linhas) foi apagado; as 14 rotas importam agora diretamente os boundaries de leitura, mutaÃ§Ã£o local, integraÃ§Ã£o externa, manutenÃ§Ã£o e discrepÃ¢ncias. `mark-discrepancies` passou a serviÃ§o/repositÃ³rio/clientes injetÃ¡veis + boundary strict, preserva o envelope e acrescenta o `noUserProduct` exigido pelo Front. Os Ãºltimos **2â†’0** HTTP 500 locais deste domÃ­nio foram enviados para SEC-10; o baseline global medido caiu **237â†’235** e a suppression `no-console` do ficheiro morto caiu **21â†’0**. Dois bugs de persistÃªncia strict foram corrigidos no schema (`markedFromComparison`, `revertReason`). RED/GREEN cobre decisÃµes, adapter Mongo, contrato, campos hostis e metadata; zero integraÃ§Ãµes reais.

- [x] **ARCH-02 â€” boundary de cursos ActiveCampaign extraÃ­do (2026-08-09):** os dashboards e previews Clareza/OGI saÃ­ram de `acTags/activecampaign.controller.ts` para `activeCampaignCourse.controller.ts`, mantendo as duas famÃ­lias de rotas e o dry-run real (`evaluateAllUsersOfProduct(..., true)`). O monÃ³lito caiu **1413â†’1067 linhas**; o novo boundary tem **355 linhas**. Characterization com mutaÃ§Ãµes RED protege lookup, zero envelopes, agregaÃ§Ã£o, classificaÃ§Ã£o/reconciliaÃ§Ã£o de tags e falhas; **14â†’0** consoles migrados para o logger canÃ³nico sem novas suppressions. A hipÃ³tese de shadowing das rotas GET especÃ­ficas foi descartada (`/:id` nÃ£o corresponde a dois segmentos); os placeholders aleatÃ³rios continuam fora deste bloco e exigem decisÃ£o prÃ³pria.
- [x] **ARCH-02 â€” controller residual ActiveCampaign dissolvido** (2026-08-09): `acTags/activecampaign.controller.ts` foi fisicamente apagado. OperaÃ§Ãµes manuais, CRUD legacy de regras e tags V2 passaram para owners diretos com **225/116/326 linhas**; nenhuma rota depende de barrel compatÃ­vel. A sequÃªncia completa do antigo monÃ³lito caiu **1413â†’1067â†’656â†’0 linhas**. Characterization protege contadores/log do `test-cron`, ordenaÃ§Ã£o last-20, envelopes legacy, persistÃªncia UserProduct e partial sync; mutaÃ§Ãµes reais deram RED ao zerar `actionsExecuted` e ao remover `UserProduct.save()`. O efeito `findOrCreateContact` do remove foi preservado, eliminando apenas a variÃ¡vel nÃ£o usada. DÃ­vidas explÃ­citas: `test-cron` continua mutativo sem gate prÃ³prio e os aliases legacy de tag rules permanecem por compatibilidade atÃ© decisÃ£o/observaÃ§Ã£o; nenhuma integraÃ§Ã£o real foi executada.
- [x] **ARCH-02 â€” reporting de histÃ³rico ActiveCampaign extraÃ­do** (2026-08-09): listagem, estatÃ­sticas e formataÃ§Ã£o de motivo saÃ­ram de `acTags/activecampaign.controller.ts` para trÃªs mÃ³dulos coesos com **197/201/47 linhas**. As rotas `/api/activecampaign/*` e o alias app-level `/api/communication-history` importam agora o boundary proprietÃ¡rio diretamente. O monÃ³lito caiu **1067â†’656 linhas**; nenhuma unidade nova ultrapassa ~400. Characterization preserva precedÃªncia de filtros, populate/sort/skip/limit, fallback `sentAt`, pipeline legado por `timestamp`, envelopes vazios e erros pÃºblicos estÃ¡veis; mutaÃ§Ãµes reais deram RED para `sentAtâ†’createdAt` e `timestampâ†’createdAt`. As divergÃªncias `action` ignorado e `createdAt/tagApplied` vs. `timestamp/action/tagName` ficam registadas como dÃ­vida de contrato, nÃ£o alteradas por esta extraÃ§Ã£o.
- [x] **ARCH-02 â€” reconciliaÃ§Ã£o de identidade Discord extraÃ­da** (2026-07-29): `users.controller.ts`
  **3688â†’3432** neste checkout. Os 7 handlers de merge/manual/bulk/delete passaram para controller fino +
  `UserIdentityReconciliationService` + port + adapter Mongoose; o import CSV consome o mesmo caso de uso
  (`added`/`unchanged`/`unmatched`), sem segunda implementaÃ§Ã£o. Inputs dos 3 writes antes sem boundary sÃ£o agora
  strict; lookup de email escapa metacaracteres antes da regex exata case-insensitive. Contratos HTTP de sucesso
  preservados; erros internos seguem o handler central. RED/GREEN: campos extra/`$where`, merge idempotente,
  bulk conservador, unmatched e email com `+`/`.`. Gate: lint 0, TS 0/0, Jest **95 suites / 387 passed /
  2 skipped**, build 0. Main ARCH-02 continua aberto atÃ© partir os restantes domÃ­nios gigantes.
- [x] **ARCH-02 â€” import de identidades Discord extraÃ­do** (2026-07-29): `users.controller.ts`
  **3432â†’3324**. A orquestraÃ§Ã£o CSV/XLSX passou para `DiscordIdentityImportService`, com portas explÃ­citas para
  workbook, reconciliaÃ§Ã£o e histÃ³rico, adapter Mongoose e controller fino. O audit deriva de `req.user.email`;
  `req.body.user` controlado pelo cliente deixou de ser aceite. Rota, limites, cleanup e envelope HTTP preservados.
  O adapter passou ainda a gravar o subdocumento `stats` completo (`updated`/`conflicts: 0`), evitando campos
  obrigatÃ³rios ausentes apÃ³s `findByIdAndUpdate`. RED/GREEN: serviÃ§o puro (falha por linha e estrutural), MongoMemory
  offline, autoria autenticada contra body hostil, cleanup em sucesso/falha e catÃ¡logo **437/437**.
- [x] **ARCH-02 â€” `listUsersSimple` paginado Front+Back** (2026-07-29): `users.controller.ts`
  **3324â†’2905**; o handler de 419 linhas passou para boundary strict + controller fino + serviÃ§o puro +
  adapter Mongoose. A query tem projeÃ§Ã£o explÃ­cita, sort `_id`, `limit` positivo obrigatÃ³rio e teto canÃ³nico
  200; o lookup de turmas recebe apenas os IDs da pÃ¡gina. O Front removeu `loadAll`/`limit: 10000`, valida
  respostas `unknown` com Zod, aceita metadata canÃ³nica ou legacy completa e preserva a Ãºltima pÃ¡gina vÃ¡lida
  perante erro de contrato. `curseduca.progress.estimatedProgress` ficou como fonte canÃ³nica e o
  `curseducaUserId` top-level deixou de ser descartado. Gate: API lint 0, TS 0/0, **102 suites / 418 passed /
  2 skipped**, build 0; Front format/lint 0, **199 suites / 900 passed**, build 0. Playwright nÃ£o arrancou
  browser neste sandbox: falta o Chromium headless 1228; 30 casos falharam antes de launch e 2 ficaram skipped.
- [x] **ARCH-02 â€” fronteira de analytics por turma** (2026-07-29):
  `analytics.controller.ts` **1407â†’1138 linhas**; os seis handlers que delegam em `analyticsService`
  (`getClassAnalytics`, `recalculateClassScores`, `getOutdatedClasses`, `getHealthScore`,
  `getEngagementDistribution`, `getClassAlerts`) passaram para factory injetÃ¡vel de 274 linhas + boundary strict
  de 25 linhas. Os sete mounts (health tem alias), paths e contratos de sucesso/404 ficaram intactos; erros
  inesperados passam pelo handler central com correlation ID e sem expor detalhe. `quick` e
  `recalculate-individual` ficaram no controller original porque acedem diretamente a modelos e exigem port
  prÃ³prio num corte posterior. CatÃ¡logo mantÃ©m **437/437**, apenas com evidÃªncias de linha atualizadas.
  `no-explicit-any` **842â†’836** (`analytics.controller` 16â†’10). RED/GREEN provou boundary hostil, envelopes,
  ligaÃ§Ã£o real das rotas, default seguro de `force` e preservaÃ§Ã£o dos handlers fora do corte. Gate: lint 0,
  TS **0/0**, Jest **105 suites / 439 passed / 2 skipped**, build 0. Spec:
  `docs/superpowers/specs/2026-07-29-class-analytics-boundary-design.md`.
- [x] **ARCH-02 â€” quick stats de turma extraÃ­do e corrigido** (2026-07-29):
  `analytics.controller.ts` **1138â†’1081 linhas**. `GET /api/analytics/class/:classId/quick` passou para boundary
  strict + controller fino + serviÃ§o puro + reader Mongoose injetÃ¡vel. O contrato pÃºblico mantÃ©m path, auth,
  status, envelopes, campos, mensagem da turma vazia e fÃ³rmula de percentagem. **Bug real:** o handler antigo
  consultava `status`/`isDeleted` no topo de `User`; esses campos nÃ£o existem aÃ­, pelo que ativos davam zero e
  apagados nÃ£o eram excluÃ­dos. A agregaÃ§Ã£o Ãºnica usa agora `combined.status` e `discord.isDeleted`, nÃ£o materializa
  alunos, tem `maxTimeMS` e Ã­ndice `users_class_id`. Para garantir que o Ã­ndice Ã© realmente instalÃ¡vel, foram
  removidas cinco declaraÃ§Ãµes duplicadas do prÃ³prio schema `User`; os Ã­ndices inline `sparse` equivalentes ficaram
  intactos e `User.syncIndexes()` passou offline. CatÃ¡logo/manifest permanecem **437/437**.
  `no-explicit-any` **836â†’835** (`analytics.controller` 10â†’9). RED/GREEN + mutaÃ§Ãµes provaram campos canÃ³nicos,
  exclusÃ£o de apagados, boundary hostil, envelopes, erro central e ligaÃ§Ã£o real da rota. Gate: lint 0, TS **0/0**,
  Jest **109 suites / 452 passed / 2 skipped**, build 0. Spec:
  `docs/superpowers/specs/2026-07-29-class-quick-stats-boundary-design.md`.
- [x] **ARCH-02 â€” analytics globais extraÃ­dos e corrigidos** (2026-07-29):
  `analytics.controller.ts` **1081â†’884 linhas**. `GET /api/analytics/global` passou para boundary strict +
  controller fino + serviÃ§o puro + cache TTL lazy injetÃ¡vel + reader Mongoose. **Quatro bugs reais:** o handler
  consultava `isDeleted`, `status` e `engagementScore` no topo de `User`, onde nÃ£o existem, e o resultado sem
  turmas nÃ£o cumpria o `globalAnalyticsDataSchema` obrigatÃ³rio do Front. A leitura usa agora
  `discord.isDeleted`, `combined.status` e a precedÃªncia canÃ³nica de engagement, devolve zeros completos no caso
  vazio e nunca expÃµe detalhe interno. As consultas por request desceram de **5â†’2** (turmas projetadas + uma
  agregaÃ§Ã£o de utilizadores), sem query por turma nem materializaÃ§Ã£o de alunos. O cache mantÃ©m TTL de cinco
  minutos, mas expira lazy e nÃ£o cria timer/handle no novo mÃ³dulo; o cache legacy entÃ£o isolado saiu no corte
  seguinte de `compareClasses`. CatÃ¡logo/manifest permanecem **437/437**. `no-explicit-any` **835â†’834**
  (`analytics.controller` 9â†’8), `no-console` 21â†’17 e `no-unused-vars` 2â†’1; a declaraÃ§Ã£o `OpportunityItem`
  sombreada e comprovadamente morta tambÃ©m saiu. RED/GREEN + quatro mutaÃ§Ãµes provaram apagados, estado, score e
  ligaÃ§Ã£o real da rota. Gate offline: lint 0, TS **0/0**, Jest **114 suites / 473 passed / 2 skipped**, build 0.
  Spec: `docs/superpowers/specs/2026-07-29-global-analytics-boundary-design.md`.
- [x] **ARCH-02 â€” comparaÃ§Ã£o de turmas extraÃ­da e corrigida** (2026-07-29):
  `analytics.controller.ts` **883â†’698 linhas fÃ­sicas**. `GET /api/analytics/compare` passou para boundary strict +
  controller fino + serviÃ§o puro com reader/clock/cache injetÃ¡veis + runtime explÃ­cito. **Dois bugs reais:** uma
  turma em erro produzia uma linha incompleta que o `comparisonResultSchema` do Front rejeitava, anulando toda a
  comparaÃ§Ã£o parcial; e o estado `cached` existia apenas no envelope exterior que o `unwrap()` do Front descarta,
  pelo que a UI nunca o via. As linhas de erro tÃªm agora o contrato completo, omitem `className` para preservar o
  fallback `Turma <id>` e usam mensagem pÃºblica estÃ¡vel, enquanto os resumos usam apenas turmas vÃ¡lidas; `cached`
  segue tambÃ©m dentro de `data`. Ordem e multiplicidade pedidas
  ficam preservadas e fazem parte da chave normalizada. O cache TTL de cinco minutos passou a expiraÃ§Ã£o lazy:
  saÃ­ram o `setInterval`, `unref`, mapa `any`, tipos/guard e handler legacy, com **0 referÃªncias Ã³rfÃ£s**; as
  comparaÃ§Ãµes Guru e snapshot permanecem vivas e intocadas. `no-explicit-any` **834â†’831**, `no-console`
  **2355â†’2351**, `no-unused-vars` mantÃ©m **83**. RED/GREEN + cinco mutaÃ§Ãµes provaram boundary hostil, contrato
  parcial, resumo, estado de cache visÃ­vel, wiring real e chave sensÃ­vel Ã  ordem. CatÃ¡logo/manifest permanecem
  **437/437**. Gate offline: lint 0, TS **0/0**, Jest **117 suites / 490 passed / 2 skipped**, build 0.
  Spec: `docs/superpowers/specs/2026-07-29-class-comparison-boundary-design.md`.
- [x] **ARCH-02 â€” oportunidades de turma extraÃ­das** (2026-07-29):
  `analytics.controller.ts` **698â†’446 linhas fÃ­sicas**. O endpoint vivo
  `GET /api/analytics/opportunities/:classId` passou para boundary strict + controller de 37 linhas + serviÃ§o
  puro de 352 linhas com reader/clock injetÃ¡veis e runtime explÃ­cito. As **12 regras** ficaram num registry
  ordenado e tipado; thresholds, textos, overlap intencional `progress`/`progress_critical`, prioridade estÃ¡vel,
  resumo e envelope consumido pelo `OpportunitiesCard` permanecem iguais. Query extra/operadores sÃ£o rejeitados
  antes do serviÃ§o; falhas inesperadas passam pelo error handler central com correlation ID e sem detalhe interno.
  SaÃ­ram handler/tipos/import legacy e o `classIds` comprovadamente nÃ£o usado do benchmark, com **0 referÃªncias
  Ã³rfÃ£s**; benchmarks, multi-platform e recÃ¡lculo individual permanecem vivos e intocados. `no-explicit-any`
  **831â†’830**, `no-console` **2351â†’2348**, `no-unused-vars` **83â†’82**. RED/GREEN + duas mutaÃ§Ãµes provaram o
  threshold exacto `<50`, ordem/overlap, zero-division guard, wiring real e boundary strict. CatÃ¡logo/manifest
  permanecem **437/437**. Gate offline: lint 0, TS **0/0**, Jest
  **119 suites / 505 passed / 2 skipped**, build 0.
  Spec: `docs/superpowers/specs/2026-07-29-class-opportunities-boundary-design.md`.
- [x] **ARCH-02/03 â€” benchmarks de analytics extraÃ­dos e contrato Front alinhado** (2026-07-29):
  `analytics.controller.ts` **446â†’226 linhas fÃ­sicas**. `GET /api/analytics/benchmarks` passou para boundary
  strict, controller de 36 linhas, serviÃ§o puro com clock/reader injetÃ¡veis e adapter Mongoose; a complexidade
  caiu de **1 + 3N queries para no mÃ¡ximo 2** (uma projeÃ§Ã£o de turmas + uma agregaÃ§Ã£o agrupada de utilizadores),
  independentemente do nÃºmero de turmas. A precedÃªncia canÃ³nica ficou explÃ­cita: estado
  `combined.statusâ†’status`; engagement `combined.engagement.scoreâ†’combined.combinedEngagementâ†’`
  `hotmart.engagement.engagementScoreâ†’curseduca.engagement.alternativeEngagementâ†’0`; progresso
  `combined.totalProgressâ†’Hotmart derivado de aulasâ†’curseduca.progress.estimatedProgressâ†’0`, preservando zeros,
  clamp `0..100`, exclusÃ£o de apagados e fallback legacy. Percentis nearest-rank, rankings, desempate por
  `classId`, insights, limite de dez e os dois envelopes vazios permaneceram determinÃ­sticos. O Front passou a
  validar o contrato rico real e os dois envelopes vazios; o schema inventado anterior Ã© rejeitado. CatÃ¡logo
  mantÃ©m **437/437** e o consumer foi corrigido de `front` para `desconhecido`, pois existe wrapper mas nenhum
  caller de componente. `no-explicit-any` **830â†’829**, `no-console` **2348â†’2344** e `no-unused-vars` mantÃ©m
  **82**. RED/GREEN + mutaÃ§Ãµes provaram nearest-rank, desempate determinÃ­stico, query count, wiring real e
  contrato Front. Gate API offline: lint 0, TS **0/0**, Jest **123 suites / 525 passed / 2 skipped**, build 0.
  Gate Front: lint 0, Jest **199 suites / 904 passed**, build 0; o hook
  `Front/scripts/git-hooks/pre-commit` prÃ©-existente permaneceu staged e fora do commit analytics.
  Specs: `docs/superpowers/specs/2026-07-29-analytics-benchmarks-boundary-design.md` e
  `docs/superpowers/plans/2026-07-29-analytics-benchmarks-boundary.md`.
- [x] **ARCH-02 â€” recÃ¡lculo individual por turma: boundary, streaming e escrita em lotes** (2026-07-30):
  `POST /api/analytics/class/:classId/recalculate-individual` deixou o handler legado e agora passa por input
  strict, controller injectÃ¡vel, serviÃ§o e adapter Mongoose. O controller legado `analytics.controller.ts` caiu
  de **225 para 121 linhas fÃ­sicas**; o seu `no-console` de **6 para 1** e `no-explicit-any` de **3 para 1**.
  O calculador de engagement caiu de **19 para 0 `console.*`**. A leitura Ã© um cursor Mongoose projetado e
  ordenado; a escrita passou de **1 leitura + N writes** para **1 cursor + `ceil(N/100)` `bulkWrite` unordered**.
  A rota e o catÃ¡logo continuam em **437/437**; o consumer do catÃ¡logo foi corrigido para `desconhecido`, pois o
  Front tem wrapper/hook mas nenhum caller de componente. A correÃ§Ã£o da revisÃ£o final restaurou a precedÃªncia
  nullish exata `combinedâ†’Hotmartâ†’CursEduca` com projeÃ§Ã£o dos dois nÃ­veis legacy, restringiu falhas parciais a
  erros indexados puros (write concern ambÃ­guo falha o lote inteiro) e retirou IDs estÃ¡veis do log runtime de
  lote, que agora regista apenas `failedCount` e a causa pelo redator comum. Os pares 14/15, 29/30, 49/50 e
  69/70 ficaram caracterizados com nÃ­vel e label. RED factual: adapter **5 failed / 5 passed** e runtime TS2305;
  GREEN focado: **9 suites / 65 testes**. As mutaÃ§Ãµes anteriores continuam a cobrir batch
  205â†’`[100,100,5]`, filtro de aluno apagado, ausÃªncia de writes por aluno, boundary hostil e wiring da rota. A
  integraÃ§Ã£o usou somente `MongoMemoryServer` com `MONGOMS_RUNTIME_DOWNLOAD=false`; nÃ£o usou Mongo ou integraÃ§Ãµes
  de produÃ§Ã£o. Gates frescos offline apÃ³s a correÃ§Ã£o: API lint exit **0**, TS **0 erros/0 ficheiros**, Jest
  **129 passed + 1 skipped suites; 569 passed + 2 skipped testes** (avisos preexistentes de Ã­ndices Mongoose
  duplicados e logs de modelos), build exit **0**. O gate Front anterior, sem alteraÃ§Ã£o neste lote, permanece:
  lint exit **0**, contrato **2/2 suites, 12/12 testes**, build exit **0** apÃ³s permissÃ£o apenas para
  `.vite-temp` (avisos preexistentes de browsers, classes Tailwind ambÃ­guas e chunk >500 kB). Isto nÃ£o fecha a
  matriz de papÃ©is, idempotÃªncia/caps transversal, o endpoint multi-plataforma nem o pilar ARCH-02 inteiro.
- [x] **ARCH-02/03 â€” analytics multi-plataforma extraÃ­do e agregado** (2026-07-30):
  `GET /api/analytics/multi-platform` preserva o contrato pÃºblico, strings UTF-8 e desempates exactos
  (Hotmart sÃ³ ganha com `>` sobre as duas alternativas; os restantes empates de popularidade resolvem para
  Discord e o empate de engagement para Curseduca). O handler passou para boundary strict de input vazio,
  controller e serviÃ§o injectÃ¡veis, reader Mongoose tipado e runtime de composiÃ§Ã£o; falhas seguem para o error
  handler central, que redige a causa. Uma Ãºnica agregaÃ§Ã£o limitada por `maxTimeMS` substitui as **cinco**
  `countDocuments` e as **duas** materializaÃ§Ãµes/scans completas do fluxo removido, sem `find`,
  `countDocuments`, cursor ou query por utilizador de fallback. A fixture offline medida devolve **17 total,
  4 activos, 6 Hotmart, 5 Curseduca, 4 Discord e 2 multi-plataforma**, com engagement Hotmart `4/200`,
  Curseduca `3/80` e combinado `6/355`; tambÃ©m prova IDs canÃ³nicos/legacy, ambos os guards de apagados e defesa
  contra zero, string, objecto, `NaN` e infinitos sem perder nÃºmeros negativos finitos. Foram apagados exactamente
  `src/controllers/analytics.controller.ts` e `tests/controllers/analytics.controller.test.ts`; scan final:
  ficheiro legacy ausente, **0** refs a `analyticsController`/`controllers/analytics.controller`, e **0** novos
  `console.*`, `any`, casts supressores ou `@ts-ignore` no diff (os **55** hits do scan largo jÃ¡ existiam todos em
  `33ff611`). CatÃ¡logo e manifest medidos em **437/437**.

  RED/GREEN factual: as duas mutaÃ§Ãµes `>`â†’`>=` dos empates produziram, separadamente,
  **1 failed / 8 passed** e voltaram a **9/9**; retirar `discord.isDeleted` alterou a fixture para 18 utilizadores
  e retirar o ID Hotmart legacy reduziu 6â†’5; adicionar `countDocuments({})` fez **2/2** testes RED por query extra,
  todos restaurados para **2/2** GREEN. A fuga directa de detalhe deu **1 failed / 5 passed**; retirar o guard de
  chave pontuada deu **1 failed / 5 passed**; retirar o boundary da rota deu **3 failed / 17 passed** e injectar
  uma chave extra deu **1 failed / 19 passed**; cada mutaÃ§Ã£o foi restaurada e o respectivo gate ficou GREEN.

  Gates frescos offline: API `npm.cmd run lint` exit **0**, `npm.cmd run types:check` **0 erros/0 ficheiros**,
  `npx.cmd jest --ci --runInBand` **132 passed + 1 skipped suites; 592 passed + 2 skipped testes**, e
  `npm.cmd run build` exit **0**. Front, na branch `remake`, com
  `npm.cmd --prefix ..\Front test -- --runInBand src/features/analytics src/__tests__/transportContract.test.ts`
  **8/8 suites e 39/39 testes**, lint exit **0** e build exit **0**; antes e depois, o Ãºnico staged continuou a
  ser `scripts/git-hooks/pre-commit` (52 linhas), sem modificaÃ§Ã£o ou commit. Nenhuma API externa, Mongo de produÃ§Ã£o,
  instalaÃ§Ã£o ou rede foi usada; a integraÃ§Ã£o de dados usou sÃ³ `MongoMemoryServer` offline com
  `MONGOMS_RUNTIME_DOWNLOAD=false`.

  **Falhas:** nenhuma nos gates finais. **Avisos preexistentes:** o Jest da API mantÃ©m o
  `src/models/user.ts:1145` `console.log` de inicializaÃ§Ã£o do modelo User, logs/avisos do registry de modelos
  (incluindo `ProductSalesStats` indisponÃ­vel), avisos Mongoose de Ã­ndices duplicados/chave reservada e o aviso
  offline de ActiveCampaign sem configuraÃ§Ã£o. O Front mantÃ©m o aviso TS151001 do `ts-jest`, dados
  Baseline/Browserslist antigos, duas classes Tailwind ambÃ­guas e um chunk acima de 500 kB. Nenhum destes avisos
  foi contado como falha nem corrigido fora do escopo. Continua fora deste corte: matriz de papÃ©is,
  idempotÃªncia/caps transversal e o restante pilar ARCH-02.
- [x] **ARCH-02/03 â€” fronteira de analytics Users V2 extraÃ­da e limitada** (2026-07-30):
  `GET /api/users/v2/stats` e `GET /api/users/v2/engagement/comparison` deixaram os handlers inline e passaram
  para schemas strict independentes, controllers injectÃ¡veis, serviÃ§os puros, readers Mongoose projetados e
  composiÃ§Ã£o runtime import-safe. `users.routes.ts` caiu de **570â†’315 linhas**. Stats passou de **2 queries e
  materializaÃ§Ã£o em Node para 1 aggregation** com projeÃ§Ã£o, facet e `maxTimeMS`. Comparison passou de **3 reads**
  (incluindo o batch reader) e `products.map(enrollments.filter(...))` **O(PÃ—E)** para **2 reads projetados** e
  agrupamentos lineares sobre enrollments/utilizadores + uma passagem sobre products, **O(E+P)**; os testes
  provam que os scans da fonte de enrollments nÃ£o crescem com o nÃºmero de produtos e preservam utilizadores
  com mÃ©dia zero no denominador. Contratos, `totalStudents` por matrÃ­cula,
  bandas, desempate, `trend: 0` e paths foram mantidos.

  O catÃ¡logo e manifest permanecem **437/437**, sÃ³ com evidÃªncias de linha actualizadas; contrato Front
  **10/10**, lint e build verdes. Focused backend: **10 suites / 82 testes**. Full backend offline:
  **141 passed + 1 skipped suites; 666 passed + 2 skipped testes**, lint 0, TypeScript **0/0**, build 0.
  O router perdeu suppressions obsoletas (`no-explicit-any` **7â†’1**, `no-require-imports` **6â†’2**,
  `no-console` **18â†’4**). RED/GREEN e trÃªs mutaÃ§Ãµes provaram boundary strict, wiring correcto de cada runtime e
  ausÃªncia dos dois handlers inline. O heatmap permanece **deliberadamente fora do corte**: continua com a
  Ãºnica ocorrÃªncia de `Math.random` no router; essa lÃ³gica nÃ£o foi alterada nem copiada.

- [x] **ARCH-02/03 â€” contrato Users V2 separado e code-complete** (2026-08-02): o endpoint polimÃ³rfico
  `GET /api/users/v2` ficou como adapter legado observÃ¡vel, enquanto as fontes canÃ³nicas sÃ£o agora
  `GET /api/users/v2/enrollments` (linhas de matrÃ­cula, paginaÃ§Ã£o por utilizador) e
  `GET /api/users/v2/analytics` (agregados completos no servidor). A API foi entregue no intervalo
  `8bd2592..11c6177`, com correÃ§Ãµes de plano em `5bbfeb2` e `0cf849a`; o Front migrou em
  `dc76bc1`, `6a97572`, `19eb220`, `5008494`, alinhou o manifest em `2b2b99a`, eliminou o Ãºltimo consumidor
  legado ActiveCampaign em `c186e5d` e baixou o ratchet de chamadas **188â†’187** em `9be4fc2`.

  O catÃ¡logo/manifest fecham em **439/439**, com **434 authenticated**, **19 deprecated** e as trÃªs rotas
  Users V2 presentes. O manifest do Front foi regenerado exclusivamente por
  `node scripts/gen-backend-routes.mjs ..\BO2_API`; o contract test ficou **10/10**. A varredura final em
  `src/` nÃ£o encontrou nenhuma chamada de produÃ§Ã£o direta a `/users/v2`: sÃ³ permanecem os sucessores
  `/users/v2/enrollments` e `/users/v2/analytics`. `userProductsEnvelopeSchema` continua vivo apenas no contrato
  distinto `/users/:id/products`. NÃ£o entrou segunda implementaÃ§Ã£o da query de matrÃ­culas, `populate`, N+1,
  regex crua, PII em logs, suppression ou `any` de produÃ§Ã£o neste slice; nenhum lockfile mudou.

  A prova de plano em `docs/architecture/users-v2-query-plans.md` mediu 1.200 matrÃ­culas em MongoMemoryServer
  offline. A Ãºnica deficiÃªncia seletiva foi `platform + status` (**300 docs/keys para 20 resultados**); o Ã­ndice
  evidenciado `users_v2_platform_status` reduziu para **20/20/20**, sem spill. Os restantes filtros seletivos
  jÃ¡ examinavam 1 documento/chave por resultado; default e substring literal permanecem scans explicitamente
  limitados por `maxTimeMS`. O deploy exige a sequÃªncia Railway one-off **inspect â†’ apply sÃ³ se missing â†’
  inspect verified**, usando `npm run maintenance:users-v2-indexes` e, apenas no passo gated,
  `USERS_V2_INDEX_APPLY=true npm run maintenance:users-v2-indexes`. Esta sequÃªncia **nÃ£o foi executada** aqui.

  Gates API offline: lint 0, TypeScript **0/0**, build 0, Jest **154 passed + 1 skipped suites / 780 passed +
  2 skipped testes**; egress guard e sentinel Mongo passaram, com `MONGOMS_RUNTIME_DOWNLOAD=false`. Gates Front
  finais apÃ³s `c186e5d`: focal **5 suites/38 testes**, full Jest **201/201 suites e 917/917 testes**, ESLint 0,
  `tsc --noEmit` 0, build Vite 0 (**4.021 mÃ³dulos**) e Prettier dos ficheiros tocados 0.

  **Follow-up ambiental para Claude/revisor:** o wrapper Yarn 1 nÃ£o expÃ´s os binÃ¡rios locais (`jest` nÃ£o
  reconhecido), por isso os gates usaram `node_modules/.bin`; o format global conserva o baseline vermelho de
  **94 ficheiros** e nÃ£o foi mass-formatado; o primeiro build Vite em sandbox bateu `EPERM` em
  `node_modules/.vite-temp` e o rerun autorizado passou. Playwright correu **uma Ãºnica vez**, serialmente:
  **32 total, 30 failed + 2 skipped**, todos por ausÃªncia de
  `chromium_headless_shell-1228/.../chrome-headless-shell.exe`; nÃ£o houve download nem retry. Estes sÃ£o
  follow-ups de ambiente, nÃ£o gates artificialmente verdes.

  **Estado operacional ainda aberto:** nenhum deploy, API externa ou Mongo de produÃ§Ã£o foi contactado. O legado
  sÃ³ pode ser removido depois de (1) deploy coordenado dos dois `remake`, (2) Ã­ndice inspecionado/aplicado e
  verificado, (3) janela acordada de trÃ¡fego real sem chamadas inexplicadas a `/api/users/v2` e (4) remoÃ§Ã£o
  coordenada no catÃ¡logo/manifest. AtÃ© essa observaÃ§Ã£o, nÃ£o existe `Sunset` e a rota deprecated permanece viva.

  **`GET /api/users/unified` deprecated (2026-08-05):** varredura do Front nÃ£o encontrou nenhuma chamada â€” a
  Ãºnica ocorrÃªncia Ã© o manifesto gerado â€” e nenhum mÃ³dulo do backend importa o handler alÃ©m do router; a
  evidÃªncia anterior do catÃ¡logo nomeava dois consumidores que jÃ¡ nÃ£o existem. A rota **continua montada** e
  pode ter clientes externos fora destes dois repositÃ³rios, por isso nÃ£o foi apagada. Sem `Sunset` e sem
  `successorLinks`: nÃ£o hÃ¡ sucessor equivalente, e a remoÃ§Ã£o depende de **zero trÃ¡fego observado na Vaga 1**.
  AtenÃ§Ã£o ao homÃ³nimo: `getAllUsersUnified` em `dualReadService.ts` Ã© funÃ§Ã£o interna viva e nÃ£o tem relaÃ§Ã£o
  com este handler HTTP.

- [x] **Dead-code cleanup â€” mÃ³dulos preservados apenas por testes removidos** (2026-08-03; commits
  `3398350` + `753e5c0` + cauda transitiva): apagados exactamente **499 linhas de produÃ§Ã£o** (`applyTags.ts`
  265 + `engagementCalculator.service.ts` 173 + `tagBatch.ts` 43 + o mÃ©todo `addTagsBatch` 17 + o import 1),
  **260 linhas de testes dedicados** (178 + 82) e **914 linhas de documentaÃ§Ã£o raiz obsoleta**
  (`INTEGRATION_PLAN.md` 468 + `TAG_SYSTEM_V2_IMPLEMENTATION.md` 446). A cauda tambÃ©m removeu 3 linhas
  de configuraÃ§Ã£o sem consumidor (`AC_TAG_APPLY_ENABLED`) e 4 linhas do registo histÃ³rico deste workplan;
  a instruÃ§Ã£o stale de rollback em `NATIVE_TAG_PROTECTION_SUMMARY.md` foi substituÃ­da one-for-one por
  `activeCampaignService.addTag(email, tagName)`, sem alteraÃ§Ã£o lÃ­quida de linhas. O diff de Users V2 retirou
  sÃ³ o mock negativo do calculator (`mockEngagementCalculatorModuleLoaded`/`mockBatchAverage`) e as duas asserÃ§Ãµes
  negativas; as asserÃ§Ãµes reais do `MongooseUsersV2ComparisonReader` (projecÃ§Ãµes, duas leituras, sem `populate`)
  permanecem. A entrada de suppression correspondente tambÃ©m foi podada.

  Sucessores vivos nomeados: `src/controllers/tagEvaluation.controller.ts`; avaliadores
  `src/jobs/dailyPipeline/tagEvaluation/evaluateStudentTags.ts` e `globalUserTags.ts`; `DecisionEngine` em
  `src/services/activeCampaign/decisionEngine.service.ts`; e `tagOrchestratorV2` em
  `src/services/activeCampaign/tagOrchestrator.service.ts`. A normalizaÃ§Ã£o partilhada
  `src/services/syncUtilizadoresServices/engagement/platformEngagementNormalizer.ts` continua consumida
  directamente por `UsersV2ComparisonService` (`src/services/users/usersV2Analytics.service.ts`); os
  consumidores/reader `MongooseUsersV2ComparisonReader` e `usersV2Analytics.runtime.ts` e o contrato Users V2
  canÃ³nico (`/users/v2/enrollments`, `/users/v2/analytics`, `/users/v2/stats` e `/users/v2/engagement/comparison`)
  permanecem vivos.

  RED/GREEN focado medido nos dois cortes: a suite focada do `tagOrchestratorV2`/orquestrador ficou **1 suite / 7 testes
  GREEN** antes e depois; a tentativa RED contra o mÃ³dulo apagado falhou com **TS2307, 0 testes executados**.
  O normalizer + reader + Users V2 overview ficou **3 suites / 41 testes GREEN** antes e depois; a tentativa RED
  falhou com **TS2307/module-resolution do mock obsoleto, 0 testes executados**. A varredura final de produÃ§Ã£o e
  testes encontrou **zero referÃªncias vivas** a `evaluateAndApplyTags`, `tagEvaluation/applyTags`,
  `engagementCalculator.service`, `mockEngagementCalculatorModuleLoaded` ou `mockBatchAverage`; `git ls-files`
  tambÃ©m nÃ£o lista nenhum dos quatro mÃ³dulos/documentos removidos.

  Gates offline finais (seriais, `MONGOMS_RUNTIME_DOWNLOAD=false`): lint **exit 0**; TypeScript ratchet
  **0 erros / 0 ficheiros**; Jest **159 suites passed + 1 skipped (160 total)** e **806 testes passed + 2 skipped
  (808 total)**; build **exit 0** (incluindo prebuild ratchet 0/0). Os avisos preexistentes de logs do modelo/
  registry, Ã­ndices Mongoose e ActiveCampaign sem configuraÃ§Ã£o foram mantidos como avisos. NÃ£o foi executada
  qualquer funÃ§Ã£o removida, Mongo de produÃ§Ã£o, ActiveCampaign, Discord, Guru, Hotmart, CursEduca ou rede externa;
  os testes usaram apenas fixtures/`MongoMemoryServer` local e as guardas de egress/sentinel.

### 3. Estrutura de pastas & higiene
- [x] Docs em `docs/` com Ã­ndice/estado; raiz limpa (DOC-02). Metadata do `package.json` corrigida (`name`, `main`).
  - Closeout proof (2026-08-04; offline): `repositoryHygiene.test.ts` passed **1 suite / 13 tests**. The suite verifies the root Markdown allowlist, indexed destinations and relative links (including non-Markdown renewal references), package metadata, tracked-artifact denylist, and fixed compose inputs.
- [x] Sem artefactos locais commitados; imagens de compose fixadas por versÃ£o/digest, sem credenciais default.
- [x] **EvidÃªncia root-hygiene (2026-08-03; Tasks 1â€“3):** seis documentos de raiz obsoletos/PII foram eliminados (**1,604 linhas**); quatro documentos live/histÃ³ricos foram movidos para `docs/` com notas de estado; e `docs/README.md` foi criado com secÃ§Ãµes separadas **Active**, **Reference**, **Archive**, **Plans** e **Specs**.
  - Os dois harnesses temporÃ¡rios rastreados foram eliminados (**85 linhas**). Foram removidos os **35** comandos directos de package com alvos ausentes e o `diagnose:all` quebrado; `validate:full` foi reparado para a sequÃªncia offline vÃ¡lida, e a auditoria dos alvos directos sobreviventes confirmou **10/10 existentes**.
  - A autoridade npm foi estabelecida sem alteraÃ§Ãµes ao grafo de dependÃªncias: `yarn.lock` foi eliminado (**4,961 linhas**); todas as configuraÃ§Ãµes de build activas (`package.json`, `Dockerfile` e Nixpacks) seleccionam npm; apenas `package.json` declara o esperado `npm@11.9.0`, enquanto Docker/Nixpacks usam o npm fornecido pelo ambiente.
  - Gates offline finais do Task 3: lint **0**, TypeScript **0/0**, Jest **159 passed + 1 skipped suites / 806 passed + 2 skipped tests**, build **0**. Esta evidÃªncia Ã© estÃ¡tica/offline e nÃ£o declara deploy nem observaÃ§Ã£o operacional.
  - **DOC-02 closeout (2026-08-04):** the seven Markdown files formerly at the root remain at their indexed Active/Reference/Archive destinations; the root/link/package proof above closes the box. This is repository evidence only and does not claim deployment or live observation.

### 4. Middleware & funÃ§Ãµes
- [x] **SEC-08 â€” baseline de instÃ¢ncia Ãºnica:** Helmet e rate limits separados para login, webhooks e operaÃ§Ãµes pesadas foram entregues/verificados; o limite Ã© explicitamente o baseline actual de **instÃ¢ncia Ãºnica**.
- [x] **SEC-08 â€” payload/processo:** cap global JSON, upload endurecido, timeouts de headers/keep-alive do servidor e container **nÃ£o-root** foram entregues/verificados.
- [x] **SEC-08 restante:** distributed limiter store, central correlation-aware 429 envelope, and final CSP policy are closed (2026-08-04) by the approved Task 5/6 commits.
  - Focused closeout proof (offline): **10 suites / 84 tests passed** across `repositoryHygiene`, `redisRateLimitStore`, `httpPerimeter`, config/bootstrap/startup, shutdown, auth, deployment perimeter, and CORS. Tests use local fakes and `MongoMemoryServer` only; no live Redis was contacted.
  - Production caveat: `REDIS_HOST` is required at startup for production distributed rate limiting; any non-default Redis port/username/password must be provisioned. No deployment, external API, production database, or sibling Front was exercised.
  - Final review remediation (offline): Helmet now emits only the four explicit API CSP directives on success, preflight, and 429; shutdown/rollback await all warmups before cache/infrastructure teardown. The final default unit+integration gate passed **165/165 suites / 868/868 tests**; the bounded loopback load project passed **1 suite / 2 tests** and the empty E2E project exited 0 without a browser dependency.
- [x] **Error handler central** `(err,req,res,next)` â€” mensagem pÃºblica estÃ¡vel + correlation ID; detalhe sÃ³ no logger redigido (SEC-10). O inventÃ¡rio exato desta missÃ£o caiu **188 -> 0** e o inventÃ¡rio pÃºblico `error.message`/`details` mantÃ©m **0**; os trÃªs ceilings `rawEnvironmentRead/localHttp500/publicErrorDetail` sÃ£o **0/0/0** e tÃªm mutaÃ§Ã£o/restauraÃ§Ã£o fail-closed.

  - **Tag Monitoring wave fechada no cÃ³digo (2026-08-10):** os **27â†’0** formatadores HTTP 500 locais dos trÃªs controllers foram enviados para o boundary central (monitoring **10â†’0**, notifications **9â†’0**, critical tags **8â†’0**); o inventÃ¡rio global SEC-10 caiu **233â†’206** e, na Task 4, **214â†’206**. O ratchet global acompanha exatamente os **206** sites restantes; a baseline no-explicit-any deste Ãºltimo controller caiu **8â†’0**. A Task 4 preserva envelopes de sucesso/400/404/409, IDs e ordem de writes para create, soft delete, permanent delete, toggle e prioridade; authenticate continua antes do handler e o delete permanente mantÃ©m withValidatedInput strict sobre params/query/body. Prova offline focada: **4/4 suites / 70/70 testes**; gate maior: lint-prune/lint/TypeScript/build **0**, Jest **318/318 suites / 1734/1734 testes**, git diff --check limpo e lockfiles intactos. O grep res.status(500)|error.message no domÃ­nio devolveu zero. O prerequisite Front foi fechado no commit **4758941**: o boundary canÃ³nico apiError Ã© a Ãºnica autoridade e o helper local foi apagado; testes focados, lint, TypeScript e build do Front ficaram verdes. SEC-10 global permanece aberto nos outros **206** sites; nÃ£o houve deploy nem observaÃ§Ã£o operacional.
  - **Fecho terminal SEC-10 (2026-08-11):** as vagas ActiveCampaign **188->156**, Products/Hotmart/Guru **156->116**, Sync Utilizadores **116->91**, Sync/history/conflicts **91->70** e aplicaÃ§Ã£o restante **70->0** convergiram todos os erros inesperados para o boundary central sem reescrever payloads de sucesso ou respostas locais de domÃ­nio. O scan literal final encontrou zero ocorrÃªncias executÃ¡veis e zero comentÃ¡rios enganadores. Isto Ã© fecho de cÃ³digo/offline; deploy e observaÃ§Ã£o continuam por fazer.
- [x] RedaÃ§Ã£o PII/tokens **numa sÃ³ funÃ§Ã£o** partilhada (logger + error handler): `redactSensitiveData` Ã© partilhada pelo logger e pelo error handler, e o ESLint ratchet rejeita novos `console` calls. A baseline legacy de console/suppressions continua aberta em TOOL-02.

### 5. SeguranÃ§a & rotas protegidas
- [x] **Default-deny** derivado do catÃ¡logo (SEC-01) â€” feito.
- [ ] **Matriz de papÃ©is** ADMIN/SUPER_ADMIN/sÃ³-consulta com `authorize(...)` por rota + audit log; gating equivalente no Front (fica **depois** da F3.1).
- [ ] **Toda rota destrutiva:** auth + role + **validaÃ§Ã£o de input strict** (F3.1) + **idempotÃªncia/cap/kill-switch/dry-run** onde escreve em sistemas externos (OPS-02).
- [x] **JWT/upload â€” corte principal:** JWT primÃ¡rio da app obrigatÃ³rio com validaÃ§Ã£o no arranque de segredo de pelo menos 32 caracteres; upload de importaÃ§Ã£o de utilizadores endurecido (SEC-02/05).
- [x] **JWT/debug/upload - corte fechado (SEC-03):** `JWT_SECRET`, `OLD_API_JWT_SECRET` e `STUDENT_ACCESS_JWT_SECRET` sao autoridades dedicadas, obrigatorias e separadas; `localDebugOnly` devolve 404 quando a flag esta desligada antes do handler, e o mount real em teste com a flag ligada chega ao noop mockado e devolve 204; o handler real deprecated `debugCurseducaAPI` continua a devolver 501.
  A prova e focada/offline; provisioning, deploy e observacao de producao continuam fora deste fecho.
- [x] **CORS** por `ALLOWED_ORIGINS`, fail-closed fora de local (SEC-11 / bloqueador D3): producao exige origens HTTP(S) explicitas e normalizadas, sem defaults de localhost ou hosts de producao embutidos; `createApp` sem allowlist injeta lista vazia.
  O codigo esta fechado; a lista completa de origens ainda tem de ser provisionada no ambiente antes do deploy.

### 6. Escalabilidade
- [x] **PaginaÃ§Ã£o canÃ³nica (ARCH-05 / F3.2):** helper Ãºnico offset-based de listas HTTP, cap 200 e projeÃ§Ã£o explÃ­cita onde aplicÃ¡vel, cobrindo explicitamente as superfÃ­cies migradas `usersReviewLists`, `guruWebhookList`, `guruSubscriptionList` e `usersSimpleList` (controllers + `usersSimpleList` service/repository).
- [x] **SCALE-01 inventariado:** os 40 reads classificados estao code-complete; a migracao mais ampla das restantes listagens HTTP/scans continua fora deste lote.
  - **SCALE-01 (2026-08-12, code-complete):** inventario canonico `40 = 40 complete + 0 pending`. Products users e course lessons preservam cardinalidade completa com batches `<=200`; quick heatmap e mock finito already-compliant; cohort ja usa agregacao completa com `allowDiskUse`. `scalability:reads:check` fixa ponteiros, limites, politicas e o baseline de sites Mongoose. Isto nao fecha OPS-02 nem prova carga/latencia operacional.
  - **SCALE-02 A (2026-08-11, code-complete; operacional aberto):** 11 = 11 complete + 0 pending, discriminados em 10 changed + 1 already-compliant. ComparaÃ§Ã£o de produtos passou de quatro acessos para uma agregaÃ§Ã£o; retenÃ§Ã£o de cohorts deixou de crescer por mÃªs/milestone; stats de engagement incorporam contagens de plataforma; data-source stats usam um Ãºnico facet; os restantes agregados completos preservam a populaÃ§Ã£o sem truncagem e explicitam allowDiskUse. O ratchet fixa ponteiros, tokens obrigatÃ³rios/proibidos e a distinÃ§Ã£o changed/no-op. NÃ£o prova Ã­ndices implantados, explain, cardinalidade/latÃªncia real, cache distribuÃ­da nem OPS-02.
  - **SCALE-03 B+C (2026-08-12, parcial; operacional aberto):** inventario canonico de codigo `24 = 12 complete (11 changed + 1 already-compliant) + 12 pending`. Guru trial subscription sync e analytics cache stats foram alterados; analytics warmup ja era finito e conforme. Os outros 12 writers/fan-outs pendentes mantem as razoes de ordem, compensacao, provider ou falha parcial. O gate operacional permanece `pending`: nenhum target Mongo explicitamente autorizado, nao-produtivo e read-only foi carregado para `executionStats` ou probes 1/10/50. Pela mesma densidade documentada, os sete fechos adicionais desta vaga elevam Escalabilidade para **70%**, nao 100%; o target operacional autorizado continua ausente.
- [ ] IdempotÃªncia e caps como **polÃ­tica transversal**, nÃ£o caso-a-caso (OPS-02).
### 7. Contrato de resposta
- [x] Envelope **Ãºnico** adaptado feature a feature com migraÃ§Ãµes atÃ³micas Front + Back (ARCH-03); nÃ£o permanecem versÃµes paralelas, aliases legacy, debug pÃºblico ou respostas 501.
  - **ARCH-03 fechado no cÃ³digo (2026-08-12):** **409/409** rotas montadas tÃªm decisÃ£o terminal revista e o inventÃ¡rio mantÃ©m **409 complete / 0 pending**.
  - A taxonomia final Ã© **390 `success-data` / 15 `public-document` / 3 `webhook-ack` / 1 `redirect`**. Os documentos pÃºblicos e ACKs de providers preservam deliberadamente o protocolo externo; as restantes respostas produtivas usam o contrato canÃ³nico.
  - O scan resolve **213 Front calls / 188 consumers / 0 gaps**. Consumidores reais foram migrados atomicamente com parsers estritos; nÃ£o foram criados consumidores artificiais nem fallbacks polimÃ³rficos.
  - `contracts:responses:check` e `routes:catalog:check` falham fechados perante membership, producer, consumer, shape ou evidence drift. A superfÃ­cie final tem **0** segmentos `v1`/`v2`/`v3`/`legacy`/`debug`, **0** `status(501)` no runtime e **0** decisÃµes `501-only`.
  - O fecho Ã© de cÃ³digo e evidÃªncia offline. Deploy, observaÃ§Ã£o dos HTML/PHP externos e integraÃ§Ãµes reais continuam fora desta declaraÃ§Ã£o.

### 8. Metodologias 2026 (toolchain & qualidade)
- [x] **TOOL-01 â€” TypeScript `strict` a zero erros** (2026-08-03; F3.3). O ratchet foi removido, `noEmitOnError:true` estÃ¡ activo e nÃ£o existe `tsc || exit 0` (Task 1, `8ee1c7c`). As autoridades restantes sÃ£o `strict`, `noEmitOnError`, a compilaÃ§Ã£o directa sem emissÃ£o (`npm.cmd run types:check`) e o build emissor (`npm.cmd run build`).
  - O contrato de tooling fixa `types:check` em `tsc --noEmit --pretty false`, exige `strict:true`/`noEmitOnError:true` no `tsconfig.json` e impede o regresso do ratchet.
  - Gates offline finais (2026-08-03): lint exit 0; TypeScript directo exit 0; Jest com `MONGOMS_RUNTIME_DOWNLOAD=false` â€” 159 suites passed, 1 skipped; 801 testes passed, 2 skipped; build (`tsc`) exit 0; `git diff --check` exit 0.
  - Progresso mecanico do workplan apos este fecho: `checked=94 open=10 total=104 percent=90.4`. The two closeout boxes are now checked; provisioning, deploy, and operational observation remain outside this cut.
- [ ] **ESLint** `--max-warnings=0`, baseline podada a zero; a dÃ­vida de `no-explicit-any` continua aberta sob `strict:true` (TOOL-02).
- [x] **Um** package manager autoritativo â€” todas as configuraÃ§Ãµes de build activas seleccionam npm; apenas `package.json` declara o esperado `npm@11.9.0`, enquanto `Dockerfile` e Nixpacks usam o npm fornecido pelo ambiente; `package-lock.json` Ã© o Ãºnico lockfile e `yarn.lock` foi removido (2026-08-03; TOOL-03).
- [x] Suites separadas unit/integration/load/e2e, mocks por defeito, **egress guard**; cobertura honesta e a subir (TEST-01/02). Task 4 (2026-08-04) established the non-overlapping topology; the final default inventory executes **165** unit+integration suites. The misplaced Front Playwright spec and its absent dependency were removed. `test:load` is an explicit opt-in bounded `127.0.0.1` Express/Supertest harness carrying the egress marker and passed **2/2** tests; `test:e2e` truthfully succeeds as an empty project with `--passWithNoTests`, without browser or network access.
- [ ] Config validada e tipada com **fail-fast** no arranque (OPS-01).
  - Estado em 2026-08-09: o gate de cÃ³digo estÃ¡ fechado em **0 reads / 0 ficheiros runtime** fora das composition roots explÃ­citas (`appConfig`, config de BD de teste e dois CLIs de manutenÃ§Ã£o com ambiente injetado). A caixa permanece operacionalmente aberta apenas atÃ© provisioning e arranque serem validados no ambiente alvo.

### Fecho offline, mÃ©tricas e validaÃ§Ã£o operacional

O progresso `checked/total` mede apenas o fecho mecÃ¢nico deste workplan. Mesmo `112/112` significa
**hardening offline concluÃ­do**, nÃ£o prontidÃ£o operacional nem equivalÃªncia em produÃ§Ã£o. O estado passa a
ser comunicado em quatro eixos independentes: caixas do workplan; prontidÃ£o operacional; dÃ­vida objetiva
(`no-explicit-any`, supressÃµes, `res.status(500)`, leituras raw-env e maior ficheiro); e migraÃ§Ã£o
arquitetural (`modernized`, `legacy frozen` ou `scheduled`).

Para reduzir overhead sem perder prova, lotes normais usam apenas RED/GREEN, commit convencional e uma
linha curta no ledger ativo. Plano + spec + relatÃ³rio extenso ficam reservados a autenticaÃ§Ã£o, migraÃ§Ãµes de
dados, operaÃ§Ãµes destrutivas, mudanÃ§as de contrato e Ã s superfÃ­cies de alto risco da Task 9. NÃ£o criar um
novo documento quando este workplan ou o plano ativo puder receber a decisÃ£o de forma concisa.

O desenvolvimento offline continua atÃ© `112/112`. A validaÃ§Ã£o real acontece depois, numa janela de fim de
semana, com stack legacy e stack `remake` em URLs distintas e promoÃ§Ã£o manual por trÃªs vagas:

1. **Leitura real:** ambas as stacks podem ler a BD real e APIs externas em modo estritamente read-only.
   Jobs, mÃ©todos e credenciais com capacidade de escrita ficam bloqueados. Comparar respostas, agregaÃ§Ãµes,
   Ã­ndices, latÃªncia, CORS, Redis, logs e trÃ¡fego da rota legacy. Qualquer mutaÃ§Ã£o aborta a vaga.
2. **CriaÃ§Ã£o/ediÃ§Ã£o/atualizaÃ§Ã£o:** criar primeiro uma cÃ³pia isolada da BD real. A candidata escreve apenas
   nessa cÃ³pia; a BD real e as APIs externas permanecem read-only. Validar transiÃ§Ãµes, idempotÃªncia, retries,
   caps, auditoria e ausÃªncia de alteraÃ§Ãµes fora da cÃ³pia.
3. **EliminaÃ§Ã£o:** novo snapshot da cÃ³pia antes da vaga; deletes apenas nessa cÃ³pia. Validar dry-run,
   allowlists, cascatas, referÃªncias Ã³rfÃ£s, repetiÃ§Ã£o segura, audit log e recuperaÃ§Ã£o. Nunca apagar na BD
   real nem nos serviÃ§os externos.

Antes de **cada** comando de teste live, o controller tem de parar e obter confirmaÃ§Ã£o explÃ­cita e atual do
utilizador sobre: vaga; URLs das duas stacks; hostname e nome da BD; classificaÃ§Ã£o `real-read-only` ou
`copy-write/delete`; APIs externas envolvidas e respetivo modo read-only; operaÃ§Ãµes/mÃ©todos autorizados;
snapshot/rollback; kill-switch; janela e stop conditions. NÃ£o inferir autorizaÃ§Ã£o de um `.env`, de uma
aprovaÃ§Ã£o antiga ou do nome da variÃ¡vel. NÃ£o imprimir nem persistir valores secretos; usar apenas nomes,
hosts nÃ£o sensÃ­veis e fingerprints redigidos. Sem confirmaÃ§Ã£o completa, nenhum teste live corre.

Cada promoÃ§Ã£o exige aprovaÃ§Ã£o manual, logs sem secrets, zero mutaÃ§Ãµes fora do destino autorizado, rollback
comprovado e zero findings Critical/Important abertos. A conclusÃ£o operacional sÃ³ existe depois das trÃªs
vagas; `104/104` por si sÃ³ nÃ£o a declara.

### Como se mede
Cada caixa fecha com **prova contra o cÃ³digo** (comando/teste), nÃ£o com report. O revisor regrava o estado
aqui ao validar. Ordem macro: **conter seguranÃ§a â†’ validar rotas (F3.1) â†’ paginaÃ§Ã£o (F3.2) â†’ TS zero (F3.3)
â†’ cirurgia de arquitectura (ARCH-01/02/03) â†’ ESLint/no-explicit-any â†’ suites separadas/egress guard â†’ configuraÃ§Ã£o tipada fail-fast.** CorrecÃ§Ã£o nunca cede a prazo.

### [x] Task 1 - safe operational documentation surface (2026-08-03)

- Rewritten: `docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md` (stable code-reference path).
- Deleted: `docs/HANDOFF_SWEEP_CODIGO_MORTO.md`; a scoped search found 0 live Markdown inbound links outside this workplan record and the historical plan/spec records, which intentionally reference the deletion.
- Modified: `docs/README.md` (the tag page is indexed as a code reference, not an operational runbook) and this workplan.
- Line counts measured from Git before this cleanup and from the final working tree: tag document `1,727 -> 60`; obsolete handoff `65 -> 0`; README `38 -> 38`; workplan `1,110 -> 1119`.
- Focused forbidden-pattern scan covered the two scanned current docs (`TAG_MONITORING_BACKEND_DOCUMENTATION.md` and `README.md`): `0` matches for `db.`, `reset --hard`, `git fetch`, `curl`, `npx`, `ACTIVECAMPAIGN`, `seedWeeklyTagMonitoringJob`, and `C:\Users\`.
- No document command or external system was executed. The job implementation and scheduler dispatch branch remain unchanged; operational provisioning, enabled state, and scheduling are unverified. This entry records documentation-only safety work.
### [x] ARCH-02 - extract ActiveCampaign condition evaluator (2026-08-09)

- Extracted the condition language from `decisionEngine.service.ts` into three pure, typed modules: `decisionConditionEvaluator.ts`, `decisionMetricPredicates.ts`, and `decisionConditionTypes.ts`.
- Preserved the exact compatibility grammar and precedence, including the narrower textual `AND` field set, fail-closed unknown expressions, legacy aliases/defaults, and the existing parenthesized-symbolic behavior.
- Characterization added 18 unit tests; mutation proof changed symbolic `&&` aggregation from `every` to `some`, produced RED, and returned GREEN after restoration.
- `decisionEngine.service.ts` measured `1,386 -> 890` lines. Its four `if (!dryRun)` guards, cooldown writes, decision execution, and external integration boundaries were not changed.
- Pure-module scan found zero Mongoose/model/API/environment imports and zero `any`, casts, non-null assertions, or suppressions. ARCH-02 remains open because the residual 890-line engine is still above the small-module target.
### [x] ARCH-02 - extract ActiveCampaign level policy (2026-08-09)

- Extracted rule normalization, level inference, threshold selection, confidence and the complete transition plan into pure `decisionLevelPolicy.ts` (201 lines) plus model-free `decisionLevelTypes.ts` (66 lines).
- `decisionEngine.service.ts` measured `890 -> 644` lines while preserving its four `if (!dryRun)` guards, remove-wins conflict resolution and ActiveCampaign execution boundary. Each cooldown write remains in its original transition branch.
- Added 8 pure policy tests plus non-dry-run integration characterization proving cooldown persistence precedes the first tag removal. Mutation `1 -> 2` cooldown days produced RED and returned GREEN after restoration.
- Pure-module scans found zero model/Mongoose/API/environment imports and zero `any`, casts, non-null assertions or suppressions. ARCH-02 remains open: the residual engine is still above ~400 lines and the repository still contains 61 `src/**/*.ts` files above that target.

### [x] ARCH-02 - extract ActiveCampaign context boundary (2026-08-09)

- Extracted persisted-record loading and TagRule adaptation to `decisionContextLoader.ts` (140 lines), shared contracts to `decisionContextTypes.ts` (50), and model-free metric derivation to `decisionMetrics.ts` (39).
- `decisionEngine.service.ts` measured **644 -> 447 lines**, below the approved 500-line limit. Its four `if (!dryRun)` guards, cooldown order, conflict resolution and tag execution remain in the engine.
- Added 8 focused context/metric tests. Mutation `greaterThan >=` to `>` produced the expected RED and returned GREEN after restoration; the existing dry-run/level/condition network stayed green.
- Added a fail-closed source-size ratchet with the exact remaining **38-file** debt baseline. It names new violations, rejects growth, and requires pruning when a file reaches 500 or fewer lines. No real integration was contacted.

### [x] ARCH-02 - split ActiveCampaign transport, contacts and tags (2026-08-09)

- Extracted the runtime/Axios boundary to `activeCampaignTransport.ts`, contact and custom-field operations to `activeCampaignContacts.service.ts`, and tag operations to `activeCampaignTags.service.ts`.
- The compatibility facade preserved every public method and singleton export while falling from **1,010 -> 299 lines**; the extracted source files contain 150, 180 and 230 lines, all below the 500-line limit.
- Focused characterization covers runtime client caching, retry classification, complete contact pagination, update-vs-create, custom-field no-create, idempotent tag association and absent-tag removal.
- Controlled mutations proved RED for a 5xx retry regression, first-page truncation and duplicate tag association, then returned GREEN after restoration. No real integration or production datastore was contacted.

### [x] ARCH-02 - extract ActiveCampaign product coordination (2026-08-09)

- Extracted the four UserProduct coordination flows to `activeCampaignProductTags.service.ts` (167 lines) behind an explicit Mongoose repository and late-bound facade ports.
- `activeCampaignService.ts` measured **299 -> 124 lines** and retains the complete singleton/public API. Three dynamic model imports and the remaining inline Mongo coordination were removed.
- Characterization proves ActiveCampaign writes precede local persistence, existing local tags are not duplicated, absent enrollments do not call the external boundary, and the legacy facade spy still intercepts tag removal.
- A controlled order mutation produced RED (`activecampaign,mongo -> mongo,activecampaign`) and returned GREEN after restoration. No real integration or production datastore was contacted.

### [x] ARCH-02 - dissolve cron scheduler monolith (2026-08-10)

- Deleted the 1,354-line `src/services/cron/scheduler.ts`; the unchanged public import now resolves through `scheduler/index.ts` to a 333-line focused facade.
- Extracted registry, cron expressions, job dispatch, execution lifecycle, notification boundary and system-job provisioning into cohesive modules, all at or below 333 physical lines.
- Characterization preserves manual versus scheduled persistence semantics, execution ordering, history isolation, disabled notification delivery, canonical schedule updates and create-only kill switches. Dispatch characterization also fixed the missing `DiscordScheduledMessages` route.
- The source-size baseline was pruned from 36 to 35 files above 500. All verification was offline; no external API, production datastore or live scheduler was contacted.

### [x] ARCH-02 - split five largest remaining modules (2026-08-10)

- Replaced five files above 1,100 lines with compatibility facades and cohesive focused modules: testimonials `1,216 -> 3`, CursEduca adapter `1,200 -> 15`, Clareza FMP `1,184 -> 5`, User model `1,150 -> 53`, and daily pipeline `1,101 -> 8` lines.
- Every extracted production module is at or below 442 physical lines. Public exports, model identity, route handlers, sync cardinality, pipeline ordering, partial-failure behavior, cache keys, formulas and external-boundary ordering were preserved.
- Added topology characterization before each split and retained the existing focused behavioral suites. Existing ESLint suppressions were relocated without increasing rule debt; non-breaking whitespace exposed by extraction was removed instead of suppressed.
- The fail-closed source-size baseline was pruned from **35 to 30 files above 500**. ARCH-02 remains open until that ratchet reaches zero; the largest remaining file is `guru.analytics.controller.ts` at 995 lines.
- All verification was offline. No external API, production datastore, Redis instance, scheduler or deployment was contacted.
### [x] ARCH-02 - split four large controllers (2026-08-10)

- Replaced four controllers above 900 lines with stable compatibility facades and focused owners: Guru analytics `995 -> 3` (largest extracted module 428), engagement `966 -> 4` (largest 260), Guru snapshots `944 -> 3` (largest 442), and cron management `904 -> 4` (largest 308).
- Preserved public exports, route contracts, shared cache identity, validation boundaries, response payloads and side-effect ordering. Added topology characterization for every facade and kept the relevant behavioral/security suites green.
- Corrected an extraction-only UTF-8 decoding issue before commit and removed newly exposed dead imports instead of suppressing them. Existing lint debt was relocated and pruned without increasing rule debt.
- The fail-closed source-size baseline was pruned from **30 to 26 files above 500**. ARCH-02 remains open until this baseline reaches zero.
- All verification was offline. No external API, production datastore, Redis instance, scheduler or deployment was contacted.
### [x] ARCH-02 - split ten remaining monoliths (2026-08-10)

- Decomposed ten files above 500 lines into compatibility facades and cohesive modules: CursEduca controller, Guru sync, dual-read sync, Renewal AC, sync API controller, tag orchestrator, Discord renewal, Hotmart helpers, weekly tag monitoring and Clareza Raio-X.
- Preserved public exports, singleton identity, response contracts, runtime kill switches, dry-run boundaries, cache ownership and external-write ordering. Each split received a RED topology test before implementation plus its focused behavior/security coverage.
- Every extracted production TypeScript file is at or below 500 physical lines. The fail-closed source-size baseline fell from **26 to 16 files above 500** in this batch.
- Final offline gate: lint and TypeScript clean, **301 suites / 1,645 tests** green, build green and both ratcheted inventories green. Jest emitted the known rare parallel-worker shutdown warning; prior --runInBand --detectOpenHandles investigation found zero open handles.
- No external API, production MongoDB, Redis instance, Discord bot, scheduler or deployment was contacted.

### [x] ARCH-02 - split ten medium monoliths (2026-08-10)

- Reduced ten remaining files above 500 lines through cohesive, contract-preserving splits: analytics calculator **606 -> 480**, Class facade **599 -> 5**, app config **584 -> 460**, tag evaluation **570 -> 467**, Guru cross-reference **548 -> 463**, conflict detection **547 -> 492**, Guru webhook **540 -> 489**, student OGI summary **539 -> 462**, activity snapshot service **538 -> 460**, and SyncReport model **538 -> 347**.
- Extracted pure time-series, configuration parsing, mapping, reconciliation policy, conflict-resolution policy and snapshot metric units; isolated model contracts, class entities, webhook administration and OGI access behind stable compatibility exports.
- Added a RED topology or behavioral characterization before each production split. Preserved model/singleton identity, public exports, HTTP envelopes, typed runtime boundaries and effect ordering; no real integration or production datastore was contacted.
- The fail-closed source-size baseline fell from **16 to 6 files above 500** in this batch (**62.5%**), and from the original **39 to 6** (**84.6% eliminated**). The six named residual files remain ratcheted and cannot grow or migrate silently.
- Final offline gate: lint and TypeScript clean, **311 suites / 1,660 tests** green, build green, size and production-boundary inventories green, diff checks clean, and lockfiles unchanged. Jest emitted the previously investigated rare parallel-worker shutdown warning; the existing run-in-band open-handle investigation found no leaked handles.
- ARCH-02 remains open until the six-file baseline reaches zero. Response-contract normalization remains a separate ARCH-03 phase and was intentionally not mixed into this behavior-preserving decomposition batch.

### [x] ARCH-02 - close source-size debt (2026-08-10)

- Closed the final six handwritten production TypeScript files above the approved 500-line limit: sync conflicts **507 -> 125**, ActivitySnapshot model **503 -> 406**, product sales stats builder **521 -> 339**, engagement recalculation **507 -> 414**, analytics contracts **536 -> 6**, and student data consolidator **501 -> 441**.
- Extracted cohesive conflict handlers, ActivitySnapshot contracts, sale-date resolution, deterministic engagement policy, domain analytics contracts, and class consolidation. Compatibility exports, model identity, HTTP contracts, platform precedence and enrollment semantics remain characterized.
- The fail-closed source-size baseline fell from **6 to 0 files above 500** and is now empty. New files above the limit, moved debt, baseline growth and obsolete entries continue to fail the tooling gate.
- Final offline gate: lint and strict TypeScript clean; **317 suites / 1676 tests**; build clean; no lockfile changes and no real API, production datastore, Redis, Discord or scheduler access.
- ARCH-02 is closed for the approved 500-line production-file threshold. Further sub-500 decomposition remains quality-driven rather than ratchet debt. ARCH-03 response-contract normalization remains separate and open.

### [x] SEC-10 - close public technical-error detail wave (2026-08-10)

- Migrated Renewal (6), Guru Trials (6), Achievements (4), ActiveCampaign webhooks (2) and Sync Status (1) to the single central error boundary with stable public messages, machine-readable codes and correlation IDs; internal causes remain logger-only and pass through the canonical PII redaction.
- Preserved existing validation, not-found, conflict and success contracts. Guru manual inactivation now distinguishes two typed domain failures (`TrialUserNotFoundError` and `TrialNotEndedError`) as stable 400 responses while unexpected failures use the central 500 boundary.
- Added a focused real-Express contract suite covering all 19 public-detail sites, both webhook branches, the two Guru domain errors and representative 400/404 behavior. RED proved raw email/token leakage and missing codes/correlation IDs; GREEN closes those paths without touching external integrations.
- Ratchets tightened from **206 -> 188** local HTTP 500 blocks and **19 -> 0** public `error.message`/`details` exposures. Removed obsolete lint suppressions for 15 explicit-`any` catches and 13 direct-console sites; route-catalog evidence was updated without changing the 439-route surface.
- All work and verification remained offline. No real API, production MongoDB, Redis, scheduler or deployment was contacted.

### [x] SEC-10 closure and ARCH-03 foundation (2026-08-11)

- SEC-10 closed the exact **188 -> 0** local-500 inventory while public technical detail and raw runtime-env debt remained **0**. The terminal scans found zero executable matches and zero misleading comments.
- ARCH-03 foundation catalogs **439/439** mounted routes with family counts **58/358/22/1**, keeps **13** explicit `501-only` decisions, and resolves **219 Front calls / 194 consumers / 0 gaps**. Exact-membership, check/write drift and test-only overlay ratchets are active.
- The first terminal Jest run exposed two pre-existing incomplete class-service fixtures: **333/335 suites** passed and all **2076** executed tests passed, but two suites failed TypeScript compilation. Commit `3680349` aligned those fixtures to the complete contracts without changing production; focused proof was **2/2 suites / 13/13 tests**.
- Terminal review then inventoried **46** fatal catch blocks with **47** local log calls, including **30** direct `console.*` calls, before delegation to the central boundary. Commit `8c7d8f4` reduced all three ceilings to **0**; compensating writes remain intact and all five non-fatal logs use canonical safe metadata, including the nested Guru failure-persistence path. Static mutation/restoration and representative runtime tests enforce local logger **0**, central logger exactly **1**, correlation presence and secret absence.
- Final fresh offline evidence after that correction: lint-prune, lint, strict TypeScript, response-contract check, build, diff-check and lockfile check all exited **0**; Jest passed **336/336 suites / 2092/2092 tests** in **303.937 s**, in-band with `MONGOMS_RUNTIME_DOWNLOAD=false`; zero Jest processes remained. Catalog updates were limited to **39** shifted source-evidence pointers; the **439** decisions, families, shape keys and consumers did not change. Known model-registry, Mongoose index/reserved-key, disabled-integration and exercised-error warnings remain non-failing.
- Code-complete is not operationally closed. Still open: feature-by-feature payload migration; approved production deployment/observation; SEC-01 role matrix and OPS-02; target-environment provisioning/startup; and the recorded Railway Users V2 index `inspect -> apply-if-missing -> verify` one-off. The current workplan does not list key rotation or a Railway builder change as open work, so neither is claimed or added here.
- Detailed evidence: `docs/reports/2026-08-10-sec10-arch03-foundation.md`.

### [x] Clareza comparador - parity code/evidence closeout (2026-08-11)

- The comparator slice is code/evidence complete offline: `GET /api/clareza/comparador` and `POST /api/clareza/comparador/refresh` preserve the selected legacy contract, limits (four comparison / ten manual-refresh symbols), cache-only reads, injected-refresh boundary and best-effort job order. The typed vertical replaces the legacy monolith; it is not a textual copy.
- Terminal review found two new public `error.message` paths in comparator policy-error handling. `ce6243d` replaces them with a closed typed code-to-message mapping; a real router RED used a forged detail and failed **1/6**, then GET and POST GREEN keep the canonical invalid-symbol message while the production-boundary ratchet returns to zero. `716c97d` separately pruned the exact stale Clareza-job suppression object (**0 additions / 8 deletions**).
- Final offline evidence: lint-prune/lint/strict TypeScript/response catalog/build/diff-check exit **0**; focused comparator+Clareza+route proof **17/17 suites / 89/89 tests**; post-fix comparator/SEC-10/ratchet **11/11 / 77/77**; authorized full Jest in-band with `MONGOMS_RUNTIME_DOWNLOAD=false` **344/344 suites / 2134/2134 tests** in **365.01 s**. Response catalog remains **441 decisions / 219 Front calls / 194 consumers**. Comparator-domain scans found zero `process.env`, `any`, casts, suppressions, non-null assertions, raw console or stale legacy import paths.
- This does **not** close operations: no deploy, real FMP/Redis/Mongo, scheduler, or external HTML/PHP observation was run. ARCH-03 remains open as a whole for payload normalization and atomic Front+Back migration. Detailed ledger: `docs/reports/2026-08-11-clareza-comparador-parity.md`.
