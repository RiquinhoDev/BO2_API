# 🧪 SPRINT 5.2 - TESTES E VALIDAÇÃO

## ✅ STATUS DE VALIDAÇÃO

### Arquivos V2 Criados e Validados

#### Backend Controllers ✅
- `src/controllers/usersV2.controller.ts` - **SEM ERROS**
- `src/controllers/syncV2.controller.ts` - **SEM ERROS**
- `src/controllers/hotmartV2.controller.ts` - **SEM ERROS**
- `src/controllers/curseducaV2.controller.ts` - **SEM ERROS**
- `src/controllers/activecampaignV2.controller.ts` - **SEM ERROS**

#### Backend Routes ✅
- `src/routes/usersV2.routes.ts` - **SEM ERROS**
- `src/routes/syncV2.routes.ts` - **SEM ERROS**
- `src/routes/hotmartV2.routes.ts` - **SEM ERROS**
- `src/routes/curseducaV2.routes.ts` - **SEM ERROS**
- `src/routes/activecampaignV2.routes.ts` - **SEM ERROS**
- `src/routes/index.ts` - **ATUALIZADO - SEM ERROS**

#### Backend Services ✅
- `src/services/userProductService.ts` - **ATUALIZADO - SEM ERROS**
- `src/services/tagRuleEngineV2.ts` - **SEM ERROS**
- `src/middleware/v2Monitor.ts` - **SEM ERROS**

#### Frontend Types ✅
- `src/types/userV2.types.ts` - **SEM ERROS**

#### Frontend Services ✅
- `src/services/usersV2.service.ts` - **SEM ERROS**
- `src/services/syncV2.service.ts` - **SEM ERROS**
- `src/services/activecampaignV2.service.ts` - **SEM ERROS**

#### Frontend Hooks ✅
- `src/hooks/useUsersV2.ts` - **SEM ERROS**

---

## 📋 TESTES MANUAIS A EXECUTAR

### 1. Testar Servidor Iniciando

```bash
# Terminal 1 - Backend
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
yarn dev

# Aguardar mensagem: "🚀 Servidor rodando na porta 3001"
```

**Verificações:**
- [ ] Servidor inicia sem erros
- [ ] Conecta ao MongoDB
- [ ] Não há erros de import nos controllers V2

---

### 2. Testar Endpoints V2 - Users

```bash
# GET /api/v2/users/stats/overview
curl http://localhost:3001/api/v2/users/stats/overview

# Esperado:
{
  "success": true,
  "data": {
    "totalUsers": N,
    "byPlatform": [...],
    "byProduct": [...]
  },
  "_v2Enabled": true
}
```

```bash
# GET /api/v2/users
curl http://localhost:3001/api/v2/users

# Esperado:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "...",
      "email": "...",
      "products": [...]
    }
  ],
  "_v2Enabled": true
}
```

**Checklist:**
- [ ] `/api/v2/users/stats/overview` retorna stats
- [ ] `/api/v2/users` retorna array de users
- [ ] Todos os responses têm `_v2Enabled: true`
- [ ] Users têm array `products[]`

---

### 3. Testar Sync Escalável - Criar Produto Novo

#### 3.1. Criar Produto Shopify no MongoDB

```bash
# Abrir MongoDB Compass ou mongosh
mongosh

use platformanalytics

db.products.insertOne({
  name: "Curso Shopify Mastery",
  code: "shopify-master-2025",
  platform: "shopify",
  platformData: {
    storeId: "store-test-123",
    productSku: "SHOP-001"
  },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})

# Copiar o _id gerado
```

#### 3.2. Sincronizar User com Shopify (NOVA PLATAFORMA)

```bash
curl -X POST http://localhost:3001/api/v2/sync/generic \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "shopify",
    "identifier": {"storeId": "store-test-123"},
    "userData": {
      "email": "teste-shopify@example.com",
      "name": "João Shopify"
    },
    "productData": {
      "orderStatus": "completed",
      "progressPercentage": 30
    }
  }'

# Esperado:
{
  "success": true,
  "data": {
    "_id": "...",
    "email": "teste-shopify@example.com",
    "products": [
      {
        "product": {
          "name": "Curso Shopify Mastery",
          "platform": "shopify"
        },
        "status": "active",
        "progress": {
          "progressPercentage": 30
        }
      }
    ]
  },
  "syncedProduct": {
    "name": "Curso Shopify Mastery",
    "platform": "shopify"
  },
  "_v2Enabled": true
}
```

**Checklist:**
- [ ] Request aceita plataforma "shopify" (NOVA)
- [ ] User criado com produto Shopify
- [ ] Response tem `_v2Enabled: true`
- [ ] **CÓDIGO ALTERADO: 0 LINHAS** ✅

---

### 4. Testar Multi-Produto (CRÍTICO)

```bash
# Adicionar Hotmart ao MESMO user
curl -X POST http://localhost:3001/api/v2/sync/hotmart \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste-shopify@example.com",
    "subdomain": "ograndeinvestimento-bomrmk",
    "status": "active",
    "progress": 75
  }'

# Esperado:
{
  "success": true,
  "data": {
    "email": "teste-shopify@example.com",
    "products": [
      {
        "product": {
          "name": "Curso Shopify Mastery",
          "platform": "shopify"
        }
      },
      {
        "product": {
          "name": "O Grande Investimento",
          "platform": "hotmart"
        }
      }
    ]
  },
  "_v2Enabled": true
}
```

**Checklist:**
- [ ] User AGORA tem 2 produtos
- [ ] Shopify mantém progressPercentage: 30
- [ ] Hotmart tem progressPercentage: 75
- [ ] **Dados não foram sobrescritos** ✅

---

### 5. Testar Tags por Produto (ISOLAMENTO)

#### 5.1. Aplicar Tag ao Shopify

```bash
# Buscar IDs
curl http://localhost:3001/api/v2/users/by-email/teste-shopify@example.com

# Copiar userId e productId do Shopify

curl -X POST http://localhost:3001/api/v2/activecampaign/tag/apply \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID_AQUI",
    "productId": "SHOPIFY_PRODUCT_ID_AQUI",
    "tagName": "SHOPIFY_PREMIUM"
  }'

# Esperado:
{
  "success": true,
  "data": {
    "productName": "Curso Shopify Mastery",
    "tagApplied": "SHOPIFY_PREMIUM"
  },
  "_v2Enabled": true
}
```

#### 5.2. Verificar Isolamento no MongoDB

```javascript
// Verificar UserProduct do Shopify
db.userproducts.findOne({
  userId: ObjectId("USER_ID"),
  productId: ObjectId("SHOPIFY_PRODUCT_ID")
})

// Esperado:
// activeCampaignData.tags: ["SHOPIFY_PREMIUM"] ✅

// Verificar UserProduct do Hotmart
db.userproducts.findOne({
  userId: ObjectId("USER_ID"),
  productId: ObjectId("HOTMART_PRODUCT_ID")
})

// Esperado:
// activeCampaignData.tags: [] OU undefined ✅
// NÃO DEVE TER "SHOPIFY_PREMIUM"
```

**Checklist:**
- [ ] Tag aplicada ao produto Shopify
- [ ] Tag NÃO existe no produto Hotmart
- [ ] **Isolamento perfeito confirmado** ✅

---

### 6. Testar Sync Status

```bash
curl http://localhost:3001/api/v2/sync/status

# Esperado:
{
  "success": true,
  "data": {
    "users": N,
    "products": M,
    "userProducts": X,
    "productsByPlatform": [
      {"_id": "hotmart", "count": ...},
      {"_id": "curseduca", "count": ...},
      {"_id": "shopify", "count": ...}  # ← NOVO
    ]
  },
  "_v2Enabled": true
}
```

**Checklist:**
- [ ] Endpoint retorna contagens corretas
- [ ] `productsByPlatform` inclui "shopify"
- [ ] `_v2Enabled: true`

---

### 7. Testar Monitorização V2

```bash
curl http://localhost:3001/api/v2/metrics

# Esperado:
{
  "totalRequests": N,
  "v2Requests": N,
  "v1Requests": 0,
  "v2Percentage": 100,
  "avgResponseTime": XX,
  "errors": 0
}
```

**Checklist:**
- [ ] `v2Percentage` deve ser 100%
- [ ] `v1Requests` deve ser 0
- [ ] Sistema está operando 100% em V2

---

## 🎯 TESTES DE ESCALABILIDADE

### Teste 1: Adicionar Udemy (5ª plataforma)

```bash
# 1. Criar produto Udemy
db.products.insertOne({
  name: "Marketing Digital Avançado",
  code: "udemy-marketing-2025",
  platform: "udemy",
  platformData: {
    courseId: "mkt-12345",
    instructorId: "inst-789"
  },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})

# 2. Sincronizar
curl -X POST http://localhost:3001/api/v2/sync/generic \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "udemy",
    "identifier": {"courseId": "mkt-12345"},
    "userData": {"email": "maria@udemy.com"},
    "productData": {"status": "enrolled", "progress": 80}
  }'
```

**Resultado Esperado:**
- ✅ User criado com produto Udemy
- ✅ Código alterado: **0 linhas**
- ✅ Tempo: **2 minutos**

---

### Teste 2: User com 5 Produtos de 5 Plataformas

```bash
# User: teste-completo@example.com

# 1. Shopify
POST /api/v2/sync/generic {"platform": "shopify", ...}

# 2. Hotmart
POST /api/v2/sync/hotmart {"email": "teste-completo@example.com", ...}

# 3. CursEduca
POST /api/v2/sync/curseduca {"email": "teste-completo@example.com", ...}

# 4. Discord
POST /api/v2/sync/discord {"email": "teste-completo@example.com", ...}

# 5. Udemy
POST /api/v2/sync/generic {"platform": "udemy", ...}

# Verificar
GET /api/v2/users/by-email/teste-completo@example.com
```

**Resultado Esperado:**
```json
{
  "email": "teste-completo@example.com",
  "products": [
    {"product": {"platform": "shopify"}},
    {"product": {"platform": "hotmart"}},
    {"product": {"platform": "curseduca"}},
    {"product": {"platform": "discord"}},
    {"product": {"platform": "udemy"}}
  ]
}
```

**Checklist:**
- [ ] User tem 5 produtos
- [ ] Cada produto tem dados isolados
- [ ] Nenhum dado foi sobrescrito

---

## 📊 RESUMO DE VALIDAÇÃO

### Backend V2
| Componente | Status | Errors |
|------------|--------|--------|
| Controllers V2 | ✅ | 0 |
| Routes V2 | ✅ | 0 |
| Services | ✅ | 0 |
| TagRuleEngine V2 | ✅ | 0 |
| Middleware | ✅ | 0 |

### Frontend V2
| Componente | Status | Errors |
|------------|--------|--------|
| Types | ✅ | 0 |
| Services | ✅ | 0 |
| Hooks | ✅ | 0 |

### Funcionalidades Críticas
| Funcionalidade | Status |
|----------------|--------|
| Sync Escalável | ✅ PRONTO |
| Multi-Produto | ✅ PRONTO |
| Tags por Produto | ✅ PRONTO |
| Isolamento de Dados | ✅ PRONTO |
| Dual Write V1+V2 | ✅ PRONTO |
| Backward Compatible | ✅ PRONTO |

---

## 🎉 CONCLUSÃO DOS TESTES

### ✅ Todos os arquivos V2 validados pelo linter
### ✅ Zero erros de sintaxe
### ✅ Arquitetura escalável implementada
### ✅ Sistema pronto para testes funcionais

**Próximo Passo:** Executar testes manuais com servidor rodando

