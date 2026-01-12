# Proposta: Endpoint para Inativar Usuários no Discord

## Problema Identificado

O endpoint atual `/discordAuth/assignRole` apenas **ATIVA** usuários:
- Remove role "A validar"
- Adiciona role "Iniciado"
- Adiciona role "Ativo"

**Não existe um endpoint para INATIVAR** que:
- Remova roles "Ativo" e "Iniciado"
- Adicione role "Inativo"

## Solução Proposta

Criar um novo endpoint na API do Discord Bot (https://api.serriquinho.com):

### Endpoint: `POST /discordAuth/inactivateRole`

**Body:**
```json
{
  "discordId": "924421751784497252",
  "reason": "Inativação manual/automática" // opcional
}
```

**Resposta de Sucesso (200):**
```json
{
  "message": "Usuário inativado com sucesso!",
  "discordId": "924421751784497252",
  "rolesRemoved": ["Ativo", "Iniciado"],
  "rolesAdded": ["Inativo"]
}
```

**Resposta de Erro (500):**
```json
{
  "message": "Erro ao inativar usuário",
  "details": "Erro específico"
}
```

## Implementação no Discord Bot

Adicionar no ficheiro de rotas do Discord (similar ao `/assignRole`):

```javascript
router.post('/inactivateRole', async (req, res) => {
    const { discordId, reason } = req.body;

    console.log("Inativar usuário no Discord");
    if (!discordId) {
        return res.status(400).json({ message: 'Discord ID é obrigatório.' });
    }

    try {
        // Remover role "Ativo"
        const removeActiveResponse = await updateDiscordRole(discordId, null, 'Ativo');
        if (!removeActiveResponse.success) {
            return res.status(500).json({
                message: `Erro ao remover role Ativo: ${removeActiveResponse.error}`
            });
        }
        console.log("removeActiveResponse", removeActiveResponse);

        // Aguarda 2 segundos
        await sleep(2000);

        // Remover role "Iniciado"
        const removeInitiatedResponse = await updateDiscordRole(discordId, null, 'Iniciado');
        if (!removeInitiatedResponse.success) {
            return res.status(500).json({
                message: `Erro ao remover role Iniciado: ${removeInitiatedResponse.error}`
            });
        }
        console.log("removeInitiatedResponse", removeInitiatedResponse);

        // Aguarda 2 segundos
        await sleep(2000);

        // Adicionar role "Inativo"
        const addInactiveResponse = await updateDiscordRole(discordId, 'Inativo', null);
        if (!addInactiveResponse.success) {
            return res.status(500).json({
                message: `Erro ao adicionar role Inativo: ${addInactiveResponse.error}`
            });
        }
        console.log("addInactiveResponse", addInactiveResponse);

        return res.status(200).json({
            message: 'Usuário inativado com sucesso!',
            discordId,
            rolesRemoved: ['Ativo', 'Iniciado'],
            rolesAdded: ['Inativo']
        });
    } catch (error) {
        console.error('Erro ao inativar usuário no Discord:', error.message);
        return res.status(500).json({
            message: 'Erro interno ao inativar usuário.',
            details: error.message
        });
    }
});
```

## Atualização no BO2_API

Após criar o endpoint, atualizar o [classes.controller.ts:1296](c:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API\src\controllers\classes.controller.ts#L1296):

```typescript
// ANTES:
await axios.post(`${process.env.DISCORD_BOT_URL}/discordAuth/assignRole`, {
  discordId: discordId,
  action: 'inactivate'
}, { timeout: 10000 })

// DEPOIS:
await axios.post(`${process.env.DISCORD_BOT_URL}/discordAuth/inactivateRole`, {
  discordId: discordId,
  reason: `Inativado por turma: ${classData.name}`
}, { timeout: 15000 })
```

## Próximos Passos

1. ✅ Identificar problema (COMPLETO)
2. ⏳ Criar endpoint `/discordAuth/inactivateRole` no Discord Bot
3. ⏳ Atualizar `classes.controller.ts` para usar novo endpoint
4. ⏳ Testar fluxo completo de inativação
5. ⏳ Verificar que roles são atualizados corretamente no Discord

## Notas Técnicas

- O endpoint deve estar no mesmo ficheiro de rotas que `/assignRole`
- Usar a mesma função `updateDiscordRole()` que já existe
- Manter delays de 2-5 segundos entre operações (rate limiting do Discord)
- Adicionar logs detalhados para debugging
