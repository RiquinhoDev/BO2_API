# 🎮 Instruções - Integração Discord Bot para Reativação de Alunos

## ✅ ALTERAÇÕES IMPLEMENTADAS

### 📝 Arquivo Modificado

**Arquivo**: `src/controllers/classes.controller.ts`
**Função**: `revertInactivation` (linhas 1409-1447)

### 🔧 O que foi adicionado

Foi adicionado código para chamar a API Riquinho (Discord Bot) quando uma inativação é revertida manualmente, restaurando os papéis "Ativo" no Discord.

**Funcionalidade:**
1. Busca os Discord IDs do usuário reativado
2. Chama o endpoint `/add-roles` da API Riquinho para cada Discord ID
3. Remove papel "Inativo" e adiciona papel "Ativo"
4. Registra logs de sucesso/falha
5. Usa `Promise.allSettled` para não bloquear a resposta se algum Discord ID falhar

---

## ⚙️ CONFIGURAÇÃO NECESSÁRIA

### 1. Adicionar Variável de Ambiente

Você precisa adicionar a seguinte variável ao arquivo `.env` do BO2_API:

```env
# Discord Bot (API Riquinho)
DISCORD_BOT_URL=http://localhost:3001
```

**IMPORTANTE**: Ajuste a URL conforme o ambiente:

| Ambiente | URL |
|----------|-----|
| **Desenvolvimento Local** | `http://localhost:3001` |
| **Produção** | `https://api.serriquinho.com` |
| **Staging** | URL do servidor de staging |

### 2. Localização do arquivo .env

```
c:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API\.env
```

### 3. Como adicionar

Abra o arquivo `.env` e adicione no final (ou na seção de URLs):

```env
# ========================================
# DISCORD BOT INTEGRATION
# ========================================
DISCORD_BOT_URL=http://localhost:3001
```

---

## 🧪 COMO TESTAR

### 1. Teste Local (Desenvolvimento)

#### Pré-requisitos:
- API Riquinho (Discord Bot) rodando em `http://localhost:3001`
- BO2_API rodando
- MongoDB conectado
- Discord Bot autenticado

#### Passos:

1. **Inativar um aluno via Frontend:**
   ```
   Gerir Alunos > Inativar Alunos > Nova Inativação
   - Selecione uma turma ativa
   - Crie a lista de inativação
   - Verifique no Discord que o aluno perdeu o papel "Ativo"
   ```

2. **Reverter a inativação:**
   ```
   Gerir Alunos > Inativar Alunos > Histórico de Inativações
   - Encontre a lista criada (status: COMPLETED)
   - Clique em "Reverter"
   - Forneça um motivo (ex: "Teste de reversão")
   - Confirme
   ```

3. **Verificar resultados:**

   **No Frontend:**
   - ✅ Toast de sucesso aparece
   - ✅ Status da lista muda para REVERSED

   **No Discord:**
   - ✅ Aluno recupera o papel "Ativo"
   - ✅ Aluno perde o papel "Inativo"

   **Logs do BO2_API (console):**
   ```
   ✅ Discord: Papéis restaurados para usuario@email.com
   ```

   **Banco de Dados:**
   - ✅ `User.status` = 'ACTIVE'
   - ✅ `User.discord.isActive` = true
   - ✅ `UserProduct.status` = 'ACTIVE'
   - ✅ Novo registro em `UserHistory` com changeType: 'STATUS_CHANGE'

### 2. Teste de Erro (sem Discord Bot rodando)

1. Pare a API Riquinho (Discord Bot)
2. Tente reverter uma inativação
3. **Resultado esperado:**
   - ⚠️ Warning no console: `Discord: Erro ao restaurar papéis`
   - ✅ A reversão ainda completa com sucesso (só o Discord falha)
   - ✅ Response 200 retorna normalmente

**Isso garante que falhas no Discord não bloqueiam a operação principal**

---

## 📊 FLUXO COMPLETO

```
1. FRONTEND (Backoffice)
   └─ Admin clica "Reverter" numa InactivationList
      └─ POST /api/classes/inactivationLists/revert/:listId
         └─ Body: { reason: "...", userId: "admin" }

2. BO2_API (classes.controller.ts)
   └─ Busca registro UserHistory pelo ID
   └─ Valida se inativação existe e não foi revertida
   └─ Atualiza User:
      ├─ status = 'ACTIVE'
      ├─ discord.isActive = true
      └─ combined.status = 'ACTIVE'
   └─ Atualiza UserProduct.status = 'ACTIVE'
   └─ Cria novo UserHistory (changeType: STATUS_CHANGE)

   └─ 🆕 CHAMA DISCORD BOT:
      ├─ Busca discord.discordIds do usuário
      ├─ Para cada Discord ID:
      │  └─ POST ${DISCORD_BOT_URL}/add-roles
      │     └─ Body: { userId: discordId, reason: "..." }
      └─ Aguarda todas as chamadas (Promise.allSettled)

3. API RIQUINHO (Discord Bot)
   └─ Recebe POST /add-roles
   └─ Adiciona à fila: userRoleUpdateQueue
   └─ processQueue() executa:
      ├─ Fetch guild pelo ID (1179187507875827782)
      ├─ Fetch member pelo Discord ID
      ├─ Remove papel "Inativo" (1198928651161452544)
      ├─ Adiciona papel "Ativo" (1198928474035994624)
      └─ Aguarda 1s (rate limiting)

4. DISCORD API
   └─ Atualiza papéis do usuário no servidor

5. RESULTADO
   └─ Response 200 para Frontend
   └─ Aluno reativado em todas as plataformas
   └─ Papéis atualizados no Discord
```

---

## 🐛 TROUBLESHOOTING

### Problema: "Discord: Erro ao restaurar papéis"

**Possíveis causas:**
1. `DISCORD_BOT_URL` não configurado no `.env`
2. API Riquinho não está rodando
3. URL incorreta (verifique porta)
4. Discord ID do usuário inválido

**Solução:**
```bash
# Verificar se API Riquinho está rodando
curl http://localhost:3001/health

# Verificar logs do BO2_API
# Deve mostrar a URL sendo chamada
```

### Problema: "Falha ao restaurar roles para {discordId}"

**Possíveis causas:**
1. Discord ID não existe no servidor
2. Discord Bot não tem permissões
3. Rate limit do Discord

**Solução:**
- Verifique se o Discord ID está no servidor
- Verifique permissões do bot (Manage Roles)
- Aguarde 1 minuto e tente novamente

### Problema: Reversão completa mas Discord não atualiza

**Possíveis causas:**
1. Usuário não tem Discord IDs no banco de dados
2. `platforms` não inclui 'discord' ou 'all'

**Solução:**
```javascript
// Verificar no MongoDB:
db.users.findOne({ email: "usuario@exemplo.com" })
// Deve ter: discord.discordIds: ["123456789"]

// Verificar UserHistory:
db.userhistories.findOne({ _id: ObjectId("...") })
// Deve ter: metadata.platforms: ['all'] ou ['discord']
```

---

## 📈 LOGS E MONITORIZAÇÃO

### Logs de Sucesso

```
ℹ️ Discord: Usuário usuario@email.com possui 2 Discord IDs
✅ Discord: Papéis restaurados para usuario@email.com
✅ Discord: Papéis restaurados para usuario@email.com
```

### Logs de Avisos

```
⚠️ Discord: Falha ao restaurar roles para 123456789
⚠️ Discord: Erro ao processar 123456789: Connection timeout
ℹ️ Discord: Usuário sem@discord.com não possui Discord IDs
```

### Logs de Erro (não bloqueantes)

```
⚠️ Discord: Erro ao restaurar papéis: fetch failed
```

---

## ✅ CHECKLIST DE VALIDAÇÃO

Antes de considerar a implementação completa, verifique:

- [ ] Variável `DISCORD_BOT_URL` adicionada ao `.env`
- [ ] API Riquinho rodando na porta correta
- [ ] Teste de reversão completo com sucesso
- [ ] Papéis atualizados no Discord
- [ ] Logs aparecem corretamente no console
- [ ] Erro no Discord não bloqueia a reversão
- [ ] UserHistory registra a reativação
- [ ] Frontend exibe toast de sucesso

---

## 🔄 COMPARAÇÃO: Antes vs Depois

### ANTES (Lacuna)

```typescript
// Linha 1407 (antes das alterações)
await UserHistory.create({
  changeType: 'STATUS_CHANGE',
  previousValue: { status: 'INACTIVE' },
  newValue: { status: 'ACTIVE' },
  // ...
})

res.json({ success: true, message: 'Inativação revertida com sucesso' })
// ❌ Discord não era atualizado
```

### DEPOIS (Completo)

```typescript
// Linha 1407-1447 (após alterações)
await UserHistory.create({
  changeType: 'STATUS_CHANGE',
  previousValue: { status: 'INACTIVE' },
  newValue: { status: 'ACTIVE' },
  // ...
})

// 🆕 Restaurar papéis no Discord
if (platforms.includes('discord') || platforms.includes('all')) {
  const user = await User.findById(inactivation.userId).lean()
  const discordIds = user?.discord?.discordIds || []

  if (discordIds.length > 0 && process.env.DISCORD_BOT_URL) {
    const discordPromises = discordIds.map(async (discordId: string) => {
      await fetch(`${process.env.DISCORD_BOT_URL}/add-roles`, {
        method: 'POST',
        body: JSON.stringify({ userId: discordId, reason })
      })
    })

    await Promise.allSettled(discordPromises)
  }
}

res.json({ success: true, message: 'Inativação revertida com sucesso' })
// ✅ Discord atualizado automaticamente
```

---

## 📚 DOCUMENTAÇÃO RELACIONADA

- [Análise do Discord Bot](./ANALISE_DISCORD_BOT.md) - Análise completa do sistema
- [API Riquinho Endpoints](../API/README.md) - Documentação dos endpoints
- [Sistema de Inativação](./SISTEMA_INATIVACAO.md) - Fluxo completo de inativação

---

## 🎯 PRÓXIMOS PASSOS RECOMENDADOS

1. **Adicionar retry automático**: Se a chamada ao Discord falhar, tentar 3x com backoff exponencial
2. **Dashboard de monitorização**: Criar dashboard para ver quantas reativações falharam no Discord
3. **Webhook de notificação**: Notificar admin se Discord Bot estiver offline
4. **Logs estruturados**: Usar Winston ou similar para logs estruturados
5. **Metrics**: Adicionar métricas (Prometheus) para monitorar taxa de sucesso

---

**Data da Implementação**: 2026-01-11
**Desenvolvido por**: Claude Code (Anthropic)
**Testado em**: Ambiente de desenvolvimento
**Status**: ✅ Implementado e pronto para testes
