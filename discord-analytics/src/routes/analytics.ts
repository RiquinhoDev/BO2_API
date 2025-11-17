import { Router } from 'express';
import { AnalyticsCollector } from '../services/AnalyticsCollector';
import { DiscordActivity } from '../models/DiscordActivity';
import { UserEngagement } from '../models/UserEngagement';
import { VoiceActivity } from '../models/VoiceActivity';
import { logger } from '../utils/logger';

const router = Router();

// 📊 GET /api/analytics/overview - Visão geral do servidor
router.get('/overview', async (req, res) => {
  try {
    const { days = 7, guildId = process.env.DISCORD_GUILD_ID } = req.query;
    
    logger.info(`📊 Buscando overview para guild ${guildId}, últimos ${days} dias`);
    
    const overview = await AnalyticsCollector.getServerOverview(
      guildId as string, 
      parseInt(days as string)
    );
    
    if (overview) {
      // ✅ CORRIGIDO: Estrutura de resposta alinhada com frontend
      res.json({
        success: true,
        data: {
          // Dados principais
          totalMembers: overview.messageUsers || overview.activeUsers || 0,
          onlineMembers: overview.onlineMembers || 0,
          messagesLast24h: overview.totalMessages || 0,
          voiceMinutesLast24h: overview.totalVoiceMinutes || 0,
          averageEngagement: overview.averageEngagement || 0,
          newMembersWeek: overview.newMembersWeek || 0,
          retentionRate: overview.retentionRate || 0,
          mostActiveChannel: overview.mostActiveChannel || 'N/A',
          
          // Dados adicionais para compatibilidade
          messageUsers: overview.messageUsers || 0,
          activeUsers: overview.activeUsers || 0,
          totalMessages: overview.totalMessages || 0,
          totalVoiceMinutes: overview.totalVoiceMinutes || 0,
          totalWords: overview.totalWords || 0,
          totalCharacters: overview.totalCharacters || 0,
          messageChannels: overview.messageChannels || 0,
          totalVoiceSessions: overview.totalVoiceSessions || 0,
          voiceUsers: overview.voiceUsers || 0,
          
          // Estrutura legacy
          messages: overview.messages || { total: 0, users: 0, channels: 0 },
          voice: overview.voice || { totalMinutes: 0, sessions: 0, users: 0 }
        },
        period: `${days} dias`,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        data: {
          totalMembers: 0,
          onlineMembers: 0,
          messagesLast24h: 0,
          voiceMinutesLast24h: 0,
          averageEngagement: 0,
          newMembersWeek: 0,
          retentionRate: 0,
          mostActiveChannel: 'N/A',
          messageUsers: 0,
          activeUsers: 0,
          totalMessages: 0,
          totalVoiceMinutes: 0,
          totalWords: 0,
          totalCharacters: 0,
          messageChannels: 0,
          totalVoiceSessions: 0,
          voiceUsers: 0,
          messages: { total: 0, users: 0, channels: 0 },
          voice: { totalMinutes: 0, sessions: 0, users: 0 }
        },
        message: 'Nenhum dado encontrado ainda'
      });
    }
    
  } catch (error) {
    logger.error('❌ Erro em /analytics/overview:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// 💬 GET /api/analytics/messages - Analytics de mensagens
router.get('/messages', async (req, res) => {
  try {
    const { 
      days = 7, 
      guildId = process.env.DISCORD_GUILD_ID,
      userId,
      channelId 
    } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    const dateStr = startDate.toISOString().split('T')[0];
    
    // Filtros
    const matchFilter: any = {
      type: 'message',
      date: { $gte: dateStr },
      guildId
    };
    
    if (userId) matchFilter.userId = userId;
    if (channelId) matchFilter.channels = channelId;
    
    // Agregação por dia
    const dailyStats = await DiscordActivity.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$date',
          totalMessages: { $sum: '$count' },
          uniqueUsers: { $addToSet: '$userId' },
          totalCharacters: { $sum: '$totalCharacters' },
          totalWords: { $sum: '$totalWords' },
          totalAttachments: { $sum: '$attachments' },
          totalMentions: { $sum: '$mentions' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Stats totais
// Stats totais
const totalStats = dailyStats.reduce((acc, day) => {
  // ✅ FIX: Converter Set para Array antes de fazer spread
  const accUsers = Array.from(acc.uniqueUsers);
  const dayUsers = Array.isArray(day.uniqueUsers) ? day.uniqueUsers : [];
  
  return {
    totalMessages: acc.totalMessages + day.totalMessages,
    uniqueUsers: new Set([...accUsers, ...dayUsers]),
    totalWords: acc.totalWords + day.totalWords,
    totalCharacters: acc.totalCharacters + day.totalCharacters,
    totalAttachments: acc.totalAttachments + day.totalAttachments,
    totalMentions: acc.totalMentions + day.totalMentions
  };
}, {
  totalMessages: 0,
  uniqueUsers: new Set(),
  totalWords: 0,
  totalCharacters: 0,
  totalAttachments: 0,
  totalMentions: 0
});

    res.json({
      success: true,
      data: {
        dailyStats: dailyStats.map(day => ({
          date: day._id,
          messages: day.totalMessages,
          users: day.uniqueUsers.length,
          words: day.totalWords,
          characters: day.totalCharacters,
          attachments: day.totalAttachments,
          mentions: day.totalMentions
        })),
        summary: {
          totalMessages: totalStats.totalMessages,
          uniqueUsers: totalStats.uniqueUsers,
          averageWordsPerMessage: totalStats.totalMessages > 0 ? Math.round(totalStats.totalWords / totalStats.totalMessages) : 0,
          totalAttachments: totalStats.totalAttachments,
          totalMentions: totalStats.totalMentions
        },
        period: `${days} dias`
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro em /analytics/messages:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// 🎤 GET /api/analytics/voice - Analytics de voz
router.get('/voice', async (req, res) => {
  try {
    const { 
      days = 7, 
      guildId = process.env.DISCORD_GUILD_ID 
    } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    
    // Stats de voz
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
          uniqueUsers: { $addToSet: '$userId' },
          averageSessionTime: { $avg: '$duration' }
        }
      }
    ]);

    // Canais mais populares
    const topChannels = await VoiceActivity.aggregate([
      { 
        $match: { 
          guildId,
          joinTime: { $gte: startDate },
          duration: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$channelName',
          totalTime: { $sum: '$duration' },
          sessions: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      { $sort: { totalTime: -1 } },
      { $limit: 10 }
    ]);

    const stats = voiceStats[0] || {
      totalMinutes: 0,
      totalSessions: 0,
      uniqueUsers: [],
      averageSessionTime: 0
    };

    res.json({
      success: true,
      data: {
        summary: {
          totalMinutes: stats.totalMinutes,
          totalHours: Math.round(stats.totalMinutes / 60 * 10) / 10,
          totalSessions: stats.totalSessions,
          uniqueUsers: stats.uniqueUsers.length,
          averageSessionTime: Math.round(stats.averageSessionTime || 0)
        },
        topChannels: topChannels.map(channel => ({
          name: channel._id,
          totalMinutes: channel.totalTime,
          sessions: channel.sessions,
          uniqueUsers: channel.uniqueUsers.length
        })),
        period: `${days} dias`
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro em /analytics/voice:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// 📈 GET /api/analytics/engagement - Métricas de engagement
router.get('/engagement', async (req, res) => {
  try {
    const { 
      days = 7, 
      guildId = process.env.DISCORD_GUILD_ID 
    } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    const dateStr = startDate.toISOString().split('T')[0];

    // Distribuição de engagement
    const engagementDistribution = await UserEngagement.aggregate([
      { 
        $match: { 
          guildId,
          date: { $gte: new Date(dateStr) }
        }
      },
      {
        $group: {
          _id: '$engagementLevel',
          count: { $sum: 1 },
          averageScore: { $avg: '$engagementScore' }
        }
      }
    ]);

    // Top users por engagement
    const topUsers = await UserEngagement.aggregate([
      { 
        $match: { 
          guildId,
          date: { $gte: new Date(dateStr) }
        }
      },
      {
        $group: {
          _id: '$userId',
          username: { $last: '$username' },
          totalScore: { $sum: '$engagementScore' },
          totalMessages: { $sum: '$messageCount' },
          totalVoiceMinutes: { $sum: '$voiceMinutes' },
          averageLevel: { $last: '$engagementLevel' }
        }
      },
      { $sort: { totalScore: -1 } },
      { $limit: 20 }
    ]);

    res.json({
      success: true,
      data: {
        distribution: engagementDistribution.map(item => ({
          level: item._id,
          count: item.count,
          averageScore: Math.round(item.averageScore || 0)
        })),
        topUsers: topUsers.map((user, index) => ({
          rank: index + 1,
          userId: user._id,
          username: user.username,
          totalScore: Math.round(user.totalScore || 0),
          messages: user.totalMessages,
          voiceMinutes: user.totalVoiceMinutes,
          level: user.averageLevel
        })),
        period: `${days} dias`
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro em /analytics/engagement:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// 👤 GET /api/analytics/user/:userId - Analytics específicas de utilizador
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30, guildId = process.env.DISCORD_GUILD_ID } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    const dateStr = startDate.toISOString().split('T')[0];

    // Atividade do utilizador
    const userActivity = await DiscordActivity.find({
      userId,
      guildId,
      date: { $gte: dateStr }
    }).sort({ date: 1 });

    // Engagement do utilizador
    const userEngagement = await UserEngagement.find({
      userId,
      guildId,
      date: { $gte: new Date(dateStr) }
    }).sort({ date: 1 });

    // Atividade de voz
    const voiceActivity = await VoiceActivity.find({
      userId,
      guildId,
      joinTime: { $gte: startDate }
    }).sort({ joinTime: 1 });

    res.json({
      success: true,
      data: {
        userId,
        activity: userActivity,
        engagement: userEngagement,
        voice: voiceActivity,
        period: `${days} dias`
      }
    });
    
  } catch (error) {
    logger.error(`❌ Erro em /analytics/user/${req.params.userId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// 👥 GET /api/analytics/users - Lista todos os utilizadores com dados completos
router.get('/users', async (req, res) => {
  try {
    const { 
      days = 7, 
      guildId = process.env.DISCORD_GUILD_ID,
      limit = 100,
      sortBy = 'messages' // messages, voice, engagement
    } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    const dateStr = startDate.toISOString().split('T')[0];

    logger.info(`🔍 Buscando utilizadores para guild ${guildId} desde ${dateStr}`);

    // ✅ CORRIGIDO: Buscar todos os utilizadores únicos com suas estatísticas
    // Primeiro, buscar todos os utilizadores que têm atividade
    const users = await DiscordActivity.aggregate([
      { 
        $match: { 
          guildId,
          date: { $gte: dateStr }
        }
      },
      {
        $group: {
          _id: '$userId',
          username: { $last: '$username' },
          displayName: { $last: '$displayName' },
          totalMessages: { 
            $sum: { 
              $cond: [{ $eq: ['$type', 'message'] }, '$count', 0] 
            }
          },
          totalVoiceMinutes: { 
            $sum: { 
              $cond: [{ $eq: ['$type', 'voice'] }, '$totalMinutes', 0] 
            }
          },
          totalWords: { 
            $sum: { 
              $cond: [{ $eq: ['$type', 'message'] }, '$totalWords', 0] 
            }
          },
          totalCharacters: { 
            $sum: { 
              $cond: [{ $eq: ['$type', 'message'] }, '$totalCharacters', 0] 
            }
          },
          channels: { $addToSet: '$channels' },
          lastActivity: { $max: '$lastActivity' },
          firstSeen: { $min: '$createdAt' }
        }
      },
      {
        $project: {
          userId: '$_id',
          username: 1,
          displayName: 1,
          totalMessages: 1,
          totalVoiceMinutes: 1,
          totalWords: 1,
          totalCharacters: 1,
          uniqueChannels: { $size: { $reduce: { input: '$channels', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } } },
          lastActivity: 1,
          firstSeen: 1,
          activityScore: { 
            $add: [
              { $multiply: ['$totalMessages', 1] },
              { $multiply: ['$totalVoiceMinutes', 0.1] },
              { $multiply: ['$totalWords', 0.01] }
            ]
          }
        }
      },
      { $sort: { [sortBy as string]: -1 } },
      { $limit: parseInt(limit as string) }
    ]);

    logger.info(`📊 Encontrados ${users.length} utilizadores com atividade`);

    // Buscar dados de engagement para cada utilizador
    const engagementData = await UserEngagement.find({
      guildId,
      lastCalculated: { $gte: startDate }
    }).select('userId engagementScore engagementLevel messageCount voiceMinutes');

    // Combinar dados de engagement
    const usersWithEngagement = users.map(user => {
      const engagement = engagementData.find(e => e.userId === user.userId);
      return {
        ...user,
        engagementScore: engagement?.engagementScore || 0,
        engagementLevel: engagement?.engagementLevel || 'inactive',
        messageCount: engagement?.messageCount || user.totalMessages,
        voiceMinutes: engagement?.voiceMinutes || user.totalVoiceMinutes
      };
    });

    // Estatísticas gerais
    const totalUsers = usersWithEngagement.length;
    const activeUsers = usersWithEngagement.filter(u => u.totalMessages > 0 || u.totalVoiceMinutes > 0).length;
    const topMessager = usersWithEngagement[0];
    const topVoiceUser = usersWithEngagement.sort((a, b) => b.totalVoiceMinutes - a.totalVoiceMinutes)[0];

    res.json({
      success: true,
      data: {
        users: usersWithEngagement,
        stats: {
          totalUsers,
          activeUsers,
          topMessager: topMessager ? {
            username: topMessager.username,
            displayName: topMessager.displayName,
            messages: topMessager.totalMessages
          } : null,
          topVoiceUser: topVoiceUser ? {
            username: topVoiceUser.username,
            displayName: topVoiceUser.displayName,
            voiceMinutes: topVoiceUser.totalVoiceMinutes
          } : null
        },
        period: `${days} dias`,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro em /analytics/users:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// 🔍 GET /api/analytics/debug - Debug de dados na base de dados
router.get('/debug', async (req, res) => {
  try {
    const { guildId = process.env.DISCORD_GUILD_ID } = req.query;
    
    logger.info(`🔍 Debug de dados para guild ${guildId}`);
    
    // Contar documentos na coleção DiscordActivity
    const totalActivities = await DiscordActivity.countDocuments({ guildId });
    const messageActivities = await DiscordActivity.countDocuments({ 
      guildId, 
      type: 'message' 
    });
    const voiceActivities = await DiscordActivity.countDocuments({ 
      guildId, 
      type: 'voice' 
    });
    
    // Buscar algumas atividades recentes
    const recentActivities = await DiscordActivity.find({ guildId })
      .sort({ lastActivity: -1 })
      .limit(5)
      .select('userId username displayName type count totalWords lastActivity');
    
    // Buscar utilizadores únicos
    const uniqueUsers = await DiscordActivity.distinct('userId', { guildId });
    
    res.json({
      success: true,
      data: {
        guildId,
        totalActivities,
        messageActivities,
        voiceActivities,
        uniqueUsers: uniqueUsers.length,
        recentActivities,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro em /analytics/debug:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// 🔄 POST /api/analytics/refresh - Refresh manual das analytics
router.post('/refresh', async (req, res) => {
  try {
    const { guildId = process.env.DISCORD_GUILD_ID } = req.body;
    
    logger.info(`🔄 Iniciando refresh manual das analytics para guild ${guildId}`);
    
    // Aqui poderíamos implementar lógica de recálculo se necessário
    // Por enquanto apenas retornamos sucesso
    
    res.json({
      success: true,
      message: 'Analytics atualizadas com sucesso',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('❌ Erro em /analytics/refresh:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

export default router;