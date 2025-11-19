# ✅ CHECKLIST DE EXECUÇÃO MANUAL

**IMPORTANTE:** Os arquivos, código e scripts foram verificados e estão implementados.  
Agora é necessário **EXECUTAR** para validar que funcionam corretamente.

---

## 🚨 TESTES CRÍTICOS (EXECUTAR PRIMEIRO)

### 1. Verificar Compilação (2 min)

```bash
# Backend
cd BO2_API
npm run build
# ✅ Esperado: Build successful, 0 errors
# ❌ Se falhar: Verificar erros TypeScript

# Frontend
cd ../Front
npm run build
# ✅ Esperado: Build successful, 0 errors
# ❌ Se falhar: Verificar erros TypeScript
```

**Status:** [ ] PASSOU [ ] FALHOU [ ] NÃO TESTADO

---

### 2. Testar Script check-ac-sync (5 min)

```bash
cd BO2_API

# Verificar se MongoDB está rodando
# Verificar se .env tem MONGO_URI correto

npm run check-ac-sync
```

**Problemas Possíveis:**
- ❌ MongoDB não conecta → Verificar MONGO_URI
- ❌ Active Campaign API falha → Verificar credenciais AC
- ❌ Erro "User/Product not found" → Database vazia (normal em dev)

**Output Esperado:**
```
🔍 AC SYNC VERIFICATION SCRIPT
📡 Connecting to MongoDB...
✅ Connected to MongoDB
👥 Fetching 10 users...
✅ Found X users
[...]
📊 SUMMARY
Total Users Checked: X
✅ Check PASSED ou ⚠️ DIVERGENT
```

**Status:** [ ] PASSOU [ ] FALHOU [ ] NÃO TESTADO

**Se falhou, erro foi:**
```
[COLAR ERRO AQUI]
```

---

### 3. Testar CRON Job V2 (3 min)

```bash
cd BO2_API

# Executar job manualmente
ts-node src/jobs/evaluateEngagementV2.job.ts
```

**Problemas Possíveis:**
- ❌ Imports não encontrados → Verificar paths
- ❌ Models não encontrados → Verificar se UserProduct/Product existem
- ❌ AC API falha → Normal se sem credenciais

**Output Esperado:**
```
[CRON V2] Iniciando avaliação...
[CRON V2] Avaliando produto: OGI (OGI-V1)
[CRON V2] ✅ Avaliação completa
```

**Status:** [ ] PASSOU [ ] FALHOU [ ] NÃO TESTADO

**Se falhou, erro foi:**
```
[COLAR ERRO AQUI]
```

---

### 4. Testar Testes E2E Backend (5 min)

```bash
cd BO2_API

# Instalar Playwright (se não instalado)
npx playwright install

# Executar testes
npm run test:e2e
```

**Problemas Possíveis:**
- ❌ Playwright não instalado → `npx playwright install`
- ❌ Servidor não roda → Verificar `webServer` config
- ❌ Testes falham → Verificar se API está OK

**Output Esperado:**
```
Running 13 tests using 3 workers

✓ tests/e2e/products-dashboard.spec.ts:12:5 › deve exibir dashboard
[...]
13 passed (30s)
```

**Status:** [ ] PASSOU (X/13) [ ] FALHOU [ ] NÃO TESTADO

**Testes que falharam:**
```
[LISTAR TESTES QUE FALHARAM]
```

---

### 5. Testar Testes E2E Frontend (10 min)

```bash
cd Front

# Instalar Playwright (se não instalado)
npx playwright install

# Executar testes
npm run test:e2e
```

**Problemas Possíveis:**
- ❌ Frontend não inicia → Verificar `npm run dev` funciona
- ❌ Login falha → Verificar credenciais de teste
- ❌ Elementos não encontrados → Verificar `data-testid`

**Output Esperado:**
```
Running 72 tests using 3 workers

✓ contact-tag-reader.spec.ts:43:3 › should render search box
[...]
72 passed (2m)
```

**Status:** [ ] PASSOU (X/72) [ ] FALHOU [ ] NÃO TESTADO

**Testes que falharam:**
```
[LISTAR TESTES QUE FALHARAM]
```

---

## 🔧 TESTES DE FUNCIONALIDADE (DEPOIS DOS CRÍTICOS)

### 6. Testar Contact Tag Reader (UI Manual - 5 min)

```bash
# 1. Iniciar backend
cd BO2_API
npm run dev

# 2. Iniciar frontend (outro terminal)
cd Front
npm run dev

# 3. Abrir browser: http://localhost:3000 (ou 5173)
# 4. Navegar: Active Campaign → Tags Reader
# 5. Testar:
   - [ ] Search box aparece
   - [ ] Digitar email válido
   - [ ] Clicar "Buscar Tags"
   - [ ] Resultado aparece com tags
   - [ ] Produtos detectados aparecem
   - [ ] Botão "Sync BO" aparece
```

**Status:** [ ] FUNCIONA [ ] NÃO FUNCIONA [ ] NÃO TESTADO

**Problemas encontrados:**
```
[DESCREVER PROBLEMAS]
```

---

### 7. Testar AC Tags por Produto (5 min)

**Objetivo:** Verificar que tags são prefixadas por produto

```bash
# No MongoDB, verificar um UserProduct
use bo2
db.userproducts.findOne()

# Verificar campo:
activeCampaignData: {
  tags: [
    "OGI_INATIVO_14D",      // ✅ Correto (prefixado)
    "CLAREZA_ATIVO"         // ✅ Correto (prefixado)
  ]
}

# ❌ ERRADO seria:
tags: ["INATIVO_14D"]  // Sem prefixo de produto
```

**Status:** [ ] CORRETO [ ] INCORRETO [ ] NÃO TESTADO

---

### 8. Testar Decision Engine V2 (3 min)

```bash
cd BO2_API

# No terminal Node ou criar script teste:
ts-node -e "
import { decisionEngineV2 } from './src/services/decisionEngineV2.service'

// Testar com userId e productId reais da tua database
const result = await decisionEngineV2.evaluateUserProduct(
  '507f1f77bcf86cd799439011',  // Substituir por userId real
  '507f1f77bcf86cd799439012'   // Substituir por productId real
)

console.log('Decisions:', result.decisions)
console.log('Tags to Apply:', result.tagsToApply)
console.log('Tags to Remove:', result.tagsToRemove)
"
```

**Status:** [ ] FUNCIONA [ ] NÃO FUNCIONA [ ] NÃO TESTADO

---

## 📊 RESUMO DE EXECUÇÃO

Preencher depois de executar todos os testes:

```
TESTES CRÍTICOS:
1. Compilação Backend:        [ ] ✅ [ ] ❌ [ ] ⏭️
2. Compilação Frontend:        [ ] ✅ [ ] ❌ [ ] ⏭️
3. check-ac-sync:              [ ] ✅ [ ] ❌ [ ] ⏭️
4. CRON Job V2:                [ ] ✅ [ ] ❌ [ ] ⏭️
5. E2E Backend (13 testes):    [ ] ✅ (X/13) [ ] ❌ [ ] ⏭️
6. E2E Frontend (72 testes):   [ ] ✅ (X/72) [ ] ❌ [ ] ⏭️

TESTES FUNCIONAIS:
7. Contact Tag Reader UI:      [ ] ✅ [ ] ❌ [ ] ⏭️
8. Tags por Produto:           [ ] ✅ [ ] ❌ [ ] ⏭️
9. Decision Engine V2:         [ ] ✅ [ ] ❌ [ ] ⏭️

───────────────────────────────────────────
TAXA DE SUCESSO: ___/9 (___%)
STATUS GERAL: [ ] ✅ PRONTO [ ] ⚠️ ISSUES [ ] ❌ BLOQUEADO
```

---

## 🐛 SE ALGO FALHAR

### Erros Comuns e Soluções

#### 1. "Cannot find module"
```bash
# Reinstalar dependências
npm install
```

#### 2. "MongoDB connection failed"
```bash
# Verificar MongoDB está rodando
mongosh

# Verificar .env
cat .env | grep MONGO_URI
```

#### 3. "Active Campaign API error"
```bash
# Verificar credenciais no .env
cat .env | grep ACTIVE_CAMPAIGN

# Testar manualmente:
curl -H "Api-Token: YOUR_TOKEN" \
  https://YOUR_ACCOUNT.api-us1.com/api/3/contacts
```

#### 4. "Playwright tests timeout"
```bash
# Aumentar timeout no playwright.config.ts
timeout: 60000  // 60 segundos
```

#### 5. "Elements not found in E2E tests"
```bash
# Executar com UI para ver o que acontece
npm run test:e2e:headed

# Verificar data-testid nos componentes
grep -r "data-testid" src/
```

---

## 📝 REPORTAR RESULTADOS

Depois de executar, reportar:

1. **Taxa de sucesso:** X/9 testes passaram
2. **Erros encontrados:** [Listar]
3. **Logs de erros:** [Colar outputs de erro]
4. **Screenshots (se aplicável):** [Anexar]

---

## 🚀 PRÓXIMOS PASSOS APÓS VALIDAÇÃO

**Se 9/9 testes passam:**
- ✅ Sistema está 100% validado
- ✅ Pronto para deploy staging
- ✅ Documentar quaisquer notas específicas do ambiente

**Se 7-8/9 testes passam:**
- ⚠️ Issues menores
- ⚠️ Corrigir issues específicos
- ⚠️ Re-testar

**Se < 7/9 testes passam:**
- ❌ Issues significativos
- ❌ Revisar implementação
- ❌ Debugging detalhado necessário

---

**IMPORTANTE:** Este checklist serve para **VALIDAR A IMPLEMENTAÇÃO**.  
O código está implementado, mas precisa ser **EXECUTADO** para confirmar funcionamento.

**Criado:** 19 Novembro 2025  
**Para:** Validação Manual de Implementação  
**Status Atual:** ⏳ AGUARDANDO EXECUÇÃO

