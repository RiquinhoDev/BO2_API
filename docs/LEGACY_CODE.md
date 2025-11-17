# 📋 CÓDIGO LEGACY V1 - PLANO DE REMOÇÃO

**Última atualização:** 16 Novembro 2025  
**Remoção planejada:** 01 Janeiro 2026 (60 dias)  
**Status:** 🟡 Depreciado mas funcional

---

## ⚠️ CAMPOS DEPRECATED

### User Model (`src/models/user.ts`)

| Campo | Status | Substituir por | Remoção Planejada |
|-------|--------|----------------|-------------------|
| `user.hotmart` | ⚠️ Deprecated | `UserProduct` (platform="hotmart") | 01/Jan/2026 |
| `user.curseduca` | ⚠️ Deprecated | `UserProduct` (platform="curseduca") | 01/Jan/2026 |
| `user.discord` | ⚠️ Deprecated | `UserProduct` (platform="discord") | 01/Jan/2026 |
| `user.consolidatedCourses` | ⚠️ Deprecated | Query em `UserProduct` | 01/Jan/2026 |
| `user.allPlatforms` | ⚠️ Deprecated | Distinct em `UserProduct` | 01/Jan/2026 |

**Razão:** Architecture V2.0 migrou esses dados para `UserProduct` para suportar multi-produto.

---

## 🗑️ CONTROLLERS LEGACY

### Products Controller V1

| Arquivo | Status | Substituir por | Ação |
|---------|--------|----------------|------|
| `products.controller.ts` (V1) | ⚠️ Não usar | `product.controller.ts` (V2) | Remover imports legacy |

**Nota:** Controller V1 foi mantido apenas para referência. Todos os endpoints devem usar V2.

---

## 📅 CRONOGRAMA DE REMOÇÃO

### ✅ Fase 1 (Agora - Sprint 4) - CONCLUÍDA
- ✅ Marcar campos como @deprecated
- ✅ Adicionar warnings em logs
- ✅ Criar este documento
- ✅ Manter DUAL WRITE ativo

### ⏳ Fase 2 (Daqui a 30 dias - 16/Dez/2025)
- ⏳ Remover DUAL WRITE
- ⏳ Backend só grava em V2
- ⏳ Avisar utilizadores via email/blog
- ⏳ Monitorizar uso de campos V1 (logs)

### ⏳ Fase 3 (Daqui a 60 dias - 01/Jan/2026)
- ⏳ **REMOVER** campos V1 do User model
- ⏳ Limpar imports legacy
- ⏳ Atualizar testes
- ⏳ Deploy final V2-only

---

## 🔧 COMO MIGRAR CÓDIGO

### Exemplo 1: Buscar Progresso

**❌ Antes (V1 - Deprecated):**
```typescript
const user = await User.findById(userId);
const progress = user.hotmart?.progress?.percentage || 0;
```

**✅ Depois (V2 - Usar sempre):**
```typescript
const userProducts = await UserProduct.find({ userId })
  .populate('productId');

const hotmartProduct = userProducts.find(
  up => up.productId.platform === 'hotmart'
);

const progress = hotmartProduct?.progress?.percentage || 0;
```

### Exemplo 2: Buscar Todos os Cursos de um User

**❌ Antes (V1 - Deprecated):**
```typescript
const user = await User.findById(userId);
const courses = user.consolidatedCourses || [];
```

**✅ Depois (V2 - Usar sempre):**
```typescript
const userProducts = await UserProduct.find({ userId })
  .populate('productId');

const courses = userProducts.map(up => up.productId.code);
```

### Exemplo 3: Verificar se User tem Produto Específico

**❌ Antes (V1 - Deprecated):**
```typescript
const user = await User.findById(userId);
const hasOGI = user.hotmart?.email ? true : false;
```

**✅ Depois (V2 - Usar sempre):**
```typescript
const hasOGI = await UserProduct.exists({
  userId,
  productId: { $in: await Product.find({ code: 'OGI-V1' }).select('_id') }
});
```

---

## 📊 IMPACTO ESTIMADO

### Arquivos Afetados
- **Models:** 1 (User.ts)
- **Controllers:** 3-5 (users, sync, hotmart)
- **Services:** 2-3 (hotmartSync, curseducaSync)
- **Testes:** ~10 testes a atualizar

### Tempo de Migração
- **Preparação:** 1 semana (Sprint 4)
- **Transição:** 30 dias (DUAL WRITE)
- **Remoção:** 1 dia (automática)

### Breaking Changes
- **Zero** durante transição (DUAL WRITE mantido)
- **Sim** após 60 dias (campos removidos)

---

## 🚨 AVISOS AUTOMÁTICOS

### Backend Logger

Adicionar warnings quando campos V1 forem acessados:

```typescript
// src/models/user.ts

userSchema.pre('save', function(next) {
  // Warning se gravar em campos V1
  if (this.isModified('hotmart') || 
      this.isModified('curseduca') || 
      this.isModified('discord')) {
    console.warn(`⚠️  DEPRECATED: User ${this._id} está usando campos V1. Migrar para UserProduct até 01/Jan/2026`);
  }
  next();
});
```

---

## 📈 MÉTRICAS DE USO

Para monitorizar uso de campos V1 antes de remover:

```typescript
// Script para verificar uso
import User from './models/User';

async function auditV1Usage() {
  const usersWithHotmart = await User.countDocuments({ 'hotmart': { $exists: true } });
  const usersWithCurseduca = await User.countDocuments({ 'curseduca': { $exists: true } });
  const usersWithDiscord = await User.countDocuments({ 'discord': { $exists: true } });
  
  console.log('📊 V1 Usage:');
  console.log(`  Hotmart: ${usersWithHotmart} users`);
  console.log(`  CursEduca: ${usersWithCurseduca} users`);
  console.log(`  Discord: ${usersWithDiscord} users`);
  
  // Se todos zerados, OK para remover
  if (usersWithHotmart === 0 && usersWithCurseduca === 0 && usersWithDiscord === 0) {
    console.log('✅ Safe to remove V1 fields!');
  }
}
```

---

## 🔄 DUAL WRITE (Atual)

Durante a transição, mantemos DUAL WRITE:

```typescript
// Escreve em AMBOS V1 e V2
await User.updateOne(
  { _id: userId },
  { $set: { 'hotmart.progress': progress } }  // V1
);

await UserProduct.updateOne(
  { userId, productId },
  { $set: { progress: progress } }  // V2
);
```

**Data de término:** 16/Dez/2025

---

## ✅ CHECKLIST DE VALIDAÇÃO

Antes de remover campos V1:

- [ ] Todos os controllers usam V2
- [ ] Todos os services usam V2
- [ ] Frontend usa apenas endpoints V2
- [ ] DUAL WRITE desativado há 30 dias
- [ ] Métricas mostram zero uso de V1
- [ ] Backup completo criado
- [ ] Testes passando 100%
- [ ] Documentação atualizada

---

## 📞 SUPORTE

Para dúvidas sobre migração:
- Consultar: `docs/MIGRATION_GUIDE.md`
- Issues: GitHub Issues
- Email: dev-team@your-domain.com

---

**🎯 Objetivo:** Transição suave e sem breaking changes para Architecture V2.0

**📅 Timeline:** 16/Nov/2025 → 01/Jan/2026 (60 dias)

**🔒 Garantia:** DUAL WRITE mantido até última fase

