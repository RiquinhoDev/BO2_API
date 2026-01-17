# 🌟 Sistema de Testemunhos: Guia Completo para a Equipa

## 📋 O Que é Este Sistema?

O Sistema de Testemunhos é uma ferramenta automatizada que nos ajuda a:
1. **Identificar** alunos satisfeitos e engajados
2. **Pedir** testemunhos de forma organizada
3. **Acompanhar** o progresso de cada pedido
4. **Automatizar** emails através do Active Campaign
5. **Gerir** todo o ciclo de vida dos testemunhos

---

## 🎯 Porquê Este Sistema?

### Antes (Problemas)
- ❌ Pedíamos testemunhos a alunos aleatórios
- ❌ Muitos alunos sem engagement suficiente
- ❌ Taxa de resposta baixa (~20%)
- ❌ Gestão manual e desorganizada
- ❌ Emails enviados manualmente
- ❌ Difícil saber quem já foi contactado

### Agora (Soluções)
- ✅ Só alunos com **engagement alto** ou **progresso ≥40%**
- ✅ Taxa de resposta esperada: **~60-70%**
- ✅ Tudo organizado num único sistema
- ✅ Emails automáticos via Active Campaign
- ✅ Acompanhamento completo: pedido → aceitação → conclusão
- ✅ Tags automáticas por produto (OGI, Clareza, Discord)

---

## 🔍 Como Funciona? (Visão Simples)

```
📝 PASSO 1: Criar Pedido de Testemunho
   → Sistema filtra alunos qualificados (engagement alto)
   → Escolhemos os alunos
   → Sistema cria pedido e aplica tag (ex: "OGI_TESTEMUNHO")

📧 PASSO 2: Email Automático (Active Campaign)
   → Sistema sincroniza tag para Active Campaign
   → Active Campaign envia email automático
   → "Olá João! Adoraríamos ouvir a tua experiência com o OGI..."

✅ PASSO 3: Aluno Responde/Grava Testemunho
   → Aluno aceita e grava vídeo/texto
   → Marcamos como "Concluído" no sistema

🏷️  PASSO 4: Tags Atualizadas Automaticamente
   → Remove tag "OGI_TESTEMUNHO"
   → Adiciona tag "OGI_TESTEMUNHO_CONCLUIDO"
   → Pode disparar email de agradecimento
```

---

## 👥 Quem Pode Dar Testemunho?

### Critérios de Qualificação

O sistema **só mostra alunos** que tenham:

**OPÇÃO 1: Engagement Alto**
- ⭐ **Nível MÉDIO ou superior** (Médio, Alto, Muito Alto)
- ⭐ **Score ≥ 40 pontos**

**OU**

**OPÇÃO 2: Progresso Alto**
- 📊 **Progresso ≥ 40%** no curso

### Exemplo Prático

#### ✅ Aluno Qualificado
```
João Silva
Email: joao@example.com
Engagement: Alto (65 pontos) ⭐⭐⭐
Progresso: 78% 📊📊📊
Status: Ativo

→ APARECE na lista!
```

#### ❌ Aluno NÃO Qualificado
```
Maria Santos
Email: maria@example.com
Engagement: Baixo (15 pontos) ⭐
Progresso: 12% 📊
Status: Ativo

→ NÃO APARECE na lista
```

---

## 🎬 Como Usar o Sistema (Passo a Passo)

### 1️⃣ Criar Pedido de Testemunho

1. **Abrir o Wizard**
   - Ir para: Gestão de Testemunhos → Novo Pedido
   - Abre janela com "Estudantes Disponíveis"

2. **Ver Lista de Alunos Qualificados**
   - 🟢 Badge verde/azul/amarelo = Engagement (Muito Alto/Alto/Médio)
   - 📊 Badge cinza = Progresso (percentagem)
   - ✅ Todos já são qualificados!

3. **Filtros Disponíveis**
   - 🔍 **Pesquisar** por nome ou email
   - 📚 **Filtrar por turma** ("Todas" ou turma específica)
   - ✅ **Só alunos ativos** (ligado por defeito)

4. **Selecionar Alunos**
   - Clicar na checkbox ao lado do nome
   - Pode selecionar múltiplos alunos
   - Contador mostra quantos selecionados

5. **Adicionar Notas (Opcional)**
   - Ex: "Aluno muito ativo no Discord"
   - Ex: "Testemunho para landing page do OGI"

6. **Confirmar**
   - Clicar "Criar Pedidos"
   - Sistema confirma: "3 pedidos criados com sucesso!"

### 2️⃣ O Que Acontece Automaticamente

Quando criamos o pedido, o sistema:

1. **Cria o Registo** na base de dados
   - Status: PENDING (Pendente)
   - Data do pedido: Hoje
   - Aluno associado

2. **Aplica Tags Automáticas**
   - Se aluno tem **OGI** → Tag `OGI_TESTEMUNHO`
   - Se aluno tem **Clareza** → Tag `CLAREZA_TESTEMUNHO`
   - Se aluno tem **Discord** → Tag `COMUNIDADE_DISCORD_TESTEMUNHO`
   - Se tem **OGI + Clareza** → Ambas as tags!

3. **Agenda Sincronização**
   - Próximo dia, às 2h da manhã
   - Sistema sincroniza tags para Active Campaign
   - Active Campaign dispara email automático

### 3️⃣ Acompanhar o Pedido

1. **Ver Lista de Pedidos**
   - Gestão de Testemunhos → Ver Todos
   - Tabela com: Nome, Email, Status, Data

2. **Status Disponíveis**
   - 🟡 **PENDING** (Pendente) - Pedido criado, aguardando contacto
   - 🔵 **CONTACTED** (Contactado) - Email enviado
   - 🟢 **ACCEPTED** (Aceite) - Aluno aceitou gravar testemunho
   - 🔴 **DECLINED** (Recusado) - Aluno recusou
   - ✅ **COMPLETED** (Concluído) - Testemunho gravado e recebido
   - ⚫ **CANCELLED** (Cancelado) - Pedido cancelado

3. **Editar Status**
   - Clicar no pedido
   - Selecionar novo status
   - Adicionar notas/observações

### 4️⃣ Marcar como Concluído

Quando o aluno grava o testemunho:

1. **Abrir o Pedido**
   - Gestão de Testemunhos → Clicar no pedido

2. **Preencher Detalhes**
   - **Status:** COMPLETED
   - **Tipo:** Vídeo / Texto / Áudio / Imagem
   - **Link/Conteúdo:** URL do vídeo ou texto
   - **Avaliação:** 1-5 estrelas (quanto o aluno gostou do curso)
   - **Notas:** Observações adicionais

3. **Guardar**
   - Sistema atualiza status para COMPLETED
   - **Automaticamente:**
     - Remove tag antiga (ex: `OGI_TESTEMUNHO`)
     - Adiciona tag nova (ex: `OGI_TESTEMUNHO_CONCLUIDO`)
   - Na próxima sincronização:
     - Tags atualizadas no Active Campaign
     - Pode disparar email de agradecimento (se configurado)

---

## 🏷️ Sistema de Tags (Simples)

### O Que São Tags?

Tags são **etiquetas** que colocamos nos alunos para o Active Campaign saber quem é quem.

Pensa nisso como **post-its coloridos**:
- 🟡 Post-it amarelo = "Pedimos testemunho OGI"
- 🟢 Post-it verde = "Testemunho OGI concluído"

### Tags por Produto

#### OGI
- `OGI_TESTEMUNHO` → Pedido enviado, aguardando resposta
- `OGI_TESTEMUNHO_CONCLUIDO` → Testemunho gravado e recebido

#### Clareza
- `CLAREZA_TESTEMUNHO` → Pedido enviado, aguardando resposta
- `CLAREZA_TESTEMUNHO_CONCLUIDO` → Testemunho gravado e recebido

#### Comunidade Discord
- `COMUNIDADE_DISCORD_TESTEMUNHO` → Pedido enviado
- `COMUNIDADE_DISCORD_TESTEMUNHO_CONCLUIDO` → Testemunho recebido

### Como São Aplicadas?

```
João tem produto: OGI V1
   ↓
Criamos pedido de testemunho
   ↓
Sistema aplica tag: OGI_TESTEMUNHO
   ↓
DailyPipeline sincroniza (às 2h)
   ↓
Active Campaign recebe tag
   ↓
Email automático dispara

---

Aluno grava testemunho
   ↓
Marcamos como COMPLETED
   ↓
Sistema automaticamente:
   - Remove: OGI_TESTEMUNHO
   - Adiciona: OGI_TESTEMUNHO_CONCLUIDO
   ↓
DailyPipeline sincroniza (próximo dia)
   ↓
Active Campaign atualiza tags
   ↓
Email de agradecimento pode disparar (opcional)
```

### Alunos com Múltiplos Produtos

Se um aluno tem **OGI + Clareza**, recebe **ambas as tags**:

```
João tem: OGI V1 + Clareza Mensal
   ↓
Criamos pedido
   ↓
Tags aplicadas:
   - OGI_TESTEMUNHO
   - CLAREZA_TESTEMUNHO
   ↓
Quando concluir, recebe:
   - OGI_TESTEMUNHO_CONCLUIDO
   - CLAREZA_TESTEMUNHO_CONCLUIDO
```

---

## 📧 Integração com Active Campaign

### Como Funciona?

1. **Sincronização Automática**
   - Todos os dias às **2h da manhã**
   - Sistema lê tags da base de dados
   - Envia para Active Campaign via API
   - Demora ~5-10 segundos

2. **O Que é Sincronizado?**
   - Tags de pedido (ex: `OGI_TESTEMUNHO`)
   - Tags de conclusão (ex: `OGI_TESTEMUNHO_CONCLUIDO`)
   - Remoção de tags antigas quando há conclusão

3. **Automações no AC**
   - **Configuradas pela equipa de marketing**
   - Trigger: Tag aplicada (ex: `OGI_TESTEMUNHO`)
   - Ação: Enviar email após 1 dia
   - Follow-up: Reminder após 7 dias se não abrir
   - Goal: Remove tag quando clicar no link

### Exemplo de Email Automático

```
Assunto: Adoraríamos ouvir a tua experiência com o OGI! 🌟

Olá João!

Notámos que tens tido uma experiência fantástica com o curso OGI V1!
Com base no teu progresso e engagement, achamos que tens uma história
valiosa para partilhar.

Adoraríamos ouvir a tua opinião:
- O que mudou para ti desde que começaste o OGI?
- Qual foi o teu maior desafio e como o ultrapassaste?
- O que dirias a alguém que está a pensar fazer o curso?

Podes gravar um pequeno vídeo (2-3 min) ou escrever algumas linhas.

[GRAVAR VÍDEO TESTEMUNHO]  [ESCREVER TESTEMUNHO]

Obrigado desde já! 💙
Equipa OGI
```

---

## 📊 Estatísticas e Relatórios

### Dashboard de Testemunhos

O que podes ver:

1. **Total de Pedidos**
   - Quantos pedidos foram criados
   - Por status (Pendente, Aceite, Concluído, etc.)

2. **Taxa de Conversão**
   - % de pedidos que viraram testemunhos
   - Ex: 73% dos pedidos resultaram em testemunho

3. **Por Produto**
   - Quantos testemunhos de OGI
   - Quantos testemunhos de Clareza
   - Quantos testemunhos de Discord

4. **Tipos de Testemunho**
   - Vídeos: 15
   - Textos: 28
   - Áudios: 7

### Exemplo de Dados

```
📊 RESUMO GERAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total de Pedidos: 150

Por Status:
  🟡 Pendente: 45 (30%)
  🔵 Contactado: 20 (13%)
  🟢 Aceite: 15 (10%)
  ✅ Concluído: 55 (37%)
  🔴 Recusado: 10 (7%)
  ⚫ Cancelado: 5 (3%)

Taxa de Conversão: 73%
(Aceite + Concluído) / (Total - Cancelado)

Por Produto:
  📚 OGI: 89 pedidos → 55 concluídos (62%)
  🎯 Clareza: 45 pedidos → 28 concluídos (62%)
  💬 Discord: 16 pedidos → 8 concluídos (50%)

Tipos de Testemunho:
  🎥 Vídeo: 35
  📝 Texto: 28
  🎙️ Áudio: 12
```

---

## 🎬 Casos de Uso Práticos

### Caso 1: Campanha de Testemunhos para Landing Page

**Objetivo:** Recolher 20 testemunhos em vídeo para nova landing page do OGI

**Passos:**
1. Abrir wizard de testemunhos
2. Filtrar: Só OGI (pode filtrar por turma se necessário)
3. Ordenar por engagement (mais altos primeiro)
4. Selecionar top 30 alunos (para ter margem)
5. Notas: "Testemunho para landing page - pedir vídeo curto"
6. Criar pedidos
7. Sistema envia emails automaticamente
8. Acompanhar no dashboard
9. Quando recebermos 20 vídeos, marcar como COMPLETED
10. Cancelar pedidos restantes se necessário

**Resultado Esperado:**
- ~20-24 testemunhos recebidos (taxa 70%)
- Timeframe: 2-3 semanas
- Tudo automático via AC

### Caso 2: Follow-up de Alunos Satisfeitos

**Objetivo:** Identificar alunos muito satisfeitos para possíveis case studies

**Passos:**
1. Criar pedidos para alunos com **Engagement Muito Alto**
2. Quando marcarem como ACCEPTED, contactar pessoalmente
3. Propor entrevista mais detalhada
4. Marcar como COMPLETED quando receber
5. Tag `OGI_TESTEMUNHO_CONCLUIDO` pode disparar email de agradecimento

### Caso 3: Testemunhos Sazonais (Ex: Final de Ano)

**Objetivo:** Campanha especial de final de ano

**Passos:**
1. Criar pedidos em massa (100+ alunos)
2. Active Campaign envia emails personalizados
3. Assunto especial: "Reflexão de final de ano"
4. Acompanhar respostas
5. Selecionar melhores para publicação

---

## ⚠️ Boas Práticas

### ✅ DO (Fazer)

1. **Selecionar alunos qualificados**
   - Só pedir a quem tem engagement/progresso alto
   - Aumenta taxa de resposta

2. **Adicionar notas descritivas**
   - Ajuda a lembrar porquê pedimos
   - Ex: "Aluno mencionou transformação de vida no Discord"

3. **Acompanhar regularmente**
   - Ver dashboard semanalmente
   - Follow-up manual se necessário

4. **Marcar como COMPLETED quando receber**
   - Mantém sistema atualizado
   - Permite enviar email de agradecimento

5. **Preencher todos os detalhes**
   - Tipo, link, avaliação
   - Facilita uso posterior

### ❌ DON'T (Não Fazer)

1. **Não pedir a alunos com engagement baixo**
   - Sistema já filtra automaticamente
   - Mas se forçar, taxa de resposta será baixa

2. **Não criar pedidos duplicados**
   - Verificar se aluno já tem pedido ativo
   - Sistema permite, mas não é boa prática

3. **Não esquecer de atualizar status**
   - Se aluno recusar, marcar como DECLINED
   - Se cancelar, marcar como CANCELLED

4. **Não apagar pedidos**
   - Marcar como CANCELLED se necessário
   - Manter histórico

---

## 🆘 Problemas Comuns e Soluções

### "Não vejo nenhum aluno na lista"

**Possíveis Causas:**
- Todos os alunos têm engagement/progresso baixo
- Filtros muito restritivos (ex: turma específica pequena)

**Solução:**
- Verificar filtros aplicados
- Tentar "Todas as turmas"
- Verificar se produto tem alunos ativos

### "Criei pedido mas aluno não recebeu email"

**Possíveis Causas:**
- Sincronização ainda não ocorreu (acontece às 2h)
- Automação não configurada no AC
- Email do aluno incorreto

**Solução:**
- Aguardar até próximo dia (após 2h)
- Verificar configuração no AC
- Confirmar email do aluno

### "Tag não aparece no Active Campaign"

**Possíveis Causas:**
- Sincronização pendente
- Erro na API do AC
- Tag não foi criada no AC

**Solução:**
- Aguardar próxima sincronização
- Verificar logs do DailyPipeline
- Criar tag manualmente no AC se necessário

### "Quero cancelar pedido já enviado"

**Solução:**
1. Abrir pedido
2. Status: CANCELLED
3. Notas: Motivo do cancelamento
4. Guardar
5. Tag será mantida, mas pedido fica inativo

---

## 📅 Timeline Típico

### Exemplo Completo

```
DIA 1 (Segunda-feira, 10h)
━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Equipa cria 20 pedidos de testemunho
📝 Status: PENDING
🏷️  Tags aplicadas na BD

DIA 2 (Terça-feira, 2h da manhã)
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 DailyPipeline executa Step 6
🏷️  Tags sincronizadas para Active Campaign
📧 Active Campaign dispara emails (às 10h)
📬 20 alunos recebem email

DIA 2-5 (Terça a Sexta)
━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 Alunos leem emails
✅ 12 alunos aceitam (60%)
🔴 3 alunos recusam
⏳ 5 ainda não responderam

DIA 5-10 (Sexta a Quarta seguinte)
━━━━━━━━━━━━━━━━━━━━━━━━━━
🎥 Alunos gravam testemunhos
📧 Follow-up automático para os 5 pendentes
✅ Mais 2 aceitam (total 14)

DIA 10-15
━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 Recebemos 14 testemunhos
👤 Equipa marca como COMPLETED
🏷️  Tags atualizadas: _TESTEMUNHO → _TESTEMUNHO_CONCLUIDO

DIA 16 (2h da manhã)
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 DailyPipeline sincroniza novamente
🏷️  Tags de conclusão no Active Campaign
📧 Email de agradecimento enviado (opcional)

RESULTADO FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Taxa de conversão: 70% (14 de 20)
🎥 14 testemunhos recebidos
💚 14 alunos com tag _CONCLUIDO
📊 Dados prontos para análise
```

---

## 🎓 Glossário

| Termo | Significado | Exemplo |
|-------|-------------|---------|
| **Engagement** | Nível de atividade do aluno | Alto, Médio, Baixo |
| **Progress** | Progresso no curso | 78%, 45%, 12% |
| **Tag** | Etiqueta no Active Campaign | OGI_TESTEMUNHO |
| **Status** | Estado do pedido | PENDING, COMPLETED |
| **DailyPipeline** | Processo automático diário | Sincroniza tags às 2h |
| **Sync** | Sincronização | Enviar dados para AC |
| **AC** | Active Campaign | Plataforma de email |
| **Wizard** | Assistente passo-a-passo | Criar pedido de testemunho |
| **Badge** | Etiqueta visual colorida | 🟢 Alto (65) |
| **UserProduct** | Ligação aluno-produto | João tem OGI V1 |

---

## ✨ Resumo Final

### O Que Fizemos?

Criámos um sistema completo que:
1. ✅ Identifica alunos qualificados automaticamente
2. ✅ Aplica tags por produto (OGI, Clareza, Discord)
3. ✅ Sincroniza com Active Campaign diariamente
4. ✅ Envia emails automáticos
5. ✅ Gere ciclo completo: pedido → conclusão
6. ✅ Atualiza tags quando testemunho é concluído
7. ✅ Fornece dashboard com estatísticas

### Benefícios

- 📈 **Taxa de conversão 3x maior** (20% → 60-70%)
- ⏱️ **Poupança de tempo:** Automação completa
- 🎯 **Targeting melhor:** Só alunos engajados
- 📊 **Visibilidade:** Dashboard com métricas
- 🔄 **Escalável:** Pode processar centenas de pedidos
- 💡 **Inteligente:** Tags automáticas por produto

### Próximos Passos

1. **Configurar automações no Active Campaign**
   - Email de pedido de testemunho
   - Email de agradecimento (conclusão)
   - Follow-ups

2. **Criar templates de email**
   - Personalizado por produto
   - Tom amigável e motivador

3. **Definir goals no AC**
   - Link clicado = remover tag pedido
   - Testemunho enviado = adicionar tag conclusão

4. **Monitorizar resultados**
   - Acompanhar dashboard semanalmente
   - Ajustar critérios se necessário

---

**Data:** 2026-01-17
**Para:** Equipa Não-Técnica
**Versão:** 1.0
