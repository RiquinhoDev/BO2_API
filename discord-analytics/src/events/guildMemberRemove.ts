import { GuildMember, PartialGuildMember } from 'discord.js';
import { AnalyticsCollector } from '../services/AnalyticsCollector';
import { logger } from '../utils/logger';

export const name = 'guildMemberRemove';
export const once = false;

export async function execute(member: GuildMember | PartialGuildMember): Promise<void> {
  try {
    // Verificar se é o servidor correto
    if (member.guild.id !== process.env.DISCORD_GUILD_ID) return;

    // Ignorar bots
    if (member.user?.bot) {
      logger.info(`🤖 Bot removido: ${member.user.username}`);
      return;
    }

    const userId = member.id;
    const username = member.user?.username || 'Unknown';
    const displayName = member.displayName || username;

    // Calcular tempo de permanência no servidor
    const joinedAt = member.joinedAt;
    const leftAt = new Date();
    const timeInServer = joinedAt ? leftAt.getTime() - joinedAt.getTime() : null;
    const daysInServer = timeInServer ? Math.floor(timeInServer / (1000 * 60 * 60 * 24)) : null;

    const memberData = {
      userId,
      username,
      displayName,
      leftAt,
      joinedAt: joinedAt || null,
      timeInServer: timeInServer || null,
      daysInServer: daysInServer || null,
      guildId: member.guild.id,
      roles: member.roles?.cache.map(role => ({
        id: role.id,
        name: role.name,
      })) || [],
      wasKicked: false, // Por padrão assumimos que saiu voluntariamente
      wasBanned: false,
    };

    // Salvar dados da saída do membro
    await AnalyticsCollector.saveMemberLeave(memberData);

    // Atualizar estatísticas do servidor
    await AnalyticsCollector.updateServerMemberCount(member.guild.id, 'remove');

    // Calcular engagement do usuário nos últimos dias
    try {
      const recentEngagement = await AnalyticsCollector.getUserRecentEngagement(userId, 7);
      
      if (recentEngagement) {
        await AnalyticsCollector.saveMemberRetentionData({
          userId,
          username,
          leftAt,
          daysInServer: daysInServer || 0,
          lastEngagementScore: recentEngagement.totalScore,
          lastActiveDate: recentEngagement.lastActiveDate,
          reasonCategory: recentEngagement.totalScore < 5 ? 'low_engagement' : 'unknown',
          guildId: member.guild.id,
        });
      }
    } catch (engagementError) {
      logger.warn('⚠️ Erro ao calcular engagement na saída do membro:', engagementError);
    }

    // Log da saída
    logger.info(`👋 Membro saiu: ${username} (${userId})`);
    
    if (daysInServer !== null) {
      if (daysInServer < 1) {
        logger.warn(`⚠️ Saída rápida: ${username} ficou menos de 1 dia`);
        
        // Salvar alerta de retenção
        await AnalyticsCollector.saveRetentionAlert({
          type: 'quick_leave',
          userId,
          username,
          details: {
            daysInServer,
            timeInServerHours: Math.floor((timeInServer || 0) / (1000 * 60 * 60)),
          },
          timestamp: leftAt,
          guildId: member.guild.id,
        });
      } else if (daysInServer < 7) {
        logger.info(`📊 Saída precoce: ${username} ficou ${daysInServer} dias`);
      }
    }

    // Log para debug
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`📊 Saída analytics:`, {
        username,
        daysInServer,
        rolesCount: memberData.roles.length,
        joinedAt: joinedAt?.toISOString(),
        leftAt: leftAt.toISOString(),
      });
    }

  } catch (error) {
    logger.error('❌ Erro ao processar guildMemberRemove:', error);
  }
}

// 📊 DADOS QUE ESTE EVENT RECOLHE:
// ✅ Membros que saíram por dia/semana/mês
// ✅ Taxa de retenção da comunidade
// ✅ Tempo médio de permanência dos membros
// ✅ Perfil dos membros que saem (engagement, roles, etc.)
// ✅ Identificação de padrões de saída
// ✅ Detecção de saídas rápidas (possível baixa onboarding)
// ✅ Correlação entre engagement e retenção
// ✅ Horários de maior saída de membros
