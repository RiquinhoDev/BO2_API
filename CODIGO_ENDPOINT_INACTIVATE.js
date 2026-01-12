// ════════════════════════════════════════════════════════════
// ADICIONAR ESTE CÓDIGO NO FICHEIRO DE ROTAS DO DISCORD BOT
// (mesmo ficheiro onde está o /assignRole)
// ════════════════════════════════════════════════════════════

router.post('/inactivateRole', async (req, res) => {
    const { discordId } = req.body;

    console.log("Inativar role no Discord");
    if (!discordId) {
        return res.status(400).json({ message: 'Discord ID é obrigatório.' });
    }

    try {
        // Remover o cargo "Ativo"
        const removeActiveResponse = await updateDiscordRole(discordId, null, 'Ativo');
        if (!removeActiveResponse.success) {
            return res.status(500).json({ message: `Erro ao remover role Ativo: ${removeActiveResponse.error}` });
        }
        console.log("removeActiveResponse", removeActiveResponse);

        // Adiciona um atraso de 2 segundos
        await sleep(2000);

        // Remover o cargo "Iniciado"
        const removeInitiatedResponse = await updateDiscordRole(discordId, null, 'Iniciado');
        if (!removeInitiatedResponse.success) {
            return res.status(500).json({ message: `Erro ao remover role Iniciado: ${removeInitiatedResponse.error}` });
        }
        console.log("removeInitiatedResponse", removeInitiatedResponse);

        // Adiciona um atraso de 2 segundos
        await sleep(2000);

        // Adicionar o cargo "Inativo"
        const addInactiveResponse = await updateDiscordRole(discordId, 'Inativo', null);
        if (!addInactiveResponse.success) {
            return res.status(500).json({ message: `Erro ao atribuir role Inativo: ${addInactiveResponse.error}` });
        }
        console.log("addInactiveResponse", addInactiveResponse);

        return res.status(200).json({ message: 'Usuário inativado com sucesso no Discord!' });
    } catch (error) {
        console.error('Erro ao inativar roles no Discord:', error.message);
        return res.status(500).json({ message: 'Erro interno ao inativar roles.', details: error.message });
    }
});
