# BO2_API — Plano de trabalho do endurecimento (Codex)

> **Codex: lê isto primeiro.** É a tua lista de trabalho e as regras. O contexto profundo (o porquê, o método
> de revisão, o histórico) vive no repo **Front**, em `docs/superpowers/` — se tiveres acesso, lê o
> `REVIEWER-PLAYBOOK.md` e o `CONTINUITY-front-remake-review.md` §7d. Auditoria local: `API_AUDIT.md` (raiz).
>
> **Missão:** elevar esta API a arquitetura/segurança/código limpo/operacionalidade de alto nível, por
> **refactor incremental (strangler), NÃO rewrite.** Trabalho na branch `remake`.

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
npm run types:check     # ratchet TS: 194 erros / 45 ficheiros. SÓ pode descer
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
- [ ] **activecampaign (5)** ← **PRÓXIMA**
  - `DELETE /api/activecampaign/tag-rules/:id` ⚠️ param `:id`
  - `POST /api/activecampaign/v2/sync/:productId` ⚠️ param `:productId`
  - `POST /api/activecampaign/test-cron`
  - `POST /api/activecampaign/v2/tag/apply`
  - `POST /api/activecampaign/v2/tag/remove`
- [ ] **guru (4)** — `POST /inactivation/bulk`, `/inactivation/single`, `DELETE /snapshots/:year/:month` ⚠️, `/snapshots/all`
- [ ] **discord-renewal (4)** — `POST /execute`, `/messages/send`, `/scheduled/:key/test` ⚠️, `/scheduled/run`
- [ ] **cron (3)** — `DELETE /jobs/:id` ⚠️, `POST /jobs/:id/trigger` ⚠️, `/tag-rules-only`
- [ ] **renewal-ac (2)** — `POST /changes/:id/revert` ⚠️, `/execute`
- [ ] **sync (2)** — `POST /execute-pipeline`, `DELETE /history/clean`
- [ ] **tag-monitoring (2)** — `DELETE /critical-tags/:id/permanent` ⚠️, `/notifications/:id` ⚠️
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
- **F3.3 — moagem TS 194→0:** baixar o ratchet **por módulo**, um commit por módulo, números no corpo.
  `npm run types:baseline:update` para regravar (nunca à mão). Só no fim (zero erros) se remove o `tsc || exit 0`.

**Cada família/bloco entregue → reporta ao utilizador, que passa ao revisor. O revisor valida contra o código
(nunca contra o report) e desbloqueia o próximo.**
