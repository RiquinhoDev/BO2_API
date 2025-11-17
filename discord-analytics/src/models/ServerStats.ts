import mongoose, { Schema, Model } from 'mongoose';
import { IServerStats } from '../types/database';

// Schema para estatísticas do servidor
const ServerStatsSchema = new Schema<IServerStats>({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    index: true,
  },
  targetId: {
    type: String,
    index: true,
  },
  name: {
    type: String,
  },
  count: {
    type: Number,
    default: 0,
  },
  
  // Estatísticas gerais
  totalMembers: {
    type: Number,
    required: true,
    min: 0,
  },
  activeMembers: {
    type: Number,
    required: true,
    min: 0,
  },
  onlineMembers: {
    type: Number,
    required: true,
    min: 0,
  },
  newMembers: {
    type: Number,
    default: 0,
    min: 0,
  },
  
  // Atividade
  totalMessages: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalVoiceMinutes: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalReactions: {
    type: Number,
    default: 0,
    min: 0,
  },
  
  // Top performers
  topChannels: [{
    channelId: {
      type: String,
      required: true,
    },
    channelName: {
      type: String,
      required: true,
      maxlength: 100,
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    uniqueUsers: {
      type: Number,
      default: 0,
      min: 0,
    },
    voiceMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
  }],
  
  topUsers: [{
    userId: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      maxlength: 32,
    },
    engagementScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    voiceMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    rank: {
      type: Number,
      required: true,
      min: 1,
    },
  }],
  
  // Métricas de crescimento
  growthMetrics: {
    memberGrowth: {
      type: Number,
      default: 0,
    },
    messageGrowth: {
      type: Number,
      default: 0,
    },
    engagementGrowth: {
      type: Number,
      default: 0,
    },
    retentionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  
  // Análise temporal
  hourlyDistribution: [{
    hour: {
      type: Number,
      required: true,
      min: 0,
      max: 23,
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    activeUsers: {
      type: Number,
      default: 0,
      min: 0,
    },
  }],
  
  lastCalculated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  collection: 'server_stats',
});

// Índices compostos
ServerStatsSchema.index({ guildId: 1, date: -1 });

// Índice único para evitar duplicatas
ServerStatsSchema.index({ guildId: 1, date: 1 }, { unique: true });

// TTL index para limpar dados antigos (2 anos)
ServerStatsSchema.index({ date: 1 }, { expireAfterSeconds: 63072000 });

// Middleware para validações
ServerStatsSchema.pre('save', function(next) {
  // Garantir que arrays têm tamanho máximo
  if (this.topChannels.length > 20) {
    this.topChannels = this.topChannels.slice(0, 20);
  }
  
  if (this.topUsers.length > 20) {
    this.topUsers = this.topUsers.slice(0, 20);
  }
  
  // Garantir que hourlyDistribution tem 24 entradas
  if (this.hourlyDistribution.length === 0) {
    for (let hour = 0; hour < 24; hour++) {
      this.hourlyDistribution.push({
        hour,
        messageCount: 0,
        activeUsers: 0,
      });
    }
  }
  
  // Atualizar lastCalculated
  this.lastCalculated = new Date();
  
  next();
});

// Métodos estáticos
ServerStatsSchema.statics.getLatestStats = function(guildId: string) {
  return this.findOne({ guildId }).sort({ date: -1 });
};

ServerStatsSchema.statics.getStatsRange = function(
  guildId: string,
  startDate: Date,
  endDate: Date
) {
  return this.find({
    guildId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });
};

ServerStatsSchema.statics.getGrowthTrends = function(
  guildId: string,
  days: number = 30
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        guildId,
        date: { $gte: startDate },
      },
    },
    {
      $sort: { date: 1 },
    },
    {
      $group: {
        _id: null,
        dates: { $push: '$date' },
        totalMembers: { $push: '$totalMembers' },
        activeMembers: { $push: '$activeMembers' },
        totalMessages: { $push: '$totalMessages' },
        totalVoiceMinutes: { $push: '$totalVoiceMinutes' },
        memberGrowth: { $push: '$growthMetrics.memberGrowth' },
        messageGrowth: { $push: '$growthMetrics.messageGrowth' },
        engagementGrowth: { $push: '$growthMetrics.engagementGrowth' },
      },
    },
    {
      $project: {
        _id: 0,
        trend: {
          dates: '$dates',
          members: {
            values: '$totalMembers',
            growth: '$memberGrowth',
          },
          activity: {
            messages: '$totalMessages',
            voice: '$totalVoiceMinutes',
            messageGrowth: '$messageGrowth',
          },
          engagement: {
            activeMembers: '$activeMembers',
            growth: '$engagementGrowth',
          },
        },
      },
    },
  ]);
};

ServerStatsSchema.statics.getTopPerformers = function(
  guildId: string,
  startDate: Date,
  endDate: Date,
  type: 'users' | 'channels' = 'users',
  limit: number = 10
) {
  const unwindField = type === 'users' ? '$topUsers' : '$topChannels';
  const groupField = type === 'users' ? 'userId' : 'channelId';
  const nameField = type === 'users' ? 'username' : 'channelName';
  
  return this.aggregate([
    {
      $match: {
        guildId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    { $unwind: unwindField },
    {
      $group: {
        _id: `${unwindField}.${groupField}`,
        name: { $last: `${unwindField}.${nameField}` },
        totalScore: type === 'users' 
          ? { $sum: `${unwindField}.engagementScore` }
          : { $sum: `${unwindField}.messageCount` },
        totalMessages: { $sum: `${unwindField}.messageCount` },
        avgRank: { $avg: `${unwindField}.rank` },
        appearances: { $sum: 1 },
      },
    },
    {
      $sort: { totalScore: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        [type === 'users' ? 'userId' : 'channelId']: '$_id',
        name: 1,
        totalScore: 1,
        totalMessages: 1,
        avgRank: { $round: ['$avgRank', 1] },
        appearances: 1,
        consistency: {
          $round: [
            { $multiply: [{ $divide: ['$appearances', days] }, 100] },
            1,
          ],
        },
        _id: 0,
      },
    },
  ]);
};

ServerStatsSchema.statics.getActivityHeatmap = function(
  guildId: string,
  startDate: Date,
  endDate: Date
) {
  return this.aggregate([
    {
      $match: {
        guildId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    { $unwind: '$hourlyDistribution' },
    {
      $group: {
        _id: '$hourlyDistribution.hour',
        avgMessages: { $avg: '$hourlyDistribution.messageCount' },
        avgActiveUsers: { $avg: '$hourlyDistribution.activeUsers' },
        totalMessages: { $sum: '$hourlyDistribution.messageCount' },
        totalActiveUsers: { $sum: '$hourlyDistribution.activeUsers' },
        days: { $sum: 1 },
      },
    },
    {
      $project: {
        hour: '$_id',
        avgMessages: { $round: ['$avgMessages', 1] },
        avgActiveUsers: { $round: ['$avgActiveUsers', 1] },
        totalMessages: 1,
        totalActiveUsers: 1,
        days: 1,
        intensity: {
          $round: [
            { $divide: ['$totalMessages', { $max: ['$days', 1] }] },
            1,
          ],
        },
        _id: 0,
      },
    },
    { $sort: { hour: 1 } },
  ]);
};

ServerStatsSchema.statics.getComparativeAnalysis = function(
  guildId: string,
  currentPeriod: { start: Date; end: Date },
  previousPeriod: { start: Date; end: Date }
) {
  return this.aggregate([
    {
      $match: {
        guildId,
        $or: [
          { date: { $gte: currentPeriod.start, $lte: currentPeriod.end } },
          { date: { $gte: previousPeriod.start, $lte: previousPeriod.end } },
        ],
      },
    },
    {
      $group: {
        _id: {
          $cond: [
            { $and: [
              { $gte: ['$date', currentPeriod.start] },
              { $lte: ['$date', currentPeriod.end] },
            ]},
            'current',
            'previous',
          ],
        },
        avgMembers: { $avg: '$totalMembers' },
        avgActiveMembers: { $avg: '$activeMembers' },
        totalMessages: { $sum: '$totalMessages' },
        totalVoiceMinutes: { $sum: '$totalVoiceMinutes' },
        totalNewMembers: { $sum: '$newMembers' },
        days: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: null,
        periods: {
          $push: {
            period: '$_id',
            avgMembers: '$avgMembers',
            avgActiveMembers: '$avgActiveMembers',
            totalMessages: '$totalMessages',
            totalVoiceMinutes: '$totalVoiceMinutes',
            totalNewMembers: '$totalNewMembers',
            days: '$days',
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        current: {
          $arrayElemAt: [
            { $filter: { input: '$periods', cond: { $eq: ['$$this.period', 'current'] } } },
            0,
          ],
        },
        previous: {
          $arrayElemAt: [
            { $filter: { input: '$periods', cond: { $eq: ['$$this.period', 'previous'] } } },
            0,
          ],
        },
      },
    },
  ]);
};

// Criar e exportar o modelo
export const ServerStats: Model<IServerStats> = mongoose.model<IServerStats>('ServerStats', ServerStatsSchema);
