"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.once = exports.name = void 0;
exports.execute = execute;
const AnalyticsCollector_1 = require("../services/AnalyticsCollector");
const logger_1 = require("../utils/logger");
exports.name = 'voiceStateUpdate';
exports.once = false;
async function execute(oldState, newState) {
    try {
        const userId = newState.member?.user.id || oldState.member?.user.id;
        const username = newState.member?.user.username || oldState.member?.user.username;
        // ✅ FIX: Garantir que displayName nunca seja undefined
        const displayName = newState.member?.displayName ||
            newState.member?.user.displayName ||
            newState.member?.user.username ||
            oldState.member?.displayName ||
            oldState.member?.user.displayName ||
            oldState.member?.user.username ||
            'Unknown User';
        const guildId = newState.guild.id;
        const timestamp = new Date();
        // Usuário entrou num canal de voz
        if (!oldState.channelId && newState.channelId) {
            await AnalyticsCollector_1.AnalyticsCollector.saveVoiceActivity({
                userId: userId,
                username: username,
                displayName: displayName, // ✅ FIX: Campo adicionado
                action: 'join',
                channelId: newState.channelId,
                channelName: newState.channel?.name,
                timestamp,
                guildId
            });
            logger_1.logger.info(`🎤 ${displayName} entrou no canal de voz: ${newState.channel?.name}`);
        }
        // Usuário saiu de um canal de voz
        else if (oldState.channelId && !newState.channelId) {
            await AnalyticsCollector_1.AnalyticsCollector.saveVoiceActivity({
                userId: userId,
                username: username,
                displayName: displayName, // ✅ FIX: Campo adicionado
                action: 'leave',
                channelId: oldState.channelId,
                channelName: oldState.channel?.name,
                previousChannelId: oldState.channelId,
                timestamp,
                guildId
            });
            logger_1.logger.info(`🚪 ${displayName} saiu do canal de voz: ${oldState.channel?.name}`);
        }
        // Usuário mudou de canal de voz
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            await AnalyticsCollector_1.AnalyticsCollector.saveVoiceActivity({
                userId: userId,
                username: username,
                displayName: displayName, // ✅ FIX: Campo adicionado
                action: 'move',
                channelId: newState.channelId,
                channelName: newState.channel?.name,
                previousChannelId: oldState.channelId,
                timestamp,
                guildId
            });
            logger_1.logger.info(`🔄 ${displayName} mudou de ${oldState.channel?.name} para ${newState.channel?.name}`);
        }
    }
    catch (error) {
        logger_1.logger.error('❌ Erro ao processar voice state update:', {
            error: error.message,
            stack: error.stack,
            oldChannelId: oldState.channelId,
            newChannelId: newState.channelId,
            userId: oldState.member?.user.id || newState.member?.user.id,
            timestamp: new Date().toISOString()
        });
    }
}
