# F5 — Simplificação das renovações (genérico por defeito + especiais por turma)

> Plano para o Codex executar. Decisão de negócio (João, 2026-07-07).
> Deixámos de **deduzir** links por turma (adeus sugestões/confiança/amostra).
> Novo modelo **híbrido e simples**:
>
> - **Genérico `1cp00emj`** = link por defeito para **todas** as turmas.
> - **Ofertas especiais** (turmas iniciais mais baratas, ~até à turma 5) que o staff
>   **atribui manualmente** a turmas escolhidas → essas turmas recebem a sua taxa
>   própria (ex.: `Renovação turma 2 | 2606` a 97€).
> - **Matcher:** a turma tem oferta especial atribuída? serve essa. Senão → genérico.
>   **Nunca** fica sem link (adeus fallback de email na entrega).

## Decisões fechadas
1. **Entrega:** turma com oferta especial (turmaNumbers atribuído, isManuallyEdited,
   ativa) → serve essa oferta. Caso contrário → **genérico `1cp00emj`**.
2. **Sem limiar fixo:** quais as turmas com oferta especial é **manual** (escolha no
   BO). O "~até à turma 5" é só orientação, não vai para código.
3. **Oferta "antigos alunos":** só email — **nunca** servida na app. Referência no BO
   (código a fornecer pelo João, opcional).
4. **Nome do `1cp00emj`:** `Renovação turma genérica`.
5. **Tab "Inativas":** remover.
6. **Tabs "Preço base (>200€)" e "Desempenho":** **NÃO tocar.**
7. **Link:** padrão existente, só troca o id (usar `buildCheckoutLink`) →
   `https://pay.hotmart.com/D61245882D?off=1cp00emj&checkoutMode=10`.
8. **Coletar sim, usar não (João):** o sync **continua a recolher tudo** — códigos,
   vendas, `suggestedTurmas`, `suggestionConfidence`, `suggestionSampleSize`. Estes
   dados **ficam na BD** (análise/Desempenho/futuro). O que muda: **não são usados na
   entrega** (matcher ignora-os) **nem no fluxo de renovação do aluno**, e **não são
   mostrados na tab Renovações**. NÃO remover do model nem do sync.

## ⚠️ Não partir isto (acoplamento)
- `renewalPerformance.service.ts` (tab **Desempenho**) lê `RenewalOffer`
  (`salesCount`, `turmaNumbers`/`offerName`, `periodYYMM`, `isRenewal`). **Manter o
  model, o sync e o performance intactos.**
- **Manter a recolha** de `suggestedTurmas`/confiança/amostra no sync — só deixa de
  ser **usada/mostrada** no fluxo de renovações (ver decisão 8).

---

## Alterações — BO2_API (backend)

### 1. Constante do código genérico
Criar `src/services/renewal/renewalConstants.ts`:
```ts
// Oferta genérica de renovação = link por defeito para todas as turmas sem
// oferta especial atribuída.
export const GENERIC_RENEWAL_OFFER_CODE = '1cp00emj'
export const GENERIC_RENEWAL_OFFER_NAME = 'Renovação turma genérica'
```

### 2. Matcher — especial por turma, senão genérico
`src/services/renewal/renewalMatcher.service.ts`:
```ts
import RenewalOffer, { IRenewalOffer } from '../../models/RenewalOffer'
import { GENERIC_RENEWAL_OFFER_CODE } from './renewalConstants'

// 1) oferta especial atribuída à turma (confirmada no BO); senão 2) genérico.
export async function findRenewalOffer(
  turmaNumber?: number | null
): Promise<IRenewalOffer | null> {
  if (turmaNumber) {
    const special = await RenewalOffer.findOne({
      isActive: true,
      isRenewal: true,
      isManuallyEdited: true,
      turmaNumbers: turmaNumber,
      offerCode: { $ne: GENERIC_RENEWAL_OFFER_CODE }
    })
      .sort({ periodYYMM: -1 }) // a mais recente atribuída
      .exec()
    if (special) return special
  }
  return RenewalOffer.findOne({
    offerCode: GENERIC_RENEWAL_OFFER_CODE,
    isActive: true
  }).exec()
}
export default findRenewalOffer
```
> Removida a exigência de `expiryYYMM` (que forçava null → sem match). Agora o
> default é sempre o genérico, por isso não há risco de aluno sem link.

### 3. Summary do aluno — link nunca null
`src/services/studentOgiSummary.service.ts` (~linha 332):
```ts
const renewalOffer = await findRenewalOffer(parsedTurma?.turmaNumber)
...
renewalUrl: renewalOffer?.link || buildCheckoutLink(GENERIC_RENEWAL_OFFER_CODE),
```
> `buildCheckoutLink` está em `renewalSync.service.ts` (privada) → exportá-la ou
> mover para uma util partilhada. Importar `GENERIC_RENEWAL_OFFER_CODE`.

### 4. Garantir o genérico na BD (não tem vendas → o sync não o cria)
Script one-off `scripts/renewal/ensure-generic-offer.ts` (`--transpile-only`), upsert
idempotente:
```
offerCode: '1cp00emj'
offerName: 'Renovação turma genérica'
link: buildCheckoutLink('1cp00emj')
isActive: true, isRenewal: true, source: 'manual', isManuallyEdited: true
turmaNumbers: []          // genérica, sem turma
```

---

## Alterações — Front / Backoffice (`RiquinhoDev/Front`)
`src/pages/gerirAlunos/renewalOffers/RenewalOffersPage.tsx`:

### 5. Remover a tab "Inativas"
- Tirar `{ id: 'inactive', ... }` de `RENEWAL_TABS`; remover `'inactive'` de `RenewalTab`.
- `getOfferTab`/`tabCounts`: ofertas inativas deixam de ter tab (filtrar `isActive`).

### 6. Simplificar a tab "Renovações" (genérico + especiais)
- **Destacar a oferta genérica `1cp00emj`** no topo: "link por defeito de todas as
  turmas" (editar nome + link).
- **Manter a atribuição de turma** (`TurmaCombobox`) **só** para as ofertas especiais
  — é assim que se escolhe que turmas recebem a taxa mais barata. As turmas não
  atribuídas recebem o genérico automaticamente.
- **Remover** o ruído da dedução: chips de sugestão, `sugerido %`, `confiança baixa`,
  e o alerta vermelho `uncovered` (deixa de fazer sentido).
- Opcional: etiqueta **"só email"** (read-only) na oferta "antigos alunos", se o João
  der o código.

### 7. Tabs a NÃO mexer
"Preço base (>200€)" e "Desempenho" ficam exatamente como estão.

### 8. UI (não backend)
- Só a **UI** deixa de mostrar `suggestedTurmas/suggestionConfidence/suggestionSampleSize`.
  O backend/sync **continua a enviá-los** (o tipo do front pode mantê-los; só não se
  renderizam). Não remover do model nem do sync.

---

## Ordem sugerida p/ o Codex
1. BO2_API: constante → matcher → summary → script `ensure-generic-offer` (+ correr).
2. Front: remover tab Inativas → simplificar tab Renovações (manter combobox só p/ especiais).
3. `tsc --noEmit` nos dois (ignorar erro pré-existente `user.ts`).
4. Smoke test: `GET /api/student/ogi/summary?email=<aluno>`:
   - turma **sem** oferta especial → `access.renewalUrl` = `...?off=1cp00emj...`.
   - turma **com** oferta especial atribuída (ex. turma 2) → `renewalUrl` = link dessa oferta.

## Info que falta o João dar (não bloqueia o essencial)
- Código da oferta "antigos alunos" (só referência/etiqueta no BO).
- Confirmar com os gestores que turmas iniciais mantêm oferta própria (a atribuição é
  manual no BO; o código não fixa nenhum limiar).
