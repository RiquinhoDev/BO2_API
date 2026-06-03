# Guru Trials — Documentação de Alterações

> **Branch:** `trials`
> **Data:** 2026-06-03
> **Objectivo:** Detectar subscrições Guru em trial (7 dias), guardar na BD, listar no backoffice, marcar PARA_INATIVAR quando expiram (sem conversão). **Inativação real continua sempre manual.**

---

## ⚠️ Princípio Fundamental

**Nada inativa automaticamente.** O cron e o `checkExpiredTrials()` apenas **MARCAM** `UserProduct.status = PARA_INATIVAR`. A inativação real no CursEduca (chamada API) continua a ser feita manualmente na tab "Gerir Subscrições" / fluxo de inativação existente (`inactivateSingle` / `inactivateBulk`). **Não foi tocado.**

---

## Problema Original

A Guru API devolve `last_status: "trial"` + campos `trial_started_at`, `trial_finished_at`, `trial_days`. O sync antigo mapeava `trialing → active`, perdendo a info de trial. Impossível distinguir trial de pago.

Exemplo real: `jose.ccosta.93@gmail.com` — Clareza Mensal, trial 02/06→08/06/2026.

---

## Ficheiros Tocados (para troubleshooting)

### 1. Model — `src/models/user.ts`
- `guru.status` enum: adicionado `'trial'`
- Novos campos: `guru.isTrial`, `guru.trialStartedAt`, `guru.trialFinishedAt`, `guru.trialConvertedAt`
- **Se houver problema:** users a aparecer com status errado → verificar este enum

### 2. Types — `src/types/guru.types.ts`
- `GuruSubscriptionStatus`: adicionado `'trial'`
- `GURU_SSO_ALLOWED_STATUSES`: adicionado `'trial'` → **trial tem acesso total ao CursEduca durante 7 dias**
- **Se houver problema:** trial sem acesso ao SSO → verificar esta lista

### 3. Constants — `src/services/guru/guru.constants.ts`
- `GURU_ACTIVE_STATUSES`: adicionado `'trial'` (conta como activo)
- Novo: `GURU_TRIAL_STATUSES = ['trial']`
- `BASE_STATUS_PRIORITY`: trial=2 (entre active=1 e pastdue=3). Restantes shiftaram +1.
- `getEffectiveStatus()`: devolve `isTrial`
- **Se houver problema:** prioridade de subscrições múltiplas errada → verificar `BASE_STATUS_PRIORITY`. Ordem relativa preservada (active > trial > pastdue > pending > ...).

### 4. Sync — `src/services/guru/guruSync.service.ts`
- `mapGuruStatus()`: `trialing → trial`, `trial → trial` (ANTES: `trialing → active`)
- `saveSubscriptionToDb()`: persiste `isTrial`, `trialStartedAt`, `trialFinishedAt`
- Interface `GuruSubscription`: campos `trial_days`, `trial_started_at`, `trial_finished_at`
- **Este é o ponto central.** Todo o sync (incl. "Sync Completo") passa por aqui.
- **Se trials não aparecem:** verificar `mapGuruStatus` + `saveSubscriptionToDb`.

### 5. StatusMaps duplicados (3 locais que NÃO usavam mapGuruStatus)
- `src/controllers/guru.analytics.controller.ts` (~linha 667): `trialing → trial`
- `src/controllers/guru.snapshot.controller.ts` (~linha 864): `trialing → trial`
- `src/controllers/guru.inactivation.controller.ts` (~linha 737): protecção anti-inactivação inclui `'trial'`
- **Se houver problema:** analytics/snapshots a contar trial como active → estes maps

### 6. Trial Service — `src/services/guru/guruTrialService.ts` (NOVO)
- `listTrials()` — lista todos (activos/expiring/expired/converted)
- `getTrialStats()` — contagens
- `checkExpiredTrials()` — **só MARCA** PARA_INATIVAR (confirma na API Guru antes)
- `syncTrialsFromGuru()` — busca trials da API + actualiza BD
- `revertTrial(email)` — repõe UserProducts ACTIVE + flags trial (manual)

### 7. Trial Controller — `src/controllers/guru.trials.controller.ts` (NOVO)
- Handlers para os 5 endpoints abaixo

### 8. Rotas — `src/routes/guru.routes.ts`
```
GET  /api/guru/trials              — listar
GET  /api/guru/trials/stats        — estatísticas
POST /api/guru/trials/sync         — sincronizar da Guru
POST /api/guru/trials/check-expired — marcar expirados (NÃO inativa)
POST /api/guru/trials/revert       — reverter (body: { email })
```

### 9. Cron — NOVO job `GuruTrialCheck`
- **Job file:** `src/jobs/guruTrialCheck.job.ts` — corre `syncTrials` + `checkExpired`
- **Scheduler:** `src/services/cron/scheduler.ts` — adicionado a `jobsWithSpecificLogic` + branch `executeSpecificJob`
- **Seed:** `src/index.ts` — cria job no arranque se não existir
- **Model:** `src/models/SyncModels/CronJobConfig.ts` — `SyncType` enum + schema enum: adicionado `'guru'`
- **Schedule:** `0 7 * * *` (07:00 Europe/Lisbon, diário)
- **NÃO protegido** — pode ser editado/pausado/triggerado manualmente na UI (≠ ClarezaRefresh que é read-only)
- **Aparece em:** Sincronizar Utilizadores → lista de crons (`GET /api/cron/jobs`)

### 10. Frontend — `Front/src/pages/guru/`
- `TrialsTab.tsx` (NOVO) — tab com stats + lista + botões sync/marcar/reverter
- `GuruDashboard.tsx` — adicionada tab "⏳ Trials" + import TrialsTab

---

## Validação: Nada Partido

| Fluxo | Estado | Porquê |
|-------|--------|--------|
| **Sync Completo (Guru + CursEduca)** | ✅ Intacto + apanha trials | STEP1 `/guru/sync/all`→`saveSubscriptionToDb` (persiste trial); STEP2 `/curseduca/sync/universal` não tocado |
| `/guru/sync/all` | ✅ Não tocado | Controller `syncAllFromGuru` igual; só o service que escreve mudou (aditivo) |
| `/guru/sync/email/:email` | ✅ Intacto | Usa mesmo `saveSubscriptionToDb` |
| Inativação manual (single/bulk) | ✅ Não tocado | `inactivateSingle`/`inactivateBulk` intactos |
| Revert não-trial (`/inactivation/revert`) | ✅ Não tocado | Usa `userProductId`; trial usa endpoint próprio `/trials/revert` por email |
| Cron ClarezaRefresh | ✅ Não tocado | Continua protegido, 6/12/18h |
| Crons Hotmart/CursEduca/all | ✅ Não tocado | Switch do scheduler intacto |
| SSO acesso | ✅ Trial agora tem acesso | Adicionado a `GURU_SSO_ALLOWED_STATUSES` |

**Regressão de dados:** users antes synced como `active` que eram `trialing` na Guru passam a `trial` no próximo sync — mas mantêm acesso (`trial` ∈ `GURU_ACTIVE_STATUSES`). Comportamento esperado, sem perda de acesso.

---

## Cron — Quando Corre

| Job | Schedule | Timezone | O que faz | Protegido? |
|-----|----------|----------|-----------|-----------|
| **GuruTrialCheck** | `0 7 * * *` | Europe/Lisbon | Sync trials + marca expirados PARA_INATIVAR | ❌ editável |
| ClarezaRefresh | `0 6,12,18 * * *` | Europe/Lisbon | Tremómetro FMP | ✅ read-only |

**Ver/gerir:** Backoffice → Sincronizar Utilizadores → crons. Ou `GET /api/cron/jobs`.
**Trigger manual:** `POST /api/cron/jobs/:id/trigger` ou botão na UI.

---

## Como Testar End-to-End

1. `POST /api/guru/trials/sync` → `jose.ccosta.93@gmail.com` aparece com `isTrial=true`
2. `GET /api/guru/trials` → devolve o user com datas trial
3. `GET /api/guru/trials/stats` → `{ active: 1, ... }`
4. Backoffice tab "⏳ Trials" → mostra o user + dias restantes
5. Após 08/06: `POST /api/guru/trials/check-expired` → marca PARA_INATIVAR (confirma que NÃO chamou CursEduca)
6. `POST /api/guru/trials/revert {email}` → repõe ACTIVE + isTrial
7. `GET /api/cron/jobs` → GuruTrialCheck aparece com nextRun 07:00
8. "Sync Completo" no dashboard → completa STEP1+STEP2 sem erros, trials persistidos
9. Build: `npx tsc --noEmit` (BO2_API) + frontend — zero erros
