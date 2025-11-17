import { VoiceState } from 'discord.js';
import { AnalyticsCollector } from '../services/AnalyticsCollector';
import { logger } from '../utils/logger';

export const name = 'voiceStateUpdate';
export const once = false;

export async function execute(oldState: VoiceState, newState: VoiceState) {
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
      await AnalyticsCollector.saveVoiceActivity({
        userId: userId!,
        username: username,
        displayName: displayName,  // ✅ FIX: Campo adicionado
        action: 'join',
        channelId: newState.channelId,
        channelName: newState.channel?.name,
        timestamp,
        guildId
      });

      logger.info(`🎤 ${displayName} entrou no canal de voz: ${newState.channel?.name}`);
    }
    
    // Usuário saiu de um canal de voz
    else if (oldState.channelId && !newState.channelId) {
      await AnalyticsCollector.saveVoiceActivity({
        userId: userId!,
        username: username,
        displayName: displayName,  // ✅ FIX: Campo adicionado
        action: 'leave',
        channelId: oldState.channelId,
        channelName: oldState.channel?.name,
        previousChannelId: oldState.channelId,
        timestamp,
        guildId
      });

      logger.info(`🚪 ${displayName} saiu do canal de voz: ${oldState.channel?.name}`);
    }
    
    // Usuário mudou de canal de voz
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      await AnalyticsCollector.saveVoiceActivity({
        userId: userId!,
        username: username,
        displayName: displayName,  // ✅ FIX: Campo adicionado
        action: 'move',
        channelId: newState.channelId,
        channelName: newState.channel?.name,
        previousChannelId: oldState.channelId,
        timestamp,
        guildId
      });

      logger.info(`🔄 ${displayName} mudou de ${oldState.channel?.name} para ${newState.channel?.name}`);
    }

  } catch (error) {
    logger.error('❌ Erro ao processar voice state update:', {
      error: error.message,
      stack: error.stack,
      oldChannelId: oldState.channelId,
      newChannelId: newState.channelId,
      userId: oldState.member?.user.id || newState.member?.user.id,
      timestamp: new Date().toISOString()
    });
  }
}