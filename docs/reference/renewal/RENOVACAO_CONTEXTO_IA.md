# Renovação OGI — Contexto para IAs/Agentes (handoff)

> **Lê este ficheiro primeiro.** É o ponto de entrada para qualquer IA/agente que venha trabalhar no ecossistema de renovações OGI. Detalhe completo nos dois planos: `RENOVACAO_OGI_BO_PLAN.md` (sync AC) e `RENOVACAO_DISCORD_CARGOS_PLAN.md` (cargos Discord).
> **Última actualização:** 2026-07-10. Autor do contexto: sessão Claude com o João (joaomcf37@gmail.com).

---

## 1. TL;DR

O produto "OGI — O Grande Investimento" (curso, vendido na **Hotmart**) tem renovações anuais geridas por automações na **ActiveCampaign (AC)** e uma comunidade no **Discord** ("Os Riquinhos"). O BackOffice (BO) automatiza o que era checklist manual da equipa:

1. **Sync BO→AC** (`RenewalAcSync`): quando um aluno muda de turma (renova), escrever a data de expiração no campo AC + trocar a tag de turma; reverter tag em reembolso.
2. **Cargos Discord** (`DiscordRolesSync`): cada aluno recebe o cargo `R. {Mês}` do seu mês de renovação (derivado da turma Hotmart), reconciliado todas as noites; + área no BO para o bot publicar mensagens que mencionam `@R. {Mês}` (notifica só as pessoas certas).

**ESTADO ACTUAL (2026-07-11):**
- **Discord: LIGADO, validado e COM AUTH** — piloto confirmado ponta a ponta (2 contas de teste com cargos verificados por leitura à API Discord). `DISCORD_ROLES_SYNC_ENABLED=true`, `DISCORD_ROLES_AUTO_EXECUTE=true`, cap 150, cron LIGADO (05:30). Backfill correu de noite via cron (confirmar contagens APPLIED na tab). Mensagens TESTADAS e a funcionar no menu Comunicados (envio sem menções + com mês). **Fase D5 concluída (2026-07-11): `BOT_SHARED_SECRET` activo nos 2 serviços — /renewal/* exige `X-Bot-Auth`, verificado 401 sem header; porta 3002 confirmada não exposta (detalhe: secção 11.5 do plano Discord).** Endpoints de produção vivem em `API/routes/renewal.js` (montados no api.js — o bot1.js é LEGACY, não corre em produção).
- **Mensagens agendadas (automatismo):** PLANO PRONTO na **secção 12 do plano Discord** (regras dia 8 lembrete + dia 15 último aviso ao cargo `R. {mês anterior}`, cron nasce desligado, idempotência por mês). Aguarda luz verde do João para implementar (decisões D-e1..D-e5 na tabela 12.4).
- **AC (RenewalAcSync): construído e 100% DESLIGADO** — cron `enabled:false` (07:30), switches `RENEWAL_AC_*` false. Checklist por fazer (secção 15 do plano AC).
- Nota UX Discord: cargos R.* têm hoist=false → não aparecem na sidebar de membros; ver no perfil do membro.

## 2. Mapa do ecossistema

| Componente | Path local | Git remote | Deploy |
|------------|-----------|------------|--------|
| Backend BO | `C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API` | github.com/RiquinhoDev/BO2_API | Railway (push a main = deploy) |
| Frontend BO | `C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front` | github.com/RiquinhoDev/Front | Railway |
| Bots Discord + API legacy | `C:\Users\User\Documents\GitHub\Riquinho\api\API` | (git local; produção = `api.serriquinho.com`) | Railway |

- BD: MongoDB Atlas, db `riquinho`. Colecções-chave: `users` (email = chave; `hotmart.enrolledClasses`, `discord.discordIds[]`), `userproducts`, `cronjobconfigs`, `renewalacchanges`, `discordrolechanges`, `discordrolestates`, `discordmessagetemplates`, `discordmessagelogs`, `studentclasshistories`.
- Externos: Hotmart (vendas/turmas), ActiveCampaign (email marketing), Discord (guild "Os Riquinhos" `1179187507875827782`), Guru (subscrições Clareza — produto irmão, fora deste âmbito).
- ⚠️ Pastas `FinHub-Vite` e `API_finhub` no mesmo workspace são de OUTRO projecto (FinHub) — ignorar aqui.

## 3. Conceito central: nome da turma = fonte de verdade

A Hotmart não expõe data de expiração. O nome da turma carrega tudo:
`"Turma 10 [renov] + REITs | 2505"` → turma 10, renovação, período 2505 (Maio 2025) → acesso termina no último dia de Maio/2026 (+12 meses; `[2anos]` = +24).

Parser canónico: `BO2_API/src/services/renewal/turmaParser.ts` (`parseTurmaName`, `resolveAccessEnd`). **Nunca reimplementar este parsing — usar sempre este módulo.** O mês de `accessEndOgi` é simultaneamente: o mês da tag de renovação AC e o mês do cargo Discord.

## 4. Padrão de segurança comum (usado nos 2 subsistemas — replicar em features futuras)

1. **Change set persistido**: nenhuma escrita externa directa. Gera-se um plano na BD (`PLANNED`) revisável na UI → aprovar → executar. Estados: `PLANNED → APPROVED → APPLIED / FAILED → REVERTED`, + `BLOCKED` (guard recusou, com motivo) e `EXPIRED` (planos velhos nunca executam: TTL 24h/48h).
2. **Kill switches em runtime** (env vars lidas a cada execução, nunca cacheadas no boot). Master + por operação. Default `false`; feature nasce morta.
3. **Cron nasce desligado** (`schedule.enabled:false`) e o **seed é create-only** — NUNCA repor `enabled`/`isActive` no arranque (houve um bug histórico no seed do ClarezaRefresh que forçava enabled no boot; foi corrigido — não reintroduzir).
4. **Allowlists**: só tags `Aluno OGI ... Turma ...` (regex `TURMA_TAG_REGEX`) podem ser removidas na AC; só os 12 role IDs `R.*` podem ser geridos/mencionados no Discord; só o canal permitido recebe mensagens.
5. **Caps + detector de anomalia**: máx. N operações/run (50 AC, 100 Discord); se >5% dos alunos "mudarem" no mesmo dia → abortar (provável falha da API Hotmart), excepto backfill inicial.
6. **Diff antes de escrever** + captura do valor "before" (permite reverter) + idempotência (re-executar é seguro).

## 5. Factos verificados (auditorias read-only 2026-07-09/10)

**ActiveCampaign:**
- Campo `[Hotmart] Data de expiração` = field id **332**, formato `YYYY-MM-DD`, 4.404 contactos preenchidos. ⚠️ título tem espaço à frente — usar sempre o ID. ⚠️ Existe um campo armadilha `Data de Fim` (id 333) VAZIO — não usar.
- Convenção real das tags de turma: `Aluno OGI L{YYMM} - Turma {N}` (original) e `Aluno OGI {YYMM} - Renovação Turma {N}` (renovação), sufixo `[2anos]`. Gerador: `buildTurmaTagName()` em `renewalAcSync.service.ts`.
- ⚠️ Tags duplicadas hífen vs travessão (ex.: `OGI - Atualizar Data de Termino` id 677 com subs vs id 707 com 0) — usar a variante com subscribers; equipa deve fundir.
- A tag `OGI - Atualizar Data de Termino` (677) é a fila de trabalho do "sistema externo" (=o BO); tinha 6 contactos pendentes — candidatos a piloto.
- `nativeTagProtection` do BO só autoriza remover tags com prefixo `BO_...`; as tags de turma NÃO têm esse prefixo → o executor do renewal-ac usa a sua própria allowlist regex (excepção deliberada e documentada).

**Discord:**
- Guild "Os Riquinhos" `1179187507875827782`. Canal de mensagens: `🗣📢︱anúncios-alunos` = `1182457352012697671`.
- 12 cargos criados: `R. Janeiro`…`R. Dezembro`, IDs na secção 7.1 do plano Discord e hardcoded (com override por env) em `discordRolesSync.service.ts` e `bot1.js`. permissions=0, fundo da hierarquia. Comparar SEMPRE por ID, nunca por nome.
- Cargo do bot "Ser Riquinho" (pos 59) tem send_messages mas NÃO tinha mention-all-roles → João deu override no canal (2026-07-10).
- Cobertura: 2.286/4.430 alunos com turma têm Discord ligado (51,6%); 104 com múltiplos IDs (cargo aplica-se a todos). Não-ligados: nada a fazer — a reconciliação nocturna apanha-os quando ligarem.
- Bot: `API/bot1.js`, discord.js v14, HTTP porta 3002 (produção: `api.serriquinho.com`). ⚠️ Token `DISCORD_TOKEN` no `.env` LOCAL está 401 (produção OK); re-copiar do serviço Railway certo antes de testes locais.

**Crons em produção (Europe/Lisbon):** 04:00 `1º` (sync principal Hotmart — `includeTags:false`, não toca na AC) · 04:30 AchievementEvaluation · 05:00 RenewalOfferSync · **05:30 DiscordRolesSync (OFF)** · 06/12/18 ClarezaRefresh · 07:00 GuruTrialCheck · **07:30 RenewalAcSync (OFF)** · 23:10 TEST_CURSEDUCA_4MIN (lixo de teste, candidato a apagar) · `TAG_RULES_SYNC` (colecção `cronconfigs`) é zombie — consta na BD mas nunca é agendado.

## 6. Superfícies construídas (mapa de ficheiros)

**BO2_API:** `models/RenewalAcChange.ts` · `models/discordRenewal.ts` (4 modelos) · `services/renewal/{renewalAcSync,hotmartRefunds,discordRolesSync}.service.ts` · `services/activeCampaign/activeCampaignService.ts` (+`updateContactField`/`getContactFieldValue`) · `routes/{renewalAc,discordRenewal}.routes.ts` (montadas em `/api/renewal-ac` e `/api/discord-renewal`) · seeds dos crons em `services/cron/scheduler.ts` · env vars documentadas em `.env.example`.

**Front:** página Renovações (`src/pages/gerirAlunos/renewalOffers/`) com tabs **"Sync AC"** (`RenewalAcSyncTab.tsx`) e **"Discord"** (`DiscordRenewalTab.tsx`) + services `renewalAcSync.service.ts` e `discordRenewal.service.ts`. Gestão de crons: Sincronizar Utilizadores → CRON Jobs (`CronJobsTab.tsx` — kill switch por job funciona e sobrevive a deploys).

**API (bot):** `bot1.js` — endpoints `/renewal/health`, `/renewal/roles/apply`, `/renewal/messages/send` (dormentes; auth activa-se definindo `BOT_SHARED_SECRET` nos 2 lados = Fase D5).

## 7. Regras de conduta para IAs (acordadas com o João)

1. **NUNCA escrever na ActiveCampaign nem no Discord directamente.** Leituras (GETs) são permitidas com autorização explícita dele. Toda a escrita externa passa pelo padrão change set + switches, executada por decisão humana.
2. **"Montado mas desconectado"**: features novas nascem desligadas (cron off + switches off). O João liga quando decidir, pelos runbooks.
3. **Planear antes de programar** quando ele diz "não programes" — plano em .md, decisões pendentes em tabela, esperar luz verde explícita.
4. Commits locais SEM push por defeito — **push dispara deploy no Railway**; esperar ordem.
5. Documentar tudo nos .md do BO2_API (planos vivos, decisões com data e autor); responder em PT-PT.
6. Não "corrigir" dados que parecem estranhos sem confirmar (ex.: cargos criados fora de ordem, nomes de turma exóticos — o parser cobre).
7. Segredos: nunca imprimir tokens/passwords em outputs; inspeccionar por comprimento/forma.

## 8. Pendências abertas (2026-07-10)

| # | Pendência | Dono |
|---|-----------|------|
| 1 | Push dos commits Discord (API `cb8742a`, BO2 `a9efac6..9533e5e`, Front `5d37c6e`) + deploy | João |
| 2 | Sync AC: checklist de operacionalização = **secção 15 do RENOVACAO_OGI_BO_PLAN.md** (dry-run, verificações na UI da AC, activação por fases) | João + IA |
| 3 | Discord: runbook = **secção 11.2 do RENOVACAO_DISCORD_CARGOS_PLAN.md** (dry-run backfill → piloto → cron → mensagens → D5 auth) | João + IA |
| 4 | 🔑 Rodar password Mongo `desenvolvimentoserriquinho` no Atlas (string partilhada em sessão dev) + actualizar Railway | João |
| 5 | ~~Re-copiar `DISCORD_TOKEN` para `.env` local~~ **FEITO 2026-07-11** (copiado do serviço API2 via Railway CLI; validado contra a API Discord — bot "Riquinho" 200 OK) | ✔ |
| 6 | Limpeza: apagar `TEST_CURSEDUCA_4MIN` e decidir zombie `TAG_RULES_SYNC`; fundir tags AC duplicadas hífen/travessão | Equipa |
| 7 | ~~Fase D5: `BOT_SHARED_SECRET` nos 2 lados + porta 3002~~ **FEITO 2026-07-11** (secção 11.5 do plano Discord) | ✔ |
| 8 | ~~Limpar chamadas legacy `/add-roles`~~ **FEITO 2026-07-11** (blocos removidos com nota; nunca funcionaram — endpoint inexistente) | ✔ |
| 9 | Implementar mensagens agendadas (plano na secção 12 do plano Discord) — aguarda luz verde + decisões D-e1..D-e5 | João → IA |
| 10 | UI: selector de tamanho de lote (25/50/100/150) no "Executar lote" da tab Discord + param `limit` no /execute — CÓDIGO PRONTO local (BO2+Front), por commitar/deployar | João (commit) |

## 9. Índice de documentação

- `RENOVACAO_OGI_BO_PLAN.md` — sync BO→AC: contexto do processo, modos de falha F1–F17, safety net 6 camadas, arquitectura 2 crons, auditoria AC, runbook (s.14), checklist (s.15)
- `RENOVACAO_DISCORD_CARGOS_PLAN.md` — cargos Discord: possível/impossível, decisões D1–D7 (todas resolvidas), IDs verificados, sistema de mensagens (s.10), implementação+runbook (s.11)
- `RENOVACAO_CONTEXTO_IA.md` — este ficheiro (manter actualizado a cada sessão)
- `docs/ac-audit-2026-07-09.json` — raw da auditoria AC (63 campos, 650 tags, 24 listas)
- Documento da equipa "Processo de Renovação - OGI" (.docx, fora do repo) — descreve as automações AC; tem incoerências conhecidas (s.9 do plano AC)
