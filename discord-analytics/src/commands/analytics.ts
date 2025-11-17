import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { AnalyticsCollector } from '../services/AnalyticsCollector';
import { EngagementCalculator } from '../services/EngagementCalculator';
import { logger } from '../utils/logger';
import { helpers } from '../utils/helpers';

export const data = new SlashCommandBuilder()
  .setName('analytics')
  .setDescription('Comandos de analytics do servidor')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(subcommand =>
    subcommand
      .setName('overview')
      .setDescription('Visão geral das analytics do servidor')
      .addIntegerOption(option =>
        option.setName('days')
          .setDescription('Número de dias para analisar')
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('user')
      .setDescription('Analytics de um utilizador específico')
      .addUserOption(option =>
        option.setName('target')
          .setDescription('Utilizador para analisar')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('days')
          .setDescription('Número de dias para analisar')
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('top')
      .setDescription('Top utilizadores por categoria')
      .addStringOption(option =>
        option.setName('category')
          .setDescription('Categoria para ranking')
          .setRequired(true)
          .addChoices(
            { name: 'Mensagens', value: 'messages' },
            { name: 'Voz', value: 'voice' },
            { name: 'Engagement', value: 'engagement' }
          )
      )
      .addIntegerOption(option =>
        option.setName('limit')
          .setDescription('Número de utilizadores no ranking')
          .setMinValue(5)
          .setMaxValue(20)
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('channels')
      .setDescription('Analytics dos canais do servidor')
      .addIntegerOption(option =>
        option.setName('days')
          .setDescription('Número de dias para analisar')
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('refresh')
      .setDescription('Atualizar cálculos de engagement (apenas administradores)')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    // Verificar se é o servidor correto
    if (interaction.guild?.id !== process.env.DISCORD_GUILD_ID) {
      await interaction.reply({
        content: '❌ Este comando só pode ser usado no servidor configurado.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'overview':
        await handleOverview(interaction);
        break;
      
      case 'user':
        await handleUser(interaction);
        break;
      
      case 'top':
        await handleTop(interaction);
        break;
      
      case 'channels':
        await handleChannels(interaction);
        break;
      
      case 'refresh':
        await handleRefresh(interaction);
        break;
      
      default:
        await interaction.editReply('❌ Subcomando não reconhecido.');
    }

  } catch (error) {
    logger.error('❌ Erro ao executar comando analytics:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    try {
      await interaction.editReply(`❌ Erro ao executar comando: ${errorMessage}`);
    } catch (replyError) {
      logger.error('❌ Erro ao enviar resposta de erro:', replyError);
    }
  }
}

// Handler para overview do servidor
async function handleOverview(interaction: ChatInputCommandInteraction) {
  const days = interaction.options.getInteger('days') || 7;
  const guildId = interaction.guild!.id;

  const overview = await AnalyticsCollector.getServerOverview(guildId, days);
  
  if (!overview) {
    await interaction.editReply('❌ Erro ao obter dados de overview.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📊 Analytics do Servidor (${days} dias)`)
    .setColor(0x0099FF)
    .setThumbnail(interaction.guild!.iconURL())
    .addFields(
      {
        name: '💬 Mensagens',
        value: [
          `**Total:** ${helpers.format.formatNumber(overview.messages.total)}`,
          `**Utilizadores:** ${overview.messages.users}`,
          `**Canais:** ${overview.messages.channels}`
        ].join('\n'),
        inline: true
      },
      {
        name: '🎤 Voz',
        value: [
          `**Tempo Total:** ${helpers.format.formatDuration(overview.voice.totalMinutes)}`,
          `**Sessões:** ${overview.voice.sessions}`,
          `**Utilizadores:** ${overview.voice.users}`
        ].join('\n'),
        inline: true
      },
      {
        name: '👥 Atividade',
        value: [
          `**Utilizadores Ativos:** ${overview.activeUsers}`,
          `**Período:** ${overview.period}`,
          `**Média/dia:** ${Math.round(overview.messages.total / days)} msgs`
        ].join('\n'),
        inline: true
      }
    )
    .setFooter({
      text: `Analytics Bot • ${new Date().toLocaleDateString('pt-PT')}`,
      iconURL: interaction.client.user.displayAvatarURL()
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// Handler para analytics de utilizador
async function handleUser(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('target')!;
  const days = interaction.options.getInteger('days') || 30;
  const guildId = interaction.guild!.id;

  // Buscar dados do utilizador
  const userEngagement = await EngagementCalculator.calculateUserEngagement(targetUser.id, guildId, days);
  const userTrend = await EngagementCalculator.calculateTrend(targetUser.id, guildId);

  const member = interaction.guild!.members.cache.get(targetUser.id);
  const displayName = member?.displayName || targetUser.username;

  const embed = new EmbedBuilder()
    .setTitle(`📊 Analytics de ${displayName}`)
    .setColor(0x00FF00)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      {
        name: '🏆 Score de Engagement',
        value: [
          `**Total:** ${userEngagement.total.toFixed(1)}`,
          `**Nível:** ${EngagementCalculator.getEngagementLevel(userEngagement.total)}`,
          `**Tendência:** ${getTrendEmoji(userTrend.direction)} ${userTrend.direction} (${userTrend.percentage.toFixed(1)}%)`
        ].join('\n'),
        inline: false
      },
      {
        name: '📊 Detalhes do Score',
        value: [
          `💬 **Mensagens:** ${userEngagement.messages.toFixed(1)}`,
          `🎤 **Voz:** ${userEngagement.voice.toFixed(1)}`,
          `👤 **Presença:** ${userEngagement.presence.toFixed(1)}`
        ].join('\n'),
        inline: true
      },
      {
        name: '📅 Período',
        value: [
          `**Dias analisados:** ${days}`,
          `**Última atualização:** Agora`,
          `**Tendência:** ${userTrend.period}`
        ].join('\n'),
        inline: true
      }
    )
    .setFooter({
      text: `Analytics de ${targetUser.username} • ${new Date().toLocaleDateString('pt-PT')}`,
      iconURL: interaction.client.user.displayAvatarURL()
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// Handler para top utilizadores
async function handleTop(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString('category')!;
  const limit = interaction.options.getInteger('limit') || 10;
  const guildId = interaction.guild!.id;

  let title = '';
  let topUsers: any[] = [];

  switch (category) {
    case 'engagement':
      title = '🏆 Top Utilizadores - Engagement';
      topUsers = await EngagementCalculator.getEngagementRankings(guildId, limit);
      break;
    
    // TODO: Implementar casos para 'messages' e 'voice'
    default:
      await interaction.editReply('❌ Categoria não implementada ainda.');
      return;
  }

  if (topUsers.length === 0) {
    await interaction.editReply('❌ Nenhum dado encontrado para esta categoria.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0xFFD700)
    .setThumbnail(interaction.guild!.iconURL());

  // Adicionar top utilizadores ao embed
  const description = topUsers.map((user, index) => {
    const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
    const trend = getTrendEmoji(user.trend);
    
    return `${medal} **${user.displayName || user.username}**\n` +
           `   Score: ${user.currentScore.toFixed(1)} ${trend}\n`;
  }).join('\n');

  embed.setDescription(description);
  embed.setFooter({
    text: `Top ${limit} • ${new Date().toLocaleDateString('pt-PT')}`,
    iconURL: interaction.client.user.displayAvatarURL()
  });

  await interaction.editReply({ embeds: [embed] });
}

// Handler para analytics de canais
async function handleChannels(interaction: ChatInputCommandInteraction) {
  // TODO: Implementar analytics de canais
  await interaction.editReply('🚧 Funcionalidade de analytics de canais em desenvolvimento.');
}

// Handler para refresh de engagement
async function handleRefresh(interaction: ChatInputCommandInteraction) {
  // Verificar se o utilizador tem permissões de administrador
  const member = interaction.guild!.members.cache.get(interaction.user.id);
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply('❌ Apenas administradores podem executar refresh de engagement.');
    return;
  }

  const guildId = interaction.guild!.id;

  await interaction.editReply('🔄 Iniciando refresh de engagement... Isso pode demorar alguns minutos.');

  try {
    await EngagementCalculator.calculateAllUsersEngagement(guildId);
    
    await interaction.followUp({
      content: '✅ Refresh de engagement concluído com sucesso!',
      ephemeral: true
    });
    
    logger.info(`🔄 Refresh de engagement executado por ${interaction.user.username} (${interaction.user.id})`);
    
  } catch (error) {
    logger.error('❌ Erro durante refresh de engagement:', error);
    
    await interaction.followUp({
      content: '❌ Erro durante o refresh de engagement. Verifique os logs.',
      ephemeral: true
    });
  }
}

// Helper para obter emoji de tendência
function getTrendEmoji(direction: string): string {
  switch (direction) {
    case 'up': return '📈';
    case 'down': return '📉';
    case 'stable': return '➡️';
    default: return '❓';
  }
}
