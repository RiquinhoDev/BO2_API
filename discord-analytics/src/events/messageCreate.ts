import { Message, ChannelType } from 'discord.js';
import { AnalyticsCollector } from '../services/AnalyticsCollector';
import { logger } from '../utils/logger';

export const name = 'messageCreate';
export const once = false;

export async function execute(message: Message): Promise<void> {
  try {
    // Ignorar bots
    if (message.author.bot) return;

    // Ignorar mensagens privadas
    if (!message.guild) return;

    // Ignorar se não for o servidor correto
    if (message.guild.id !== process.env.DISCORD_GUILD_ID) return;

    // Função para obter nome do canal de forma robusta
    const getChannelName = (channel: any): string => {
      try {
        // Verificar diferentes tipos de canal
        switch (channel.type) {
          case ChannelType.GuildText:
            return channel.name || `text-${channel.id}`;
          case ChannelType.GuildVoice:
            return channel.name || `voice-${channel.id}`;
          case ChannelType.GuildAnnouncement:
            return channel.name || `announcement-${channel.id}`;
          case ChannelType.GuildForum:
            return channel.name || `forum-${channel.id}`;
          case ChannelType.PublicThread:
          case ChannelType.PrivateThread:
            return channel.name || `thread-${channel.id}`;
          default:
            // Fallback para qualquer tipo de canal
            return channel.name || `canal-${channel.id}`;
        }
      } catch (error) {
        logger.warn(`⚠️ Erro ao obter nome do canal ${channel.id}:`, error);
        return `canal-${channel.id}`;
      }
    };

    // Função para contar emojis de forma mais precisa
    const countEmojis = (content: string): boolean => {
      if (!content) return false;
      
      // Regex mais abrangente para emojis
      const emojiRegex = /<a?:\w+:\d+>|[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
      
      return emojiRegex.test(content);
    };

    // Obter informações do canal
    const channelName = getChannelName(message.channel);

    // Validar conteúdo da mensagem
    const messageContent = message.content || '';
    const trimmedContent = messageContent.trim();

    // Calcular número de palavras de forma mais precisa
    const wordCount = trimmedContent ? trimmedContent.split(/\s+/).filter(word => word.length > 0).length : 0;

    // Dados da mensagem com validações adicionais
    const messageData = {
      userId: message.author.id,
      username: message.author.username || 'unknown',
      displayName: message.member?.displayName || message.author.displayName || message.author.username || 'unknown',
      channelId: message.channel.id,
      channelName: channelName,
      messageLength: messageContent.length,
      wordCount: wordCount,
      hasAttachments: message.attachments.size > 0,
      hasMentions: message.mentions.users.size > 0 || message.mentions.roles.size > 0 || message.mentions.everyone,
      hasEmojis: countEmojis(messageContent),
      timestamp: new Date(),
      guildId: message.guild.id,
      messageId: message.id,
      
      // Dados adicionais para analytics mais detalhadas
      isReply: !!message.reference,
      hasReactions: message.reactions.cache.size > 0,
      isPinned: message.pinned,
      isSystemMessage: message.system,
      
      // Informações do canal para contexto
      channelType: message.channel.type,
      parentChannelId: (message.channel as any).parentId || null,
    };

    // Salvar na base de dados via AnalyticsCollector
    try {
      await AnalyticsCollector.saveMessageActivity(messageData);
      logger.info(`✅ Mensagem salva: ${messageData.username} - ${messageData.wordCount} palavras`);
    } catch (error) {
      logger.error(`❌ Erro ao salvar mensagem:`, error);
    }

    // Log detalhado apenas em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`📝 Mensagem de ${messageData.username} em #${messageData.channelName} - ${messageData.wordCount} palavras`, {
        messageId: messageData.messageId,
        channelId: messageData.channelId,
        hasAttachments: messageData.hasAttachments,
        hasMentions: messageData.hasMentions,
        hasEmojis: messageData.hasEmojis
      });
    }

    // Log de sucesso mais compacto para produção
    if (process.env.NODE_ENV === 'production') {
      logger.info(`📝 Mensagem processada: ${messageData.username} em #${messageData.channelName}`);
    }

  } catch (error) {
    // Log detalhado do erro para debugging
    logger.error('❌ Erro ao processar messageCreate:', {
      error: error.message,
      stack: error.stack,
      messageId: message?.id,
      channelId: message?.channel?.id,
      guildId: message?.guild?.id,
      userId: message?.author?.id,
      timestamp: new Date().toISOString()
    });

    // Em desenvolvimento, também fazer console.error para visibilidade
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ messageCreate error details:', error);
    }
  }
}