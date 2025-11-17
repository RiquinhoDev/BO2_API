import { GuildMember } from 'discord.js';
import { AnalyticsCollector } from '../services/AnalyticsCollector';
import { logger } from '../utils/logger';

export const name = 'guildMemberAdd';
export const once = false;

export async function execute(member: GuildMember): Promise<void> {
  try {
    // Verificar se é o servidor correto
    if (member.guild.id !== process.env.DISCORD_GUILD_ID) return;

    // Ignorar bots (opcional, dependendo se queremos trackear bots)
    if (member.user.bot) {
      logger.info(`🤖 Bot adicionado: ${member.user.username}`);
      return;
    }

    const memberData = {
      userId: member.id,
      username: member.user.username,
      displayName: member.displayName,
      discriminator: member.user.discriminator,
      avatar: member.user.avatar,
      joinedAt: member.joinedAt || new Date(),
      accountCreatedAt: member.user.createdAt,
      guildId: member.guild.id,
      roles: member.roles.cache.map(role => ({
        id: role.id,
        name: role.name,
      })),
      isNew: true, // Flag para identificar novos membros
    };

    // Salvar dados do novo membro
    await AnalyticsCollector.saveMemberJoin(memberData);

    // Atualizar estatísticas do servidor
    await AnalyticsCollector.updateServerMemberCount(member.guild.id, 'add');

    // Log de novo membro
    logger.info(`👋 Novo membro: ${member.user.username} (${member.id})`);
    
    // Calcular idade da conta
    const accountAge = Date.now() - member.user.createdAt.getTime();
    const daysOld = Math.floor(accountAge / (1000 * 60 * 60 * 24));
    
    // Log adicional para debug
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`📊 Membro analytics:`, {
        username: member.user.username,
        accountAge: `${daysOld} dias`,
        hasAvatar: !!member.user.avatar,
        rolesCount: member.roles.cache.size,
      });
    }

    // Verificar se é uma conta muito nova (possível spam/bot)
    if (daysOld < 7) {
      logger.warn(`⚠️ Conta nova detectada: ${member.user.username} (${daysOld} dias)`);
      
      // Salvar alerta para revisão manual
      await AnalyticsCollector.saveSecurityAlert({
        type: 'new_account',
        userId: member.id,
        username: member.user.username,
        details: {
          accountAge: daysOld,
          hasAvatar: !!member.user.avatar,
        },
        timestamp: new Date(),
        guildId: member.guild.id,
      });
    }

  } catch (error) {
    logger.error('❌ Erro ao processar guildMemberAdd:', error);
  }
}

// 📊 DADOS QUE ESTE EVENT RECOLHE:
// ✅ Novos membros por dia/semana/mês
// ✅ Taxa de crescimento da comunidade
// ✅ Perfil dos novos membros (idade da conta, avatar, etc.)
// ✅ Horários de maior entrada de membros
// ✅ Detecção de contas suspeitas/muito novas
// ✅ Estatísticas de retenção (quando combinado com dados de saída)
// ✅ Distribuição de roles iniciais
