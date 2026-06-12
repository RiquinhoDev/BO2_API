# Plano — Estado (inactivação) + Conquistas (achievements)

> **Projecto:** OGI / Ser Riquinho · **Data:** 2026-06-12
> **Para:** execução pelo Codex, **uma tarefa de cada vez** (não juntar; validar cada uma antes de avançar)
> **Bases:**
> - BO2_API (TS): `Documents\GitHub\Riquinho\api\Front\BO2_API`
> - Front alunos: `...\Comunidade\Comunidade_login`
> **Reutiliza:** `parseTurmaName(className)` em `BO2_API/src/services/renewal/turmaParser.ts`
>   (devolve `accessEndOgi` = expiração real, já trata turmas de 1 e 2 anos).

---

## Contexto / achados (verificados na BD real)

Aluna de referência: **dionisiaportela@gmail.com** (turma 2, `Turma 2 [3a renov] | 2506`).
- Compra original: **22/05/2025**. Renovou → acesso real até **01/07/2026** (19 dias no momento).
- **Estado mostrado: INACTIVE** (errado — ela está activa).
- **Conquistas: 0/0** (errado — qualifica para **10/26**, confirmado a correr o evaluator).

Dois bugs/lacunas distintos, ambos a afectar produção.

---

# CENÁRIO A — Inactivação automática ignora renovações (bug)

## Problema
O sync diário inactiva alunos com **`purchaseDate + 380 dias`**, usando a **data da compra original**, sem olhar à renovação. Renovados são inactivados indevidamente.

## Achado (evidência)
- `BO2_API/src/services/syncUtilizadoresServices/universalSyncService.ts`
  - `const EXPIRATION_DAYS = 380` (~linha 713)
  - Detecta/inactiva por `daysSincePurchase > 380` (~linhas 627-628, 710-842)
  - Grava `inactivation.reason = "Compra expirada: N dias (limite: 380)"`, `inactivatedBy = "Sistema - Expiração Automática"`, e põe `status = INACTIVE` (UserProduct + `combined.status`).
- dionísia: `inactivation.inactivatedAt = 2026-06-08`, `reason = "Compra expirada: 381 dias"` — apesar de ter renovado (expira 01/07/2026).
- Impacto: não é só o display — `combined.status` INACTIVE pode afectar acesso Discord/comunidade.

## Solução
A inactivação tem de usar a **expiração real da turma**, não `purchaseDate + 380`:
- Para cada aluno, obter a className activa (`user.hotmart.enrolledClasses[].className`, a activa) → `parseTurmaName(className).accessEndOgi`.
- Inactivar **só se** `accessEndOgi < hoje` (opcional: margem de N dias de tolerância, ex. 0–2).
- Fallback: se o nome não tiver período (`!hasExpiry`), manter o comportamento antigo (`purchaseDate + 380`) **só** nesses casos.
- **Reconciliar**: reactivar quem foi inactivado pelo "Sistema - Expiração Automática" mas cuja `accessEndOgi >= hoje` (corrigir os já afectados, ex. a dionísia).

## Ficheiros
- MODIFICAR `src/services/syncUtilizadoresServices/universalSyncService.ts` (lógica de expiração/inactivação)
- CRIAR `scripts/maintenance/reactivate-wrongly-inactivated.ts` (reconciliação one-off)

### Prompt Codex — A
```
Contexto: BO2_API. O sync diário (src/services/syncUtilizadoresServices/universalSyncService.ts)
inactiva alunos com purchaseDate + 380 dias (EXPIRATION_DAYS=380, ~linhas 627-628 e 710-842),
ignorando renovações. Alunos renovados (ex: "Turma 2 [3a renov] | 2506", acesso real até
01/07/2026) são inactivados pela compra original. Existe parseTurmaName(className) em
src/services/renewal/turmaParser.ts que devolve accessEndOgi (expiração real, 1 e 2 anos).

Tarefa:
1. Na lógica de inactivação por expiração, substituir o critério purchaseDate+380 por:
   - obter a className activa do aluno (hotmart.enrolledClasses, a que tem isActive!==false)
   - p = parseTurmaName(className)
   - se p.hasExpiry: expirado = p.accessEndOgi < now
   - senão (sem período no nome): fallback ao critério antigo (purchaseDate + 380 dias)
   Só inactivar quando 'expirado' for true.
2. Manter os campos de inactivation (inactivatedBy/reason) mas com a razão correta
   (ex: "Acesso expirado: <accessEndOgi>"), e atualizar status/combined.status coerentemente.
3. CRIAR scripts/maintenance/reactivate-wrongly-inactivated.ts: percorre users com
   inactivation.inactivatedBy = "Sistema - Expiração Automática" e isManuallyInactivated=true;
   se parseTurmaName(classNameActiva).accessEndOgi >= now → reactivar (limpar inactivation,
   status ACTIVE, combined.status conforme as outras plataformas). Modo DRY_RUN por env.
   npm script "reactivate:expired-fix".

Aceitação: dionisiaportela@gmail.com volta a ACTIVE; o sync deixa de inactivar renovados com
acesso válido; só inactiva quem passou da expiração REAL da turma. Respeita acentuação PT.
```
**Aceitação A:** correr o sync não inactiva a dionísia; script de reconciliação reactiva os afectados; summary mostra ACTIVE.

---

# CENÁRIO B — Conquistas: avaliação automática + flag "mostrado" no servidor

## Problema
1. **Nunca avalia sozinho** → `user.achievements` vazio → summary mostra 0/0. Só corre via
   `POST /api/achievements/evaluate(-all)` manual. (dionísia qualifica para 10/26, confirmado.)
2. **Flag "mostrado" é client-side** (`localStorage['seenAchievements']` em
   `Comunidade_login/src/hooks/useAchievements.js`) → reaparece noutro device/ao limpar cache,
   ou nunca aparece. Tem de ser **no servidor**.

## Achados
- `BO2_API/src/services/studentOgiSummary.service.ts`: importa `evaluateAchievements` (linha 7)
  mas **não o usa** — só lê o cache via `buildAchievementsResponse(user.achievements, ...)`.
- `BO2_API/src/routes/achievements.routes.ts`: tem `POST /evaluate/:email` e `POST /evaluate-all`
  (avaliam + gravam `user.achievements` / `user.achievementStats`).
- `BO2_API/src/services/achievements/achievementEvaluator.ts`: `evaluateAchievements(user)`.
- Front: `useAchievements.js` calcula `newAchievements = unlocked && unlockedAt && !seen[id]`
  (seen via localStorage); `SuccessPage.jsx` mostra `AchievementBannerQueue` + `markAllNewAsSeen`.

## Solução (subdividir)

### B1 — Avaliar automaticamente (backend)
- No `getStudentOgiSummary`, se o cache estiver vazio **ou desatualizado** (ex: `achievementStats.lastEvaluatedAt` > 12h ou inexistente): correr `evaluateAchievements` e **persistir** no user. Caso contrário, usar o cache. (Evita avaliar a cada load.)
- CRON diário a chamar `evaluate-all` (mantém fresco para quem não abre a página). Registar no scheduler existente (padrão `CronJobConfig`, como o `RenewalOfferSync`).

### B2 — Flag `seenAt` no servidor
- No model `User` (schema dos achievements): cada item passa a ter `unlockedAt` (já existe) + **`seenAt: Date | null`**. `unlockedAt` é **sticky** (nunca recalcular se já estiver definido).
- O summary devolve, por achievement: `isUnlocked`, `unlockedAt`, **`isNew = unlockedAt && !seenAt`**.
- CRIAR `POST /api/achievements/mark-seen` (body: `{ token, ids: string[] }` ou via token do aluno) → grava `seenAt = now` nos ids indicados.

### B3 — Backfill sem enxurrada de banners (CRÍTICO)
- Quando se avalia pela **primeira vez** (ou no `evaluate-all` de backfill), marcar os já-desbloqueados com **`seenAt = now`** → não fazem banner. Só desbloqueios **futuros** (sem `seenAt`) fazem banner.
- Sem isto, a dionísia abre a página e leva 10 banners de uma vez.

### B4 — Front usa o servidor (não localStorage)
- `useAchievements.js`: `newAchievements` passa a vir do servidor (`isNew`), não do `localStorage`.
- `markAllNewAsSeen` chama `POST /achievements/mark-seen` (persiste), em vez de gravar no localStorage.
- Manter UI dos banners.

## Ficheiros
- MODIFICAR `BO2_API/src/services/studentOgiSummary.service.ts` (avaliar-se-stale + devolver isNew)
- MODIFICAR `BO2_API/src/models/user.ts` (achievements[].seenAt)
- MODIFICAR `BO2_API/src/routes/achievements.routes.ts` (mark-seen; backfill seenAt no evaluate-all)
- MODIFICAR `BO2_API/src/services/cron/scheduler.ts` (cron diário evaluate-all)
- MODIFICAR `Comunidade_login/src/hooks/useAchievements.js` + `src/services/Api.js` + `SuccessPage.jsx`

### Prompt Codex — B (executar B1→B4 por esta ordem)
```
Contexto: BO2_API + Comunidade_login. As conquistas só são avaliadas via endpoints manuais
(/api/achievements/evaluate-all) e a flag "visto" é só localStorage no front, logo os alunos
veem 0/0 e os banners não são fiáveis cross-device. evaluateAchievements(user) já existe
(src/services/achievements/achievementEvaluator.ts) e devolve { achievements, stats } com
unlockedAt. O summary (studentOgiSummary.service.ts) hoje só lê o cache.

B1 — Avaliação automática:
 - Em getStudentOgiSummary: se !user.achievements OU achievementStats.lastEvaluatedAt > 12h,
   correr evaluateAchievements e gravar no user (achievements + achievementStats). Senão usar cache.
 - Registar cron diário no scheduler (padrão CronJobConfig, como RenewalOfferSync) que corre a
   avaliação de todos os users com hotmart.purchaseDate (igual ao /evaluate-all).

B2 — Flag seenAt no servidor:
 - user.ts: cada achievement passa a ter seenAt (Date, default null). unlockedAt é sticky:
   ao reavaliar, NÃO sobrescrever unlockedAt já existente; nem seenAt já existente.
 - O summary devolve por achievement: isUnlocked, unlockedAt, isNew = Boolean(unlockedAt && !seenAt).
 - POST /api/achievements/mark-seen: recebe token do aluno (mesmo esquema do summary) + ids[],
   grava seenAt=now nesses achievements do user.

B3 — Backfill sem enxurrada (IMPORTANTE):
 - Na 1ª avaliação de um user (e no evaluate-all de backfill), os achievements já desbloqueados
   nesse momento ficam com seenAt = now (não fazem banner). Só desbloqueios futuros têm seenAt=null.

B4 — Front (Comunidade_login):
 - useAchievements.js: newAchievements vem do isNew do servidor (não do localStorage).
 - markAllNewAsSeen chama POST /achievements/mark-seen (via Api.js, usando BO2_API_URL) e só
   depois limpa localmente. Remover dependência do localStorage para o "visto".
 - Manter AchievementBannerQueue.

Aceitação: dionisiaportela abre a página e vê 10/26 (sem 10 banners de golpe — todos vêm como
"vistos" no backfill); quando desbloquear um NOVO, aparece banner UMA vez e não reaparece noutro
device. Acentuação PT.
```
**Aceitação B:** 0/0 desaparece; banners só para novos, uma vez, cross-device.

---

# CENÁRIO C — Streak (sequência de dias) — feature à parte

## Problema
`currentStreak`/`bestStreak` = 0 (não há tracking) → `streak_7_dias`, `streak_30_dias`,
`streak_100_dias`, `streak_365_dias` e `fenix` **nunca desbloqueiam**.

## Solução
- Registar atividade diária do aluno (login/abertura da página / último acesso por dia) e calcular
  a sequência de dias consecutivos: `currentStreak` (atual) e `bestStreak` (recorde).
- Guardar no user (ex: `engagement.streak = { current, best, lastActiveDay }`).
- Alimentar o `evaluateAchievements` com esses valores.

### Prompt Codex — C
```
Contexto: BO2_API. As conquistas de streak não desbloqueiam porque currentStreak/bestStreak=0
(não são calculados). Tarefa: registar atividade diária do aluno e calcular streak.
- Ao carregar o summary (ou num endpoint de "ping" do front por sessão/dia), atualizar
  user.engagement.streak: se lastActiveDay = ontem → current+1; se = hoje → manter; senão → reset a 1.
  best = max(best, current). lastActiveDay = hoje (UTC date).
- evaluateAchievements passa a usar user.engagement.streak.current/best para as conquistas de streak.
Aceitação: um aluno que entra em dias consecutivos vê currentStreak subir e desbloqueia streak_7_dias
ao 7º dia. Acentuação PT.
```
**Aceitação C:** streak sobe com dias consecutivos; conquistas de streak desbloqueiam.

---

## Ordem de execução (handoff — uma de cada vez)

| # | Tarefa | Base | Porquê primeiro |
|---|--------|------|-----------------|
| 1 | **A** — fix inactivação (renovados) + reconciliação | BO2_API | bug em produção a tirar estado/acesso a renovados |
| 2 | **B1+B2+B3** — avaliação auto + seenAt + backfill | BO2_API | desbloqueia o 0/0 sem enxurrada de banners |
| 3 | **B4** — front usa seenAt do servidor | Comunidade_login | depende de B1–B3 |
| 4 | **C** — streak | BO2_API | maior, independente; pode vir depois |

**Regras de qualidade (cada tarefa):** correr/validar antes de avançar; respeitar acentuação PT;
não partir o que já funciona (parser, matcher, summary); commits separados por tarefa
(`fix(status): …`, `feat(achievements): …`, `feat(streak): …`); reportar o resultado da aceitação.
