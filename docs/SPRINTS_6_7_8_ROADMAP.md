# 🚀 SPRINTS 6-8: BI-DIRECTIONAL INTEGRATION ROADMAP

**Status:** 📋 **PLANEJADO**  
**Período:** Novembro 19 - Dezembro 10, 2025  
**Sprint Anterior:** ✅ Sprint 5 (Contact Tag Reader) - 100% Completo

---

## 📋 VISÃO GERAL

Após o **sucesso do Sprint 5**, que implementou a leitura de tags do Active Campaign (AC) e sincronização com o Backoffice (BO), os **Sprints 6-8** irão:

1. **Sprint 6:** Email Engagement Analytics (BO ← AC webhooks)
2. **Sprint 7:** Automação & Webhook Receiver (AC ← BO events)
3. **Sprint 8:** Cross-Platform Analytics & ML Predictions

---

## 🎯 SPRINT 6: EMAIL ENGAGEMENT ANALYTICS

**Objetivo:** Rastrear engagement de emails (opens, clicks, bounces) via webhooks do Active Campaign

**Duração:** 5 dias úteis  
**Data Início:** 20/11/2025  
**Data Fim:** 26/11/2025

### **6.1 Backend Tasks**

#### **Task 6.1: Email Engagement Reader Service**
**Arquivo:** `src/services/ac/emailEngagementReader.service.ts`

**Funcionalidades:**
- ✅ Buscar campanhas do AC
- ✅ Buscar métricas de engagement (opens, clicks, bounces)
- ✅ Associar engagement a UserProducts
- ✅ Calcular taxas de conversão
- ✅ Agregação por produto/campanha

**Interfaces:**
```typescript
interface CampaignEngagement {
  campaignId: string;
  campaignName: string;
  sentCount: number;
  deliveredCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

interface UserEngagement {
  userId: string;
  email: string;
  productId: string;
  campaigns: Array<{
    campaignId: string;
    sentAt: Date;
    opened: boolean;
    clicked: boolean;
    bounced: boolean;
    lastInteraction: Date;
  }>;
}
```

#### **Task 6.2: Email Engagement Controller**
**Arquivo:** `src/controllers/emailEngagement.controller.ts`

**Endpoints:**
- `GET /api/ac/campaigns` - Lista campanhas
- `GET /api/ac/campaigns/:campaignId/engagement` - Métricas de uma campanha
- `GET /api/ac/users/:userId/engagement` - Engagement de um user
- `GET /api/ac/products/:productId/engagement` - Engagement por produto
- `POST /api/ac/webhooks/engagement` - Receiver de webhooks

#### **Task 6.3: Webhook Receiver**
**Arquivo:** `src/controllers/webhookReceiver.controller.ts`

**Eventos a processar:**
- ✅ `email_opened` - Email aberto
- ✅ `email_clicked` - Link clicado
- ✅ `email_bounced` - Bounce
- ✅ `email_complained` - Marcado como spam
- ✅ `email_unsubscribed` - Unsubscribe

**Lógica:**
1. Receber webhook do AC
2. Validar signature (segurança)
3. Identificar user (email → userId)
4. Atualizar `UserProduct.activeCampaignData.engagement`
5. Registrar em `CommunicationHistory`
6. Trigger alertas se necessário

### **6.2 Frontend Tasks**

#### **Task 6.4: Hook useEmailEngagement**
**Arquivo:** `src/hooks/useEmailEngagement.ts`

**Hooks:**
- `useCampaigns()` - Lista campanhas
- `useCampaignEngagement(campaignId)` - Métricas de campanha
- `useUserEngagement(userId)` - Engagement de user
- `useProductEngagement(productId)` - Engagement por produto

#### **Task 6.5: Email Engagement Dashboard**
**Arquivo:** `src/pages/activecampaign/components/EmailEngagementDashboard.tsx`

**Features:**
- 📊 Cards de métricas globais (open rate, click rate, bounce rate)
- 📈 Gráfico de engagement ao longo do tempo
- 📋 Tabela de campanhas com métricas
- 🔍 Filtros por produto/período
- 🚨 Alertas de baixo engagement

#### **Task 6.6: User Engagement Timeline**
**Arquivo:** `src/pages/activecampaign/components/UserEngagementTimeline.tsx`

**Features:**
- 📅 Timeline de interações do user
- 🟢 Indicadores visuais (abriu, clicou, bounced)
- 📧 Lista de emails recebidos
- 📊 Score de engagement

### **6.3 Testes & Documentação**

#### **Task 6.7: Testes**
**Arquivo:** `tests/integration/emailEngagement.test.ts`

**Casos de teste:**
- ✅ Processar webhook de email_opened
- ✅ Processar webhook de email_clicked
- ✅ Calcular taxas de engagement
- ✅ Agregação por produto
- ✅ Validação de signature do webhook

#### **Task 6.8: Documentação**
**Arquivo:** `docs/SPRINT_6_EMAIL_ENGAGEMENT.md`

**Conteúdo:**
- Arquitetura de webhooks
- Como configurar webhooks no AC
- Endpoints e exemplos
- Dashboard usage
- Troubleshooting

---

## 🎯 SPRINT 7: AUTOMAÇÃO & WEBHOOK RECEIVER

**Objetivo:** Criar sistema de automação baseado em eventos (AC ← BO)

**Duração:** 5 dias úteis  
**Data Início:** 27/11/2025  
**Data Fim:** 03/12/2025

### **7.1 Backend Tasks**

#### **Task 7.1: Automation Sync Service**
**Arquivo:** `src/services/ac/automationSync.service.ts`

**Funcionalidades:**
- ✅ Monitorar eventos no BO (novo user, progresso, inatividade)
- ✅ Trigger ações no AC (aplicar tag, adicionar a automação)
- ✅ CRON jobs para verificações periódicas
- ✅ Queue system para processar eventos

**Eventos BO → AC:**
- `user.created` → Adicionar a "Welcome Campaign"
- `user.inactive_7d` → Aplicar tag "INATIVO_7D"
- `user.progress_milestone` → Aplicar tag "LEVEL_UP"
- `user.completed_course` → Aplicar tag "GRADUATED"

#### **Task 7.2: Automation Controller**
**Arquivo:** `src/controllers/automation.controller.ts`

**Endpoints:**
- `GET /api/automation/rules` - Lista regras de automação
- `POST /api/automation/rules` - Criar regra
- `PUT /api/automation/rules/:id` - Atualizar regra
- `DELETE /api/automation/rules/:id` - Deletar regra
- `POST /api/automation/trigger` - Trigger manual
- `GET /api/automation/logs` - Logs de execução

#### **Task 7.3: Automation Config Model**
**Arquivo:** `src/models/AutomationConfig.ts`

**Schema:**
```typescript
interface AutomationConfig {
  name: string;
  description: string;
  trigger: {
    type: 'user.created' | 'user.inactive' | 'user.progress' | 'user.completed';
    conditions: any[];
  };
  actions: Array<{
    type: 'apply_tag' | 'add_to_automation' | 'send_email';
    params: any;
  }>;
  isActive: boolean;
  productId?: string; // Se null, aplica a todos os produtos
  executionStats: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastRun?: Date;
  };
}
```

### **7.2 Frontend Tasks**

#### **Task 7.4: Automation Builder Component**
**Arquivo:** `src/pages/activecampaign/components/AutomationBuilder.tsx`

**Features:**
- 🛠️ Drag-and-drop builder de automações
- 📝 Form para criar/editar regras
- 🔀 Conditional logic builder
- ✅ Validação de regras
- 📊 Preview de impacto (quantos users afetados)

#### **Task 7.5: Automation Logs Viewer**
**Arquivo:** `src/pages/activecampaign/components/AutomationLogsViewer.tsx`

**Features:**
- 📋 Tabela de logs de execução
- 🔍 Filtros (regra, status, data)
- 🚨 Erro highlighting
- 📊 Estatísticas de sucesso/falha

### **7.3 Testes & Documentação**

#### **Task 7.6: Testes**
**Arquivo:** `tests/integration/automationSync.test.ts`

#### **Task 7.7: Documentação**
**Arquivo:** `docs/SPRINT_7_AUTOMATION.md`

---

## 🎯 SPRINT 8: CROSS-PLATFORM ANALYTICS & ML

**Objetivo:** Analytics avançados e predição de churn com Machine Learning

**Duração:** 7 dias úteis  
**Data Início:** 04/12/2025  
**Data Fim:** 10/12/2025

### **8.1 Backend Tasks**

#### **Task 8.1: Cross-Platform Analytics Service**
**Arquivo:** `src/services/analytics/crossPlatformAnalytics.service.ts`

**Funcionalidades:**
- ✅ Agregar dados de Hotmart + CursEduca + Discord + AC
- ✅ Calcular KPIs globais
- ✅ User journey tracking (lifecycle completo)
- ✅ Cohort analysis
- ✅ Funnel analysis

**Métricas:**
- Total users por plataforma
- Taxa de conversão (lead → active → completed)
- Tempo médio de conclusão
- Taxa de retenção
- Churn rate

#### **Task 8.2: Churn Prediction Service (ML)**
**Arquivo:** `src/services/ml/churnPrediction.service.ts`

**Funcionalidades:**
- ✅ Feature engineering (últimos 30 dias de atividade)
- ✅ Modelo de ML (XGBoost ou Random Forest)
- ✅ Score de churn (0-1) para cada user
- ✅ Segmentação (high risk / medium risk / low risk)
- ✅ Recomendações de ações

**Features para o modelo:**
- `days_since_last_activity`
- `total_logins_30d`
- `progress_percentage`
- `email_open_rate`
- `email_click_rate`
- `has_discord_activity`
- `total_classes_attended`
- `days_since_enrollment`

#### **Task 8.3: Recommendation Engine**
**Arquivo:** `src/services/ml/recommendationEngine.service.ts`

**Funcionalidades:**
- ✅ Recomendar próximo conteúdo (baseado em progresso)
- ✅ Recomendar re-engagement ações
- ✅ Sugerir campanhas personalizadas

#### **Task 8.4: Analytics Report Generator**
**Arquivo:** `src/services/analytics/emailAnalyticsReport.service.ts`

**Funcionalidades:**
- ✅ Gerar relatórios semanais/mensais automaticamente
- ✅ Exportar para PDF/Excel
- ✅ Agendar envio por email

### **8.2 Frontend Tasks**

#### **Task 8.5: Advanced Analytics Dashboard**
**Arquivo:** `src/pages/analytics/AdvancedAnalyticsPage.tsx`

**Features:**
- 📊 KPIs cards (conversão, retenção, churn)
- 📈 Gráficos avançados (funnel, cohort, heatmap)
- 🌍 Cross-platform comparison
- 📅 Date range picker
- 📥 Exportar relatórios

#### **Task 8.6: Churn Risk Dashboard**
**Arquivo:** `src/pages/analytics/ChurnRiskDashboard.tsx`

**Features:**
- 🚨 Lista de users em risco (high/medium/low)
- 📊 Churn score distribution
- 🎯 Recommended actions por user
- 📈 Trend de churn ao longo do tempo
- 📧 Trigger re-engagement campaign

#### **Task 8.7: User Journey Visualizer**
**Arquivo:** `src/pages/analytics/UserJourneyVisualizer.tsx`

**Features:**
- 🗺️ Sankey diagram do user journey
- 📍 Milestones do user (enrollment → first login → 50% progress → completed)
- ⏱️ Tempo médio em cada estágio
- 🔀 Drop-off points

### **8.3 Testes & Documentação**

#### **Task 8.8: Testes**
**Arquivo:** `tests/integration/analytics.test.ts`

#### **Task 8.9: Documentação**
**Arquivo:** `docs/SPRINT_8_ADVANCED_ANALYTICS.md`

---

## 📊 RESUMO GERAL (Sprints 6-8)

| Sprint | Tema | Duração | Tasks | Linhas Estimadas |
|--------|------|---------|-------|------------------|
| **6** | Email Engagement | 5 dias | 8 | ~2000 linhas |
| **7** | Automação & Webhooks | 5 dias | 7 | ~1800 linhas |
| **8** | Analytics & ML | 7 dias | 9 | ~2500 linhas |
| **TOTAL** | - | **17 dias** | **24 tasks** | **~6300 linhas** |

---

## 🎯 PRÓXIMO PASSO

**Comando para iniciar Sprint 6:**

```bash
@workspace Iniciar Sprint 6:
Implementar Task 6.1 - Email Engagement Reader Service
Criar src/services/ac/emailEngagementReader.service.ts com:
1. Buscar campanhas do AC
2. Buscar métricas de engagement
3. Associar engagement a UserProducts
4. Calcular taxas de conversão
Usar Active Campaign API para buscar dados de campaigns e contacts.
```

---

**Criado em:** Novembro 19, 2025  
**Autor:** AI Assistant  
**Status:** 📋 Planejado (aguardando aprovação para iniciar Sprint 6)

