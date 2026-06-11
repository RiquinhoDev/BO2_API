# Plano — Sistema de Links de Renovação OGI

> **Projecto:** Ser Riquinho / O Grande Investimento (OGI)
> **Data:** 2026-06-11
> **Estado:** F0 feito · F1–F4 por executar
> **Bases envolvidas:**
> - BO2_API (TS): `C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API`
> - API legacy (JS): `C:\Users\User\Documents\GitHub\Riquinho\api\API`
> - Backoffice front: `C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front`
> - Front alunos: `...\Comunidade\Comunidade_login`

---

## 1. Objectivo

Mostrar a cada aluno do OGI o **link de renovação certo, na data certa**, com base na turma dele e no período em que o acesso termina. Ponte de 3 pontos:

1. **API/BO2_API** vai buscar os links à Hotmart (cron) e guarda na BD.
2. **Backoffice** permite ver que links estão activos e a que turmas vão ser atribuídos (editável).
3. **Front aluno** mostra o botão "Renovar" com o link certo na altura certa.

---

## 2. Achados que comandam o desenho (verificados na BD real)

1. **A Hotmart NÃO expõe data de expiração nem o nome da turma na API.** O `hotmart` block do User só tem `purchaseDate`/`lastAccessDate`. O nome da turma somos **nós** que o damos no Backoffice.
2. **A expiração deriva do NOME da turma.** Formato: `Turma {N} [renov|2a renov] + extras | {YYMM}`. O `YYMM` é o início do cohort. **Expiração = YYMM + 12 meses, último dia do mês.**
   - Ex: `Turma 10 [renov] | 2505` → maio 2025 → acesso OGI termina **31 maio 2026**.
3. **A expiração é CALCULADA em runtime** (não gravada). Há um **health-check** que valida os nomes.
4. **Bug actual a corrigir:** `studentOgiSummary.service.ts:440` faz `expiresAt = purchaseDate + 1 ano` — errado para quem renovou (ex: comprou 2024-05 mas está em cohort `| 2505`).
5. O nome da oferta de renovação tem o **mesmo formato** (`Renovação turma 10 | 2605`) → o mapa oferta→turma auto-sugere-se do parse.

### Regras de negócio
- Expiração é **por turma/cohort**, não por compra individual.
- Botão de renovação **activo 45 dias** antes do fim; **urgência escalada** quanto mais perto.
- **Contador** de dias só na recta final (≤15 dias).
- Comunidade dá **+15 dias** extra (Discord/Curseduca) — **fora de escopo agora** (não fazer nada até ver).
- Preços diferentes por turma — **fora de escopo agora**.
- Sem oferta para a turma → mostrar email `contactos@serriquinho.com`.

---

## 3. Arquitectura de dados

```
nome da turma (gerido no BO)  ──parseTurmaName──►  expiração (runtime) ──┐
                                                                          ├─► matcher ─► access{expiresAt, renewalUrl} ─► Front
cron Hotmart ─► RenewalOffer (BD) ─► Backoffice (mapa oferta→turma) ─────┘
```

### Modelo `RenewalOffer` (a criar — F1)
| Campo | Tipo | Origem |
|---|---|---|
| `offerCode` | string (unique) | Hotmart |
| `offerName` | string | Hotmart (ou manual) |
| `link` | string | construído / editável no BO |
| `turmaNumbers` | number[] | parse do `offerName` (editável) |
| `periodYYMM` | string | parse do `offerName` |
| `periodStart` | Date | derivado |
| `isRenewal` | boolean | parse (`/renova/i`) |
| `isActive` | boolean | cron / manual |
| `lastSeenAt` | Date | cron |

Link de checkout: `https://pay.hotmart.com/D61245882D?off={offerCode}&checkoutMode=10`

---

## 4. F0 — Parser + health-check ✅ FEITO

Já implementado e validado contra a BD (99% dos alunos, 4393/4424):

- `src/services/renewal/turmaParser.ts`
  - `parseTurmaName(className) → ParsedTurma { turmaNumber, turmaNumbers[], isRenov, renovLevel, periodYYMM, periodStart, accessEndOgi, hasTurma, hasExpiry, valid }`
  - `parseOfferName(offerName) → ParsedOffer { isRenewal, turmaNumbers[], periodYYMM, periodStart, valid }`
- `scripts/renewal/check-turma-names.ts` — health-check. Corre: `npm run renewal:check-names`
  - Reporta turmas sem número (matching impossível) ou sem período (expiração impossível). Sai com código 1 se houver problemas.

> 3 turmas precisam de correcção manual no BO: `Equipa`, `Turma antigos alunos | 2606`, `Turma Pb4KBr2WOX` (31 alunos).

---

## 5. F1 — RenewalOffer + cron Hotmart → BD

**Dono:** Codex · **Depende de:** F0

**Ficheiros:**
- CRIAR `src/models/RenewalOffer.ts`
- CRIAR `src/services/renewal/renewalSync.service.ts`
- CRIAR `scripts/renewal/sync-offers.ts` (corrida manual)
- MODIFICAR scheduler de cron (`src/services/cron/scheduler.ts`) — registar job semanal

### Prompt Codex — F1
```
Contexto: BO2_API (Node/TS, Mongoose). Estamos a construir o sistema de links de
renovação do OGI. Já existe o parser em src/services/renewal/turmaParser.ts com
parseOfferName(offerName) que devolve { isRenewal, turmaNumbers[], periodYYMM,
periodStart, valid }. Existe getHotmartAccessToken() em
src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers.ts.

Tarefa:
1. Cria o model src/models/RenewalOffer.ts com os campos: offerCode (string,
   unique, index), offerName, link, turmaNumbers ([Number]), periodYYMM (string),
   periodStart (Date), isRenewal (Boolean), isActive (Boolean, default true),
   lastSeenAt (Date), timestamps. Colecção 'renewaloffers'.
2. Cria src/services/renewal/renewalSync.service.ts com syncRenewalOffers():
   - obtém token com getHotmartAccessToken()
   - percorre GET https://developers.hotmart.com/payments/api/v1/sales/history
     (Bearer) e coleciona os offer codes + nomes vistos
   - para cada offer: upsert na BD por offerCode; preenche turmaNumbers/periodYYMM/
     periodStart/isRenewal via parseOfferName(offerName); link =
     `https://pay.hotmart.com/D61245882D?off=${offerCode}&checkoutMode=10`;
     isActive=true; lastSeenAt=now
   - ofertas na BD não vistas há >35 dias E cujo periodStart já passou → isActive=false
   - devolve um relatório { upserted, deactivated, unknownNames[] }
3. Cria scripts/renewal/sync-offers.ts que liga à BD, corre syncRenewalOffers() e
   imprime o relatório. Adiciona o npm script "renewal:sync": "ts-node
   scripts/renewal/sync-offers.ts".
4. Regista um cron semanal no scheduler existente a chamar syncRenewalOffers().

Não inventes nomes de ofertas — usa os que vierem da API. Ofertas cujo nome não dê
parse (parseOfferName.valid === false) entram com turmaNumbers=[] e ficam para
revisão manual no BO. Respeita acentuação PT em comentários e logs.
```
**Aceitação:** `npm run renewal:sync` cria/atualiza documentos `RenewalOffer`; ofertas conhecidas (ex `cjzpbezh`) ficam com `turmaNumbers` e `periodYYMM` corretos.

---

## 6. F2 — Matcher + injecção no resumo do aluno (+ fix do bug)

**Dono:** Codex · **Depende de:** F1

**Ficheiros:**
- CRIAR `src/services/renewal/renewalMatcher.service.ts`
- MODIFICAR `src/services/studentOgiSummary.service.ts`

### Prompt Codex — F2
```
Contexto: BO2_API. Existe parseTurmaName(className) em
src/services/renewal/turmaParser.ts (devolve turmaNumbers[], periodYYMM,
accessEndOgi, valid) e o model RenewalOffer (F1). O resumo do aluno é construído em
src/services/studentOgiSummary.service.ts (função buildStudentOgiSummary), que hoje
calcula access.expiresAt errado: calculateExpirationDate(purchaseDate) = purchase +
1 ano (linha ~440). A turma do aluno está em user.hotmart.enrolledClasses[] (campo
className, com o "| YYMM"); usar a className activa (isActive !== false).

Tarefa:
1. Cria src/services/renewal/renewalMatcher.service.ts com
   findRenewalOffer({ turmaNumber, periodYYMM }):
   - busca RenewalOffer com isActive=true, isRenewal=true, turmaNumbers contém
     turmaNumber, e periodYYMM > periodYYMM do aluno (comparação string funciona
     para YYMM zero-padded)
   - ordena por periodYYMM asc, devolve a primeira (o cohort seguinte mais próximo)
   - devolve null se não houver match
2. Em studentOgiSummary.service.ts:
   - extrai a className activa do aluno e corre parseTurmaName
   - access.expiresAt passa a ser parsed.accessEndOgi (fallback para o cálculo
     antigo só se parsed.hasExpiry === false)
   - adiciona access.renewalUrl: corre findRenewalOffer com os dados do parse; se
     houver oferta, renewalUrl = offer.link; senão null
   - adiciona ao interface StudentOgiSummary.access os campos expiresAt (já existe)
     e renewalUrl?: string | null, e turmaNumber?: number | null
3. Não alterar a forma do resto do summary.

Respeita acentuação PT.
```
**Aceitação:** `GET /student/ogi/summary` de um aluno da turma 10 [renov] devolve `access.expiresAt` ≈ 2026-05-31 e `access.renewalUrl` com a oferta de renovação da turma 10 do período seguinte.

---

## 7. F3 — Backoffice: gerir ofertas e mapa oferta→turma

**Dono:** Codex (lógica/API) + Claude (UI/acentuação) · **Depende de:** F1

**Ficheiros:**
- CRIAR `src/controllers/renewal.controller.ts` + `src/routes/renewal.routes.ts` (BO2_API)
- Registar em `src/routes/index.ts`
- Front backoffice: nova página de gestão de ofertas

### Prompt Codex — F3 (backend)
```
Contexto: BO2_API. Model RenewalOffer (F1). Quero endpoints admin para o backoffice
gerir as ofertas de renovação.

Tarefa — cria renewal.controller.ts + renewal.routes.ts e regista em routes/index.ts:
- GET  /api/renewal/offers            → lista todas (filtros: isActive, isRenewal,
                                          turmaNumber)
- PATCH /api/renewal/offers/:id       → editar link, turmaNumbers, isActive, isRenewal
- POST /api/renewal/sync              → dispara syncRenewalOffers() (F1) on-demand
- GET  /api/renewal/preview?turmaNumber=&periodYYMM=  → corre findRenewalOffer (F2)
                                          e devolve a oferta que um aluno receberia
                                          (para testar no BO)
Protege as rotas com o middleware de auth admin já usado nas outras rotas do BO2_API.
Respeita acentuação PT.
```

### Prompt Codex — F3 (front backoffice)
```
Contexto: Backoffice em C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front.
Existem endpoints /api/renewal/* (F3 backend).

Tarefa: cria uma página "Renovações" com:
- tabela de ofertas (offerName, turmaNumbers, periodYYMM, link, isActive)
- coluna turmaNumbers editável (auto-preenchida pelo parse, corrigível à mão)
- editar link inline; toggle isActive
- botão "Sincronizar Hotmart" (POST /api/renewal/sync)
- caixa de teste "Preview por turma": inputs turmaNumber + periodYYMM → mostra a
  oferta que o aluno receberia (GET /api/renewal/preview)
Segue o estilo/componentes existentes do backoffice. Acentuação PT correcta.
```
**Aceitação:** no BO consigo ver as ofertas, corrigir a turma de uma oferta, editar o link, e testar via preview qual a oferta de um aluno de turma X período Y.

---

## 8. F4 — Front aluno (SuccessPage)

**Dono:** Claude (UI) · **Depende de:** F2

**Ficheiro:** `Comunidade_login/src/pages/SuccessPage.jsx`

O gancho já existe: `getRenewalUrl(access)` lê `access.renewalUrl` (linha ~577). Falta:
1. `getRenewalUrl` deve preferir `access.renewalUrl` real (já o faz); remover dependência do env como fonte primária.
2. Substituir `isRenewalMonth(expiresAt)` (só "mesmo mês") por **janela de 45 dias** antes de `expiresAt`.
3. Botão **activo** desde os 45 dias; **urgência escalada** (texto/cor mais fortes quanto mais perto).
4. **Contador** "Faltam X dias" só quando `daysLeft <= 15`.
5. Sem `renewalUrl` (null) → mostrar `contactos@serriquinho.com` em vez do botão.

**Aceitação:** aluno a >45 dias não vê renovação; a ≤45 vê botão activo; a ≤15 vê contador; sem oferta vê o email.

---

## 9. Validação end-to-end (quando F1–F4 fechadas)

1. `npm run renewal:check-names` → 0 turmas inválidas (após correcção das 3 no BO).
2. `npm run renewal:sync` → RenewalOffer populado.
3. `GET /api/renewal/preview?turmaNumber=10&periodYYMM=2505` → oferta de renovação turma 10 do período seguinte.
4. `GET /student/ogi/summary` (aluno turma 10 [renov]) → `expiresAt` 2026-05-31 + `renewalUrl`.
5. SuccessPage de um aluno perto da expiração → botão certo + contador.

---

## 10. Resumo de fases

| Fase | O quê | Base | Dono | Depende |
|---|---|---|---|---|
| F0 ✅ | parser + health-check | BO2_API | feito | — |
| F1 | RenewalOffer + cron sync | BO2_API | Codex | F0 |
| F2 | matcher + fix expiração no summary | BO2_API | Codex | F1 |
| F3 | endpoints + página BO | BO2_API + Front | Codex (+Claude UI) | F1 |
| F4 | SuccessPage 45d + contador | Comunidade_login | Claude | F2 |

Ordem crítica: **F1 → F2 → F4**. F3 em paralelo após F1.
