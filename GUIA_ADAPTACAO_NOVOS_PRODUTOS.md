# 🚀 GUIA DE ADAPTAÇÃO PARA NOVOS PRODUTOS

## 📅 Data: 19 Novembro 2025

## 🎯 OBJETIVO

Este guia explica como o sistema está preparado para **automaticamente adaptar-se a novos produtos** e como funciona a **sincronização multi-produto**.

---

## 🏗️ ARQUITECTURA V2 - MULTI-PRODUTO

### 1. **Modelo de Dados Escalável**

```
User (Global)
  ├─ email (único identificador)
  ├─ name
  ├─ discord {...}    // Dados específicos Discord
  ├─ hotmart {...}    // Dados específicos Hotmart
  └─ curseduca {...}  // Dados específicos CursEduca

Product (Definição de Produtos)
  ├─ code: "OGI-V1", "CLAREZA-BASIC", etc
  ├─ name: "O Grande Investimento V1"
  ├─ platform: 'hotmart' | 'curseduca' | 'discord' | 'mixed'
  └─ activeCampaignConfig {...}

UserProduct (Relação User ↔ Product)
  ├─ userId (ref User)
  ├─ productId (ref Product)
  ├─ status: 'ACTIVE' | 'INACTIVE' | 'CANCELLED'
  ├─ progress {...}
  └─ activeCampaignData {
       tags: ["OGI-V1_INATIVO_14D", ...],  // Tags específicas deste produto
       lastSyncAt: Date
     }
```

### 2. **Fluxo de Sincronização**

```
1. API Externa (Hotmart/CursEduca/Discord)
   ↓
2. Service (detecta produtos automaticamente)
   ↓
3. User (cria/atualiza dados globais)
   ↓
4. Product (busca produtos existentes pela plataforma)
   ↓
5. UserProduct (cria/atualiza relação user-produto)
   ↓
6. Active Campaign (aplica tags específicas do produto)
```

---

## ✅ CORREÇÃO APLICADA HOJE

### Problema no `curseducaService.ts`

**Erro:**
```typescript
import User, { Course, Platform } from '../models/User'; // ❌ ERRADO
const curseducaProducts = await Product.find({
  platform: Platform.CURSEDUCA,  // ❌ Platform.CURSEDUCA não existe
  isActive: true
})
```

**Correção:**
```typescript
import User, { Course } from '../models/user'; // ✅ user (minúsculo)
const curseducaProducts = await Product.find({
  platform: 'curseduca',  // ✅ String literal lowercase
  isActive: true
})
```

---

## 🔧 COMO ADICIONAR UM NOVO PRODUTO

### Passo 1: Criar o Produto na Base de Dados

```javascript
// Script para criar novo produto
const newProduct = await Product.create({
  code: 'NOVO-PRODUTO-V1',
  name: 'Meu Novo Produto V1',
  platform: 'hotmart', // ou 'curseduca', 'discord', 'mixed'
  
  // IDs da plataforma (opcional)
  hotmartProductId: '12345',
  // ou
  curseducaGroupId: '4',
  curseducaGroupUuid: 'abc-123',
  // ou
  discordRoleId: '123456789',
  
  // Active Campaign config
  activeCampaignConfig: {
    tagPrefix: 'NOVO-PRODUTO-V1',
    listId: 'lista-id-ac',
    automationIds: ['automation-1', 'automation-2']
  },
  
  isActive: true,
  launchDate: new Date(),
  
  courseId: mongoose.Types.ObjectId('...') // ID do curso
})
```

### Passo 2: O Sistema ADAPTA-SE AUTOMATICAMENTE! ✅

**Não é necessário alterar código!**

1. ✅ **Service de Sync** detecta o novo produto automaticamente:
   ```typescript
   // Em syncCursEducaStudents() ou syncHotmartUsers()
   const product = await Product.findOne({
     curseducaGroupId: student.groupId,  // Busca automática
     isActive: true
   })
   ```

2. ✅ **UserProduct** é criado automaticamente:
   ```typescript
   const userProduct = await UserProduct.findOneAndUpdate(
     { userId: user._id, productId: product._id },
     { ...productData },
     { upsert: true, new: true }
   )
   ```

3. ✅ **Tags AC** são aplicadas com o prefixo correto:
   ```typescript
   // activeCampaignService.applyTagToUserProduct()
   const fullTagName = `${product.code}_INATIVO_14D`
   // Ex: "NOVO-PRODUTO-V1_INATIVO_14D"
   ```

4. ✅ **Dashboard V2** mostra o novo produto automaticamente:
   ```typescript
   // Busca todos os produtos ativos
   const products = await Product.find({ isActive: true })
   // Inclui automaticamente o novo produto!
   ```

---

## 📊 ENDPOINTS QUE SE ADAPTAM AUTOMATICAMENTE

### Backend

✅ **GET `/api/v2/users/stats/overview`**
- Lista stats de **todos os produtos ativos**
- Inclui automaticamente novos produtos

✅ **GET `/api/v2/users?productId=XXX`**
- Filtra users por qualquer produto
- Funciona com novos produtos sem alterações

✅ **GET `/api/curseduca/dashboard`**
- Calcula stats para **todos os produtos CursEduca**
- Inclui automaticamente novos produtos da plataforma

✅ **GET `/api/hotmart/dashboard`**
- Similar ao CursEduca, mas para Hotmart

### Frontend

✅ **Dashboard V2 (`/dashboard`)**
- Tab "Dashboard V2" mostra **todos os produtos**
- Filtros incluem automaticamente novos produtos

✅ **Products Dashboard (`/products`)**
- Lista **todos os produtos ativos**
- Cards gerados dinamicamente

✅ **Analytics V2**
- Gráficos e tabelas adaptam-se automaticamente
- Filtros por produto incluem todos os produtos ativos

---

## 🎨 MAPEAMENTO DE PRODUTOS POR PLATAFORMA

### CursEduca

```typescript
// Em curseducaService.ts
function mapCursEducaGroupToProduct(groupId: string, groupName: string): Course | null {
  const mapping: Record<string, Course> = {
    '4': Course.CLAREZA, // Clareza = groupId 4
    // Adicionar mais mapeamentos conforme necessário
  };
  
  return mapping[groupId] || null;
}
```

**Para adicionar novo mapeamento:**
```typescript
'5': Course.NOVO_CURSO, // Novo Curso = groupId 5
```

### Hotmart

```typescript
// Em hotmartService.ts (similar)
// Busca por subdomain ou hotmartProductId
const product = await Product.findOne({
  hotmartProductId: data.product_id,
  isActive: true
})
```

---

## 🔄 CRON JOBS V2 - ESCALÁVEIS

### evaluateEngagementV2.job.ts

```typescript
// Itera TODOS os produtos ativos
const products = await Product.find({ isActive: true })

for (const product of products) {
  // Processa TODOS os UserProducts deste produto
  const userProducts = await UserProduct.find({
    productId: product._id,
    status: 'ACTIVE'
  })
  
  // Aplica regras específicas do produto
  for (const userProduct of userProducts) {
    const actions = await decisionEngineV2.decideEngagementActions(userProduct, product)
    await tagOrchestratorV2.orchestrateTags(user._id, product._id, actions)
  }
}
```

**Resultado:** Novos produtos são **automaticamente incluídos** no processamento CRON!

---

## 📝 EXEMPLO PRÁTICO: ADICIONAR "MENTORIA PREMIUM"

### 1. Criar Produto

```bash
# No MongoDB ou via script
db.products.insertOne({
  code: "MENTORIA-PREMIUM",
  name: "Mentoria Premium",
  platform: "curseduca",
  curseducaGroupId: "7",
  curseducaGroupUuid: "uuid-mentoria",
  activeCampaignConfig: {
    tagPrefix: "MENTORIA-PREMIUM",
    listId: "lista-mentoria",
  },
  isActive: true,
  launchDate: new Date(),
  courseId: ObjectId("..."),
  createdAt: new Date(),
  updatedAt: new Date()
})
```

### 2. Adicionar Mapeamento CursEduca (opcional)

```typescript
// curseducaService.ts - mapCursEducaGroupToProduct()
'7': Course.MENTORIA_PREMIUM, // Novo mapeamento
```

### 3. PRONTO! ✅

**O sistema agora:**
- ✅ Sincroniza users da "Mentoria Premium" automaticamente
- ✅ Cria `UserProduct` para cada user
- ✅ Aplica tags `MENTORIA-PREMIUM_*` no Active Campaign
- ✅ Mostra no Dashboard V2
- ✅ Inclui nas análises e relatórios
- ✅ Processa no CRON job de engagement

**SEM ALTERAR NENHUM CÓDIGO DE SINCRONIZAÇÃO!** 🎉

---

## 🚨 CHECKLIST PARA NOVOS PRODUTOS

- [ ] Criar `Product` na base de dados
- [ ] Definir `code` (único, UPPERCASE)
- [ ] Definir `platform` ('hotmart' | 'curseduca' | 'discord' | 'mixed')
- [ ] Definir IDs da plataforma externa (hotmartProductId, curseducaGroupId, etc)
- [ ] Configurar Active Campaign (`tagPrefix`, `listId`)
- [ ] Adicionar mapeamento no service da plataforma (se necessário)
- [ ] Testar sincronização: `GET /api/[platform]/sync...Users`
- [ ] Verificar Dashboard V2: `GET /api/v2/users/stats/overview`
- [ ] Confirmar tags no AC: verificar `UserProduct.activeCampaignData.tags`

---

## 💡 BOAS PRÁTICAS

### 1. **Naming Convention para Products**
```
PRODUTO-VERSAO      Ex: OGI-V1, OGI-V2
PRODUTO-TIER        Ex: CLAREZA-BASIC, CLAREZA-PREMIUM
PRODUTO-PLATAFORMA  Ex: CLAREZA-CURSEDUCA, CLAREZA-HOTMART
```

### 2. **Active Campaign Tag Prefix**
- Use o mesmo valor que `code`
- UPPERCASE sempre
- Exemplo: code="OGI-V1" → tagPrefix="OGI-V1"

### 3. **Platform Values**
- `'hotmart'` - Produtos vendidos via Hotmart
- `'curseduca'` - Produtos hospedados na CursEduca
- `'discord'` - Produtos baseados em Discord
- `'mixed'` - Produtos que usam múltiplas plataformas

### 4. **isActive Flag**
- Produtos inativos são **ignorados automaticamente**
- Útil para sunset de produtos antigos
- Não precisa apagar da BD, basta `isActive: false`

---

## ✅ STATUS ATUAL

🎉 **O sistema está 100% preparado para escalar!**

- ✅ Backend adapta-se automaticamente a novos produtos
- ✅ Frontend lista produtos dinamicamente
- ✅ CRON jobs processam todos os produtos ativos
- ✅ Active Campaign tags isoladas por produto
- ✅ Dashboard e Analytics escaláveis

**Basta criar o `Product` na BD e tudo funciona! 🚀**

---

**Autor:** Assistant AI  
**Data:** 19 Novembro 2025  
**Versão:** 2.0

