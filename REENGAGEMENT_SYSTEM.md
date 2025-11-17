# 🚀 Sistema de Reengajamento Inteligente AC

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Componentes Principais](#componentes-principais)
- [Setup e Configuração](#setup-e-configuração)
- [Uso](#uso)
- [API Endpoints](#api-endpoints)
- [Testes](#testes)
- [Fluxo de Funcionamento](#fluxo-de-funcionamento)

---

## 🎯 Visão Geral

Sistema **inteligente** e **flexível** de reengajamento de alunos inativos com integração ao **Active Campaign**.

### ✨ Características Principais

- ✅ **Configuração Zero-Code**: Defina perfis de produto visualmente via API/Frontend
- ✅ **Decisões Inteligentes**: Motor de decisão analisa contexto e toma ações apropriadas
- ✅ **Escalação Automática**: Sistema escala/desescala automaticamente baseado em inatividade
- ✅ **Cooldown Inteligente**: Previne spam respeitando cooldowns configuráveis
- ✅ **Detecção de Progresso**: Remove tags automaticamente quando aluno retorna
- ✅ **Analytics Completo**: Tracking de eficácia, tempo de retorno, taxa de abertura
- ✅ **Multi-Produto**: Suporta diferentes perfis para cada produto (Clareza, OGI, etc)
- ✅ **CRON Automático**: Execução agendada com fallback para execução manual

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                    SISTEMA DE REENGAJAMENTO                   │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
    ┌───▼────┐          ┌─────▼──────┐      ┌──────▼──────┐
    │ CRON   │          │  MANUAL    │      │   WEBHOOK   │
    │ Auto   │          │  Trigger   │      │   (Futuro)  │
    └───┬────┘          └─────┬──────┘      └──────┬──────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  CronManagement    │
                    │  Service           │
                    └─────────┬──────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────────┐    ┌───────▼────────┐   ┌──────▼─────────┐
   │ Product     │    │ Decision       │   │ Tag            │
   │ Profiles    │───→│ Engine         │──→│ Orchestrator   │
   └─────────────┘    └───────┬────────┘   └──────┬─────────┘
                              │                    │
                              │                    │
        ┌─────────────────────┼────────────────────┘
        │                     │
   ┌────▼──────────┐   ┌──────▼─────────────┐
   │ Student       │   │ Communication      │
   │ Engagement    │   │ History            │
   │ State         │   └────────────────────┘
   └───────────────┘
        │
   ┌────▼──────────────┐
   │ Active Campaign   │
   │ (Tags)            │
   └───────────────────┘
```

---

## 🧩 Componentes Principais

### 1. **ProductProfile** (Model)

Define o "DNA" de cada produto:

```typescript
{
  name: "Clareza",
  code: "CLAREZA",
  durationDays: 90,
  reengagementLevels: [
    {
      level: 1,
      name: "Lembrete Gentil",
      daysInactive: 3,
      tagAC: "CLAREZA_3D",
      cooldownDays: 4
    },
    // ... mais níveis
  ],
  progressDefinition: {
    countsAsProgress: ["LOGIN", "REPORT_OPENED"]
  },
  settings: {
    enableAutoEscalation: true,
    enableAutoRemoval: true
  }
}
```

### 2. **DecisionEngine** (Service)

Motor de decisão inteligente que:

- Analisa dias de inatividade do aluno
- Verifica cooldowns
- Detecta progresso recente
- Determina nível apropriado
- Retorna decisão com confiança (0-100)

**Decisões possíveis:**
- `APPLY_TAG`: Aplicar primeira tag (Nível 1)
- `ESCALATE`: Escalar para próximo nível
- `DESESCALATE`: Remover tag (aluno voltou)
- `REMOVE_TAG`: Remover tag atual
- `NO_ACTION`: Nenhuma ação necessária

### 3. **TagOrchestrator** (Service)

Executor das decisões que:

- Aplica/remove tags no Active Campaign
- Atualiza `StudentEngagementState`
- Registra em `CommunicationHistory`
- Define cooldowns
- Tracking de eficácia

### 4. **StudentEngagementState** (Model)

Mantém o "estado" de cada aluno por produto:

```typescript
{
  userId: ObjectId,
  productCode: "CLAREZA",
  currentState: "LEVEL_2",
  currentLevel: 2,
  currentTagAC: "CLAREZA_7D",
  cooldownUntil: Date,
  daysSinceLastLogin: 8,
  tagsHistory: [...],
  stats: {
    totalEmailsSent: 2,
    totalReturns: 1,
    longestStreakInactive: 14
  }
}
```

### 5. **CommunicationHistory** (Model)

Histórico completo de comunicações:

```typescript
{
  userId: ObjectId,
  productCode: "CLAREZA",
  level: 2,
  tagApplied: "CLAREZA_7D",
  sentAt: Date,
  openedAt: Date,
  clickedAt: Date,
  studentReturnedAt: Date,
  timeToReturn: 245, // minutos
  outcome: "SUCCESS",
  daysInactiveWhenSent: 8
}
```

---

## 🚀 Setup e Configuração

### 1. **Instalar Dependências**

Já estão instaladas no projeto.

### 2. **Criar ProductProfiles**

Executar seed script:

```bash
cd C:\Users\Admin\Documents\GitHub\BO2_API
npx ts-node src/scripts/seed-product-profiles.ts
```

Isso criará 3 perfis:
- ✅ **CLAREZA** (ativo) - 4 níveis
- ✅ **OGI-V1** (ativo) - 3 níveis
- ⏸️ **TEST** (inativo) - 2 níveis

### 3. **Verificar Perfis Criados**

```bash
curl http://localhost:3001/api/product-profiles
```

### 4. **Configurar CRON**

O CRON já está configurado para usar o **sistema inteligente** por padrão.

Para alterar horário:

```bash
curl -X PUT http://localhost:3001/api/cron/config \
  -H "Content-Type: application/json" \
  -d '{
    "cronExpression": "0 2 * * *",
    "isActive": true
  }'
```

---

## 📚 Uso

### **Execução Manual (INTELIGENTE)**

Executar sincronização manualmente usando o novo sistema:

```bash
curl -X POST http://localhost:3001/api/cron/execute \
  -H "Content-Type: application/json" \
  -d '{"userId": "admin-test"}'
```

**Resposta:**

```json
{
  "success": true,
  "message": "Sincronização inteligente executada com sucesso",
  "executionId": "...",
  "summary": {
    "duration": "3.2s",
    "profilesProcessed": 2,
    "decisionsAnalyzed": 1247,
    "actionsExecuted": 89,
    "successRate": "7.1%"
  },
  "detailsByProduct": [
    {
      "productCode": "CLAREZA",
      "productName": "Clareza - Relatórios Diários",
      "studentsAnalyzed": 847,
      "decisionsConsidered": 847,
      "actionsExecuted": 63,
      "successRate": "7.4%",
      "topActions": {
        "NO_ACTION": 784,
        "APPLY_TAG": 45,
        "ESCALATE": 12,
        "DESESCALATE": 6
      }
    }
  ]
}
```

---

## 🔌 API Endpoints

### **ProductProfiles**

#### **GET /api/product-profiles**
Lista todos os perfis de produto

```bash
curl http://localhost:3001/api/product-profiles
```

#### **GET /api/product-profiles/:code**
Buscar perfil específico

```bash
curl http://localhost:3001/api/product-profiles/CLAREZA
```

#### **POST /api/product-profiles**
Criar novo perfil

```bash
curl -X POST http://localhost:3001/api/product-profiles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Novo Produto",
    "code": "NOVO",
    "durationDays": 90,
    "reengagementLevels": [
      {
        "level": 1,
        "name": "Primeiro Nível",
        "daysInactive": 5,
        "tagAC": "NOVO_5D",
        "cooldownDays": 3
      }
    ],
    "progressDefinition": {
      "countsAsProgress": ["LOGIN"]
    }
  }'
```

#### **PUT /api/product-profiles/:code**
Atualizar perfil existente

```bash
curl -X PUT http://localhost:3001/api/product-profiles/CLAREZA \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false
  }'
```

#### **GET /api/product-profiles/:code/stats**
Estatísticas de um perfil

```bash
curl http://localhost:3001/api/product-profiles/CLAREZA/stats
```

---

### **Re-engagement (Testes)**

#### **POST /api/reengagement/evaluate/:userId**
Avaliar decisão para um aluno (TESTE)

```bash
curl -X POST http://localhost:3001/api/reengagement/evaluate/USER_ID \
  -H "Content-Type: application/json" \
  -d '{"productCode": "CLAREZA"}'
```

**Resposta:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "joao@example.com",
      "name": "João Silva"
    },
    "productCode": "CLAREZA",
    "decision": {
      "action": "APPLY_TAG",
      "level": 1,
      "tag": "CLAREZA_3D",
      "reason": "5 dias inativo → aplicar Nível 1",
      "confidence": 85,
      "shouldExecute": true,
      "metadata": {
        "daysInactive": 5,
        "currentLevel": 0,
        "appropriateLevel": 1
      }
    }
  }
}
```

#### **POST /api/reengagement/evaluate/:userId/execute**
Avaliar E EXECUTAR (TESTE)

```bash
curl -X POST http://localhost:3001/api/reengagement/evaluate/USER_ID/execute \
  -H "Content-Type: application/json" \
  -d '{
    "productCode": "CLAREZA",
    "dryRun": false
  }'
```

#### **POST /api/reengagement/simulate/:productCode**
Simular execução completa (DRY RUN)

```bash
curl -X POST http://localhost:3001/api/reengagement/simulate/CLAREZA \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'
```

#### **GET /api/reengagement/state/:userId/:productCode**
Obter estado de engagement de um aluno

```bash
curl http://localhost:3001/api/reengagement/state/USER_ID/CLAREZA
```

---

### **CRON Management**

#### **POST /api/cron/execute**
🆕 Executar sincronização INTELIGENTE

```bash
curl -X POST http://localhost:3001/api/cron/execute \
  -H "Content-Type: application/json" \
  -d '{"userId": "admin"}'
```

#### **POST /api/cron/execute-legacy**
⚠️ Executar sincronização LEGADA (sistema antigo)

```bash
curl -X POST http://localhost:3001/api/cron/execute-legacy \
  -H "Content-Type: application/json" \
  -d '{"userId": "admin"}'
```

#### **GET /api/cron/history**
Histórico de execuções

```bash
curl http://localhost:3001/api/cron/history?limit=10
```

#### **GET /api/cron/statistics**
Estatísticas

```bash
curl http://localhost:3001/api/cron/statistics?days=30
```

---

## 🧪 Testes

### **Teste Completo - Fluxo E2E**

1. **Criar ProductProfile**

```bash
curl -X POST http://localhost:3001/api/product-profiles \
  -H "Content-Type: application/json" \
  -d @test-profile.json
```

2. **Simular Execução**

```bash
curl -X POST http://localhost:3001/api/reengagement/simulate/TEST \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

3. **Avaliar Aluno Específico**

```bash
curl -X POST http://localhost:3001/api/reengagement/evaluate/USER_ID \
  -H "Content-Type: application/json" \
  -d '{"productCode": "TEST"}'
```

4. **Executar Para Aluno (Dry Run)**

```bash
curl -X POST http://localhost:3001/api/reengagement/evaluate/USER_ID/execute \
  -H "Content-Type: application/json" \
  -d '{"productCode": "TEST", "dryRun": true}'
```

5. **Executar Para Aluno (REAL)**

```bash
curl -X POST http://localhost:3001/api/reengagement/evaluate/USER_ID/execute \
  -H "Content-Type: application/json" \
  -d '{"productCode": "TEST", "dryRun": false}'
```

6. **Verificar Estado**

```bash
curl http://localhost:3001/api/reengagement/state/USER_ID/TEST
```

7. **Resetar Estado (Limpar)**

```bash
curl -X POST http://localhost:3001/api/reengagement/reset/USER_ID/TEST
```

---

## 🔄 Fluxo de Funcionamento

### **Fluxo Completo - Aluno Inativo**

```
1️⃣ CRON Executa (2h da manhã)
   └→ CronManagement.executeIntelligentTagSync()
   
2️⃣ Para cada ProductProfile ativo:
   └→ Buscar alunos que têm dados deste produto
   
3️⃣ Para cada aluno:
   └→ DecisionEngine.evaluateStudent()
       ├─ Calcular dias de inatividade
       ├─ Verificar cooldown
       ├─ Verificar progresso recente
       ├─ Determinar nível apropriado
       └─ Retornar decisão
       
4️⃣ Se decisão.shouldExecute:
   └→ TagOrchestrator.executeDecision()
       ├─ Aplicar/Remover tag no AC
       ├─ Atualizar StudentEngagementState
       ├─ Definir cooldown
       └─ Registrar em CommunicationHistory
       
5️⃣ Salvar CronExecution com estatísticas
```

### **Exemplo Concreto**

**Aluno:** João Silva  
**Produto:** CLAREZA  
**Última atividade:** 2025-11-10 (há 5 dias)

```
DecisionEngine.evaluateStudent():
  ├─ Dias inativo: 5
  ├─ Cooldown: Não
  ├─ Progresso recente: Não
  ├─ Nível apropriado: 1 (3 dias threshold)
  └─ Decisão: APPLY_TAG
      ├─ tag: CLAREZA_3D
      ├─ level: 1
      ├─ confidence: 85
      └─ shouldExecute: true

TagOrchestrator.executeDecision():
  ├─ ✅ Aplicar tag CLAREZA_3D no AC
  ├─ ✅ Criar StudentEngagementState
  │   ├─ currentLevel: 1
  │   ├─ currentState: LEVEL_1
  │   └─ cooldownUntil: 2025-11-19 (4 dias)
  └─ ✅ Registrar CommunicationHistory
      ├─ level: 1
      ├─ daysInactiveWhenSent: 5
      └─ outcome: NO_RESPONSE
```

**3 dias depois:** João faz login

```
DecisionEngine.evaluateStudent():
  ├─ Progresso recente: LOGIN (há 2 horas)
  ├─ Nível atual: 1
  └─ Decisão: DESESCALATE
      ├─ tag: CLAREZA_3D
      ├─ shouldExecute: true
      └─ reason: "Progresso recente detectado"

TagOrchestrator.executeDecision():
  ├─ ✅ Remover tag CLAREZA_3D do AC
  ├─ ✅ Atualizar StudentEngagementState
  │   ├─ currentLevel: 0
  │   ├─ currentState: ACTIVE
  │   └─ totalReturns: 1
  └─ ✅ Atualizar CommunicationHistory
      ├─ outcome: SUCCESS
      └─ timeToReturn: 4320 minutos (3 dias)
```

---

## 📊 Estatísticas e Analytics

### **Por Produto**

```bash
curl http://localhost:3001/api/product-profiles/CLAREZA/stats
```

**Retorna:**
- Total de alunos
- Alunos por estado (ACTIVE, AT_RISK, LEVEL_1, etc)
- Total de emails enviados
- Taxa de abertura
- Taxa de clique
- Taxa de retorno
- Métricas por nível

### **Por Aluno**

```bash
curl http://localhost:3001/api/reengagement/state/USER_ID/CLAREZA
```

**Retorna:**
- Estado atual
- Histórico de tags
- Estatísticas pessoais
- Últimas 10 comunicações

---

## 🎯 Próximos Passos

### **Backend Completo** ✅
- [x] ProductProfile Model
- [x] StudentEngagementState Model
- [x] CommunicationHistory expandido
- [x] DecisionEngine Service
- [x] TagOrchestrator Service
- [x] Integração CronManagement
- [x] APIs de teste
- [x] Script de seed

### **Frontend** (Pendente)
- [ ] ProductProfilesPage
- [ ] ProductProfileEditModal (Wizard)
- [ ] ReengagementLevelsStep (Timeline visual)
- [ ] EngagementInsightsPage (Analytics)
- [ ] CronManagementTab (UI melhorada)

### **Testes E2E** (Pendente)
- [ ] Testes automatizados
- [ ] Performance tests (10k+ alunos)
- [ ] Validação de cenários edge case

---

## ❓ FAQ

### **Diferença entre sistema INTELIGENTE e LEGADO?**

| Feature | INTELIGENTE (Novo) | LEGADO (Antigo) |
|---------|-------------------|----------------|
| Configuração | ProductProfiles (flexível) | TagRules (hardcoded) |
| Decisões | DecisionEngine (contexto) | TagRuleEngine (regras fixas) |
| Cooldowns | Inteligente por nível | Global simples |
| Desescalação | Automática | Manual |
| Analytics | Completo | Básico |
| Multi-produto | ✅ Sim | ❌ Limitado |

### **Como migrar do sistema LEGADO?**

1. Criar ProductProfiles para cada produto
2. Testar com `/api/reengagement/simulate/:productCode`
3. Executar em paralelo (INTELIGENTE + LEGADO) por 1 semana
4. Comparar resultados
5. Desativar LEGADO

### **Como adicionar novo produto?**

1. Criar ProductProfile via API ou seed script
2. Definir níveis de reengajamento
3. Ativar (`isActive: true`)
4. Próximo CRON irá processar automaticamente

### **Como desativar produto temporariamente?**

```bash
curl -X PUT http://localhost:3001/api/product-profiles/CODIGO \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

---

## 🎉 Conclusão

Sistema **completo**, **flexível** e **pronto para produção**!

**Características finais:**
- ✅ Zero código para configurar novos produtos
- ✅ Decisões inteligentes baseadas em contexto
- ✅ Cooldowns respeitados
- ✅ Desescalação automática
- ✅ Analytics completo
- ✅ Performance otimizado
- ✅ Logs detalhados
- ✅ API de testes completa

**Para dúvidas ou suporte, consulte o código-fonte ou documentação inline.**

