"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.once = exports.name = void 0;
exports.execute = execute;
const AnalyticsCollector_1 = require("../services/AnalyticsCollector");
const logger_1 = require("../utils/logger");
exports.name = 'presenceUpdate';
exports.once = false;
async function execute(oldPresence, newPresence) {
    try {
        // Verificar se é o servidor correto
        if (newPresence.guild?.id !== process.env.DISCORD_GUILD_ID)
            return;
        // Ignorar bots
        if (newPresence.user?.bot)
            return;
        const userId = newPresence.user?.id;
        const username = newPresence.user?.username;
        if (!userId || !username)
            return;
        // Obter displayName do membro
        const member = newPresence.member;
        const displayName = member?.displayName || username;
        // Verificar se houve mudança de status
        const oldStatus = oldPresence?.status || 'offline';
        const newStatus = newPresence.status;
        if (oldStatus !== newStatus) {
            // Preparar dados das atividades
            const activities = newPresence.activities.map(activity => ({
                name: activity.name,
                type: activity.type,
                details: activity.details || null,
                state: activity.state || null,
            }));
            // Dados da presença para analytics
            const presenceData = {
                userId,
                username,
                status: newStatus,
                timestamp: new Date(),
                guildId: newPresence.guild.id,
            };
            // Salvar mudança de presença
            await AnalyticsCollector_1.AnalyticsCollector.savePresenceData(presenceData);
            // Log para debug
            if (process.env.NODE_ENV === 'development') {
                logger_1.logger.debug(`👤 ${username} mudou status: ${oldStatus} → ${newStatus}`);
                if (activities.length > 0) {
                    logger_1.logger.debug(`🎮 Atividades: ${activities.map(a => a.name).join(', ')}`);
                }
            }
        }
        // Verificar mudanças nas atividades mesmo sem mudança de status
        else if (newPresence.activities.length !== (oldPresence?.activities.length || 0)) {
            const activities = newPresence.activities.map(activity => ({
                name: activity.name,
                type: activity.type,
                details: activity.details || null,
                state: activity.state || null,
            }));
            // Apenas registrar mudança de atividade se for significativa
            if (activities.length > 0) {
                const presenceData = {
                    userId,
                    username,
                    status: newStatus,
                    timestamp: new Date(),
                    guildId: newPresence.guild.id,
                };
                await AnalyticsCollector_1.AnalyticsCollector.savePresenceData(presenceData);
                if (process.env.NODE_ENV === 'development') {
                    logger_1.logger.debug(`🎮 ${username} mudou atividades: ${activities.map(a => a.name).join(', ')}`);
                }
            }
        }
    }
    catch (error) {
        logger_1.logger.error('❌ Erro ao processar presenceUpdate:', error);
    }
}
// 📊 DADOS QUE ESTE EVENT RECOLHE:
// ✅ Tempo online/offline dos utilizadores
// ✅ Padrões de atividade (jogos, streaming, etc.)
// ✅ Horários de maior presença online
// ✅ Distribuição de status (online, idle, dnd, offline)
// ✅ Atividades mais populares na comunidade
// ✅ Tempo médio de sessão online
// ✅ Frequência de mudanças de status
