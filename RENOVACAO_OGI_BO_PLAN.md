# Renovação OGI — Integração BackOffice ↔ ActiveCampaign (Plano)

> **Estado:** plano aprovado em conceito. Implementados apenas os pré-requisitos de segurança dos crons (secção 13.6) — **toda a escrita na AC continua desligada** (verificação em 13.7). Fases 1-4 por implementar.
> **Fontes:** documento "Processo de Renovação - OGI" (equipa Ser Riquinho) + análise do código BO2_API / Front + auditoria read-only da AC e da BD de produção (2026-07-09).

---

## 1. Contexto (resumo do processo de renovação)

- Todos os alunos OGI têm 1 ano de acesso (2 anos nalgumas turmas `[2 anos]`).
- A ActiveCampaign (AC) trata dos e-mails de renovação em 2 fluxos:
  - **Fluxo 1 — Turma Genérica:** 7 e-mails, começam 45 dias antes da expiração; aos +30 dias sem renovar o aluno passa a "antigo aluno".
  - **Fluxo 2 — Antigos Alunos:** 4 e-mails em 14 dias, começa 6 meses depois da expiração.
- As automações da AC arrancam a partir do campo **`[Hotmart] Data de expiração`** — que hoje tem de ser preenchido manualmente (checklist mensal).
- Quem renova fica temporariamente numa **turma genérica** na Hotmart; no início do mês seguinte é movido para a turma **"Turma Renovação | AAMM"**.
- Reembolso (janela de 14 dias): automação da AC reverte o estado do aluno e põe `Data de expiração = hoje`. O checklist diz que a **tag de turma** criada pode ter de ser retirada à mão.

## 2. Âmbito — os 3 pontos que o BO vai assumir

| # | Objectivo | Corresponde no documento OGI |
|---|-----------|------------------------------|
| 1 | Actualizar o campo de expiração na AC quando o aluno muda de turma (renovação) | Checklist "1x/mês: adicionar a data de término no campo [Hotmart] Data de expiração" + tag técnica `OGI – Atualizar Data de Termino` |
| 2 | Aplicar a tag da turma nova na AC e retirar a tag da turma anterior | Checklist "1x/mês: adicionar a tag da turma correta ao aluno" |
| 3 | Em caso de reembolso, retirar a tag de turma que o BO aplicou | Checklist "Pode ter de retirar a tag criada em caso de reembolso" |

**Fora de âmbito** (fica na AC): sequências de e-mail, listas Alunos/Leads, tags de estado (`Alunos OGI Ativos`, etc.), automações de reembolso da AC.

## 3. Estratégia aprovada em conceito

Aproveitar o **cron diário de sync Hotmart** que já actualiza os alunos:

1. O sync diário já detecta **mudança de turma** por aluno → nesse momento:
   - calcular a nova data de fim de acesso a partir do nome da turma nova;
   - escrever essa data no campo `[Hotmart] Data de expiração` do contacto na AC;
   - aplicar a tag da turma nova na AC;
   - remover a tag da turma anterior.
2. Detectar **reembolsos Hotmart** (não existe hoje — ver gaps) → quando detectado:
   - remover a tag de turma aplicada pelo BO;
   - **nunca** reescrever data de expiração futura (não pisar a automação de reembolso da AC).

## 4. O que já existe no código (reutilizar)

| Peça | Onde | Estado |
|------|------|--------|
| Cron diário Hotmart | `src/services/cron/scheduler.ts` (`executeHotmartSync`, ~linha 935) | ✅ operacional |
| Detecção de mudança de turma | `src/services/syncUtilizadoresServices/universalSyncService.ts` (~linhas 1267–1303): guarda `oldClassName` → `newClassName`, histórico com `previousClassName`, log `[ClassChange]` | ✅ gancho pronto |
| Cálculo da data de fim de acesso | `src/services/renewal/turmaParser.ts` → `parseTurmaName()` / `resolveAccessEnd()` (nome "Turma 10 [renov] | 2505" → último dia do mês, +12/24 meses) | ✅ fonte canónica |
| Tags AC (criar/aplicar/remover) | `src/services/activeCampaign/activeCampaignService.ts` → `addTag()` (linha ~257, cria tag se não existir, dedupe), `removeTag()` (~355), `removeTagBatch()`, com rate-limiting | ✅ |
| Ofertas de renovação + vendas | `src/services/renewal/renewalSync.service.ts` (sales/history Hotmart, `buyerEmails` por oferta) | ✅ base para detecção de reembolsos |
| Campo refund no modelo | `UserProduct.metadata.refunded` / `refundedAt` — **schema existe, é lido pelo tagEvaluation** (`src/jobs/dailyPipeline/tagEvaluation/accountStatusTags.ts:48`) | ⚠️ nada o escreve (Hotmart) |
| UI de renovação no Front | `Front/src/pages/gerirAlunos/renewalOffers/RenewalOffersPage.tsx` | ✅ sítio natural para expor estado/relatórios |

## 5. Gaps — o que falta construir

### Gap A — Detecção de reembolsos Hotmart (pré-requisito do ponto 3)
O BO está cego para reembolsos Hotmart: `metadata.refunded` nunca é escrito (todo o tratamento de reembolsos existente é do Guru/Clareza).
- **Opção A (recomendada, encaixa no cron):** no sync diário, consultar a API de vendas Hotmart com `transaction_status=REFUNDED` (e `CHARGEBACK`) dos últimos ~30 dias e marcar `metadata.refunded` + `refundedAt`. A infra de chamada à sales/history já existe no `renewalSync.service.ts`.
- Opção B: webhook Hotmart `PURCHASE_REFUNDED` (tempo real; hoje não existe nenhuma rota de webhook Hotmart). Pode vir depois como melhoria.
- Janela de reembolso = 14 dias → latência de 24h do cron é suficiente.

### Gap B — Escrita de custom fields na AC (pré-requisito do ponto 1)
O `activeCampaignService` só escreve contactos, tags e listas — **não** custom fields.
- Implementar `updateContactField(email, fieldId, value)` via `POST /api/3/fieldValues`.
- Mapear o ID do campo `[Hotmart] Data de expiração` (obter na AC; guardar em config/env, não hardcoded).
- Confirmar o formato de data aceite pelo campo na AC.

### Gap C — Orquestração no ponto `[ClassChange]`
Pendurar no sync diário (onde a mudança de turma é detectada) as 3 acções AC: data + tag nova + remover tag antiga. A tag antiga deriva-se do `previousClassName` já guardado.
- Registar num campo próprio (User ou UserProduct) **que tag de turma o BO aplicou e quando** — auditável e é o que o fluxo de reembolso usa para reverter com precisão.

### Gap D — Guard de reembolso na escrita da data
Se `refunded === true`, o cron **não pode** escrever data de expiração futura na AC — a automação de reembolso da AC pôs `Data de expiração = hoje` e reescrevê-la re-armava a sequência de renovação. Regra: reembolsado → só remoção de tag, zero escrita de data.

## 6. Edge cases e riscos

1. **Dupla mudança de turma:** renovação → turma genérica (imediato) → "Turma Renovação | AAMM" (mensal). O cron vê 2 mudanças. Mitigação proposta: só agir quando `parseTurmaName(novaTurma).valid === true` (a turma genérica sem período YYMM não faz parse válido) — a decidir na secção 8.
2. **Escrita em massa na AC:** o sync corre sobre todos os alunos diariamente. Só escrever fieldValue/tag quando o valor **mudou** (diff antes de escrever) para não bater no rate limit da AC.
3. **`nativeTagProtection.service.ts`:** verificar que o sistema de protecção de tags nativas não bloqueia a remoção da tag de turma antiga pelo BO.
4. **Mudanças de turma que não são renovação** (correcções manuais, moves administrativos): o gancho `[ClassChange]` dispara na mesma. Provavelmente desejável (mantém AC coerente com Hotmart), mas confirmar.
5. **Convenção do nome da tag de turma na AC:** ainda não definida (ex.: usar o `className` completo? `Turma Renovação | 2505`? prefixo próprio tipo `OGI Turma - ...`?). Decisão pendente.
6. **Falha parcial** (data escrita mas tag falhou, etc.): as acções AC devem ser idempotentes e re-tentáveis no dia seguinte (o `addTag` já é idempotente; o diff da secção 6.2 dá a re-tentativa de graça).

## 7. Plano de implementação proposto (fases)

### Fase 1 — Fundações
- [ ] `updateContactField()` no activeCampaignService (Gap B) + config do field ID.
- [ ] Detecção de reembolsos Hotmart no sync diário → escreve `metadata.refunded`/`refundedAt` (Gap A).

### Fase 2 — Orquestrador de renovação
- [ ] Serviço `renewalAcSync` pendurado no `[ClassChange]` do sync diário: data na AC + tag nova + remove tag antiga, com diff e guard de reembolso (Gaps C + D).
- [ ] Persistir tag aplicada pelo BO (`appliedTurmaTag` + timestamp).

### Fase 3 — Reversão por reembolso
- [ ] Ao detectar `refunded` novo: remover `appliedTurmaTag` na AC, registar reversão, não tocar na data.

### Fase 4 — Visibilidade
- [ ] Relatório/log no BO (ex.: tab na RenewalOffersPage ou nos SyncReports): quantas datas escritas, tags aplicadas/removidas, reembolsos revertidos, falhas.

## 8. Decisões pendentes (a fechar antes da Fase 2)

| # | Decisão | Opções | Inclinação |
|---|---------|--------|-----------|
| 1 | Convenção do nome da tag de turma na AC | className completo vs formato próprio | **REVISTO após auditoria AC (secção 12)**: a equipa JÁ tem convenção em produção — `Aluno OGI {YYMM} - Renovação Turma {N}` (ex.: `Aluno OGI 2505 - Renovação Turma 10`, +40 tags existentes). O BO deve usar estas tags, não inventar novas. Consequência: `isBOTag()` NÃO as reconhece → a `nativeTagProtection` bloqueia a remoção → é preciso uma **excepção controlada por padrão** (ver 11.4 revisto). A ideia anterior de prefixo `BO_` fica descartada — criaria tags paralelas às da equipa sem eliminar o trabalho manual. |
| 2 | Agir na turma genérica intermédia? | ignorar (só turmas com parse válido) vs aplicar sempre | ignorar |
| 3 | Onde persistir a tag aplicada pelo BO | User vs UserProduct | UserProduct (por produto OGI) |
| 4 | Reembolso: restaurar a tag da turma antiga? | só remover a nova vs repor a anterior | só remover (doc: aluno passa a "antigo aluno", AC trata o resto) |
| 5 | Webhook Hotmart em tempo real (Opção B do Gap A) | agora vs melhoria futura | melhoria futura |

## 9. Incoerências do documento OGI a confirmar com a equipa

(Detectadas na análise do documento; não bloqueiam este plano, mas convém alinhar.)
- Fluxo 1 diz "criamos turma nova no início de cada mês"; o checklist diz "1x por ano: criar todas as turmas" — qual é o processo real?
- A janela de renovação da Turma 1/Turma 2 (janeiro/junho) não tem enforcement descrito — quem impede renovação a 49€/97€ fora da janela?
- Zona morta de comunicação entre +30 dias e 6 meses pós-expiração — intencional?

---

## 10. Modos de falha (análise 2026-07-09)

A feature está desligada de momento; esta secção enumera o que pode correr mal quando ligar. Cada item tem um ID (F1…) referenciado pela safety net (secção 11).

### 10.1 Escrita da data de expiração na AC

| ID | Falha | Impacto | Probabilidade |
|----|-------|---------|---------------|
| F1 | **Field ID errado** na config → escreve no campo errado de todos os contactos processados | Corrupção em massa, silenciosa (a API aceita) | Baixa, mas catastrófica |
| F2 | **Formato de data errado** (dd/mm vs mm/dd vs ISO) → AC interpreta datas trocadas | Sequências de renovação disparam nos dias errados, em massa | Média no primeiro deploy |
| F3 | **Data futura escrita em aluno reembolsado** → desfaz o `Data de expiração = hoje` da automação de reembolso da AC | Re-arma e-mails de renovação a quem pediu reembolso | Alta sem guard (= Gap D) |
| F4 | **Parse do nome da turma falha ou nome mal escrito na Hotmart** → data calculada errada/null | Data errada num subconjunto de alunos | Média (nomes de turma são texto livre) |
| F5 | **Primeiro run em massa** (backfill de milhares de contactos) → rate limit AC, timeouts, estado meio-escrito | Metade dos contactos actualizados, metade não; difícil de auditar | Alta no arranque |
| F6 | **Overwrite de ajustes manuais**: equipa corrige data à mão na AC, cron reescreve por cima no dia seguinte | Guerra silenciosa BO ↔ equipa | Alta se não houver diff/regra |
| F7 | **Contacto não existe na AC** → `addTag`/`createOrUpdateContact` cria contacto novo como efeito secundário | Contactos fantasma na AC (podem entrar em automações) | Média |

### 10.2 Aplicar / remover tags de turma

| ID | Falha | Impacto | Probabilidade |
|----|-------|---------|---------------|
| F8 | **Tag sem prefixo `BO_`** → `nativeTagProtection` bloqueia a remoção para sempre | Tags de turma órfãs acumulam; reembolso irreversível pelo BO | Certa se a convenção não for `BO_` (ver decisão #1) |
| F9 | **Bypass da protecção**: `activeCampaignService.removeTag()` NÃO valida `canRemoveTag()` — só o `tagOrchestrator` aplica o filtro. Código novo que chame `removeTag` directo remove qualquer tag, incluindo nativas | Remoção de tags nativas da equipa (o pior cenário) | Alta se o orquestrador novo não for obrigado a passar pelo filtro |
| F10 | **ClassChange em massa falso**: falha transitória da API Hotmart devolve `enrolledClasses` vazio/errado para muitos alunos → o sync "vê" mudanças de turma em massa → troca de tags e datas em massa | O evento exacto que o utilizador quer evitar ("apagar tags em massa") | Média — APIs falham |
| F11 | **Flip-flop**: turma errada num dia, correcta no seguinte → tag removida e reposta → automações AC que reagem a "tag added" disparam 2x | E-mails duplicados / estado AC a oscilar | Média |
| F12 | **Typo na convenção da tag** → `getOrCreateTag` cria tag NOVA silenciosamente em vez de dar erro | Proliferação de tags quase-iguais na AC | Média |
| F13 | **Remover tag que é trigger de automação AC** | Pára/dispara automações inadvertidamente | Baixa (tags de turma são novas), mas verificar na AC |
| F14 | **Falha parcial**: data escrita ✓, tag nova ✓, remoção da antiga ✗ | Aluno com 2 tags de turma; relatórios AC errados | Alta (3 chamadas de rede independentes) |

### 10.3 Reversão por reembolso

| ID | Falha | Impacto | Probabilidade |
|----|-------|---------|---------------|
| F15 | **Falso positivo**: reembolso de OUTRO produto/transacção do mesmo email interpretado como reembolso da renovação OGI | Remove tag de turma a aluno válido e activo | Média sem matching por transacção |
| F16 | **Re-processamento diário**: reembolso sem marca "já revertido" → o cron tenta reverter todos os dias | Ruído, rate limit, logs poluídos | Certa sem idempotência |
| F17 | **Chargeback tardio** (fora da janela de 14 dias, meses depois): a tag actual do aluno já pode ser doutra renovação | Reverter a tag errada | Baixa |

---

## 11. Safety net (desenho)

Princípio: **o BO nunca escreve na AC sem deixar um rasto revisável e reversível.** Modelo a copiar: o próprio `tagOrchestrator.service.ts` (snapshot → diff → filtro de protecção → aplicar → persistir só se tudo OK).

### 11.1 Camada 0 — Interruptores (feature começa DESLIGADA)
- Kill switch global `RENEWAL_AC_SYNC_ENABLED=false` + flags independentes por operação: `..._WRITE_DATES`, `..._WRITE_TAGS`, `..._PROCESS_REFUNDS`. Ligar uma de cada vez no rollout.
- Mitiga: F1–F17 (blast radius controlado).

### 11.2 Camada 1 — Dry-run com revisão (o "rever antes de aplicar" pedido)
- O serviço corre em modo **plano**: gera um *change set* persistido em BD (`RenewalAcChange`: email, acção, valor antes → valor depois, origem `CLASS_CHANGE`/`REFUND`, status `PLANNED`) **sem tocar na AC**.
- Endpoint/página no BO para rever o plano do dia e aprovar (individual ou em bloco). Só depois de aprovado é que executa. Quando houver confiança, pode passar-se a auto-approve para runs pequenos (abaixo dos caps da camada 2) mantendo revisão manual para runs grandes.
- Nota: as `inactivationLists` já têm o conceito create→execute→revert mas o execute/revert actual é semi-stub — o motor tem de ser feito de novo, o padrão de UI pode ser reaproveitado.
- Mitiga: F1, F2, F5, F10 (o plano gigante é visto ANTES de executar), F15.

### 11.3 Camada 2 — Circuit breakers (anti-massa)
- **Cap por run**: máx. N alterações (default 50, configurável). Acima → aborta, marca o plano como `NEEDS_REVIEW`, alerta a equipa. O backfill inicial é feito deliberadamente por lotes aprovados.
- **Detector de anomalia**: se >X% (ex. 5%) dos alunos processados tiverem "mudança de turma" no mesmo dia → quase de certeza falha da API Hotmart, não realidade → aborta o run inteiro (F10).
- **Por aluno**: máx. 1 troca de tag de turma por run; nunca remover mais de 1 tag por aluno por dia.
- Mitiga: F5, F10, F11.

### 11.4 Camada 3 — Validações pré-escrita (por item)
- **Data**: só escrever se `parseTurmaName().valid`; janela de sanidade (entre hoje−2 anos e hoje+3 anos); **nunca** escrever se `metadata.refunded === true` (F3); só escrever se o valor difere do que está na AC — ler antes de escrever (F6, e poupa rate limit).
- **Contacto**: só actuar se o contacto JÁ existe na AC; nunca criar contactos (F7).
- **Tag**: nome gerado por UMA função central (`buildTurmaTagName()`) que segue a convenção real da equipa `Aluno OGI {YYMM} - Renovação Turma {N}` (F12). Como estas tags não passam no `isBOTag()`, a protecção precisa de uma **excepção com escopo mínimo**: um allowlist por regex (`^Aluno OGI( L)? \d{4} - (Renovação )?Turma .+$`) usável APENAS pelo orquestrador de renovação, e só para tags que constem do registo `appliedTurmaTag` ou correspondam ao `previousClassName` do aluno — nunca uma isenção geral (F8, F9). Todas as restantes remoções continuam obrigadas a passar por `filterSafeTagsToRemove()` — proibido chamar `activeCampaignService.removeTag()` directo no código novo (F9).
- **Debounce**: um `[ClassChange]` só entra no plano se a turma nova tiver parse válido E se mantiver no sync seguinte (confirmação em 2 runs consecutivos) (F10, F11).
- **Reembolso**: matching por transacção da oferta de renovação (não só por email) (F15); reverter apenas a tag registada em `appliedTurmaTag` (F17).

### 11.5 Camada 4 — Snapshot + reversibilidade
- Antes de qualquer escrita: capturar estado actual (tags do contacto via `captureNativeTags` + valor actual do campo de data) e guardar no registo da alteração → **cada alteração sabe desfazer-se**.
- Endpoint `revert` por alteração ou por run completo (usa os valores "antes" guardados).
- Status de cada registo: `PLANNED → APPROVED → APPLIED / FAILED → REVERTED`. Idempotência: alteração `APPLIED` nunca é re-executada; reembolso revertido fica marcado (F16); falha parcial fica `FAILED` com o passo exacto, re-tentável (F14).

### 11.6 Camada 5 — Observabilidade
- Relatório diário (reaproveitar `notification.service` / SyncReports): nº de datas escritas, tags aplicadas/removidas, reembolsos revertidos, itens bloqueados pelos guards e porquê.
- Log de tudo o que foi BLOQUEADO é tão importante como o que foi feito — é onde os bugs aparecem primeiro.

### 11.7 Rollout faseado
1. **Piloto**: allowlist de 2-3 emails de teste, tudo em dry-run → validar plano gerado à mão.
2. **Execução no piloto**: aplicar só nos emails de teste; confirmar na AC (campo, tags, automações não disparam indevidamente).
3. **1 turma real** com revisão manual do plano diário durante ~1 semana.
4. **Geral**, mantendo caps e alertas.

### 11.8 Verificações pontuais antes de ligar (checklist)
- [x] ~~Confirmar na AC o ID e o formato do campo~~ → **feito por auditoria read-only (secção 12): field id 332, formato `YYYY-MM-DD`**.
- [ ] Confirmar na AC **quais automações usam as tags duplicadas** hífen vs travessão (`Aluno OGI - Renovação` id 675 vs `Aluno OGI – Renovação` id 711; `OGI - Atualizar Data de Termino` id 677 vs id 707) — o BO tem de escrever na que está ligada às automações (F12/F13).
- [ ] Confirmar que as automações de renovação lêem o campo id 332 (e não o campo vazio `Data de Fim` id 333) (F1).
- [ ] Confirmar quais automações AC usam as tags `Aluno OGI {YYMM} - Renovação Turma {N}` como trigger (F13).
- [ ] Confirmar comportamento da Hotmart no reembolso: o aluno muda de turma? desaparece do sync? (afecta o debounce e o matching).
- [ ] Decidir a regra para ajustes manuais da equipa na AC: o BO respeita valores editados à mão ou é sempre autoritativo? (F6)
- [ ] Processar os **6 contactos** que já têm a tag `OGI - Atualizar Data de Termino` (id 677) pendente — são a fila de trabalho real e os candidatos ideais para o piloto (11.7).

---

## 12. Auditoria read-only da AC (2026-07-09)

Feita com a key do BO2_API, **apenas GETs**. Raw completo: [`docs/ac-audit-2026-07-09.json`](docs/ac-audit-2026-07-09.json) (fields + 650 tags + listas; re-gerável a qualquer momento).

### 12.1 Campos relevantes (IDs confirmados)

| Campo | ID | Tipo | Perstag | Notas |
|-------|----|------|---------|-------|
| `[Hotmart] Data de expiração` | **332** | date | `%HOTMART_DATA_DE_EXPIRAO%` | ⚠️ o título tem **espaço à frente** (`" [Hotmart] Data de expiração"`) — lookups por nome têm de fazer trim. **4.404 contactos preenchidos**, formato `YYYY-MM-DD`. |
| `[Hotmart] Data da compra` | 334 | date | `%HOTMART_DATA_DA_COMPRA%` | Também com espaço à frente no título. 4.402 valores, `YYYY-MM-DD`. |
| `[Hotmart] Data da 1ª Compra` | 337 | date | `%HOTMART_DATA_DA_1COMPRA%` | 4.399 valores. Usado pela verificação anti-abuso do Fluxo 2. |
| `[Hotmart] Data do reembolso` | 324 | **datetime** | `%HOTMART_DATA_DO_REEMBOLSO%` | 4 valores, ISO com timezone (ex. `2026-07-09T10:37:33+01:00`) — a automação de reembolso da AC já está a disparar. |
| `Data de Fim` | 333 | date | `%DATA_DE_FIM%` | **0 valores — campo morto.** Armadilha F1 perfeita: nome parecido, vazio. Não usar; confirmar que nenhuma automação o lê. |
| `[Hotmart] Estado da compra` | 282 | dropdown | `%ESTADO_COMPRA%` | Pode servir de sinal secundário de reembolso. |

### 12.2 Tags — convenção real em produção

650 tags no total, ~427 relevantes para OGI/Clareza/turmas. Padrões:

- **Turma original:** `Aluno OGI L{YYMM} - Turma {N}` (+ variante `[2anos]`) — ex. `Aluno OGI L2505 - Turma 14` (242 subs).
- **Turma de renovação:** `Aluno OGI {YYMM} - Renovação Turma {N}` (sem o `L`; + `[2anos]`) — ex. `Aluno OGI 2505 - Renovação Turma 10` (120 subs). **Esta é a "tag da turma onde a pessoa fica" do ponto 2** — a convenção já existe, o BO adopta-a.
- **Estado:** `Alunos OGI Ativos` (id 347, 875 subs), `Alunos OGI Antigos` (id 643, 3.516), `OGI - Aluno ou Ex-Aluno` (id 676, 4.380), `Subscritor Clareza - Ativa/Atrasada` (423/424).
- **Tags técnicas do documento OGI** (todas existem, criadas recentemente, 0-6 subs): `OGI Renovação Genérica - Compra Confirmada` (708), `OGI Renovação Antigos Alunos - Compra Confirmada` (709), `OGI Renovação Genérica - Reembolso` (712), `OGI Renovação Antigos Alunos - Reembolso` (713), `Aluno OGI - Renovação Antigos Alunos` (706), `Aluno OGI - Renovação Fixa Turma 1` (714) e `Turma 2` (715) — estas duas últimas parecem ser o enforcement da janela jan/jun (responde à incoerência 2 da secção 9).

### 12.3 Problemas encontrados na AC (accionáveis)

1. **Tags duplicadas hífen vs travessão** — a incoerência prevista na análise do documento confirma-se na AC real:
   - `Aluno OGI - Renovação` (id 675, 6 subs) vs `Aluno OGI – Renovação` (id 711, 0 subs)
   - `OGI - Atualizar Data de Termino` (id 677, 6 subs) vs `OGI – Atualizar Data de Termino` (id 707, 0 subs)
   O BO tem de usar exactamente a variante ligada às automações (a julgar pelos subscribers, a de hífen simples) e a equipa devia apagar/fundir a duplicada na AC.
2. **Fila pendente real:** a tag `OGI - Atualizar Data de Termino` (677) tem **6 contactos** à espera do "sistema externo" (= o BO, esta feature) — ninguém está a consumir esta fila hoje. São os candidatos ideais para o piloto.
3. **Volume para o backfill:** 4.404 contactos com data de expiração → qualquer recálculo em massa toca em milhares de contactos (reforça F5 e o cap da camada 11.3).
4. **Espaços à frente nos títulos dos campos** 332/334 — usar sempre IDs numéricos em código, nunca lookup por título.

### 12.4 Implicações no plano (ver também secção 13 — arquitectura de execução)

- **Ponto 1 (data):** escrever `YYYY-MM-DD` no field id **332** via `fieldValues`. O campo já é mantido por alguém/algo para 4.404 contactos — investigar quem o preenche hoje (integração Hotmart→AC? import manual?) antes do BO assumir a escrita, para não haver dois escritores (F6).
- **Ponto 2 (tag):** adoptar a convenção existente `Aluno OGI {YYMM} - Renovação Turma {N}`; suportar `[2anos]`; o `turmaParser.ts` já sabe fazer parse destes nomes.
- **Ponto 3 (reembolso):** remover a tag de renovação aplicada + eventualmente sincronizar com as tags técnicas 712/713 que a automação da AC usa. O campo 324 (datetime do reembolso) pode servir de confirmação cruzada do lado AC.
- **Protecção de tags:** excepção por allowlist de padrão (ver 11.4) em vez de prefixo `BO_` — decisão #1 revista.

---

## 13. Arquitectura de execução — 2 crons desacoplados (decidido 2026-07-09)

Requisito do João: o cron Hotmart actual e o novo processamento AC correm **separados**, com **2–3 horas de intervalo**, e ambos com kill switch.

### 13.1 Desenho

```
FASE A — cron Hotmart EXISTENTE (hora actual, sem mudanças)
  sync users Hotmart (como hoje)
  + detecta [ClassChange]           → grava RenewalAcChange status=PLANNED na BD
  + detecta reembolsos (Gap A)      → grava RenewalAcChange status=PLANNED na BD
  ✋ NÃO toca na AC. Zero chamadas AC nesta fase.

        (2–3 horas de intervalo)

FASE B — cron NOVO "RenewalAcSync" (hora da Fase A + 3h)
  pré-condições (todas obrigatórias, senão termina sem fazer nada):
    1. kill switch env RENEWAL_AC_SYNC_ENABLED=true
    2. o run da Fase A de HOJE terminou com SUCESSO (via SyncReport/lastRun)
    3. existem RenewalAcChange frescos (criados nas últimas X horas)
  executa o change set contra a AC com TODAS as guards da secção 11
  (caps, dry-run/aprovação, filtro de tags, diff antes de escrever)
```

Porquê assim e não um job encadeado:
- Se a Fase A falhar ou não correr, a Fase B **não encontra plano fresco e não faz nada** — o default é seguro, não há "AC a correr sobre dados velhos".
- O intervalo dá tempo para se olhar para o plano do dia (alertas/summary da Fase A) e desligar a Fase B antes de ela tocar na AC, se algo parecer estranho.
- Cada fase liga/desliga sem afectar a outra: dá para correr semanas só com a Fase A (a acumular planos revisáveis, em dry-run permanente) antes de alguma vez ligar a B.

### 13.2 Kill switches (3 níveis)

| Nível | Mecanismo | Âmbito |
|-------|-----------|--------|
| 1. Job | `CronJobConfig.schedule.enabled` / `isActive` — **já existe no modelo** e é gerível pela UI de crons | Cada cron individualmente (o Hotmart actual JÁ tem este switch) |
| 2. Master env | `RENEWAL_AC_SYNC_ENABLED` (default `false`), lido **em runtime** no início da Fase B e em qualquer endpoint manual de execução | Toda a escrita AC, mesmo que o cron dispare |
| 3. Por operação | `RENEWAL_AC_WRITE_DATES` / `RENEWAL_AC_WRITE_TAGS` / `RENEWAL_AC_PROCESS_REFUNDS` | Ligar uma operação de cada vez no rollout (11.7) |

### 13.3 ⚠️ Armadilha encontrada no padrão de arranque (corrigir ao implementar)

O seed do `ClarezaRefresh` em `src/index.ts` (~linha 146) tem um "schedule repair" que **força `enabled=true` e `isActive=true` em cada boot**. Se o job novo copiar este padrão, qualquer kill switch accionado na BD/UI é **silenciosamente reactivado no deploy seguinte** — exactamente o que não pode acontecer.

Regras para o seed do `RenewalAcSync`:
- Criar com `schedule.enabled: false` (nasce desligado).
- O seed NUNCA repara/força `enabled` — só cria se não existir (padrão do `ensureRenewalOfferSyncJob`, que só actualiza o cronExpression, é o correcto).
- Verificar também que o job Hotmart principal não está sujeito a nenhum force-enable no boot.

### 13.4 Horários (confirmados na BD de produção, 2026-07-09)

Mapa real (Europe/Lisbon), lido da colecção `cronjobconfigs` de produção:

| Hora | Job | Estado |
|------|-----|--------|
| 04:00 | **"1º"** — sync principal de utilizadores Hotmart (**= Fase A**) | enabled, 194 runs |
| 04:30 | AchievementEvaluation | enabled |
| 05:00 | RenewalOfferSync | enabled |
| 06/12/18h | ClarezaRefresh | enabled |
| 07:00 | GuruTrialCheck | enabled |
| 23:10 | TEST_CURSEDUCA_4MIN (job de teste — candidato a limpeza) | enabled |
| — | DailyPipeline (02:00), EvaluateRules, ResetCounters, CronExecutionCleanup, RebuildDashboardStats, EvaluateRules_TEST | **disabled** |

**Decisão de horário:** `RenewalAcSync` às **07:30 Lisboa** (04:00 + 3h30) — respeita o intervalo de 2-3h pedido, evita a colisão com o GuruTrialCheck às 07:00, e corre a uma hora em que a equipa está acordada para reagir a alertas.

Nota: existe ainda um agendamento legacy `TAG_RULES_SYNC` (02:00) na colecção `cronconfigs` — **zombie**: está `isActive: true` na BD mas o `TagCronManagement.initializeCronJobs()` não é chamado no arranque, portanto não corre (nextRun parado em 2025-12-28). Ver 13.6.

### 13.5 Freshness e handshake entre fases

- Cada `RenewalAcChange` guarda `sourceRunId` (id do SyncReport da Fase A que o gerou).
- A Fase B só processa changes cujo `sourceRunId` corresponde a um run **com sucesso** e **das últimas 12h** — planos velhos expiram automaticamente (`status=EXPIRED`), nunca são executados dias depois.
- Se a Fase B correr e não houver nada fresco: log "nothing to do" + termina (não é erro).

### 13.6 Implementado em 2026-07-09 (pré-requisitos de segurança dos crons)

1. **Kill switch respeitado em todos os crons** — `src/index.ts`: o "schedule repair" do seed ClarezaRefresh deixou de forçar `enabled=true`/`isActive=true` no arranque; agora repara apenas horário/timezone. Pausar um job na UI passa a sobreviver a deploys. Cada seed afecta apenas o seu próprio cron.
2. **UI: Pausar/Retomar disponível para todos os jobs** — `CronJobsTab.tsx`: o botão de toggle (kill switch) deixou de estar bloqueado para o ClarezaRefresh; Editar/Apagar/Executar continuam protegidos nesse job.
3. **Todos os crons visíveis no Backoffice** — `GET /api/cron/jobs` passou a devolver também `systemJobs` (agendamentos fora do `CronJobConfig`, hoje o legacy `TAG_RULES_SYNC` da colecção `cronconfigs`), e o `CronJobsTab` mostra-os numa secção read-only "Agendamentos de sistema (legacy)", com aviso quando o agendamento existe na BD mas não é iniciado pelo servidor (caso actual — zombie).
4. **UI: filtro de plataforma** ganhou as opções Guru e Pipeline (jobs desses tipos já existiam na BD mas não eram filtráveis) e metadata amigável para GuruTrialCheck, RenewalOfferSync e AchievementEvaluation.

Pendente de decisão da equipa: apagar ou reactivar formalmente o `TAG_RULES_SYNC` zombie, e limpar o job de teste `TEST_CURSEDUCA_4MIN` (corre todos os dias às 23:10 em produção).

> ⚠️ Nota de segurança: a connection string de produção foi partilhada durante esta sessão de desenvolvimento — **rodar a password do utilizador `desenvolvimentoserriquinho` no Atlas depois de implementar/testar** (combinado a 2026-07-09).

### 13.7 Verificação "AC desligada" (2026-07-09)

Confirmado que **hoje não existe nenhum caminho de cron que escreva na ActiveCampaign**:

| Caminho possível | Estado | Prova |
|------------------|--------|-------|
| Job "1º" (sync principal 04:00) a aplicar tags | ❌ desligado | `syncConfig.includeTags: false` + `tagRuleOptions.enabled: false` + `tagRules: []` (BD produção) |
| `TAG_RULES_SYNC` (TagCronManagement, 02:00) | ❌ não corre | `initializeCronJobs()` não é invocado em nenhum ponto do arranque; nextRun parado em 2025-12-28 |
| `DailyPipeline` (inclui tagEvaluation) | ❌ desligado | `schedule.enabled: false` na BD |
| `EvaluateRules` / `EvaluateRules_TEST` | ❌ desligados | `schedule.enabled: false` na BD |
| `RenewalAcSync` (Fase B deste plano) | ❌ não existe | ainda não implementado; env switches documentados em `.env.example` com default `false` |

Escritas AC possíveis hoje = apenas acções **manuais** na UI (force evaluation, etc.), fora de qualquer cron.
