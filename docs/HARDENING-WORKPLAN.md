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
npm run types:check     # ratchet TS: 184 erros / 44 ficheiros. SÓ pode descer
npx jest --ci           # verde, egress guard ativo
npm run build           # exit 0
```

A regeneração do manifest de rotas e o contract test correm no Front — **isso é do revisor**, não teu.

---

## Fase atual: F3.1 — SEC-09 (validação de input nas rotas destrutivas)

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
- [ ] **tag-monitoring (2)** ← **PRÓXIMA** (ficheiro `tagMonitoring.routes.ts`, montado em `/api/tag-monitoring`)
  - `DELETE /api/tag-monitoring/critical-tags/:id/permanent` ⚠️ param `:id` (ObjectId — confirmado `findByIdAndDelete`)
  - `DELETE /api/tag-monitoring/notifications/:id` ⚠️ param `:id` (ObjectId — confirmado `findByIdAndDelete`)
  - Nota A ⚠️ **middleware `authenticate` inline**: estas rotas são `router.delete(path, authenticate, controller)`.
    Insere o `withValidatedInput` **depois** do `authenticate`, não o largues: `router.delete(path, authenticate,
    withValidatedInput(schema, (input, _req, res) => controller(input, res)))`. Ambos os `:id` são ObjectId;
    o check interno `if (!id)` fica redundante mas **não o removas**.
  - Nota B (teste) ⚠️: como o `authenticate` corre inline, a suite isolada apanha **401 antes** da validação.
    Mocka-o: `jest.mock('../../src/middleware/auth.middleware', () => ({ authenticate: (_req,_res,next)=>next() }))`.
    Só assim os testes de 400 (campo extra / NoSQL / `:id` válido→handler) exercem a fronteira de validação.
- [ ] **classes (1)** — `DELETE /:classId` ⚠️
- [ ] **curseduca (1)** — `POST /cleanup`
- [ ] **events (1)** — `DELETE /:id` ⚠️
- [ ] **product-profiles (1)** — `DELETE /:code` ⚠️
- [ ] **reengagement (1)** — `POST /evaluate/:userId/execute` ⚠️
- [ ] **test (1)** — `POST /test/history/delete-test-events` (já atrás de `ENABLE_DEBUG_ROUTES`; menor risco)
- [ ] **testimonials (1)** — `DELETE /:id` ⚠️

> ⚠️ = tem path param → modela-o na shape (ver a armadilha acima).

---

## A seguir à F3.1

- **F3.2 — ARCH-05 (paginação):** helper único com min/max e projeção explícita; há defaults de **10 000**
  (`guru.sso.controller.ts`, `guru.webhook.controller.ts`) e `find({})` sem limite.
- **F3.3 — moagem TS 184→0:** baixar o ratchet **por módulo**, um commit por módulo, números no corpo.
  `npm run types:baseline:update` para regravar (nunca à mão). Só no fim (zero erros) se remove o `tsc || exit 0`.

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
