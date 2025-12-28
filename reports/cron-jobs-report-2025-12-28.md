# 📋 RELATÓRIO DE JOBS CRON - SISTEMA COMPLETO

**Data de geração:** 28/12/2025, 10:56
**Total de jobs encontrados:** 9

═══════════════════════════════════════════════════════════════

## 📊 RESUMO GERAL

```
Total de Jobs: 9
  ✅ Ativos: 7
  ⏸️  Inativos: 2

Fontes:
  - CronJobConfig: 8 jobs
  - CronConfig: 1 jobs
```

## 🔷 JOBS DE: CronJobConfig

### ✅ TEST_CURSEDUCA_4MIN

| Campo | Valor |
|-------|-------|
| **Schedule** | `10 23 * * *` |
| **Próxima execução** | 10 23 * * * |
| **Status** | 🟢 ATIVO |
| **Descrição** | TESTE - Sync CursEDuca em 4 minutos |
| **Última execução** | 27/12/2025, 23:10 |
| **Total execuções (30d)** | 3 |
| **Taxa de sucesso** | 100.0% |
| **Duração média** | 316s |
| **Total execuções** | 5 |
| **Taxa de sucesso** | 100.0% |

### ✅ 1º

| Campo | Valor |
|-------|-------|
| **Schedule** | `0 4 * * *` |
| **Próxima execução** | 0 4 * * * |
| **Status** | 🟢 ATIVO |
| **Descrição** | Job de Hotmart |
| **Última execução** | 28/12/2025, 04:00 |
| **Total execuções (30d)** | 7 |
| **Taxa de sucesso** | 85.7% |
| **Duração média** | 3050s |
| **Total execuções** | 6 |
| **Taxa de sucesso** | 100.0% |

### ✅ ResetCounters

| Campo | Valor |
|-------|-------|
| **Schedule** | `0 1 * * 1` |
| **Próxima execução** | Segundas às 01:00 |
| **Status** | 🟢 ATIVO |
| **Descrição** | Reset de contadores semanais. Executa às segundas-feiras às 01:00 para limpar métricas da semana anterior. |

### ✅ CronExecutionCleanup

| Campo | Valor |
|-------|-------|
| **Schedule** | `0 3 * * 0` |
| **Próxima execução** | 0 3 * * 0 |
| **Status** | 🟢 ATIVO |
| **Descrição** | Limpeza de histórico antigo de execuções CRON (>90 dias). Executa aos domingos às 03:00 para manter BD limpa. |
| **Última execução** | 28/12/2025, 02:59 |
| **Total execuções (30d)** | 1 |
| **Taxa de sucesso** | 100.0% |
| **Duração média** | 3669s |
| **Total execuções** | 1 |
| **Taxa de sucesso** | 100.0% |

### ✅ DailyPipeline

| Campo | Valor |
|-------|-------|
| **Schedule** | `0 2 * * *` |
| **Próxima execução** | Diariamente às 02:00 |
| **Status** | 🟢 ATIVO |
| **Descrição** | Pipeline completo: Sync Hotmart → Sync CursEduca → Recalc Engagement → Tag Rules. Executa os 4 steps sequencialmente garantindo dados sempre frescos. |
| **Última execução** | 28/12/2025, 02:00 |
| **Total execuções (30d)** | 1 |
| **Taxa de sucesso** | 100.0% |
| **Duração média** | 6043s |
| **Total execuções** | 1 |
| **Taxa de sucesso** | 100.0% |

### ⏸️ EvaluateRules_TEST

| Campo | Valor |
|-------|-------|
| **Schedule** | `0 2 * * *` |
| **Próxima execução** | Diariamente às 02:00 |
| **Status** | 🔴 INATIVO |
| **Descrição** | Teste debug |

### ⏸️ EvaluateRules

| Campo | Valor |
|-------|-------|
| **Schedule** | `0 2 * * *` |
| **Próxima execução** | Diariamente às 02:00 |
| **Status** | 🔴 INATIVO |
| **Descrição** | ⚠️ DUPLICA DailyPipeline STEP 4! Avaliar regras de engagement. Criar DESATIVADO. |

### ✅ RebuildDashboardStats

| Campo | Valor |
|-------|-------|
| **Schedule** | `*/5 * * * *` |
| **Próxima execução** | A cada 5 minutos |
| **Status** | 🟢 ATIVO |
| **Descrição** | Rebuild de estatísticas do dashboard. Executa a cada 5 minutos. |
| **Última execução** | 28/12/2025, 10:15 |
| **Total execuções (30d)** | 8 |
| **Taxa de sucesso** | 12.5% |
| **Duração média** | 740s |
| **Total execuções** | 6 |
| **Taxa de sucesso** | N/A |


## 🔷 JOBS DE: CronConfig

### ✅ TAG_RULES_SYNC

| Campo | Valor |
|-------|-------|
| **Schedule** | `0 2 * * *` |
| **Próxima execução** | Diariamente às 02:00 |
| **Status** | 🟢 ATIVO |
| **Descrição** | Sistema antigo Tag Rules |
| **Última execução** | 27/12/2025, 02:00 |
| **Total execuções (30d)** | 14 |
| **Taxa de sucesso** | 100.0% |
| **Duração média** | 0s |


## ⚠️ ANÁLISE DE DUPLICAÇÕES

### ⚠️ Múltiplos jobs no horário: `0 2 * * *`

- **DailyPipeline** (CronJobConfig)
  - Pipeline completo: Sync Hotmart → Sync CursEduca → Recalc Engagement → Tag Rules. Executa os 4 steps sequencialmente garantindo dados sempre frescos.
- **TAG_RULES_SYNC** (CronConfig)
  - Sistema antigo Tag Rules

**ATENÇÃO:** Verificar se há duplicação de esforços!

═══════════════════════════════════════════════════════════════

## 💡 RECOMENDAÇÕES

1. **Jobs inativos:** 2 jobs estão desativados. Considerar remover se não são mais necessários.

2. **Duplicações:** Verificar jobs que executam no mesmo horário para evitar conflitos.

3. **Frontend:** Verificar se todos os 7 jobs ativos aparecem no dashboard.

4. **Monitorização:** Implementar alertas para jobs que falham consistentemente.

═══════════════════════════════════════════════════════════════

**Relatório gerado por:** `scripts/list-all-cron-jobs.ts`
**Comando:** `npx ts-node scripts/list-all-cron-jobs.ts`
