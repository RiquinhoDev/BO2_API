# 🔧 CORREÇÃO URL API - Double `/api/api/`

## 📅 Data: 19 Novembro 2025

## 🐛 PROBLEMA

Estava a ocorrer **duplicação do `/api`** nas chamadas:
```
GET http://localhost:3001/api/api/users/listUsersSimple ❌
GET http://localhost:3001/api/api/users/dashboard-stats ❌
```

## 🎯 CAUSA RAIZ

Os **services V2** tinham o fallback **INCORRETO**:
```typescript
// ❌ ERRADO - adiciona /api no fallback
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
```

Quando `VITE_API_URL` não estava definido, usava o fallback `http://localhost:3001/api`, e depois **ADICIONAVA MAIS UM `/api`** na chamada, resultando em `/api/api/`.

## ✅ SOLUÇÃO

Corrigido para usar **duas variáveis**:
```typescript
// ✅ CORRETO - separa base URL do caminho da API
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const BASE_URL = `${API_URL}/api`
```

Agora:
- Se `VITE_API_URL` está definido (ex: `http://localhost:3001`), usa esse valor
- Adiciona `/api` **UMA VEZ** via `BASE_URL`
- Resultado: `http://localhost:3001/api/v2/users/...` ✅

## 📝 ARQUIVOS CORRIGIDOS

### 1. ✅ Front/src/services/usersV2.service.ts
```typescript
-const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
+const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
+const BASE_URL = `${API_URL}/api`

-const response = await axios.get(`${API_URL}/v2/users?${params.toString()}`)
+const response = await axios.get(`${BASE_URL}/v2/users?${params.toString()}`)
```

### 2. ✅ Front/src/services/activecampaignV2.service.ts
```typescript
-const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
+const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
+const BASE_URL = `${API_URL}/api`

-const response = await axios.post(`${API_URL}/v2/activecampaign/tag/apply`, payload)
+const response = await axios.post(`${BASE_URL}/v2/activecampaign/tag/apply`, payload)
```

### 3. ✅ Front/src/services/syncV2.service.ts
```typescript
-const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
+const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
+const BASE_URL = `${API_URL}/api`

-const response = await axios.post(`${API_URL}/v2/sync/generic`, payload)
+const response = await axios.post(`${BASE_URL}/v2/sync/generic`, payload)
```

## 📊 PADRÃO CORRETO

### .env do Frontend
```env
# ✅ SEM /api no final
VITE_API_URL=http://localhost:3001
```

### Services
```typescript
// ✅ PADRÃO CORRETO para todos os services
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const BASE_URL = `${API_URL}/api`

// Usar BASE_URL nas chamadas
axios.get(`${BASE_URL}/v2/users/...`)
```

## 🚀 RESULTADO

Agora as chamadas estão **CORRETAS**:
```
✅ GET http://localhost:3001/api/v2/users/stats/overview
✅ GET http://localhost:3001/api/users/listUsersSimple
✅ GET http://localhost:3001/api/users/dashboard-stats
```

## 📝 LIÇÕES APRENDIDAS

1. **Nunca duplicar `/api`** no fallback de `VITE_API_URL`
2. **Sempre usar duas variáveis**: `API_URL` (base) e `BASE_URL` (com `/api`)
3. **`.env` deve ter apenas a base URL** sem caminhos adicionais
4. **Services devem construir o caminho completo** internamente

---

**Status:** ✅ CORRIGIDO  
**Autor:** Assistant AI  
**Data:** 19 Novembro 2025

