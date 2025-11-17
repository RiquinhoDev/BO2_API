import { DiscordActivity } from '../models/DiscordActivity';
import { VoiceActivity } from '../models/VoiceActivity';
import { UserEngagement } from '../models/UserEngagement';
import { logger } from '../utils/logger';

export interface EngagementScore {
  total: number;
  messages: number;
  voice: number;
  presence: number;
}

export interface TrendData {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
  period: string;
}

export class EngagementCalculator {

  // 📊 CALCULAR ENGAGEMENT DO UTILIZADOR
  static async calculateUserEngagement(userId: string, guildId: string, days: number = 7): Promise<EngagementScore> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const dateStr = startDate.toISOString().split('T')[0];

      // Buscar atividades do utilizador
      const activities = await DiscordActivity.find({
        userId,
        guildId,
        date: { $gte: dateStr }
      });

      // Buscar atividade de voz
      const voiceActivities = await VoiceActivity.find({
        userId,
        guildId,
        date: { $gte: dateStr },
        duration: { $exists: true }
      });

      // Calcular scores por categoria
      const messageScore = this.calculateMessageScore(activities);
      const voiceScore = this.calculateVoiceScore(voiceActivities);
      const presenceScore = this.calculatePresenceScore(activities);

      const totalScore = messageScore + voiceScore + presenceScore;

      return {
        total: Math.round(totalScore * 10) / 10,
        messages: Math.round(messageScore * 10) / 10,
        voice: Math.round(voiceScore * 10) / 10,
        presence: Math.round(presenceScore * 10) / 10
      };

    } catch (error) {
      logger.error('❌ Erro ao calcular engagement do utilizador:', error);
      return { total: 0, messages: 0, voice: 0, presence: 0 };
    }
  }

  // 💬 CALCULAR SCORE DE MENSAGENS
  private static calculateMessageScore(activities: any[]): number {
    const messageActivities = activities.filter(a => a.type === 'message');
    if (messageActivities.length === 0) return 0;

    let score = 0;

    messageActivities.forEach(activity => {
      // Score base por mensagem
      score += activity.count * 1;

      // Bonus por caracteres (máximo 50% bonus)
      const avgCharsPerMessage = activity.totalCharacters / activity.count;
      const charBonus = Math.min(avgCharsPerMessage / 100, 0.5);
      score += activity.count * charBonus;

      // Bonus por palavras (máximo 30% bonus)
      const avgWordsPerMessage = activity.totalWords / activity.count;
      const wordBonus = Math.min(avgWordsPerMessage / 20, 0.3);
      score += activity.count * wordBonus;

      // Bonus por attachments
      score += activity.attachments * 0.5;

      // Bonus por mentions
      score += activity.mentions * 0.3;

      // Bonus por emojis
      score += activity.emojis * 0.2;

      // Bonus por diversidade de canais
      const channelBonus = Math.min(activity.channels.length * 0.1, 2);
      score += channelBonus;

      // Bonus por consistência (atividade em diferentes horas)
      const hourBonus = Math.min(activity.hours.length * 0.05, 1);
      score += hourBonus;
    });

    return score;
  }

  // 🎤 CALCULAR SCORE DE VOZ
  private static calculateVoiceScore(voiceActivities: any[]): number {
    if (voiceActivities.length === 0) return 0;

    let score = 0;
    let totalMinutes = 0;
    let totalSessions = 0;

    voiceActivities.forEach(activity => {
      totalMinutes += activity.duration || 0;
      totalSessions += 1;
    });

    // Score base por minuto (0.5 pontos por minuto)
    score += totalMinutes * 0.5;

    // Bonus por número de sessões
    score += totalSessions * 2;

    // Bonus por duração média das sessões (sessões mais longas = mais engajamento)
    if (totalSessions > 0) {
      const avgSessionDuration = totalMinutes / totalSessions;
      if (avgSessionDuration >= 30) score += totalSessions * 1; // Bonus para sessões longas
      if (avgSessionDuration >= 60) score += totalSessions * 0.5; // Bonus extra
    }

    // Penalty por sessões muito curtas (menos de 2 minutos)
    const shortSessions = voiceActivities.filter(a => a.duration < 2).length;
    score -= shortSessions * 0.5;

    return Math.max(score, 0); // Nunca negativo
  }

  // 👤 CALCULAR SCORE DE PRESENÇA
// Melhoria para calcular tempo online mais preciso
private static calculatePresenceScore(activities: any[]): number {
  const presenceActivities = activities.filter(a => a.type === 'presence');
  if (presenceActivities.length === 0) return 0;

  let score = 0;
  let totalOnlineMinutes = 0;

  presenceActivities.forEach(activity => {
    // Score base por mudança de status
    score += activity.count * 0.1;

    const statusChanges = activity.statusChanges || [];
    
    // Calcular tempo online mais precisamente
    for (let i = 0; i < statusChanges.length - 1; i++) {
      const current = statusChanges[i];
      const next = statusChanges[i + 1];
      
      if (['online', 'idle', 'dnd'].includes(current.status)) {
        const duration = new Date(next.timestamp).getTime() - 
                        new Date(current.timestamp).getTime();
        const minutes = duration / (1000 * 60);
        totalOnlineMinutes += minutes;
      }
    }
    
    // Verificar último status se ainda estiver online
    const lastStatus = statusChanges[statusChanges.length - 1];
    if (lastStatus && ['online', 'idle', 'dnd'].includes(lastStatus.status)) {
      const now = new Date();
      const duration = now.getTime() - new Date(lastStatus.timestamp).getTime();
      const minutes = duration / (1000 * 60);
      totalOnlineMinutes += minutes;
    }
  });

  // Pontos por tempo online (0.2 pontos por hora)
  score += (totalOnlineMinutes / 60) * 0.2;

  return score;
}

  // 📈 CALCULAR TENDÊNCIA DE ENGAGEMENT
  static async calculateTrend(userId: string, guildId: string): Promise<TrendData> {
    try {
      // Comparar últimos 7 dias com 7 dias anteriores
      const now = new Date();
      
      // Período atual (últimos 7 dias)
      const currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 7);
      
      // Período anterior (7 dias antes dos últimos 7)
      const previousStart = new Date(now);
      previousStart.setDate(previousStart.getDate() - 14);
      const previousEnd = new Date(currentStart);

      // Calcular scores para ambos os períodos
      const currentScore = await this.calculateUserEngagement(userId, guildId, 7);
      
      // Para período anterior, calcular manualmente
      const previousActivities = await DiscordActivity.find({
        userId,
        guildId,
        date: { 
          $gte: previousStart.toISOString().split('T')[0],
          $lt: previousEnd.toISOString().split('T')[0]
        }
      });

      const previousVoiceActivities = await VoiceActivity.find({
        userId,
        guildId,
        date: { 
          $gte: previousStart.toISOString().split('T')[0],
          $lt: previousEnd.toISOString().split('T')[0]
        },
        duration: { $exists: true }
      });

      const previousMessageScore = this.calculateMessageScore(previousActivities);
      const previousVoiceScore = this.calculateVoiceScore(previousVoiceActivities);
      const previousPresenceScore = this.calculatePresenceScore(previousActivities);
      const previousTotal = previousMessageScore + previousVoiceScore + previousPresenceScore;

      // Calcular percentual de mudança
      let percentage = 0;
      let direction: 'up' | 'down' | 'stable' = 'stable';

      if (previousTotal === 0 && currentScore.total > 0) {
        percentage = 100;
        direction = 'up';
      } else if (previousTotal > 0) {
        percentage = ((currentScore.total - previousTotal) / previousTotal) * 100;
        
        if (Math.abs(percentage) < 5) {
          direction = 'stable';
        } else if (percentage > 0) {
          direction = 'up';
        } else {
          direction = 'down';
        }
      }

      return {
        direction,
        percentage: Math.round(Math.abs(percentage) * 10) / 10,
        period: '7 dias'
      };

    } catch (error) {
      logger.error('❌ Erro ao calcular tendência:', error);
      return { direction: 'stable', percentage: 0, period: '7 dias' };
    }
  }

  // 🏆 OBTER NÍVEL DE ENGAGEMENT
  static getEngagementLevel(score: number): 'baixo' | 'medio' | 'alto' | 'excelente' {
    if (score < 10) return 'baixo';
    if (score < 50) return 'medio';
    if (score < 100) return 'alto';
    return 'excelente';
  }

  // 📊 CALCULAR ENGAGEMENT PARA TODOS OS UTILIZADORES
  static async calculateAllUsersEngagement(guildId: string): Promise<void> {
    try {
      logger.info('🔄 Iniciando cálculo de engagement para todos os utilizadores...');

      // Buscar todos os utilizadores ativos nos últimos 30 dias
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      const activeUsers = await DiscordActivity.distinct('userId', {
        guildId,
        date: { $gte: dateStr }
      });

      logger.info(`📊 Processando engagement para ${activeUsers.length} utilizadores...`);

      // Processar em batches para evitar sobrecarga
      const batchSize = 50;
      for (let i = 0; i < activeUsers.length; i += batchSize) {
        const batch = activeUsers.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (userId) => {
          try {
            const score = await this.calculateUserEngagement(userId, guildId);
            const trend = await this.calculateTrend(userId, guildId);

            // Buscar username mais recente
            const recentActivity = await DiscordActivity.findOne({
              userId,
              guildId,
              username: { $exists: true }
            }).sort({ lastActivity: -1 });

            await UserEngagement.findOneAndUpdate(
              { userId, guildId },
              {
                currentScore: score.total,
                messageScore: score.messages,
                voiceScore: score.voice,
                presenceScore: score.presence,
                trend: trend.direction,
                trendPercentage: trend.percentage,
                level: this.getEngagementLevel(score.total),
                username: recentActivity?.username || 'Unknown',
                displayName: recentActivity?.displayName || recentActivity?.username || 'Unknown',
                lastCalculated: new Date()
              },
              { upsert: true }
            );

          } catch (error) {
            logger.warn(`⚠️ Erro ao calcular engagement para ${userId}:`, error);
          }
        }));

        logger.info(`✅ Processado batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(activeUsers.length / batchSize)}`);
      }

      logger.info('✅ Cálculo de engagement concluído para todos os utilizadores');

    } catch (error) {
      logger.error('❌ Erro ao calcular engagement para todos os utilizadores:', error);
    }
  }

  // 📈 OBTER RANKINGS DE ENGAGEMENT
  static async getEngagementRankings(guildId: string, limit: number = 20): Promise<any[]> {
    try {
      return await UserEngagement.find({ guildId })
        .sort({ currentScore: -1 })
        .limit(limit)
        .select({
          userId: 1,
          username: 1,
          displayName: 1,
          currentScore: 1,
          messageScore: 1,
          voiceScore: 1,
          presenceScore: 1,
          level: 1,
          trend: 1,
          trendPercentage: 1,
          lastCalculated: 1
        })
        .lean();

    } catch (error) {
      logger.error('❌ Erro ao obter rankings de engagement:', error);
      return [];
    }
  }

  // 📊 OBTER ESTATÍSTICAS DE ENGAGEMENT
  static async getEngagementStats(guildId: string): Promise<any> {
    try {
      const stats = await UserEngagement.aggregate([
        { $match: { guildId } },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            averageScore: { $avg: '$currentScore' },
            highEngagement: {
              $sum: { $cond: [{ $gte: ['$currentScore', 50] }, 1, 0] }
            },
            mediumEngagement: {
              $sum: { $cond: [{ $and: [{ $gte: ['$currentScore', 10] }, { $lt: ['$currentScore', 50] }] }, 1, 0] }
            },
            lowEngagement: {
              $sum: { $cond: [{ $lt: ['$currentScore', 10] }, 1, 0] }
            },
            trendingUp: {
              $sum: { $cond: [{ $eq: ['$trend', 'up'] }, 1, 0] }
            },
            trendingDown: {
              $sum: { $cond: [{ $eq: ['$trend', 'down'] }, 1, 0] }
            }
          }
        }
      ]);

      return stats[0] || {
        totalUsers: 0,
        averageScore: 0,
        highEngagement: 0,
        mediumEngagement: 0,
        lowEngagement: 0,
        trendingUp: 0,
        trendingDown: 0
      };

    } catch (error) {
      logger.error('❌ Erro ao obter estatísticas de engagement:', error);
      return null;
    }
  }
}
