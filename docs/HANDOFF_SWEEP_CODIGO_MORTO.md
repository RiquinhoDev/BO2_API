# Handoff Codex — Sweep de código morto

> Criado: 2026-07-20 (Claude valida; Codex executa).
> Fonte: bloco "🧹 SWEEP de código morto" + regras não-negociáveis do `HARDENING-WORKPLAN.md`.
> Este doc é auto-suficiente. As regras profundas (1–9) e os gates vivem no workplan §"Regras a respeitar" — **lê-as antes de tocar em nada**.

---

## Objectivo

Remover código morto **confirmado** de `src/` — o que **nada** importa/monta/chama. Apagar lixo provado vale mais que tipar um fantasma. **Não é** refactor nem tipagem; é só deleção segura.

## Estado verificado à entrada (2026-07-20, por Claude)

- ✅ **Pré-requisito cumprido:** reengagement V1 já foi apagado. Só resta `reengagementLevels`/`IReengagement` (config de cooldown do `ProductProfile`) — **isso está VIVO, não tocar**.
- ⚠️ **A lista de candidatos do revisor no workplan está provavelmente STALE:** `ogiCourse.controller.ts` e `getDashboardStatsV3Legacy` **já não aparecem em `src/`** (grep vazio). **Não persigas a lista antiga — faz inventário fresco.**

## Protocolo (executar por ordem)

1. **Sincroniza:** `git fetch && git reset --hard origin/remake` (a história foi reescrita — nunca merge/pull por cima). Branch: `remake` (ou `chore/sweep-dead-code` a partir de `remake` se preferires isolar).
2. **Inventário fresco:** `npx knip` (ou `npx ts-prune` — **não instales, usa `npx`**). Reporta a lista crua.
   **Filtra falsos positivos ANTES de apagar:** entry points, `await import(...)` dinâmicos, jobs por side-effect (`registerModels`, crons montados por efeito), tipos usados só em `.d`/testes.
3. **Prova cada candidato (regra 9):** só é morto se **nada em `src/` o importa/monta/chama** — testa TODAS as formas: `import X`, `import { X }`, `import('...')` dinâmico, e montagem em `registerRoutes.ts`. Um `grep -rn` por unidade, colado no report.
4. **Apaga o confirmado:** **1 commit por unidade** (`chore: remove dead <nome>`), remove imports/mounts órfãos no mesmo commit. Se a unidade tinha erros contados no ratchet TS, corre `npm run types:baseline:update` no mesmo commit.
5. **PARA E PERGUNTA (regra 8) — não apagues, é decisão de comportamento:**
   - Stubs vivos `evaluateClarezaRules` / `evaluateOGIRules` (devolvem hardcoded e o Front chama-os) → reporta e espera.
   - Qualquer unidade com semântica destrutiva/ambígua ou que uma rota consuma de forma não óbvia.
6. **Report por candidato:** um de três — *confirmado morto e apagado* (com o grep) / *afinal vivo, mantido* (com quem o usa) / *precisa decisão* (com o porquê). Lista também o que o knip/ts-prune deu a mais (falsos positivos).

## NÃO TOCAR (vivo / fora de scope)

- `decisionEngine.service.ts`, `tagOrchestrator.service.ts`, o cron de tags vivo.
- Os **dois** `cronManagement.controller.ts` — famílias diferentes, **não** são duplicados.
- `reengagementLevels` / `IReengagement` (config viva).
- `scripts/git-hooks/`, `URGENT_KEY_REPLACEMENT.md`, `RENOVACAO_*.md` (outra sessão de segurança).
- `getDashboardStatsV3` (vivo, `/stats/v3`) — não confundir com o `...Legacy` (esse, se existir, é candidato).

## Regras críticas (do workplan — não-negociáveis)

- **Tudo offline.** Nunca tocar APIs reais (Guru/Hotmart/AC/CursEduca/Discord) nem Mongo de produção.
- **Não corras `npm install`.** Precisas de dep nova → **pára e pede** (o revisor actualiza os **dois** lockfiles).
- **Fonte única** — não cries 2ª cópia de nada.
- **Um assunto por commit**, Conventional Commits, **subject em minúscula** (commitlint rejeita maiúscula), trailer `Co-Authored-By`. Secret-scanner no pre-commit; `--no-verify` só em falso positivo comprovado.
- **Nunca desligar regra/guarda sem gatilho escrito.**

## Gate (verde ANTES de reportar cada unidade)

```bash
npm run lint          # exit 0. NUNCA --pass-on-unpruned-suppressions (poda suppressions órfãs ao remover código)
npm run types:check   # ratchet TS (scripts/typecheck-ratchet.js) — SÓ pode descer face ao baseline actual, nunca subir
npx jest --ci         # verde, egress guard ativo
npm run build         # exit 0 (tsc)
```

> Nota: a nota "182 erros / 44 ficheiros" no bloco antigo do workplan está **stale** (a F3.3 fechou o ratchet). Corre `npm run types:check` e respeita o baseline **actual** — não pode subir.

## NÃO é do Codex

- Regenerar `route-catalog.json` + manifest/contract do Front (quando deleções mexem em rotas) → é do **revisor**.

## Fecho

- Report final consolidado (apagados / mantidos / decisões pendentes) + gates verdes por commit.
- Actualizar o bloco "🧹 SWEEP" no `HARDENING-WORKPLAN.md` → FEITO, com a lista do que saiu e os gates.
- **Validação:** Claude confirma cada deleção contra o código (grep de refs = 0), gates, e commita/valida o report.
