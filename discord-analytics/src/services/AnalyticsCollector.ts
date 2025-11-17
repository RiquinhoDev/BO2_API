import { DiscordActivity } from '../models/DiscordActivity';
import { UserEngagement } from '../models/UserEngagement';
import { VoiceActivity } from '../models/VoiceActivity';
import { ServerStats } from '../models/ServerStats';
import { EngagementCalculator } from './EngagementCalculator';
import { logger } from '../utils/logger';

export interface MessageActivityData {
  userId: string;
  username: string;
  displayName: string;
  channelId: string;
  channelName: string;
  messageLength: number;
  wordCount: number;
  hasAttachments: boolean;
  hasMentions: boolean;
  hasEmojis: boolean;
  timestamp: Date;
  guildId: string;
  messageId: string;
}

export interface VoiceActivityData {
  userId: string;
  username?: string;
  displayName?: string;  // ✅ FIX: Adicionado displayName opcional
  action: 'join' | 'leave' | 'move';
  channelId: string;
  channelName?: string;
  previousChannelId?: string;
  timestamp: Date;
  guildId: string;
}

export interface PresenceData {
  userId: string;
  username: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  timestamp: Date;
  guildId: string;
}

export class AnalyticsCollector {
  
  // 💬 SALVAR ATIVIDADE DE MENSAGENS
  static async saveMessageActivity(data: MessageActivityData): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const hour = data.timestamp.getHours();

      console.log(`🔍 Salvando atividade: ${data.username} - ${data.wordCount} palavras em ${today}`);

      // Atualizar atividade diária
      const result = await DiscordActivity.findOneAndUpdate(
        { 
          userId: data.userId,
          date: today,
          type: 'message',
          guildId: data.guildId
        },
        {
          $inc: { 
            count: 1,
            totalCharacters: data.messageLength,
            totalWords: data.wordCount,
            attachments: data.hasAttachments ? 1 : 0,
            mentions: data.hasMentions ? 1 : 0,
            emojis: data.hasEmojis ? 1 : 0
          },
          $set: {
            lastActivity: data.timestamp,
            username: data.username,
            displayName: data.displayName
          },
          $addToSet: {
            channels: data.channelName,
            hours: hour
          },
          $push: {
            recentMessages: {
              $each: [{
                messageId: data.messageId,
                channelId: data.channelId,
                timestamp: data.timestamp,
                length: data.messageLength
              }],
              $slice: -10 // Manter apenas últimas 10 mensagens
            }
          }
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Atividade salva: ${result ? 'atualizada' : 'criada'}`);

      // Atualizar stats do canal
      await this.updateChannelStats(data.channelId, data.channelName, data.guildId);

      // Calcular engagement score
      await this.updateEngagementScore(data.userId, data.guildId);

    } catch (error) {
      console.error('❌ Erro ao salvar atividade de mensagem:', error);
      logger.error('❌ Erro ao salvar atividade de mensagem:', error);
    }
  }

  // 🎤 SALVAR ATIVIDADE DE VOZ
  static async saveVoiceActivity(data: VoiceActivityData): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      if (data.action === 'join') {
        // ✅ FIX: Garantir que displayName não seja undefined
        const displayName = data.displayName || data.username || 'Unknown User';
        
        // Registar entrada no voice channel
        await VoiceActivity.create({
          userId: data.userId,
          username: data.username,
          displayName: displayName,  // ✅ FIX: Campo obrigatório adicionado
          channelId: data.channelId,
          channelName: data.channelName,
          joinTime: data.timestamp,
          date: today,
          guildId: data.guildId
        });

      } else if (data.action === 'leave') {
        // Calcular duração e fechar sessão
        const session = await VoiceActivity.findOne({
          userId: data.userId,
          channelId: data.previousChannelId || data.channelId,
          leaveTime: { $exists: false },
          date: today,
          guildId: data.guildId
        }).sort({ joinTime: -1 });

        if (session) {
          const duration = Math.floor((data.timestamp.getTime() - session.joinTime.getTime()) / 1000 / 60); // minutos
          
          await VoiceActivity.findByIdAndUpdate(session._id, {
            leaveTime: data.timestamp,
            duration: duration
          });

          // Atualizar atividade diária
          await DiscordActivity.findOneAndUpdate(
            { 
              userId: data.userId,
              date: today,
              type: 'voice',
              guildId: data.guildId
            },
            {
              $inc: { 
                count: 1,
                totalMinutes: duration
              },
              $set: {
                lastActivity: data.timestamp,
                username: data.username
              },
              $addToSet: {
                channels: session.channelName
              }
            },
            { upsert: true }
          );
        }

      } else if (data.action === 'move') {
        // Tratar mudança de canal
        await this.handleVoiceMove(data);
      }

    } catch (error) {
      logger.error('❌ Erro ao salvar atividade de voz:', error);
    }
  }

  // 👤 SALVAR DADOS DE PRESENÇA
  static async savePresenceData(data: PresenceData): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      await DiscordActivity.findOneAndUpdate(
        { 
          userId: data.userId,
          date: today,
          type: 'presence',
          guildId: data.guildId
        },
        {
          $set: {
            lastActivity: data.timestamp,
            username: data.username,
            currentStatus: data.status
          },
          $inc: {
            count: 1
          },
          $push: {
            statusChanges: {
              $each: [{
                status: data.status,
                timestamp: data.timestamp
              }],
              $slice: -20 // Manter últimas 20 mudanças
            }
          }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('❌ Erro ao salvar dados de presença:', error);
    }
  }

  // 📈 ATUALIZAR ENGAGEMENT SCORE
  static async updateEngagementScore(userId: string, guildId: string): Promise<void> {
    try {
      const score = await EngagementCalculator.calculateUserEngagement(userId, guildId);
      const trend = await EngagementCalculator.calculateTrend(userId, guildId);

      // ✅ FIX: Garantir que trend seja sempre string
      let trendString = '';
      if (typeof trend === 'object' && trend !== null) {
        trendString = `${trend.direction || 'stable'} ${trend.percentage || 0}% (${trend.period || '7 dias'})`;
      } else if (typeof trend === 'string') {
        trendString = trend;
      } else {
        trendString = 'stable';
      }

      await UserEngagement.findOneAndUpdate(
        { userId, guildId },
        { 
          currentScore: score.total,
          messageScore: score.messages,
          voiceScore: score.voice,
          presenceScore: score.presence,
          trend: trendString,  // ✅ FIX: Garantir que é sempre string
          level: EngagementCalculator.getEngagementLevel(score.total),
          lastCalculated: new Date()
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('❌ Erro ao atualizar engagement score:', error);
    }
  }

  // 📊 ATUALIZAR STATS DO CANAL
  // ✅ FIX: Correção para evitar duplicated key error
  static async updateChannelStats(channelId: string, channelName: string, guildId: string): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      await ServerStats.findOneAndUpdate(
        { 
          type: 'channel',
          targetId: channelId,
          date: today,
          guildId
        },
        {
          $inc: { count: 1 },
          $set: { 
            name: channelName,
            lastActivity: new Date()
          }
        },
        { upsert: true }
      );

    } catch (error) {
      // ✅ FIX: Se der erro de duplicated key, ignorar (documento já existe)
      if (error.code !== 11000) {
        logger.error('❌ Erro ao atualizar stats do canal:', error);
      }
    }
  }

  // 🔄 TRATAR MUDANÇA DE CANAL DE VOZ
  private static async handleVoiceMove(data: VoiceActivityData): Promise<void> {
    // Fechar sessão no canal anterior
    if (data.previousChannelId) {
      await this.saveVoiceActivity({
        ...data,
        action: 'leave',
        channelId: data.previousChannelId
      });
    }

    // Iniciar nova sessão no canal atual
    await this.saveVoiceActivity({
      ...data,
      action: 'join'
    });
  }

  // 📈 OBTER ESTATÍSTICAS GERAIS
static async getServerOverview(guildId: string, days: number = 7): Promise<any> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const dateStr = startDate.toISOString().split('T')[0];

    console.log(`🔍 Buscando overview para guild ${guildId} desde ${dateStr}`);

    // 📊 STATS DE MENSAGENS
    const messageStats = await DiscordActivity.aggregate([
      { 
        $match: { 
          type: 'message', 
          date: { $gte: dateStr },
          guildId 
        }
      },
      { 
        $group: { 
          _id: null, 
          totalMessages: { $sum: '$count' },
          totalUsers: { $addToSet: '$userId' },
          totalWords: { $sum: '$totalWords' },
          totalCharacters: { $sum: '$totalCharacters' },
          totalChannels: { $addToSet: '$channels' }
        }
      }
    ]);

    console.log('📊 Message stats:', messageStats);

    // 🎤 STATS DE VOZ
    const voiceStats = await VoiceActivity.aggregate([
      { 
        $match: { 
          guildId,
          joinTime: { $gte: startDate },
          duration: { $exists: true }
        }
      },
      { 
        $group: { 
          _id: null, 
          totalMinutes: { $sum: '$duration' },
          totalSessions: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      }
    ]);

    console.log('🎤 Voice stats:', voiceStats);

    // 👥 UTILIZADORES ÚNICOS ATIVOS
    const activeUsers = await DiscordActivity.distinct('userId', {
      date: { $gte: dateStr },
      guildId
    });

    console.log('👥 Active users:', activeUsers.length);

    // 🏆 ENGAGEMENT MÉDIO
    const avgEngagement = await UserEngagement.aggregate([
      { 
        $match: { 
          guildId,
          lastCalculated: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          averageScore: { $avg: '$currentScore' }
        }
      }
    ]);

    console.log('🏆 Avg engagement:', avgEngagement);

    // 📈 CANAL MAIS ATIVO
    const topChannel = await ServerStats.aggregate([
      {
        $match: {
          guildId,
          type: 'channel',
          date: { $gte: dateStr }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    console.log('📈 Top channel:', topChannel);

    // 🔢 CONSTRUIR RESPOSTA
    const messageData = messageStats[0] || { totalMessages: 0, totalUsers: [], totalWords: 0, totalCharacters: 0, totalChannels: [] };
    const voiceData = voiceStats[0] || { totalMinutes: 0, totalSessions: 0, uniqueUsers: [] };
    const engagementData = avgEngagement[0] || { averageScore: 0 };

    const result = {
      period: `${days} dias`,
      
      // Dados de mensagens
      totalMessages: messageData.totalMessages,
      messageUsers: Array.isArray(messageData.totalUsers) ? messageData.totalUsers.length : 0,
      totalWords: messageData.totalWords || 0,
      totalCharacters: messageData.totalCharacters || 0,
      messageChannels: Array.isArray(messageData.totalChannels) ? messageData.totalChannels.flat().length : 0,
      
      // Dados de voz
      totalVoiceMinutes: voiceData.totalMinutes,
      totalVoiceSessions: voiceData.totalSessions,
      voiceUsers: Array.isArray(voiceData.uniqueUsers) ? voiceData.uniqueUsers.length : 0,
      
      // Dados gerais
      activeUsers: activeUsers.length,
      averageEngagement: Math.round(engagementData.averageScore || 0),
      mostActiveChannel: topChannel[0]?.name || 'N/A',
      
      // Estrutura legacy para compatibilidade
      messages: {
        total: messageData.totalMessages,
        users: Array.isArray(messageData.totalUsers) ? messageData.totalUsers.length : 0,
        channels: Array.isArray(messageData.totalChannels) ? messageData.totalChannels.flat().length : 0
      },
      voice: {
        totalMinutes: voiceData.totalMinutes,
        sessions: voiceData.totalSessions,
        users: Array.isArray(voiceData.uniqueUsers) ? voiceData.uniqueUsers.length : 0
      }
    };

    console.log('✅ Overview final:', result);
    return result;

  } catch (error) {
    logger.error('❌ Erro ao obter overview do servidor:', error);
    
    // Retornar dados vazios em caso de erro
    return {
      period: `${days} dias`,
      totalMessages: 0,
      messageUsers: 0,
      totalWords: 0,
      totalCharacters: 0,
      messageChannels: 0,
      totalVoiceMinutes: 0,
      totalVoiceSessions: 0,
      voiceUsers: 0,
      activeUsers: 0,
      averageEngagement: 0,
      mostActiveChannel: 'N/A',
      messages: { total: 0, users: 0, channels: 0 },
      voice: { totalMinutes: 0, sessions: 0, users: 0 }
    };
  }
}
}