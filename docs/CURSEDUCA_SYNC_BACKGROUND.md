# CursEduca Sync — Fix Timeout/CORS (Background + Polling)

> **Data:** 2026-06-03
> **Problema:** "Sync Completo (Guru + CursEduca)" dava erro CORS no STEP 2.

---

## Diagnóstico (com simulação real)

O botão "Sync Completo" faz 2 passos:
- **STEP 1** `GET /guru/sync/all` → ~0.6s ✅
- **STEP 2** `GET /curseduca/sync/universal` → **~27s+** (520 membros)

STEP 2 faz **enrich por membro** (`/members/{id}` para `lastLogin`+`situation`, concurrency 5). 520 membros ≈ 26s só de enrich. Cruza o timeout do proxy Railway (~30-60s) → resposta sem headers CORS → browser reporta "CORS". **Não era CORS real — era timeout.**

Confirmado por simulação: STEP 1 apanha 50 subs + 1 trial em 0.6s; STEP 2 lista 520 membros (3 grupos) + enrich ~26s.

---

## Fix — Background + Polling (aditivo, zero regressão)

O endpoint síncrono `/curseduca/sync/universal` **fica intacto** (usado por cron e outros — server-side, sem proxy timeout). Adicionados 2 endpoints NOVOS:

| Endpoint | O que faz |
|----------|-----------|
| `GET /curseduca/sync/universal/start` | Inicia sync em background, devolve **202 imediatamente** (sem bloquear → sem timeout) |
| `GET /curseduca/sync/status` | Estado para polling: `{ running, startedAt, finishedAt, error, result }` |

### Como funciona
- `syncCurseducaUsersStart` reutiliza **100%** o handler existente `syncCurseducaUsers` passando um `res` falso que captura o resultado.
- Lock em memória (`global.__curseducaSyncRunning`) impede syncs concorrentes (409 se já a correr).
- Promise fire-and-forget — processo Railway mantém o event loop vivo após o 202.

### Frontend (`GuruDashboard.tsx` → `startFullSync`)
- STEP 2 agora chama `/start` (202) e faz **polling** de `/status` cada 4s.
- Limite: 225 polls ≈ **15 min** de margem. Dá tempo a correr tudo, por muito grande que seja.
- Mostra erro se `status.error`, ou conclui quando `running=false`.

---

## Ficheiros Tocados

| Acção | Ficheiro |
|-------|---------|
| MODIFICAR | `src/controllers/syncUtilizadoresControllers/curseduca.controller.ts` — +`syncCurseducaUsersStart` +`getCurseducaSyncStatus` (no fim, aditivo) |
| MODIFICAR | `src/routes/curseduca.routes.ts` — +2 rotas |
| MODIFICAR | `Front/src/pages/guru/GuruDashboard.tsx` — STEP 2 background+polling |

**Intacto:** `/curseduca/sync/universal` síncrono, `syncCurseducaUsers` core, cron, todo o resto.

---

## Garantias

| | |
|--|--|
| Timeout/CORS volta? | ❌ Não — trigger devolve 202 em <1s, nunca cruza limite do proxy |
| Dá tempo a correr tudo? | ✅ Polling até ~15 min; sync corre em fundo o tempo que precisar |
| Syncs concorrentes? | ✅ Bloqueados por lock (409) |
| Regressão no sync existente? | ❌ Endpoint síncrono e handler core intactos |
| Apanha trials (STEP 1)? | ✅ Confirmado por simulação |

---

## Teste

1. Clicar "Iniciar Sync Completo" → STEP 1 rápido, STEP 2 mostra "A sincronizar CursEduca..." sem erro CORS
2. `GET /curseduca/sync/status` → `running:true` durante, `running:false`+`result` no fim
3. Iniciar 2x seguidas → 2ª devolve 409 (lock)
4. Confirmar stats finais aparecem na UI (inseridos/atualizados + crossReference)
