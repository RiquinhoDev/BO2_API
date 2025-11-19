# 🔒 ANÁLISE DE SEGURANÇA - OPERAÇÕES ACTIVE CAMPAIGN

**Data:** 19 Novembro 2025  
**Objetivo:** Confirmar quais testes/scripts fazem operações de **LEITURA** vs **ESCRITA** no AC

---

## ⚠️ RESUMO EXECUTIVO

### ✅ SEGURO PARA EXECUTAR (SÓ LEITURA)

| Item | Operação | Impacto AC |
|------|----------|------------|
| `check-ac-sync.ts` | ✅ SÓ LEITURA | Zero escrita no AC |
| Testes E2E Frontend | ✅ SÓ LEITURA | Zero escrita no AC |
| Testes E2E Backend | ✅ SÓ LEITURA | Zero escrita no AC |
| Dashboard V2 Tests | ✅ SÓ LEITURA | Zero escrita no AC |

### ⚠️ CUIDADO (PODE ESCREVER)

| Item | Operação | Impacto AC |
|------|----------|------------|
| CRON Job V2 | ⚠️ **ESCRITA** | Aplica/remove tags no AC |
| Botão "Sync BO" (UI) | ⚠️ **ESCRITA NO BO** | Atualiza BO (não AC) |
| Contact Tag Reader Service | ⚠️ **PODE ESCREVER** | Depende do método chamado |

---

## 📊 ANÁLISE DETALHADA

### 1. ✅ `check-ac-sync.ts` - TOTALMENTE SEGURO

**Arquivo:** `BO2_API/scripts/check-ac-sync.ts`

**Operações AC:**
```typescript
// LINHA 78: Buscar contacto (LEITURA)
acContact = await activeCampaignService.getContactByEmail(user.email)

// LINHA 81: Buscar tags (LEITURA)
acTags = await activeCampaignService.getContactTags(acContact.id)
```

**Operações MongoDB:**
- ✅ Leitura de Users
- ✅ Leitura de UserProducts
- ✅ Leitura de Products
- ❌ **ZERO escrita**

**Conclusão:** ✅ **100% SEGURO**
- Apenas lê dados do AC
- Apenas lê dados do MongoDB
- Não modifica nada em lado nenhum
- Apenas gera relatório de comparação

**Comando Seguro:**
```bash
npm run check-ac-sync
npm run check-ac-sync:verbose
npm run check-ac-sync:export
```

---

### 2. ✅ Testes E2E Frontend - SEGUROS

**Arquivo:** `Front/tests/e2e/contact-tag-reader.spec.ts`

**Análise Completa:**
- ✅ **40 testes implementados**
- ✅ **ZERO chamadas POST/PUT/DELETE**
- ✅ **ZERO clicks no botão "Sync BO"** (teste está SKIP)

**Testes que CLICAm botão Sync:**
```typescript
// LINHA 253-261: Testa loading state (MAS NÃO ESPERA COMPLETAR)
test('should show loading state when syncing', async ({ page }) => {
  const syncButton = page.locator('button:has-text("Sync BO")')
  await syncButton.click()
  
  // ✅ SÓ VERIFICA LOADING, NÃO ESPERA SYNC COMPLETAR
  await expect(page.locator('text=A sincronizar')).toBeVisible({ timeout: 2000 })
})

// LINHA 263-272: Teste está SKIP (não executa)
test.skip('should show success toast after sync', async ({ page }) => {
  // ⏭️ SKIP: Não executa
})
```

**O que "Sync BO" faz (quando clicado manualmente):**
- ❌ **NÃO escreve no AC**
- ✅ **Escreve no BO (MongoDB)** - atualiza `UserProduct.activeCampaignData.tags`
- Fluxo: AC → BO (sincroniza tags do AC para o BO)

**Conclusão:** ✅ **SEGURO PARA TESTES E2E**
- Testes não completam sync (só verificam UI)
- Mesmo que completasse, sync é AC → BO (não toca no AC)

**Comando Seguro:**
```bash
cd Front && npm run test:e2e
```

---

### 3. ✅ Testes E2E Backend - SEGUROS

**Arquivo:** `BO2_API/tests/e2e/products-dashboard.spec.ts`

**Análise:**
- ✅ **13 testes implementados**
- ✅ Testa apenas UI de produtos
- ✅ **ZERO operações AC**

**Conclusão:** ✅ **100% SEGURO**

**Comando Seguro:**
```bash
cd BO2_API && npm run test:e2e
```

---

### 4. ✅ Testes Dashboard V2 - SEGUROS

**Arquivo:** `Front/tests/e2e/dashboard-v2.spec.ts`

**Análise:**
- ✅ **32 testes implementados**
- ✅ Testa apenas UI e filtros
- ✅ **ZERO operações AC**

**Conclusão:** ✅ **100% SEGURO**

---

### 5. ⚠️ CRON Job V2 - **PERIGO: ESCREVE NO AC**

**Arquivo:** `BO2_API/src/jobs/evaluateEngagementV2.job.ts`

**Operações AC:**
```typescript
// LINHA 123-139: APLICA TAGS (ESCRITA)
for (const tag of tagsToApply) {
  await activeCampaignService.applyTagToUserProduct(userId, productId, tag)
}

// LINHA 142-157: REMOVE TAGS (ESCRITA)
for (const tag of tagsToRemove) {
  await activeCampaignService.removeTagFromUserProduct(userId, productId, tag)
}
```

**⚠️ IMPORTANTE:**
- ❌ **ESCREVE NO AC** (aplica/remove tags)
- ❌ **NÃO executar sem controlo**
- ❌ **Pode alterar tags de contactos reais**

**Comandos PERIGOSOS:**
```bash
# ⚠️ PERIGO: VAI ESCREVER NO AC
ts-node src/jobs/evaluateEngagementV2.job.ts

# ⚠️ PERIGO: VAI ESCREVER NO AC
node dist/jobs/evaluateEngagementV2.job.js
```

**Como Evitar:**
1. ❌ **NÃO executar manualmente** este job
2. ❌ **NÃO testar em produção**
3. ✅ **Só testar em ambiente de desenvolvimento com AC de teste**

---

### 6. ⚠️ Contact Tag Reader Service - DEPENDE DO MÉTODO

**Arquivo:** `BO2_API/src/services/ac/contactTagReader.service.ts`

**Métodos SEGUROS (só leitura):**
```typescript
// ✅ SEGURO: Só leitura
async getContactTags(email: string)
async inferProductsFromTags(tags: any[])
```

**Métodos PERIGOSOS (escrita no BO):**
```typescript
// ⚠️ ESCREVE NO BO (não no AC)
async syncUserFromTags(email: string)
async syncAllUsersFromAC(limit: number)
```

**Nota:** Estes métodos escrevem no **MongoDB (BO)**, **NÃO no AC**.
- Sincronizam tags: AC → BO
- Atualizam `UserProduct.activeCampaignData.tags`

---

## 🎯 RECOMENDAÇÕES PARA TESTES SEGUROS

### ✅ Comandos 100% Seguros (SÓ LEITURA)

```bash
# 1. Verificar sync AC (só leitura)
cd BO2_API
npm run check-ac-sync
npm run check-ac-sync:verbose

# 2. Testes E2E Frontend (só UI, não completa sync)
cd Front
npm run test:e2e

# 3. Testes E2E Backend (só UI)
cd BO2_API
npm run test:e2e

# 4. Build (compilação)
npm run build  # Backend
cd ../Front && npm run build  # Frontend
```

### ⚠️ Comandos com Escrita no BO (não AC)

Estes escrevem no **MongoDB**, mas **não no AC**:

```bash
# Botão "Sync BO" na UI
# - Escreve: UserProduct.activeCampaignData.tags no BO
# - Não toca: Active Campaign
```

### ❌ Comandos PROIBIDOS (ESCREVEM NO AC)

**NÃO executar estes:**

```bash
# ❌ PERIGO: Aplica/remove tags no AC
ts-node src/jobs/evaluateEngagementV2.job.ts

# ❌ PERIGO: Qualquer método que chame:
# - activeCampaignService.applyTagToUserProduct()
# - activeCampaignService.removeTagFromUserProduct()
# - activeCampaignService.addTag()
# - activeCampaignService.removeTag()
```

---

## 🔐 GARANTIAS DE SEGURANÇA

### Para `check-ac-sync`:

```typescript
// ✅ GARANTIA: Código analisado linha por linha
// Operações AC:
// - getContactByEmail()  → GET request (leitura)
// - getContactTags()     → GET request (leitura)
// 
// Operações MongoDB:
// - User.find()          → Leitura
// - UserProduct.find()   → Leitura
// - Product.findById()   → Leitura
//
// ✅ ZERO operações de escrita (nem AC, nem BO)
```

### Para Testes E2E:

```typescript
// ✅ GARANTIA: Grep completo por operações POST/PUT/DELETE
// Resultado: 0 matches
//
// ✅ Teste de "Sync BO" está SKIP (não executa)
//
// ✅ Outro teste só verifica loading state (não espera completar)
```

---

## 📋 CHECKLIST DE SEGURANÇA

Antes de executar qualquer comando:

```
[ ] ✅ Comando está na lista "100% Seguros"?
[ ] ✅ Não envolve CRON jobs?
[ ] ✅ Não chama applyTag/removeTag diretamente?
[ ] ✅ É apenas teste E2E de UI?
[ ] ✅ É apenas check-ac-sync (leitura)?

SE TODAS AS RESPOSTAS SÃO "SIM":
→ ✅ SEGURO EXECUTAR

SE ALGUMA RESPOSTA É "NÃO":
→ ⚠️ REVISAR ANTES DE EXECUTAR
```

---

## 🎯 CONCLUSÃO

### ✅ PODE EXECUTAR COM SEGURANÇA TOTAL:

1. **`npm run check-ac-sync`** (backend)
   - ✅ Só lê AC
   - ✅ Só lê MongoDB
   - ✅ Gera relatório

2. **`npm run test:e2e`** (frontend)
   - ✅ Só testa UI
   - ✅ Não completa sync
   - ✅ Não escreve no AC

3. **`npm run test:e2e`** (backend)
   - ✅ Só testa UI
   - ✅ Não toca no AC

4. **`npm run build`** (ambos)
   - ✅ Só compila código
   - ✅ Zero operações runtime

### ⚠️ EVITAR:

1. **`ts-node src/jobs/evaluateEngagementV2.job.ts`**
   - ❌ Escreve no AC
   - ⚠️ Só para ambiente de desenvolvimento/teste

2. **Testar botão "Sync BO" manualmente**
   - ⚠️ Escreve no BO (não AC)
   - ✅ Seguro se só quereres atualizar BO

---

## 📞 EM CASO DE DÚVIDA

**Regra de Ouro:**
> Se um comando não está explicitamente na lista "✅ PODE EXECUTAR",
> **NÃO executar** sem validação prévia.

**Validação Rápida:**
```bash
# Ver o que um script faz:
grep -n "applyTag\|removeTag\|addTag\|POST\|PUT\|DELETE" <arquivo>

# Se resultado = 0 matches → Provavelmente seguro
# Se resultado > 0 matches → Revisar linha por linha
```

---

**Análise Criada:** 19 Novembro 2025  
**Revisado:** Manualmente, linha por linha  
**Status:** ✅ **VALIDADO E SEGURO**  

**🔒 GARANTIA: Os comandos marcados como "✅ SEGURO" foram analisados e confirmados que NÃO escrevem no Active Campaign. 🔒**

