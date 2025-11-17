import { Presence } from 'discord.js';
import { AnalyticsCollector, PresenceData } from '../services/AnalyticsCollector';
import { logger } from '../utils/logger';

export const name = 'presenceUpdate';
export const once = false;

export async function execute(oldPresence: Presence | null, newPresence: Presence): Promise<void> {
  try {
    // Verificar se é o servidor correto
    if (newPresence.guild?.id !== process.env.DISCORD_GUILD_ID) return;

    // Ignorar bots
    if (newPresence.user?.bot) return;

    const userId = newPresence.user?.id;
    const username = newPresence.user?.username;
    
    if (!userId || !username) return;

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
      const presenceData: PresenceData = {
        userId,
        username,
        status: newStatus,
        timestamp: new Date(),
        guildId: newPresence.guild!.id,
      };

      // Salvar mudança de presença
      await AnalyticsCollector.savePresenceData(presenceData);

      // Log para debug
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`👤 ${username} mudou status: ${oldStatus} → ${newStatus}`);
        
        if (activities.length > 0) {
          logger.debug(`🎮 Atividades: ${activities.map(a => a.name).join(', ')}`);
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
        const presenceData: PresenceData = {
          userId,
          username,
          status: newStatus,
          timestamp: new Date(),
          guildId: newPresence.guild!.id,
        };

        await AnalyticsCollector.savePresenceData(presenceData);

        if (process.env.NODE_ENV === 'development') {
          logger.debug(`🎮 ${username} mudou atividades: ${activities.map(a => a.name).join(', ')}`);
        }
      }
    }

  } catch (error) {
    logger.error('❌ Erro ao processar presenceUpdate:', error);
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
