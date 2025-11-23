# 🔍 DEBUG - ERRO 500 CURSEDUCA

## 📅 Data: 19 Novembro 2025

---

## ❌ PROBLEMA

Frontend mostra:
```
GET http://localhost:3001/api/curseduca/syncCurseducaUsers 500 (Internal Server Error)
```

Mas **não sabemos o erro específico** do backend.

---

## 🎯 PASSO 1: VER LOGS DO BACKEND

### No terminal onde o backend está a correr, deve aparecer:

```
❌ Error in CursEduca sync: ...
❌ ERRO CRÍTICO: ...
TypeError: ...
```

### **🚨 AÇÃO: COPIAR ESSES LOGS COMPLETOS E ENVIAR!**

---

## 🎯 PASSO 2: EXECUTAR SCRIPT DE TESTE

Criei um script de teste em: **`test-curseduca-api.ts`**

### Executar:

```powershell
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API

npx ts-node test-curseduca-api.ts
```

### O que vai testar:

1. ✅ Credenciais configuradas
2. ✅ Endpoint `/groups` funciona
3. ✅ Endpoint `/reports/group/members` funciona
4. ✅ Estrutura das respostas
5. ✅ Campos disponíveis em cada objeto

### Output esperado:

```
🧪 TESTE DA API CURSEDUCA
================================================================================
📋 Configuração:
   URL: https://prof.curseduca.pro
   API Key: ✅ Configurada
   Token: ✅ Configurado
================================================================================

🔍 TESTE 1: GET /groups
--------------------------------------------------------------------------------
✅ Status: 200
📦 Tipo da resposta: Array direto
📚 Grupos encontrados: 2

📄 Primeiros 3 grupos:
   - ID: 4, Nome: Clareza, UUID: abc-123
   - ID: 5, Nome: OGI, UUID: def-456

================================================================================
🔍 TESTE 2: GET /reports/group/members?groupId=4
📚 Grupo: Clareza (ID: 4)
--------------------------------------------------------------------------------
✅ Status: 200
📦 Tipo da resposta: Array direto
👥 Membros encontrados: 10

📄 Primeiro membro (estrutura):
   Keys disponíveis: memberId, memberUuid, name, email, groupId, groupName, ...

📄 Dados completos do primeiro membro:
{
  "memberId": 56,
  "email": "eli@hotmail.com",
  "name": "Elisabete",
  "progress": 45,
  "status": "ACTIVE",
  ...
}

================================================================================
✅ Testes concluídos!
================================================================================
```

---

## 🎯 PASSO 3: VERIFICAÇÕES RÁPIDAS

### 1. Backend está a correr?
```powershell
curl http://localhost:3001/api/health
```

**Esperado:** 200 OK

---

### 2. Variáveis de ambiente OK?
```powershell
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
type .env | findstr CURSEDUCA
```

**Esperado:**
```
CURSEDUCA_API_URL=https://prof.curseduca.pro
CURSEDUCA_API_KEY=ce9ef2a4afef727f94738acaef0109c4faa8
CURSEDUCA_AccessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

**Verificar:**
- ✅ Sem espaços antes/depois do `=`
- ✅ Sem trailing slash no URL
- ✅ Sem aspas `"` nas variáveis

---

### 3. Service existe e está correto?
```powershell
dir src\services\curseducaService.ts
```

**Esperado:** Ficheiro existe

---

### 4. Controller existe?
```powershell
dir src\controllers\curseduca.controller.ts
```

**Esperado:** Ficheiro existe

---

### 5. Rota registrada?
```powershell
type src\routes\index.ts | findstr curseduca
```

**Esperado:**
```typescript
router.use('/curseduca', curseducaRoutes)
```

---

## 🎯 PASSO 4: POSSÍVEIS CAUSAS DO ERRO 500

### ❌ Causa 1: Import errado no controller

**Verificar `src/controllers/curseduca.controller.ts`:**

```typescript
// ❌ ERRADO (se função não existe)
import { syncCursEducaStudents } from '../services/curseducaService'

// ✅ CORRETO (conforme exportado no service)
import { syncCursEducaStudents, syncCurseducaMembers } from '../services/curseducaService'
```

**Solução:**
```typescript
// No controller, usar o nome correto:
export const syncCurseducaUsers = async (req: Request, res: Response) => {
  try {
    const result = await syncCursEducaStudents(); // OU syncCurseducaMembers()
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
```

---

### ❌ Causa 2: Função não exportada

**Verificar `src/services/curseducaService.ts` tem:**

```typescript
export const syncCursEducaStudents = async () => { 
  // ... implementação
}

// OU alias:
export const syncCurseducaMembers = syncCursEducaStudents;
```

**Se não tiver `export`, adicionar!**

---

### ❌ Causa 3: Model User não tem campo curseduca

**Verificar `src/models/user.ts` tem:**

```typescript
export interface IUser {
  email: string;
  name?: string;
  curseduca?: {
    curseducaUserId?: string;
    curseducaUuid?: string;
    email?: string;
    groupId?: string;
    groupUuid?: string;
    groupName?: string;
    groupCurseducaId?: number;
    groupCurseducaUuid?: string;
    enrollmentDate?: Date;
    expiresAt?: Date;
    courses?: Course[];
    progress?: {
      estimatedProgress?: number;
      progressSource?: string;
    };
    lastAccess?: Date;
    memberStatus?: string;
  };
  // ... outros campos
}
```

**Se faltar campos, adicionar conforme a estrutura acima!**

---

### ❌ Causa 4: Model Course não tem CLAREZA

**Verificar `src/models/user.ts` (ou similar) tem:**

```typescript
export enum Course {
  CLAREZA = 'CLAREZA',
  OGI = 'OGI',
  OGI_V1 = 'OGI_V1',
  // ... outros cursos
}
```

**Se não tiver, adicionar:**

```typescript
export enum Course {
  // ... cursos existentes
  CLAREZA = 'CLAREZA',
  OGI_V1 = 'OGI_V1',
}
```

---

### ❌ Causa 5: MongoDB não conectado

**Verificar logs do backend têm:**

```
✅ MongoDB conectado
```

**Se aparecer:**
```
❌ MongooseError: Could not connect
❌ MongoServerSelectionError: ...
```

**Solução:**
1. Verificar `MONGODB_URI` no `.env`
2. Verificar MongoDB está a correr (local ou cloud)
3. Verificar credenciais corretas

---

### ❌ Causa 6: dotenv.config() no sítio errado

**Verificar `src/index.ts` tem NO TOPO:**

```typescript
// ⚠️ CRITICAL: dotenv.config() MUST be the first thing executed!
import dotenv from "dotenv"
dotenv.config()

// DEPOIS os outros imports
import express from "express"
// ...
```

**Se não estiver no topo, MOVER!**

---

### ❌ Causa 7: Axios error (API CursEduca indisponível)

**Verificar logs têm:**

```
❌ Error: Request failed with status code 401
❌ Error: Request failed with status code 404
❌ Error: Network Error
```

**Soluções:**
- **401:** API Key ou Token incorretos
- **404:** Endpoint errado (verificar URL)
- **Network Error:** API offline ou URL errado

---

### ❌ Causa 8: Estrutura de resposta inesperada

**Se logs mostram:**

```
❌ TypeError: Cannot read property 'data' of undefined
❌ TypeError: students is not iterable
```

**Solução:** O script de teste vai mostrar a estrutura exata!

---

## 📝 CHECKLIST DE DEBUG

- [ ] Ver logs completos do backend terminal (últimas 50 linhas)
- [ ] Executar script de teste (`npx ts-node test-curseduca-api.ts`)
- [ ] Verificar `.env` tem 3 variáveis CursEduca (sem espaços, sem aspas)
- [ ] Verificar backend reiniciado após mudanças
- [ ] Verificar MongoDB conectado (logs têm "✅ MongoDB conectado")
- [ ] Verificar Models têm campos corretos (curseduca, Course enum)
- [ ] Verificar imports no controller (nomes corretos)
- [ ] Verificar dotenv.config() no topo de index.ts
- [ ] Verificar rotas registradas (`router.use('/curseduca', ...)`)

---

## 💡 ENVIAR INFORMAÇÃO PARA DEBUG

Para eu poder ajudar, preciso de **3 coisas**:

### 1. **Logs completos do backend**
Copiar as últimas 50-100 linhas do terminal onde o backend está a correr, especialmente quando dá o erro 500.

**Como obter:**
- Clicar em "Sincronização Completa" no frontend
- Copiar TUDO que aparecer no terminal do backend
- Incluir especialmente linhas com `❌`, `TypeError`, `Error:`

---

### 2. **Output do script de teste**
```powershell
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
npx ts-node test-curseduca-api.ts
```

Copiar TODA a saída, especialmente:
- `📦 Tipo da resposta:`
- `📦 Keys do objeto:`
- `📄 Dados completos do primeiro membro:`

---

### 3. **Conteúdo do `.env` (linhas CursEduca)**
```powershell
type .env | findstr CURSEDUCA
```

Copiar a saída. **Se tiver tokens sensíveis, pode apagar parte, mas manter formato!**

Exemplo:
```
CURSEDUCA_API_URL=https://prof.curseduca.pro
CURSEDUCA_API_KEY=ce9ef2a4...xxx (apagar metade)
CURSEDUCA_AccessToken=eyJhbG...xxx (apagar metade)
```

---

## 🚀 AÇÕES IMEDIATAS

### 1. **EXECUTAR SCRIPT DE TESTE:**
```powershell
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
npx ts-node test-curseduca-api.ts
```

### 2. **COPIAR OUTPUT COMPLETO**

### 3. **TENTAR SINCRONIZAÇÃO NO FRONTEND**
- Clicar em "Sincronização Completa"
- Ver logs do backend

### 4. **COPIAR LOGS DO BACKEND**

### 5. **ENVIAR TUDO!**

---

## ✅ COM ESTAS INFORMAÇÕES

Vou poder:
1. ✅ Ver exatamente qual endpoint está a falhar
2. ✅ Ver estrutura exata da resposta da API
3. ✅ Identificar qual linha do código está a dar erro
4. ✅ Ajustar o código para funcionar perfeitamente

---

## 📊 DIAGNÓSTICO RÁPIDO

Se o script de teste **FUNCIONAR** mas a sincronização no backend **FALHAR**, então:
- ❌ Problema no backend (controller, service, models)
- ✅ API CursEduca está OK

Se o script de teste **FALHAR**, então:
- ❌ Problema na API CursEduca (credenciais, endpoints)
- ✅ Backend código está OK

---

**🎯 EXECUTAR O SCRIPT DE TESTE PRIMEIRO E ENVIAR O OUTPUT!**

Com isso consigo identificar o problema exato em 2 minutos! 💪

