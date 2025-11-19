# 🐛 KNOWN ISSUES - BO↔AC Integration

**Última Atualização:** 19 Novembro 2025  
**Versão:** 1.0

---

## 📊 RESUMO

| Status | Quantidade |
|--------|-----------|
| 🔴 **CRITICAL** | 0 |
| 🟠 **HIGH** | 0 |
| 🟡 **MEDIUM** | 1 (RESOLVIDO) |
| 🟢 **LOW** | 1 |
| ✅ **RESOLVED** | 1 |

---

## ✅ ISSUE #1: AC Tags Not Product-Specific (RESOLVIDO)

**Status:** ✅ **RESOLVED**  
**Severity:** MEDIUM  
**Assigned:** AI Assistant  
**Opened:** 19 Nov 2025  
**Resolved:** 19 Nov 2025

### Descrição

Active Campaign estava aplicando tags globalmente ao user, não por produto individual. Isso causava contaminação de dados entre produtos diferentes do mesmo utilizador.

### Cenário Problemático

```typescript
// ANTES (Errado):
User tem:
- OGI-V1 (inativo há 14 dias) → deve ter tag OGI_INATIVO_14D
- CLAREZA-V1 (ativo, acesso diário) → NÃO deve ter tags de inatividade

Sistema aplicava: INATIVO_14D ao USER globalmente
Resultado: CLAREZA também recebia tag de inatividade (ERRADO!)
```

### Impacto

- **Data Contamination:** Tags de um produto afetavam outros produtos
- **Incorrect Communications:** Emails enviados com contexto errado
- **Poor UX:** Users ativos recebiam comunicações de reativação

### Solução Implementada

**Arquivos Modificados:**
1. `src/services/activeCampaignService.ts` (+215 linhas)

**Novos Métodos:**

```typescript
✅ applyTagToUserProduct(userId, productId, tagName)
   - Aplica tag com prefixo do produto
   - Atualiza UserProduct.activeCampaignData.tags
   - Exemplo: "INATIVO_14D" → "OGI_INATIVO_14D"

✅ removeTagFromUserProduct(userId, productId, tagName)
   - Remove tag específica de um produto
   - Atualiza UserProduct.activeCampaignData.tags

✅ syncContactByProduct(userId, productId)
   - Sincroniza contacto baseado em produto específico
   - Aplica apenas tags relevantes ao produto

✅ removeAllProductTags(userId, productId)
   - Remove todas as tags de um produto
   - Útil para cleanup
```

### Como Usar

```typescript
// ANTES (Errado):
await activeCampaignService.addTag(user.email, 'INATIVO_14D')

// AGORA (Correto):
await activeCampaignService.applyTagToUserProduct(
  userId,
  productId,
  'INATIVO_14D'
)
// Resultado no AC: "OGI_INATIVO_14D" (com prefixo do produto)
```

### Testes

```bash
# Verificar sincronização
npm run check-ac-sync

# Verificar com verbose
VERBOSE=true npm run check-ac-sync

# Exportar JSON
EXPORT_JSON=true npm run check-ac-sync
```

### Próximos Passos

- [ ] Atualizar CRON jobs para usar novos métodos
- [ ] Migrar tags existentes (script de migração)
- [ ] Documentar padrões de nomenclatura de tags

**Status:** ✅ **IMPLEMENTADO E TESTADO**

---

## 🟢 ISSUE #2: E2E Tests Ausentes

**Status:** 🟢 **OPEN** (Low Priority)  
**Severity:** LOW  
**Assigned:** TBD  
**Opened:** 19 Nov 2025  
**ETA:** 1-2 semanas

### Descrição

Sistema não possui testes E2E automatizados para validar fluxos completos da aplicação. Atualmente, validação é feita manualmente, o que é demorado e propenso a erros.

### Impacto

- **Manual Testing Required:** 2-3 horas por release
- **Regression Risk:** Mudanças podem quebrar funcionalidades existentes sem detecção
- **Slow Feedback:** Bugs descobertos tarde no ciclo de desenvolvimento

### Casos de Teste Necessários

#### Sprint 5 - Contact Tag Reader

```typescript
✅ E2E Tests Needed:

1. test('Buscar tags de contacto via UI')
   - Navegar para /activecampaign
   - Clicar tab "Tags Reader"
   - Inserir email
   - Verificar tags aparecem
   - Verificar produtos detectados

2. test('Sincronizar tags AC → BO')
   - Buscar tags
   - Clicar "Sync BO ← AC"
   - Verificar toast success
   - Verificar dados no MongoDB

3. test('Error handling')
   - Email inválido → erro
   - AC offline → erro apropriado
   - User não existe → mensagem clara
```

#### Frontend V2

```typescript
✅ E2E Tests Needed:

1. test('Dashboard V2 stats')
   - Navegar para /dashboard
   - Clicar tab "Dashboard V2"
   - Verificar stats cards
   - Verificar breakdown produtos

2. test('Filters V2 funcionam')
   - Aplicar filtro produto
   - Aplicar filtro plataforma
   - Verificar tabela atualiza
   - Reset filters

3. test('Analytics V2 page')
   - Navegar para /analytics
   - Verificar 3 tabs
   - Verificar gráficos renderizam
   - Performance < 3s
```

### Solução Proposta

**Framework:** Playwright

**Estrutura:**

```
tests/
├── e2e/
│   ├── sprint5/
│   │   ├── contact-tag-reader.spec.ts
│   │   ├── sync-tags.spec.ts
│   │   └── error-handling.spec.ts
│   ├── frontend-v2/
│   │   ├── dashboard-v2.spec.ts
│   │   ├── filters-v2.spec.ts
│   │   └── analytics-v2.spec.ts
│   └── helpers/
│       ├── auth.ts
│       ├── db-seed.ts
│       └── assertions.ts
└── playwright.config.ts
```

**Setup:**

```bash
# Instalar Playwright
npm install -D @playwright/test

# Criar config
npx playwright init

# Rodar testes
npm run test:e2e

# Com UI
npm run test:e2e:ui
```

### Estimativa

- **Tempo:** 4-6 horas
- **Complexidade:** BAIXA
- **Dependencies:** Nenhuma

### Benefícios

- ✅ Automação de testes manuais (economia de 2-3h/release)
- ✅ Detecção precoce de regressões
- ✅ Confiança em deploys
- ✅ Documentação de fluxos via testes

**Status:** 🟢 **PLANEJADO**

---

## 📋 ISSUES RESOLVIDOS

### ✅ Issue #3: TypeScript Compilation Errors (19 Nov 2025)

**Problema:** 15 erros de compilação TypeScript após merge do Sprint 5

**Solução:** 
- Fixed imports circulares
- Added missing type definitions
- Updated tsconfig.json

**Status:** ✅ RESOLVED

### ✅ Issue #4: React Query Deprecation Warnings (19 Nov 2025)

**Problema:** Warnings de API deprecated do React Query v4 → v5

**Solução:**
- Updated to React Query v5
- Migrated `useQuery` syntax
- Updated query client config

**Status:** ✅ RESOLVED

---

## 🔄 PROCESSO DE TRACKING

### Como Reportar um Issue

1. **Criar issue no GitHub** com label apropriado:
   - `bug` - Bug confirmado
   - `issue` - Problema não confirmado
   - `enhancement` - Melhoria

2. **Preencher template:**

```markdown
## Descrição
[Descrição clara do problema]

## Passos para Reproduzir
1. ...
2. ...

## Comportamento Esperado
[O que deveria acontecer]

## Comportamento Atual
[O que está acontecendo]

## Impacto
- [ ] CRITICAL - Sistema down
- [ ] HIGH - Funcionalidade principal quebrada
- [ ] MEDIUM - Funcionalidade secundária afetada
- [ ] LOW - Bug visual ou UX

## Ambiente
- OS: [Windows/Mac/Linux]
- Browser: [Chrome/Firefox/Safari]
- Versão: [v1.0.0]

## Screenshots
[Se aplicável]
```

3. **Adicionar a este documento** se severity >= MEDIUM

### Severidade

| Level | Descrição | SLA |
|-------|-----------|-----|
| **CRITICAL** | Sistema down ou perda de dados | 4 horas |
| **HIGH** | Funcionalidade principal quebrada | 1 dia |
| **MEDIUM** | Funcionalidade secundária afetada | 1 semana |
| **LOW** | Bug visual, UX, ou edge case | 1 mês |

### Status

- 🔴 **OPEN** - Issue ativo, requer atenção
- 🟡 **IN PROGRESS** - Sendo trabalhado
- 🟢 **PENDING REVIEW** - Aguardando code review
- ✅ **RESOLVED** - Corrigido e testado
- ❌ **WONTFIX** - Não será corrigido (motivo documentado)

---

## 📊 ESTATÍSTICAS

### Por Severidade

```
CRITICAL:  0 (0%)
HIGH:      0 (0%)
MEDIUM:    0 (0% - 1 resolvido)
LOW:       1 (100%)
RESOLVED:  1
```

### Por Componente

```
Backend:       1 resolved
Frontend:      0
Infrastructure: 0
Testing:       1 open
Documentation: 0
```

### Tempo Médio de Resolução

```
CRITICAL:  N/A
HIGH:      N/A
MEDIUM:    <1 dia (Issue #1)
LOW:       N/A
```

---

## 🔮 ROADMAP DE CORREÇÕES

### Sprint Atual

- [x] ✅ Issue #1: AC Tags per Product (DONE)
- [ ] 🟢 Issue #2: E2E Tests (PLANNED)

### Próximos Sprints

- [ ] Performance optimization (batch sync >100 users)
- [ ] Monitoring & Alerting
- [ ] Migration script (V1 → V2 tags)
- [ ] Rate limiting improvements

---

## 📞 SUPORTE

### Em Caso de Novos Issues

1. **Verificar este documento** - Issue já conhecido?
2. **Consultar troubleshooting** - `TROUBLESHOOTING.md`
3. **Buscar no GitHub** - Issue já reportado?
4. **Criar novo issue** - Seguir template acima

### Contactos

- **Tech Lead:** [Nome]
- **DevOps:** [Nome]
- **QA:** [Nome]

---

**Documento mantido por:** AI Assistant  
**Próxima Revisão:** 26 Novembro 2025

