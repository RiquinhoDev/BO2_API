# 🛡️ Sistema de Proteção de Tags Nativas - Resumo

## 📋 O QUE FOI IMPLEMENTADO

### **🔒 4 CAMADAS DE PROTEÇÃO**

#### **Camada 1: Padrão BO_**
- **TODAS as tags do BO têm prefixo `BO_`**
- Formato: `BO_PRODUCTNAME - Descrição`
- Exemplos:
  - ✅ BO: `BO_OGI_V1 - Inativo 14d`
  - ✅ BO: `BO_CLAREZA_ANUAL - Alto Engajamento`
  - ❌ NATIVA: `Cliente VIP`
  - ❌ NATIVA: `Testemunho Gravado`

#### **Camada 2: Snapshot de Tags Nativas na BD**
- Nova coleção: `ac_native_tags_snapshots`
- Guarda TODAS as tags nativas de cada utilizador
- Atualizado a cada sync
- Histórico completo de mudanças

#### **Camada 3: Validação Tripla Antes de Remover**
- Verifica se tag tem prefixo `BO_`
- Verifica se tag está no snapshot de nativas
- Verifica histórico de tags nativas
- **Se falhar qualquer verificação → BLOQUEIO!**

#### **Camada 4: Filtro de Segurança no Orchestrator**
- Antes de remover QUALQUER tag, passa pelo `nativeTagProtection`
- Tags bloqueadas são logged com motivo
- Só tags aprovadas são removidas

---

## 📂 FICHEIROS CRIADOS

### **1. Modelo de BD**
- `src/models/acTags/ACNativeTagsSnapshot.ts`
  - Guarda tags nativas por utilizador
  - Histórico de mudanças
  - Metadata de sync

### **2. Serviço de Proteção**
- `src/services/activeCampaign/nativeTagProtection.service.ts`
  - `isBOTag(tag)` - Verifica se é tag BO (com BO_ prefix)
  - `classifyTags(tags)` - Separa tags BO vs nativas
  - `captureNativeTags(email)` - Captura e guarda tags nativas
  - `captureNativeTagsBatch(emails)` - Captura batch
  - `canRemoveTag(email, tag)` - Valida se pode remover (CRÍTICO!)
  - `filterSafeTagsToRemove(email, tags)` - Filtra tags seguras
  - `getNativeTagsReport(email)` - Relatório de um user
  - `getProtectionStats()` - Estatísticas globais

### **3. Tag Formatter (Prefixo BO_)**
- `src/jobs/dailyPipeline/tagEvaluation/tagFormatter.ts`
  - `formatBOTag(productName, description)` - Adiciona prefixo BO_
  - `removeBOPrefix(tag)` - Remove prefixo (para display)
  - `hasBOPrefix(tag)` - Verifica se tem prefixo

### **4. Scripts de Teste e Inicialização**
- `initialize-native-tags-protection.js` - Inicializa proteção para todos os users
- `test-native-tag-protection.js` - Testa sistema de proteção

### **5. Integração no Orchestrator**
- `src/services/activeCampaign/tagOrchestrator.service.ts`
  - Captura tags nativas ANTES de qualquer operação
  - Filtra tags seguras ANTES de remover
  - Bloqueia remoção de tags nativas

---

## ⚠️ FICHEIROS QUE PRECISAM SER ATUALIZADOS

### **CRÍTICO: Adicionar prefixo BO_ em todos os avaliadores**

Atualizar os seguintes ficheiros para usar `formatBOTag()`:

1. ✅ `inactivityTags.ts` - JÁ ATUALIZADO
2. ⏳ `engagementTags.ts` - Substituir `${productName} -` por `formatBOTag(productName, ...)`
3. ⏳ `progressTags.ts` - Substituir `${productName} -` por `formatBOTag(productName, ...)`
4. ⏳ `completionTags.ts` - Substituir `${productName} -` por `formatBOTag(productName, ...)`
5. ⏳ `accountStatusTags.ts` - Substituir `${productName} -` por `formatBOTag(productName, ...)`

### **Exemplo de Mudança:**

**ANTES:**
```typescript
tags.push(`${productName} - Inativo 14d`)
```

**DEPOIS:**
```typescript
import { formatBOTag } from './tagFormatter'
tags.push(formatBOTag(productName, 'Inativo 14d'))
```

**Resultado:**
- Tag antiga: `OGI_V1 - Inativo 14d`
- Tag nova: `BO_OGI_V1 - Inativo 14d` ✅

---

## 🚀 PRÓXIMOS PASSOS

### **Passo 1: Atualizar Avaliadores de Tags**
```bash
# Atualizar ficheiros manualmente ou usar find/replace:
# Procurar: `${productName} -
# Substituir por: formatBOTag(productName, '
# E adicionar import: import { formatBOTag } from './tagFormatter'
```

### **Passo 2: Compilar**
```bash
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
npm run build
```

### **Passo 3: Inicializar Proteção (MANDATÓRIO)**
```bash
node initialize-native-tags-protection.js
```

**O que faz:**
- Captura TODAS as tags atuais da AC para TODOS os utilizadores ativos
- Classifica em BO vs Nativas
- Guarda snapshot na BD (`ac_native_tags_snapshots`)
- Tempo estimado: ~50 minutos para 5000 utilizadores

### **Passo 4: Testar Proteção**
```bash
node test-native-tag-protection.js
```

**Valida:**
- Classificação de tags (BO vs Nativa)
- Captura de snapshots
- Validação de remoção
- Filtro de segurança

### **Passo 5: Executar Pipeline com Proteção Ativa**
```bash
# Tag Rules Only (mais rápido para testar)
curl -X POST http://localhost:3001/api/cron/tag-rules-only

# Ou Daily Pipeline completo
curl -X POST http://localhost:3001/api/cron/manual
```

**Resultado esperado:**
- Snapshots PRE/POST criados
- Comparação mostra tags adicionadas/removidas
- **NENHUMA tag nativa é removida** (bloqueadas pela proteção)
- Logs mostram tags bloqueadas (se houver tentativas)

---

## 🔍 COMO VALIDAR QUE ESTÁ A FUNCIONAR

### **1. Verificar Snapshots na BD**
```javascript
db.ac_native_tags_snapshots.find({ email: 'teste@example.com' })
```

Deve mostrar:
- `nativeTags`: Array de tags nativas (sem BO_)
- `boTags`: Array de tags BO (com BO_)
- `history`: Histórico de mudanças

### **2. Verificar Logs do Pipeline**
Procurar por:
```
[Orchestrator] 🚨 BLOQUEADAS X tags nativas para email@example.com
[NativeTagProtection] 🚨 BLOQUEADO: Tentativa de remover tag NATIVA "Cliente VIP"
```

### **3. Verificar Tags Aplicadas**
Todas as novas tags devem ter prefixo `BO_`:
```
BO_OGI_V1 - Inativo 14d
BO_OGI_V1 - Médio Engajamento
BO_CLAREZA_ANUAL - Progresso Alto
```

### **4. Verificar ActiveCampaign**
- Tags antigas (sem BO_) devem permanecer intactas
- Tags nativas (Cliente VIP, etc.) nunca são removidas
- Tags BO antigas (sem prefixo) podem ser removidas
- Tags BO novas (com prefixo) são adicionadas

---

## 📊 ESTATÍSTICAS ESPERADAS

### **Após Inicialização:**
```
Total de snapshots: ~5000
Utilizadores com tags nativas: ~1500-2000
Média de tags nativas por user: 2-5
```

### **Após Pipeline:**
```
Tags BO aplicadas: ~2500-3000 (novas com BO_ prefix)
Tags BO removidas: ~500-800 (antigas sem BO_ prefix)
Tags nativas bloqueadas: 0 (proteção ativa)
Tags nativas removidas: 0 ✅
```

---

## 🛡️ GARANTIAS DO SISTEMA

1. **NUNCA remove tags sem prefixo BO_**
2. **NUNCA remove tags no snapshot de nativas**
3. **NUNCA remove tags com histórico de ser nativa**
4. **SEMPRE captura tags antes de operações**
5. **SEMPRE valida ANTES de remover**
6. **SEMPRE loga tentativas de remoção bloqueadas**

---

## ⚠️ ROLLBACK (Se Necessário)

Se algo correr mal:

1. **Restaurar tags nativas:**
```javascript
const snapshot = await ACNativeTagsSnapshot.findOne({ email: 'user@example.com' })
// snapshot.nativeTags contém as tags originais
// Adicionar de volta via activeCampaignService.addTagsBatch()
```

2. **Histórico de mudanças:**
```javascript
snapshot.history.forEach(entry => {
  console.log(entry.timestamp, entry.action, entry.tags)
})
```

---

## 📝 CHECKLIST PRE-PRODUÇÃO

- [ ] ✅ Modelo ACNativeTagsSnapshot criado
- [ ] ✅ Serviço nativeTagProtection criado
- [ ] ✅ Tag formatter criado (prefixo BO_)
- [ ] ✅ Orchestrator integrado com proteção
- [ ] ⏳ Todos os avaliadores atualizados com formatBOTag()
- [ ] ⏳ Código compilado (npm run build)
- [ ] ⏳ Inicialização executada (initialize-native-tags-protection.js)
- [ ] ⏳ Testes executados (test-native-tag-protection.js)
- [ ] ⏳ Pipeline testado com proteção ativa
- [ ] ⏳ Validação em AC que tags nativas estão intactas
- [ ] ⏳ Logs revisados para bloqueios

---

**Criado em**: 2026-01-23
**Autor**: Claude Code Assistant
**Status**: 🟡 Implementação 80% completa - Falta atualizar avaliadores com BO_ prefix
