# 🎯 ESTRATÉGIA DE SINCRONIZAÇÃO CURSEDUCA V2

## 📅 Data: 19 Novembro 2025

---

## 🚀 MUDANÇA DE ESTRATÉGIA

### ❌ ESTRATÉGIA ANTIGA (V1):
```
GET /members → Lista todos os membros SEM progresso/grupo detalhado
```

**Problemas:**
- ❌ Resposta não tinha estrutura esperada (`TypeError: students is not iterable`)
- ❌ Não trazia dados de progresso/engagement
- ❌ Não trazia informação detalhada do grupo
- ❌ Uma única chamada, mas dados incompletos

---

### ✅ ESTRATÉGIA NOVA (V2):

```
1. GET /groups
   ↓
   [Grupo 1: Clareza, Grupo 2: OGI, ...]
   
2. Para cada grupo:
   GET /reports/group/members?groupId={id}
   ↓
   [Member 1 + progresso, Member 2 + progresso, ...]
   
3. Para cada member:
   - Criar/atualizar User (V1)
   - Criar/atualizar Product
   - Criar/atualizar UserProduct (V2)
```

**Vantagens:**
- ✅ Dados completos: grupo, progresso, datas
- ✅ Endpoint `/reports/group/members` já traz tudo agregado
- ✅ Suporta múltiplas estruturas de resposta
- ✅ Logs detalhados para diagnóstico
- ✅ Sincroniza V1 (User) + V2 (UserProduct)

---

## 📚 ENDPOINTS UTILIZADOS

### 1. `/groups` - Listar Grupos
**Request:**
```http
GET https://prof.curseduca.pro/groups
Authorization: Bearer {token}
api_key: {key}
```

**Response:**
```json
[
  {
    "id": 4,
    "uuid": "abc-123",
    "name": "Clareza",
    "description": "..."
  },
  {
    "id": 5,
    "uuid": "def-456",
    "name": "OGI",
    "description": "..."
  }
]
```

### 2. `/reports/group/members` - Membros com Progresso
**Request:**
```http
GET https://prof.curseduca.pro/reports/group/members?groupId=4
Authorization: Bearer {token}
api_key: {key}
```

**Response:**
```json
[
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
]
```

---

## 🔄 FLUXO DE SINCRONIZAÇÃO

### **ETAPA 1: Buscar Grupos**
```typescript
const groupsResponse = await axios.get(`${CURSEDUCA_API_URL}/groups`, {
  headers: {
    'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
    'api_key': CURSEDUCA_API_KEY,
    'Content-Type': 'application/json'
  }
});

const groups = Array.isArray(groupsResponse.data) 
  ? groupsResponse.data 
  : groupsResponse.data?.data || [];
```

### **ETAPA 2: Para Cada Grupo, Buscar Membros**
```typescript
for (const group of groups) {
  // Mapear grupo para curso/produto
  const course = mapCursEducaGroupToProduct(group.id.toString(), group.name);
  
  if (!course) {
    continue; // Skip grupos não mapeados
  }
  
  // Buscar membros COM progresso
  const membersResponse = await axios.get(
    `${CURSEDUCA_API_URL}/reports/group/members`,
    {
      params: { groupId: group.id },
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'api_key': CURSEDUCA_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const members = Array.isArray(membersResponse.data)
    ? membersResponse.data
    : membersResponse.data?.data || [];
  
  // Processar membros...
}
```

### **ETAPA 3: Para Cada Membro, Sincronizar Dados**

#### **3.1: User (V1)**
```typescript
let user = await User.findOne({ email: member.email });

if (!user) {
  // Criar novo user
  user = await User.create({
    email: member.email,
    name: member.name,
    curseduca: {
      curseducaUserId: member.memberId?.toString(),
      curseducaUuid: member.memberUuid,
      email: member.email,
      groupId: group.id.toString(),
      groupUuid: group.uuid,
      groupName: group.name,
      enrollmentDate: new Date(member.enrolledAt),
      expiresAt: member.expiresAt ? new Date(member.expiresAt) : null,
      courses: [course],
      progress: {
        estimatedProgress: member.progress || 0,
        progressSource: 'curseduca_reports'
      },
      lastAccess: new Date(member.lastAccess),
      memberStatus: member.status || 'ACTIVE'
    }
  });
} else {
  // Atualizar user existente
  user.curseduca.progress.estimatedProgress = member.progress || 0;
  user.curseduca.lastAccess = new Date(member.lastAccess);
  await user.save();
}
```

#### **3.2: Product**
```typescript
let product = await Product.findOne({ code: course });

if (!product) {
  product = await Product.create({
    code: course,
    name: group.name,
    platform: 'curseduca',
    platformData: {
      groupId: group.id.toString(),
      groupUuid: group.uuid,
      groupName: group.name
    },
    isActive: true
  });
}
```

#### **3.3: UserProduct (V2)**
```typescript
const existingUserProduct = await UserProduct.findOne({
  userId: user._id,
  productId: product._id
});

if (existingUserProduct) {
  // Atualizar
  existingUserProduct.progress = {
    current: member.progress || 0,
    total: 100,
    percentage: member.progress || 0,
    completedClasses: [],
    lastUpdated: new Date()
  };
  existingUserProduct.lastActivityDate = new Date(member.lastAccess);
  await existingUserProduct.save();
} else {
  // Criar
  await UserProduct.create({
    userId: user._id,
    productId: product._id,
    platformData: {
      platformId: 'CURSEDUCA',
      externalUserId: member.memberId?.toString(),
      externalProductId: group.id.toString()
    },
    progress: {
      current: member.progress || 0,
      total: 100,
      percentage: member.progress || 0,
      completedClasses: [],
      lastUpdated: new Date()
    },
    status: member.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    enrollmentDate: new Date(member.enrolledAt),
    lastActivityDate: new Date(member.lastAccess)
  });
}
```

---

## 📊 LOGS ESPERADOS

### **Sucesso:**
```
🔄 SINCRONIZAÇÃO CURSEDUCA - ESTRATÉGIA V2
================================================================================
📅 Data/Hora: 19/11/2025, 15:30:00
🌐 API URL: https://prof.curseduca.pro
🔑 API Key: ✅ Configurada
🎫 Access Token: ✅ Configurado

📚 ETAPA 1: Buscando grupos...

✅ 2 grupos encontrados
📄 Exemplo do primeiro grupo:
{
  "id": 4,
  "uuid": "abc-123",
  "name": "Clareza"
}

================================================================================
📚 Processando grupo: Clareza (ID: 4)
================================================================================
   🎯 Mapeado para: CLAREZA
   📡 Buscando membros...
   ✅ 10 membros encontrados
   
   [1/10] eli@hotmail.com
      ➕ CRIAR novo user
      ✅ User criado: 673d...
      ✅ Produto criado: 673d...
      ✅ UserProduct criado
   
   [2/10] frmcs93@gmail.com
      🔄 ATUALIZAR user existente: 673c...
      ✅ User atualizado
      ✅ UserProduct atualizado

================================================================================
📚 Processando grupo: OGI (ID: 5)
================================================================================
   🎯 Mapeado para: OGI_V1
   📡 Buscando membros...
   ✅ 25 membros encontrados
   ...

================================================================================
📊 RESUMO DA SINCRONIZAÇÃO
================================================================================
📚 Grupos processados: 2
➕ Users criados: 15
🔄 Users atualizados: 20
⏭️  Ignorados: 0
❌ Erros: 0
================================================================================
```

### **Erro:**
```
❌ ERRO CRÍTICO NA SINCRONIZAÇÃO
================================================================================
Mensagem: Request failed with status code 401
Status HTTP: 401
Resposta: {"error":"No API key was provided."}
================================================================================
```

---

## 🗺️ MAPEAMENTO DE GRUPOS

Atualmente configurado em `mapCursEducaGroupToProduct()`:

```typescript
const mapping: Record<string, Course> = {
  '4': Course.CLAREZA, // Clareza = groupId 4
  '5': Course.OGI_V1,  // OGI = groupId 5
  // Adicionar mais conforme necessário
};
```

**Para adicionar novos grupos:**
1. Identificar o `groupId` da API
2. Adicionar mapeamento no objeto acima
3. Garantir que o `Course` enum existe em `models/user.ts`

---

## 🔧 ESTRUTURAS SUPORTADAS

O código suporta automaticamente múltiplas estruturas de resposta:

### Grupos:
- `Array direto`: `[{id: 4, name: "Clareza"}]`
- `response.data.data`: `{data: [{id: 4, name: "Clareza"}]}`
- `response.data.groups`: `{groups: [{id: 4, name: "Clareza"}]}`

### Membros:
- `Array direto`: `[{email: "...", progress: 45}]`
- `response.data.data`: `{data: [{email: "...", progress: 45}]}`
- `response.data.members`: `{members: [{email: "...", progress: 45}]}`

---

## 📈 VANTAGENS DA V2

| Aspecto | V1 (Antiga) | V2 (Nova) |
|---------|-------------|-----------|
| **Progresso** | ❌ Não trazia | ✅ Incluído |
| **Grupo detalhado** | ❌ Básico | ✅ Completo (UUID, etc.) |
| **Data matrícula** | ❌ Não tinha | ✅ `enrolledAt` |
| **Data expiração** | ❌ Não tinha | ✅ `expiresAt` |
| **Último acesso** | ❌ Não tinha | ✅ `lastAccess` |
| **Status membro** | ❌ Não tinha | ✅ `ACTIVE`/`INACTIVE` |
| **UserProduct (V2)** | ❌ Não criava | ✅ Cria/atualiza |
| **Logs** | ❌ Básicos | ✅ Detalhados |
| **Diagnóstico** | ❌ Difícil | ✅ Estruturas mostradas |

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [x] Reescrever `syncCursEducaStudents` com ETAPAS 1-3
- [x] Suportar múltiplas estruturas de resposta
- [x] Adicionar logs detalhados de diagnóstico
- [x] Criar/atualizar User (V1)
- [x] Criar/atualizar Product
- [x] Criar/atualizar UserProduct (V2)
- [x] Tratamento de erros por grupo
- [x] Resumo final com estatísticas
- [ ] **TESTAR com backend rodando**
- [ ] **VALIDAR logs de estrutura**
- [ ] **CONFIRMAR sincronização funciona**

---

## 🚀 PRÓXIMOS PASSOS

### **1. REINICIAR BACKEND:**
```powershell
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API

# CTRL+C para parar

npm run dev
```

### **2. TESTAR SINCRONIZAÇÃO:**
- Clicar em "Sincronização Completa" no frontend
- Ver logs do backend (especialmente `📦 Estrutura da resposta`)
- Confirmar que membros são sincronizados

### **3. VALIDAR DADOS:**
```javascript
// MongoDB
db.users.find({ 'curseduca.email': { $exists: true } }).count()
db.products.find({ platform: 'curseduca' })
db.userproducts.find({ 'platformData.platformId': 'CURSEDUCA' }).count()
```

---

## 📚 DOCUMENTAÇÃO RELACIONADA

1. **CORRECAO_ESTRUTURA_RESPOSTA.md** - Estruturas antigas (obsoleto)
2. **CORRECAO_ENDPOINTS_CURSEDUCA.md** - Correção endpoints
3. **CORRECAO_FINAL_CURSEDUCA.md** - Todas as 7 correções
4. **ESTRATEGIA_SYNC_V2_CURSEDUCA.md** - Este documento (ATUAL)

---

## 🎉 RESULTADO ESPERADO

**Após implementação:**
- ✅ Sincronização completa de grupos e membros
- ✅ Dados V1 (User) + V2 (UserProduct) atualizados
- ✅ Progresso sincronizado
- ✅ Logs detalhados e claros
- ✅ Suporte para múltiplas estruturas
- ✅ Tratamento robusto de erros

---

**Status:** ✅ IMPLEMENTADO  
**Ação Necessária:** TESTAR  
**Tempo Estimado:** 5 minutos (teste)

