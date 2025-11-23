# 🧪 SCRIPT DE TESTE CURSEDUCA - GUIA RÁPIDO

## 📅 Data: 19 Novembro 2025

---

## 🎯 O QUE FOI CRIADO

✅ **Script de teste:** `test-curseduca-api.ts`  
✅ **Documentação completa:** `DEBUG_ERRO_500_CURSEDUCA.md`

---

## 🚀 COMO USAR O SCRIPT DE TESTE

### **1. Abrir terminal no projeto backend:**

```powershell
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
```

### **2. Executar o script:**

```powershell
npx ts-node test-curseduca-api.ts
```

### **3. Ver output completo:**

O script vai testar:
- ✅ Se credenciais estão configuradas
- ✅ Endpoint `/groups` (lista grupos)
- ✅ Endpoint `/reports/group/members` (membros com progresso)
- ✅ Endpoint alternativo `/groups/{id}/members`
- ✅ Estrutura exata das respostas
- ✅ Campos disponíveis em cada objeto

---

## 📊 OUTPUT ESPERADO (SUCESSO)

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
   Keys disponíveis: memberId, memberUuid, name, email, groupId, progress, status, ...

📄 Dados completos do primeiro membro:
{
  "memberId": 56,
  "memberUuid": "...",
  "name": "Elisabete",
  "email": "eli@hotmail.com",
  "groupId": 4,
  "groupName": "Clareza",
  "enrolledAt": "2025-10-17T06:15:20.000Z",
  "expiresAt": null,
  "progress": 45,
  "lastAccess": "2025-11-07T13:56:28.000Z",
  "status": "ACTIVE"
}

================================================================================
🔍 TESTE 3: GET /groups/4/members (endpoint alternativo)
--------------------------------------------------------------------------------
⚠️  Endpoint alternativo não disponível ou não funciona
   Mensagem: Request failed with status code 404

================================================================================
✅ Testes concluídos!
================================================================================
```

---

## ❌ OUTPUT POSSÍVEL (ERRO)

### **Erro 1: Credenciais em falta**

```
🧪 TESTE DA API CURSEDUCA
================================================================================
📋 Configuração:
   URL: https://prof.curseduca.pro
   API Key: ❌ Falta
   Token: ❌ Falta
================================================================================

❌ Credenciais em falta no .env!

Verificar no .env:
  CURSEDUCA_API_URL=https://prof.curseduca.pro
  CURSEDUCA_API_KEY=...
  CURSEDUCA_AccessToken=...
```

**Solução:** Adicionar variáveis ao `.env`

---

### **Erro 2: API Key inválida**

```
🔍 TESTE 1: GET /groups
--------------------------------------------------------------------------------
❌ Erro ao buscar grupos: Request failed with status code 401
   Status HTTP: 401
   Resposta: { error: "No API key was provided." }
```

**Solução:** Verificar `CURSEDUCA_API_KEY` no `.env`

---

### **Erro 3: Token inválido**

```
🔍 TESTE 1: GET /groups
--------------------------------------------------------------------------------
❌ Erro ao buscar grupos: Request failed with status code 401
   Status HTTP: 401
   Resposta: { error: "Invalid token" }
```

**Solução:** Verificar `CURSEDUCA_AccessToken` no `.env`

---

### **Erro 4: URL errado**

```
🔍 TESTE 1: GET /groups
--------------------------------------------------------------------------------
❌ Erro ao buscar grupos: Network Error
```

**Solução:** Verificar `CURSEDUCA_API_URL` (deve ser `https://prof.curseduca.pro` sem barra final)

---

### **Erro 5: Endpoint não existe**

```
🔍 TESTE 2: GET /reports/group/members?groupId=4
--------------------------------------------------------------------------------
❌ Erro ao buscar membros: Request failed with status code 404
   Status HTTP: 404
   Resposta: { error: "Route not found" }
```

**Solução:** Endpoint pode ter mudado. Reportar output completo para ajuste!

---

## 🎯 PRÓXIMOS PASSOS APÓS O TESTE

### **Se o teste FUNCIONAR (✅):**

1. **API está OK!**
2. **Backend pode ter problema no código**
3. **Verificar:**
   - Controller importa funções corretas
   - Models têm campos necessários
   - MongoDB está conectado

### **Se o teste FALHAR (❌):**

1. **API tem problema (credenciais ou endpoints)**
2. **Solução:**
   - Verificar credenciais no `.env`
   - Verificar URLs sem trailing slash
   - Verificar sem espaços nas variáveis

---

## 📋 INFORMAÇÕES PARA ENVIAR

Após executar o script, **COPIAR E ENVIAR:**

### **1. Output completo do script**
```powershell
npx ts-node test-curseduca-api.ts > output-teste.txt
```

Enviar o ficheiro `output-teste.txt` completo.

---

### **2. Logs do backend (se erro 500)**

Quando clicar em "Sincronização Completa" no frontend e der erro 500:

1. Ver terminal do backend
2. Copiar últimas 50-100 linhas
3. Incluir especialmente:
   - Linhas com `❌`
   - Linhas com `TypeError`
   - Linhas com `Error:`
   - Linhas com stack trace

---

### **3. Variáveis de ambiente (sem tokens completos)**

```powershell
type .env | findstr CURSEDUCA
```

Pode apagar parte dos tokens, mas manter formato:

```
CURSEDUCA_API_URL=https://prof.curseduca.pro
CURSEDUCA_API_KEY=ce9ef2a4...xxx
CURSEDUCA_AccessToken=eyJhbG...xxx
```

---

## 🔧 VERIFICAÇÕES ADICIONAIS

### **1. Backend está a correr?**
```powershell
curl http://localhost:3001/api/health
```

**Esperado:** 200 OK

---

### **2. MongoDB conectado?**

Ver logs do backend, deve ter:
```
✅ MongoDB conectado
```

---

### **3. dotenv.config() no topo?**

Verificar `src/index.ts` começa com:
```typescript
import dotenv from "dotenv"
dotenv.config()
```

---

### **4. Service exporta funções?**

Verificar `src/services/curseducaService.ts` tem:
```typescript
export const syncCursEducaStudents = async () => { ... }
export const syncCurseducaMembers = syncCursEducaStudents;
```

---

### **5. Controller importa correto?**

Verificar `src/controllers/curseduca.controller.ts` tem:
```typescript
import { syncCurseducaMembers } from '../services/curseducaService'
```

---

## ✅ CHECKLIST RÁPIDO

Antes de reportar erro, verificar:

- [ ] Executei o script de teste
- [ ] Copiei output completo do script
- [ ] Backend está a correr
- [ ] MongoDB está conectado
- [ ] Variáveis `.env` sem espaços/aspas
- [ ] Backend reiniciado após mudanças
- [ ] Logs do backend copiados (se erro 500)

---

## 🎉 RESULTADO ESPERADO FINAL

Após todas as correções:

### **Script de teste:**
```
✅ Testes concluídos!
📚 2 grupos encontrados
👥 10 membros encontrados no primeiro grupo
```

### **Sincronização no backend:**
```
🔄 SINCRONIZAÇÃO CURSEDUCA - ESTRATÉGIA V2
📚 Grupos processados: 2
➕ Users criados: 15
🔄 Users atualizados: 20
✅ Sincronização completa!
```

### **Frontend:**
```
✅ Sincronização Concluída
15 novos utilizadores, 20 atualizados
```

---

## 🆘 SE CONTINUAR COM PROBLEMAS

**ENVIAR 3 FICHEIROS:**

1. **Output do script de teste** (`npx ts-node test-curseduca-api.ts`)
2. **Logs do backend** (últimas 100 linhas)
3. **Variáveis `.env`** (linhas CURSEDUCA, com tokens parcialmente apagados)

**Com isso consigo resolver em 5 minutos!** 🚀

---

## 📚 DOCUMENTOS RELACIONADOS

1. ✅ **`test-curseduca-api.ts`** - Script de teste
2. ✅ **`DEBUG_ERRO_500_CURSEDUCA.md`** - Guia completo de debug
3. ✅ **`ESTRATEGIA_SYNC_V2_CURSEDUCA.md`** - Estratégia de sincronização
4. ✅ **`CORRECAO_FINAL_CURSEDUCA.md`** - Todas as correções anteriores
5. ✅ **`RESUMO_SCRIPT_TESTE.md`** - Este documento

---

**🎯 EXECUTAR O SCRIPT AGORA E ENVIAR O OUTPUT!** 💪

