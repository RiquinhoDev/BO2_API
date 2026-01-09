# 🧪 Teste de Sincronização para User Único

## 📋 Objetivo

Script para testar todo o fluxo do CRON (DecisionEngine → TagOrchestrator → ActiveCampaign) para **um único utilizador**, sem afetar os restantes.

---

## 🚀 Como Usar

### Opção 1: Aplicar Tags Reais (PRODUÇÃO)

```bash
npm run test:single-user
```

**O que faz:**
- ✅ Executa DecisionEngine para `ruifilipespteixeira@gmail.com`
- ✅ Aplica tags reais na BD
- ✅ Sincroniza com Active Campaign
- ✅ Mostra logs detalhados de todo o processo

---

### Opção 2: Dry Run (SIMULAÇÃO)

```bash
npm run test:single-user:dry
```

**O que faz:**
- ✅ Executa DecisionEngine para `ruifilipespteixeira@gmail.com`
- ⚠️ **NÃO aplica tags** (apenas simula)
- ✅ Mostra o que **seria feito** sem executar
- ✅ Útil para testar sem afetar dados

---

## 📊 Output Esperado

O script mostra:

### 1. Dados Atuais do User
```
📊 DADOS ATUAIS DO USER
═══════════════════════════════════════════════════════════════

🎯 Produto: OGI_V1 (OGI_V1)
   Status: ACTIVE
   Platform: hotmart
   Enrolled: 01/10/2025

   📈 Progress:
      Percentage: 45%
      Current Module: 3
      Last Activity: 20/12/2025 15:30

   🔥 Engagement:
      Score: 650
      Days Since Last Login: 12
      Days Since Last Action: 10
      Last Login: 20/12/2025 15:30

   🏷️  Tags Atuais (BD):
      • OGI_V1 - Inativo 7d
      • OGI_V1 - Módulo 3
```

### 2. Decision Engine (Avaliação)
```
🧠 EXECUTANDO DECISION ENGINE
═══════════════════════════════════════════════════════════════

🎯 Avaliando: OGI_V1 (OGI_V1)
─────────────────────────────────────────────────────────────

📋 Resultado da Avaliação:
   Decisões tomadas: 3
   Ações executadas: 1
   Success: ✅

   🎲 Decisões Detalhadas:

   1. Inativo 7 dias
      Tag: OGI_V1 - Inativo 7d
      Action: APPLY_TAG
      Should Execute: ✅ SIM
      Reason: Inativo há 12 dias (> 7 dias threshold)
      Conditions:
         daysSinceLastLogin: 12
         threshold: 7
         meetsCondition: true

   2. Inativo 14 dias
      Tag: OGI_V1 - Inativo 14d
      Action: APPLY_TAG
      Should Execute: ❌ NÃO
      Reason: Já tem tag de nível inferior (7d), cooldown ativo
```

### 3. Mudanças na BD
```
🔄 VERIFICANDO MUDANÇAS NA BD
═══════════════════════════════════════════════════════════════

🎯 Produto: OGI_V1
   Tags Atuais (2):
      • OGI_V1 - Inativo 7d
      • OGI_V1 - Módulo 3

   ✅ Tags Adicionadas (1):
      + OGI_V1 - Inativo 7d

   ⚪ Sem mudanças nas tags
```

### 4. Active Campaign (se não for dry run)
```
☁️  VERIFICANDO ACTIVE CAMPAIGN
═══════════════════════════════════════════════════════════════

✅ Tags Finais no Active Campaign (2):
   • OGI_V1 - Inativo 7d
   • OGI_V1 - Módulo 3
```

### 5. Sumário Final
```
📊 SUMÁRIO FINAL
═══════════════════════════════════════════════════════════════

✅ Teste concluído com sucesso!

⏱️  Duração: 2.34s
👤 User: ruifilipespteixeira@gmail.com
📦 Produtos avaliados: 2
🎯 Decisões tomadas: 2
⚡ Ações executadas: 1
🔒 Dry Run: NÃO
```

---

## 🔧 Configuração

Para testar outro email, edita o ficheiro:

```typescript
// src/scripts/test-single-user-sync.ts

const TEST_EMAIL = 'outro.email@example.com'  // ← Mudar aqui
const DRY_RUN = false  // true = simula, false = aplica
```

---

## ⚙️ Como Funciona

1. **Conecta à BD**
2. **Busca user por email**
3. **Busca todos UserProducts do user**
4. **Mostra dados atuais** (progress, engagement, tags)
5. **Busca tags no Active Campaign** (para comparação)
6. **Executa DecisionEngine** para cada produto
7. **Mostra decisões detalhadas** (o que foi avaliado, porquê)
8. **Mostra mudanças na BD** (tags adicionadas/removidas)
9. **Verifica Active Campaign** (se não for dry run)
10. **Mostra sumário final**

---

## 🎯 Casos de Uso

### Testar Nova Regra
```bash
# 1. Criar TagRule na BD
# 2. Executar dry run para ver se funciona
npm run test:single-user:dry

# 3. Se estiver OK, executar real
npm run test:single-user
```

### Debug de Tags Incorretas
```bash
# Ver exatamente que regras estão a ser avaliadas
npm run test:single-user
```

### Validar Antes do CRON
```bash
# Testar com teu user antes de rodar CRON para todos
npm run test:single-user:dry
```

---

## 🐛 Troubleshooting

### Erro: "User não encontrado"
**Causa:** Email não existe na BD

**Solução:** Verifica o email no script

### Erro: "No TagRules found"
**Causa:** Não há regras ativas para o produto

**Solução:** Cria TagRules na BD para o curso do produto

### Erro: "AC API error"
**Causa:** Token do Active Campaign inválido ou expirado

**Solução:** Verifica `.env`:
```
AC_API_URL=https://...
AC_API_TOKEN=your_token
```

---

## 📝 Ficheiros Envolvidos

```
src/scripts/test-single-user-sync.ts     ← Script principal
src/services/activeCampaign/
  ├─ decisionEngine.service.ts          ← Avalia regras
  ├─ tagOrchestrator.service.ts         ← Aplica tags
  └─ activeCampaignService.ts           ← API do AC

package.json                             ← Comandos npm
```

---

## ✅ Próximos Passos

Depois de testar:

1. **Se funcionar bem** → Executar CRON completo
   ```bash
   POST http://localhost:3001/api/activecampaign/test-cron
   ```

2. **Se houver bugs** → Debug no código do DecisionEngine

3. **Se regras precisarem ajuste** → Atualizar TagRules na BD

---

**Bom teste! 🚀**
