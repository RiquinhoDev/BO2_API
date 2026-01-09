# 🔍 GUIA DE DEBUG: Fluxo BD → AC (Rui)

**Data**: 2026-01-06
**Objetivo**: Descobrir onde há perda de informação entre BD e AC

---

## 📊 PROBLEMA IDENTIFICADO

**Pipeline executou**:
- ✅ STEP 1-3: Sync Hotmart, CursEduca, Recalc (OK)
- ✅ STEP 4: Tag Rules (completo mas demorado - 12,427s = 3h47min)
- ⚠️ **Tags aplicadas**: 1510 (parece baixo)
- ❌ **Rui**: Tags não correspondem ao que está na BD

**Duração total**: 259min (4h19min) - MUITO LENTO!

---

## 🔧 FERRAMENTAS CRIADAS

### 1. DebugLogger (`src/utils/debugLogger.ts`)

Sistema de logging que:
- ✅ Grava logs detalhados em ficheiro MD
- ✅ Log de cada endpoint da AC (request + response)
- ✅ Log de queries à BD
- ✅ Timestamps precisos
- ✅ Guarda em `logs/debug/`

---

### 2. Script de Debug Completo (`scripts/debug-rui-tags-complete.ts`)

**O QUE FAZ**:

#### STEP 1: Buscar Rui na BD
```
BD.findOne({ email: 'ruifilipespteixeira@gmail.com' })
↓
LOG: _id, email, name, hotmart (presente/ausente), curseduca (presente/ausente)
```

#### STEP 2: Buscar UserProducts do Rui
```
UserProduct.find({ userId: ruiId, status: 'ACTIVE' })
↓
LOG: Lista de produtos (OGI_V1, CLAREZA, etc)
```

#### STEP 3: Buscar ContactId do Rui na AC
```
GET /api/3/contacts?email=ruifilipespteixeira@gmail.com
↓
LOG: endpoint, response, contactId
```

#### STEP 4: Para CADA produto do Rui

```
a) Buscar TagRules na BD
   ↓
   LOG: TagRules ativas, condições, ações

b) DecisionEngine: Avaliar tags esperadas
   ↓
   LOG: Decisões tomadas, tagsToApply, tagsToRemove, razões

c) Buscar tags ATUAIS do Rui na AC
   GET /api/3/contacts/{contactId}/contactTags
   ↓
   LOG: endpoint, response, todas as tags, tags filtradas por produto

d) COMPARAR: Tags esperadas vs Tags na AC
   ↓
   LOG: expectedTags, currentTags, tagsToAdd, tagsToRemove

e) RESULTADO
   ✅ Tags CORRETAS (match)
   ❌ Tags DESATUALIZADAS (diff)
```

#### STEP 5: Listar TODAS as tags do Rui
```
GET /api/3/contacts/{contactId}/contactTags
↓
LOG: Lista completa com marcação (BO) ou (Nativa AC)
```

---

## 🚀 COMO USAR

### Executar script de debug:
```bash
npx tsx scripts/debug-rui-tags-complete.ts
```

### Output esperado:

**Console**:
```
════════════════════════════════════════════════════════════
🔍 DEBUG COMPLETO: Fluxo BD → AC (Rui)
════════════════════════════════════════════════════════════

[SETUP] Conectando à BD
[SETUP] Conectado à BD com sucesso
[BD] Buscando Rui na BD
[BD] Rui encontrado
   _id: 64abc123...
   email: ruifilipespteixeira@gmail.com
   name: Rui Teixeira
   hotmart: presente
   curseduca: ausente

[BD] Buscando UserProducts do Rui
[BD] 2 UserProducts ACTIVE encontrados
   1. OGI_V1
   2. CLAREZA_V1

[AC] GET /api/3/contacts?email=...
[AC] ContactId do Rui encontrado
   contactId: 123456

════════════════════════════════════════════════════════════
📦 PRODUTO: OGI_V1
════════════════════════════════════════════════════════════

[BD] Buscando TagRules para OGI_V1
[BD] 8 TagRules ativas encontradas

[DECISION_ENGINE] Avaliando regras para OGI_V1
[DECISION_ENGINE] Decisões tomadas
   tagsToApply: ["Ativo", "Progresso Alto", "Engajado"]
   tagsToRemove: []

[AC] GET /api/3/contacts/123456/contactTags
[DEBUG] getContactTags() START
   contactId: 123456
   endpoint: GET /api/3/contacts/123456/contactTags

[DEBUG] getContactTags() RESPONSE
   status: 200
   contactTags count: 15

[DEBUG] Buscando detalhes de 15 tags...
[DEBUG]    Tag 789 → "OGI_V1 - Ativo"
[DEBUG]    Tag 790 → "OGI_V1 - Inativo 7d"
[DEBUG]    Tag 791 → "Tag Antiga"
...

[AC] Tags deste produto (OGI_V1) na AC
   prefixes: ["OGI_V1", "OGI"]
   totalTagsInAC: 15
   productTagsInAC: ["OGI_V1 - Ativo", "OGI_V1 - Inativo 7d"]

[COMPARISON] Comparação BD vs AC
   expectedTags: ["OGI_V1 - Ativo", "OGI_V1 - Progresso Alto", "OGI_V1 - Engajado"]
   currentTags: ["OGI_V1 - Ativo", "OGI_V1 - Inativo 7d"]
   tagsToAdd: ["OGI_V1 - Progresso Alto", "OGI_V1 - Engajado"]
   tagsToRemove: ["OGI_V1 - Inativo 7d"]
   match: false

📊 RESULTADO PARA OGI_V1:
   Tags esperadas (BD): [OGI_V1 - Ativo, OGI_V1 - Progresso Alto, OGI_V1 - Engajado]
   Tags atuais (AC):    [OGI_V1 - Ativo, OGI_V1 - Inativo 7d]
   🆕 A adicionar:      [OGI_V1 - Progresso Alto, OGI_V1 - Engajado]
   🗑️  A remover:        [OGI_V1 - Inativo 7d]
   ⚠️  Tags DESATUALIZADAS (precisa sync)

════════════════════════════════════════════════════════════
📋 TODAS AS TAGS DO RUI NA AC
════════════════════════════════════════════════════════════

Total de tags: 15
   1. OGI_V1 - Ativo (BO)
   2. OGI_V1 - Inativo 7d (BO)
   3. CLAREZA - Inscrito (BO)
   4. Tag Nativa 1 (Nativa AC)
   5. Tag Nativa 2 (Nativa AC)
   ...

✅ DEBUG COMPLETO

📁 Log detalhado guardado em: logs/debug/debug-rui-tags-2026-01-06T23-15-30.md
```

**Ficheiro MD gerado** (`logs/debug/debug-rui-tags-*.md`):

```markdown
# 🔍 DEBUG LOG

**Sessão**: debug-rui-tags
**Início**: 06/01/2026, 23:15:30
**SessionID**: 2026-01-06T23-15-30

---

## SETUP - Conectando à BD

**Time**: 23:15:30

---

## BD - Rui encontrado

**Time**: 23:15:31

**Data**:
```json
{
  "_id": "64abc123...",
  "email": "ruifilipespteixeira@gmail.com",
  "name": "Rui Teixeira",
  "hotmart": "presente",
  "curseduca": "ausente"
}
```

---

## AC - GET /api/3/contacts/{contactId}/contactTags

**Time**: 23:15:32

**Endpoint**: `GET /api/3/contacts/123456/contactTags`

**Response**:
```json
{
  "contactTags": [
    { "id": "789", "tag": "15", "cdate": "..." },
    { "id": "790", "tag": "16", "cdate": "..." }
  ]
}
```

---

... (continua com TODOS os passos)

---

# 📊 RESUMO

**Fim**: 06/01/2026, 23:16:00
**Duração**: 0min 30s
**Total de logs**: 45

**Ficheiro**: `logs/debug/debug-rui-tags-2026-01-06T23-15-30.md`
```

---

## 🎯 O QUE PROCURAR NO LOG

### 1. **Tags esperadas vs Tags atuais**
```
[COMPARISON] Comparação BD vs AC
   expectedTags: [...]
   currentTags: [...]
   tagsToAdd: [...]
   tagsToRemove: [...]
```

**Se `match: false`** → Há diferença (BUG!)

---

### 2. **DecisionEngine: Razões**
```
[DECISION_ENGINE] Decisões tomadas
   decisions: [
     {
       ruleName: "Inativo 7d",
       action: "APPLY_TAG",
       tagName: "Inativo 7d",
       shouldExecute: false,  ← AQUI!
       reason: "Cooldown ativo" ← AQUI!
     }
   ]
```

**Se `shouldExecute: false`** → Tag NÃO vai ser aplicada (porquê?)

---

### 3. **Endpoints AC: Respostas**
```
[DEBUG] getContactTags() RESPONSE
   status: 200
   contactTags count: 15
```

**Se count diferente do esperado** → AC não tem as tags certas

---

### 4. **Logs de funções específicas**

**`findContactTag()`**:
```
[DEBUG] findContactTag() START
   contactId: 123456
   tagId: 789
   propósito: Verificar se tag ESPECÍFICA está associada ao contacto
   endpoint: GET /api/3/contactTags?filters[contact]=123456&filters[tag]=789

[DEBUG] findContactTag() RESPONSE
   contactTags encontrados: 1
   contactTagId: "999" (ou "null" se não tiver)
```

**`getContactTags()`**:
```
[DEBUG] getContactTags() START
   contactId: 123456
   endpoint: GET /api/3/contacts/123456/contactTags

[DEBUG] getContactTags() RESPONSE
   status: 200
   contactTags count: 15

[DEBUG] Buscando detalhes de 15 tags...
[DEBUG]    Tag 789 → "OGI_V1 - Ativo"
[DEBUG]    Tag 790 → "OGI_V1 - Inativo 7d"
...
```

---

## 📋 DIFERENÇA ENTRE FUNÇÕES

### `findContactTag(contactId, tagId)`
- **Propósito**: Verificar se UMA tag ESPECÍFICA está no contacto
- **Endpoint**: `GET /api/3/contactTags?filters[contact]=X&filters[tag]=Y`
- **Retorna**: `contactTagId` (ID da associação) OU `null`
- **Uso**: Antes de adicionar tag (ver se já existe)

### `getContactTags(contactId)`
- **Propósito**: Buscar TODAS as tags de um contacto
- **Endpoint**: `GET /api/3/contacts/{contactId}/contactTags`
- **Retorna**: Array de tags `["Tag1", "Tag2", ...]`
- **Uso**: Comparar tags atuais vs esperadas

---

## 🐛 POSSÍVEIS BUGS A PROCURAR

### 1. DecisionEngine retorna tags mas `shouldExecute: false`
```
Razões possíveis:
- Cooldown ativo
- Condição não cumprida
- Regra desativada
```

### 2. Tags na BD diferentes das tags na AC
```
BD: ["Tag A", "Tag B", "Tag C"]
AC: ["Tag A", "Tag Antiga"]

→ Tag B e C não foram aplicadas (porquê?)
→ Tag Antiga não foi removida (porquê?)
```

### 3. `getContactTags()` retorna menos tags que esperado
```
→ AC pode ter cache
→ Tags podem não ter sido criadas
→ Contacto pode ter sido criado duplicado
```

### 4. Performance lenta
```
12,427s para processar tags = 3h47min

→ Demasiados pedidos à AC?
→ Rate limit a atrasar?
→ Muitos alunos processados?
```

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ **Executar script**: `npx tsx scripts/debug-rui-tags-complete.ts`
2. ✅ **Analisar log MD** gerado em `logs/debug/`
3. ✅ **Procurar**:
   - Tags esperadas vs atuais (diff)
   - `shouldExecute: false` (razões)
   - Respostas AC (counts incorretos)
4. ✅ **Identificar** onde há perda de informação
5. ✅ **Corrigir** o bug específico

---

**Ficheiros criados**:
- ✅ `src/utils/debugLogger.ts` - Sistema de logging
- ✅ `scripts/debug-rui-tags-complete.ts` - Script de debug
- ✅ Logs adicionados em `activeCampaignService.ts` (`findContactTag`, `getContactTags`)

**Pronto para executar!** 🎉
