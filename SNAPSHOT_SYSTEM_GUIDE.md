# 📸 Sistema de Snapshots - Guia de Uso

## 🎯 Objetivo

O **Pipeline Snapshot Service** permite capturar o estado da BD antes e depois da execução do Daily Pipeline, comparar as mudanças e gerar relatórios detalhados.

---

## 🔑 Features

### ✅ O que o sistema faz:

1. **Captura snapshot PRE** - Estado da BD antes do pipeline
2. **Captura snapshot POST** - Estado da BD depois do pipeline
3. **Compara snapshots** - Identifica tags adicionadas/removidas
4. **Gera relatórios** - JSON + Markdown com análise detalhada
5. **Protege tags nativas** - Só rastreia tags BO (formato `CODIGO - Descrição`)

### 📊 Dados Capturados:

Para cada UserProduct ativo:
- Email do utilizador
- Código do produto
- Tags da BD (`activeCampaignData.tags`)
- Engagement metrics (score, daysInactive, loginsLast30Days, weeksActiveLast30Days)
- Progress (percentage, completed)

---

## 🚀 Como Usar

### **Cenário 1: Testar Daily Pipeline completo**

```bash
# PASSO 1: Capturar snapshot PRE (antes do pipeline)
node test-snapshot-system.js

# PASSO 2: Executar Daily Pipeline
# (via CRON ou endpoint manual)

# PASSO 3: Capturar snapshot POST e comparar
node test-snapshot-compare.js
```

**Resultado**: Ficheiros em `./snapshots/`:
- `snapshot_PRE_latest.json` - Estado antes
- `snapshot_POST_latest.json` - Estado depois
- `comparison_latest.json` - Diff detalhado
- `report_latest.md` - Relatório em markdown

---

### **Cenário 2: Testar Tag Rules Only (sem sync)**

```bash
# PASSO 1: Capturar snapshot PRE
node test-snapshot-system.js

# PASSO 2: Executar Tag Rules Only (via endpoint ou CRON)
curl -X POST http://localhost:3001/api/cron/tag-rules-only

# PASSO 3: Comparar
node test-snapshot-compare.js
```

---

### **Cenário 3: Comparação Manual**

Você pode carregar snapshots antigos e comparar manualmente:

```javascript
const { pipelineSnapshotService } = require('./dist/services/activeCampaign/pipelineSnapshot.service');

// Carregar snapshots
const pre = await pipelineSnapshotService.loadSnapshot('./snapshots/snapshot_PRE_2026-01-23.json');
const post = await pipelineSnapshotService.loadSnapshot('./snapshots/snapshot_POST_2026-01-23.json');

// Comparar
const comparison = pipelineSnapshotService.compareSnapshots(pre, post);

// Salvar relatório
await pipelineSnapshotService.saveMarkdownReport(comparison, 'report_custom.md');
```

---

## 📋 Formato dos Snapshots

### **Snapshot Structure**

```typescript
{
  timestamp: Date,
  type: 'PRE' | 'POST',
  totalUserProducts: number,
  activeUserProducts: number,
  userProducts: [
    {
      userId: string,
      email: string,
      productId: string,
      productCode: string,
      status: string,
      tags: string[], // Tags da BD
      engagement: {
        score: number,
        daysInactive?: number,
        loginsLast30Days?: number,
        weeksActiveLast30Days?: number
      },
      progress: {
        percentage: number,
        completed: boolean
      }
    }
  ],
  stats: {
    totalUsers: number,
    totalTags: number,
    avgEngagementScore: number,
    productBreakdown: {
      [productCode: string]: {
        total: number,
        avgScore: number
      }
    }
  }
}
```

---

### **Comparison Structure**

```typescript
{
  pre: PipelineSnapshot,
  post: PipelineSnapshot,
  diff: {
    tagsAdded: [
      {
        email: string,
        productCode: string,
        tags: string[]
      }
    ],
    tagsRemoved: [
      {
        email: string,
        productCode: string,
        tags: string[]
      }
    ],
    engagementChanged: [
      {
        email: string,
        productCode: string,
        before: number,
        after: number
      }
    ],
    summary: {
      totalTagsAdded: number,
      totalTagsRemoved: number,
      usersAffected: number,
      productsAffected: Set<string>
    }
  }
}
```

---

## 📝 Exemplo de Relatório Markdown

```markdown
# 📊 Relatório de Comparação Pipeline

**Data**: 23/01/2026, 15:30:00

## 📸 Snapshots

- **PRE**: 23/01/2026, 14:00:00 (6655 UserProducts)
- **POST**: 23/01/2026, 15:20:00 (6655 UserProducts)

## 🎯 Resumo de Mudanças

- **Tags Adicionadas**: 2543
- **Tags Removidas**: 413
- **Utilizadores Afetados**: 1850
- **Produtos Afetados**: 4

## ✅ Tags Adicionadas

| Email | Produto | Tags |
|---|---|---|
| joao@example.com | OGI_V1 | OGI_V1 - Inativo 14d, OGI_V1 - Progresso Baixo |
| maria@example.com | CLAREZA_ANUAL | CLAREZA_ANUAL - Médio Engajamento |

## ❌ Tags Removidas

| Email | Produto | Tags |
|---|---|---|
| pedro@example.com | OGI_V1 | OGI_V1 - Ativo |

## 📈 Mudanças de Engagement Score (>5 pontos)

| Email | Produto | Antes | Depois | Δ |
|---|---|---|---|---|
| ana@example.com | OGI_V1 | 45 | 60 | +15 |

## 📊 Estatísticas Gerais

| Métrica | PRE | POST | Δ |
|---|---|---|---|
| Total Tags | 3200 | 5330 | +2130 |
| Avg Engagement Score | 42.50 | 48.30 | +5.80 |
| Total Utilizadores | 5200 | 5200 | 0 |
```

---

## 🔒 Regra Crítica de Proteção

### **Tags BO vs Tags Nativas**

O sistema **só rastreia e remove tags BO** (criadas pelo nosso sistema).

**Tag BO** (pode ser removida):
```
OGI_V1 - Inativo 14d
CLAREZA_ANUAL - Alto Engajamento
```

**Tag Nativa do AC** (NÃO pode ser removida):
```
Cliente VIP
Testemunho Gravado
Evento 2025
```

**Regex de identificação**:
```javascript
function isBOTag(tagName) {
  return /^[A-Z_0-9]+ - .+$/.test(tagName)
}
```

Esta proteção garante que tags criadas manualmente no ActiveCampaign **NUNCA sejam tocadas** pelo nosso sistema.

---

## 🎯 Use Cases

### **1. Validar Tag System V2**

Antes de implementar o Tag System V2 em produção:
1. Captura snapshot PRE
2. Executa pipeline com sistema novo
3. Compara resultados
4. Valida se tags foram aplicadas corretamente

### **2. Debug de Tags Removidas**

Se tags estão a ser removidas incorretamente:
1. Captura snapshot PRE
2. Executa pipeline
3. Compara e identifica quais tags foram removidas
4. Analisa lógica de remoção

### **3. Monitorização de Engagement**

Verifica se recalc engagement está a funcionar:
1. Compara `avgEngagementScore` PRE vs POST
2. Analisa `engagementChanged` para ver quem mudou
3. Valida se scores estão corretos

### **4. Análise de Impacto**

Antes de lançar nova feature de tags:
1. Captura baseline (PRE)
2. Testa feature em staging
3. Compara impacto (quantos users afetados, quais tags)
4. Decide se vai para produção

---

## 📂 Estrutura de Ficheiros

```
./snapshots/
├── snapshot_PRE_latest.json       # Último snapshot PRE
├── snapshot_POST_latest.json      # Último snapshot POST
├── comparison_latest.json         # Última comparação
├── report_latest.md               # Último relatório
├── snapshot_PRE_2026-01-23T14-00-00.json  # Snapshots timestamped
├── snapshot_POST_2026-01-23T15-20-00.json
└── comparison_2026-01-23T15-25-00.json
```

**Dica**: Os ficheiros `*_latest.*` são sobrescritos. Os timestamped ficam como histórico.

---

## 🧪 Testes

### **Teste Básico (sem executar pipeline)**

```bash
# Captura snapshot PRE
node test-snapshot-system.js

# Espera alguns segundos (não muda nada)

# Captura snapshot POST e compara (deve mostrar 0 mudanças)
node test-snapshot-compare.js
```

**Resultado esperado**:
- Tags Adicionadas: 0
- Tags Removidas: 0
- Utilizadores Afetados: 0

---

### **Teste com Tag Rules Only**

```bash
# 1. Captura PRE
node test-snapshot-system.js

# 2. Executa Tag Rules Only
curl -X POST http://localhost:3001/api/cron/tag-rules-only

# 3. Compara
node test-snapshot-compare.js
```

**Resultado esperado** (após implementar Tag System V2):
- Tags Adicionadas: ~2500-3000
- Tags Removidas: ~500-800 (tags antigas do sistema anterior)
- Utilizadores Afetados: ~2000-2500

---

## ⚙️ Integração no Daily Pipeline

**Opção 1: Automático (recomendado)**

Modificar `dailyPipeline.service.ts` para capturar snapshots automaticamente:

```typescript
export async function executeDailyPipeline(): Promise<DailyPipelineResult> {
  // Capturar snapshot PRE
  const preSnapshot = await pipelineSnapshotService.captureSnapshot('PRE')
  await pipelineSnapshotService.saveSnapshot(preSnapshot)

  // Executar pipeline...
  const result = await /* ... */

  // Capturar snapshot POST
  const postSnapshot = await pipelineSnapshotService.captureSnapshot('POST')
  await pipelineSnapshotService.saveSnapshot(postSnapshot)

  // Comparar e salvar relatório
  const comparison = pipelineSnapshotService.compareSnapshots(preSnapshot, postSnapshot)
  await pipelineSnapshotService.saveComparison(comparison)
  await pipelineSnapshotService.saveMarkdownReport(comparison)

  return result
}
```

**Opção 2: Manual**

Manter scripts separados e executar manualmente quando necessário.

---

## 🎯 Próximos Passos

1. ✅ Sistema de snapshots criado
2. ✅ Scripts de teste criados
3. ⏳ Testar com Daily Pipeline atual (sistema antigo)
4. ⏳ Implementar Tag System V2
5. ⏳ Comparar resultados sistema antigo vs novo
6. ⏳ Validar que só tags BO são removidas
7. ⏳ Deploy em produção

---

**Criado em**: 2026-01-23
**Versão**: 1.0
**Autor**: Claude Code Assistant
