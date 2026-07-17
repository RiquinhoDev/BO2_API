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

## ▶ Fase atual: F3.2 — ARCH-05 (paginação) — **DECIDIDA, PRONTA A EXECUTAR**

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

### Passo 2 — listas backend-only (seguras, sem Front) ← **PRÓXIMO**
- [ ] Migrar as listagens sem consumidor de "carregar tudo": alvos a enumerar com `grep -rn "find({})" src`
  (o Codex reporta a lista **antes** de mexer). **Ordenação estável obrigatória** (inclui `_id` de desempate).
  Projeção **explícita** por endpoint. Um commit por controller. **Não** trocar array↔envelope (isso é ARCH-03).
- [ ] Os **full-scans internos** (jobs/scripts/serviços que precisam do conjunto todo) **não** levam `.limit(200)`
  — usam **cursor/batch**; truncá-los alteraria resultados de jobs. Lista dos que são scan vs. listagem HTTP
  já levantada pelo Codex no report de arranque; confirmar caso a caso.

### Passo 3 — as 2 telas Guru (par Front+Back, no MESMO bloco)
- [ ] **Backend:** `guru.sso.controller.ts:245` e `guru.webhook.controller.ts:306` passam a offset 50/200 via
  helper; webhooks com projeção explícita **sem** `rawData`/`__v`; **sort server-side** (`sortField`/`sortDirection`
  → query, ordena no Mongo com `_id` de desempate).
- [ ] **Front:** larga o `useMemo` de sort client-side e envia sort ao servidor; **export passa a paginar no
  servidor** (loop de páginas a 200 até esgotar, ou endpoint CSV dedicado) — **nunca** um pedido de 10000.
  Remove o `defaultLimit=10_000` de `useGuruCore.ts`.
- [ ] **Contract tests** (provas negativas): `limit=10000` devolve **≤200** e `pages` correcto; filtros+envelope
  iguais; sort não duplica/perde itens entre páginas; `rawData` **não** sai na listagem; export traz **tudo**.
- [ ] Backend NÃO faz deploy do clamp Guru **antes** deste par estar completo (a `remake` não está em prod → há
  folga, mas entrega-se junto).

**Regra da fase:** correcção antes de elegância; caracterização primeiro onde o payload muda; gate verde entre
cada commit.

## A seguir à F3.2

- **F3.3 — moagem TS 178→0:** baixar o ratchet **por módulo**, um commit por módulo, números no corpo.
  `npm run types:baseline:update` para regravar (nunca à mão). Só no fim (zero erros) se remove o `tsc || exit 0`.
- **Depois: cirurgia de arquitectura** (ARCH-01 god-file, ARCH-02 módulos gigantes, ARCH-03 envelope) — ver
  a régua em **"Estado-alvo (Definition of Done)"**. Nota: ARCH-01 **já arrancou** (rotas montadas em
  `src/runtime/registerRoutes.ts`, não no `index.ts`).

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
