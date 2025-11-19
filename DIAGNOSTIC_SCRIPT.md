# 🔍 SCRIPT DE DIAGNÓSTICO - RIQUINHO API

## 📅 Data: 19 Novembro 2025

---

## ✅ CORREÇÕES JÁ APLICADAS

### 1. ✅ CursEduca Service - Funções Adicionadas
- `testCurseducaConnection()`
- `syncCurseducaMembers()`
- `syncCurseducaProgress()`
- `getCurseducaDashboardStats()`

### 2. ✅ Import Platform Corrigido
```typescript
// Antes: import { Platform } from '../models/User'
// Depois: platform: 'curseduca' (string literal)
```

### 3. ✅ dotenv.config() Movido para o Topo
```typescript
// Agora é a PRIMEIRA coisa executada no index.ts
import dotenv from "dotenv"
dotenv.config()
```

### 4. ✅ Variáveis AC - Espaços Removidos
```env
# Antes: AC_API_URL =https://...
# Depois: AC_API_URL=https://...
```

---

## 🚀 PASSO A PASSO PARA CORRIGIR TUDO

### PASSO 1: REINICIAR BACKEND (OBRIGATÓRIO!)

```powershell
# 1. Parar o backend atual (CTRL+C no terminal)

# 2. Navegar para a pasta do backend
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API

# 3. Reiniciar
npm run dev
```

**VERIFICAR no console:**
```
✅ Servidor rodando na porta 3001
✅ MongoDB conectado
✅ Rotas registradas
```

**NÃO DEVE APARECER:**
```
❌ Error: Invalid URL
❌ TypeError: getCurseducaDashboardStats is not a function
❌ Active Campaign não configurado
```

---

### PASSO 2: TESTAR ENDPOINTS CURSEDUCA

#### Teste A: Dashboard
```powershell
curl http://localhost:3001/api/curseduca/dashboard
```

**ESPERADO:** Status 200 + JSON:
```json
{
  "success": true,
  "message": "✅ Estatísticas calculadas com sucesso",
  "data": {
    "overview": {
      "totalUsers": X,
      "activeUsers": Y,
      ...
    }
  }
}
```

#### Teste B: Sincronização
```powershell
curl http://localhost:3001/api/curseduca/syncCurseducaUsers
```

**ESPERADO:** Status 200 + stats de sincronização

---

### PASSO 3: TESTAR ACTIVE CAMPAIGN

```powershell
curl "http://localhost:3001/api/ac/contact/joaomcf37@gmail.com/tags"
```

**ESPERADO:** Status 200 + Array de tags:
```json
{
  "success": true,
  "data": {
    "email": "joaomcf37@gmail.com",
    "tags": ["TAG1", "TAG2"],
    "products": [...]
  }
}
```

**SE 500:**
- Verificar credenciais AC no `.env`
- Ver logs do backend para stack trace

---

### PASSO 4: DISCORD ANALYTICS (OPCIONAL)

⚠️ **NOTA:** Discord Analytics é um **servidor separado** na porta 3002!

Se não tens este projeto, podes **IGNORAR** este passo. O sistema funciona sem ele.

**Se quiseres ativar:**
1. Encontrar o projeto Discord Analytics
2. Configurar `.env` com token Discord
3. Iniciar: `npm run dev`
4. Verificar: `curl http://localhost:3002/api/analytics/overview?days=7`

---

## 🧪 SCRIPT DE DIAGNÓSTICO AUTOMÁTICO

Cria um ficheiro `test-endpoints.ps1`:

```powershell
# test-endpoints.ps1 - Testar todos os endpoints críticos

Write-Host "🔍 DIAGNÓSTICO RIQUINHO API" -ForegroundColor Cyan
Write-Host "=" -repeat 50

# Testar Backend Health
Write-Host "`n✅ 1. Backend Health..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -Method Get
if ($health.status -eq "OK") {
    Write-Host "   ✅ Backend ONLINE" -ForegroundColor Green
} else {
    Write-Host "   ❌ Backend com problemas" -ForegroundColor Red
}

# Testar CursEduca Dashboard
Write-Host "`n✅ 2. CursEduca Dashboard..." -ForegroundColor Yellow
try {
    $curseduca = Invoke-RestMethod -Uri "http://localhost:3001/api/curseduca/dashboard" -Method Get
    if ($curseduca.success) {
        Write-Host "   ✅ Dashboard OK - $($curseduca.data.overview.totalUsers) users" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Dashboard FALHOU: $($_.Exception.Message)" -ForegroundColor Red
}

# Testar AC Tags
Write-Host "`n✅ 3. Active Campaign Tags..." -ForegroundColor Yellow
try {
    $ac = Invoke-RestMethod -Uri "http://localhost:3001/api/ac/contact/test@email.com/tags" -Method Get
    Write-Host "   ✅ AC OK" -ForegroundColor Green
} catch {
    Write-Host "   ❌ AC FALHOU: $($_.Exception.Message)" -ForegroundColor Red
}

# Testar Discord Analytics (opcional)
Write-Host "`n✅ 4. Discord Analytics (opcional)..." -ForegroundColor Yellow
try {
    $discord = Invoke-RestMethod -Uri "http://localhost:3002/api/analytics/overview?days=7" -Method Get
    Write-Host "   ✅ Discord Analytics OK" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Discord Analytics OFFLINE (opcional)" -ForegroundColor Yellow
}

Write-Host "`n" + "=" -repeat 50
Write-Host "🎉 DIAGNÓSTICO COMPLETO!" -ForegroundColor Cyan
```

**Executar:**
```powershell
.\test-endpoints.ps1
```

---

## 📊 VERIFICAR MONGODB

Se os endpoints continuarem a dar 500, verificar a BD:

```javascript
// Abrir MongoDB Compass ou mongosh
use platformanalytics

// 1. Verificar Users CursEduca
db.users.countDocuments({"curseduca.curseducaUserId": {$exists: true}})
// Esperado: > 0

// 2. Verificar Produtos
db.products.find({platform: "curseduca"}).pretty()
// Esperado: Pelo menos 1 produto CursEduca

// 3. Verificar UserProducts
db.userproducts.countDocuments({})
// Esperado: > 0

// 4. Verificar índices
db.users.getIndexes()
// Deve incluir índices em curseduca.curseducaUserId
```

---

## 🐛 TROUBLESHOOTING

### Erro: "Invalid URL" continua

**Causa:** `dotenv.config()` não executou corretamente

**Solução:**
1. Confirmar que `index.ts` tem `dotenv.config()` na linha 3
2. Reiniciar backend completamente (matar processo e reiniciar)
3. Verificar `.env` existe na raiz de `BO2_API/`

### Erro: "getCurseducaDashboardStats is not a function"

**Causa:** Backend não foi reiniciado após adicionar funções

**Solução:**
1. **CTRL+C** para parar backend
2. `npm run dev` para reiniciar
3. Aguardar "Servidor rodando na porta 3001"

### Erro: CursEduca Dashboard 500 mas logs vazios

**Causa:** MongoDB sem dados ou query a falhar

**Solução:**
1. Executar sync manualmente: `GET /api/curseduca/syncCurseducaUsers`
2. Verificar MongoDB tem dados
3. Ver logs detalhados no terminal do backend

### Erro: AC Tags 500

**Causa:** Credenciais AC incorretas ou API down

**Solução:**
1. Verificar `.env` tem `AC_API_URL` e `AC_API_KEY` **SEM ESPAÇOS**
2. Testar credenciais AC manualmente (Postman/curl)
3. Verificar se AC API está online

---

## ✅ CHECKLIST FINAL

Após reiniciar backend:

- [ ] Backend inicia sem erros
- [ ] MongoDB conecta com sucesso
- [ ] `GET /api/health` retorna 200
- [ ] `GET /api/curseduca/dashboard` retorna 200
- [ ] `GET /api/curseduca/syncCurseducaUsers` retorna 200
- [ ] `GET /api/ac/contact/:email/tags` retorna 200
- [ ] Frontend carrega sem erros 404/500
- [ ] Console browser sem erros vermelhos

---

## 📞 SE AINDA HOUVER ERROS

Cola aqui:
1. **Output completo** do terminal backend (últimas 50 linhas)
2. **Stack trace** do erro (se houver)
3. **Resultado** do script de diagnóstico

---

**Data:** 19 Novembro 2025  
**Versão:** 3.0  
**Status:** ✅ Pronto para aplicar

