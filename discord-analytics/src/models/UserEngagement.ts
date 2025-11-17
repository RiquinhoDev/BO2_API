import mongoose, { Schema, Model } from 'mongoose';
import { IUserEngagement } from '../types/database';

// Schema para engagement do usuário
const UserEngagementSchema = new Schema<IUserEngagement>({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
    maxlength: 32,
  },
  displayName: {
    type: String,
    required: true,
    maxlength: 32,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  
  // Métricas básicas
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
  reactionCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  mentionCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  
  // Score e nível
  engagementScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  currentScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  messageScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  voiceScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  presenceScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  engagementLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'very_high'],
    default: 'low',
    index: true,
  },
  level: {
    type: String,
    enum: ['baixo', 'medio', 'alto', 'excelente'],
    default: 'baixo',
  },
  trend: {
    type: String,
    enum: ['up', 'down', 'stable'],
    default: 'stable',
  },
  trendPercentage: {
    type: Number,
    default: 0,
  },
  
  // Detalhes por canal
  channels: [{
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
    timeSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
  }],
  
  // Análise temporal
  timeDistribution: {
    morning: {
      type: Number,
      default: 0,
      min: 0,
    },
    afternoon: {
      type: Number,
      default: 0,
      min: 0,
    },
    evening: {
      type: Number,
      default: 0,
      min: 0,
    },
    night: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  lastCalculated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  collection: 'user_engagement',
});

// Índices compostos
UserEngagementSchema.index({ guildId: 1, date: -1 });
UserEngagementSchema.index({ userId: 1, date: -1 });
UserEngagementSchema.index({ guildId: 1, engagementLevel: 1, date: -1 });
UserEngagementSchema.index({ guildId: 1, engagementScore: -1, date: -1 });

// Índice único para evitar duplicatas
UserEngagementSchema.index({ userId: 1, guildId: 1, date: 1 }, { unique: true });

// TTL index para limpar dados antigos (2 anos)
UserEngagementSchema.index({ date: 1 }, { expireAfterSeconds: 63072000 });

// Middleware para calcular engagement level
UserEngagementSchema.pre('save', function(next) {
  // Calcular engagement level baseado no score
  if (this.engagementScore < 10) {
    this.engagementLevel = 'low';
  } else if (this.engagementScore < 50) {
    this.engagementLevel = 'medium';
  } else if (this.engagementScore < 100) {
    this.engagementLevel = 'high';
  } else {
    this.engagementLevel = 'very_high';
  }
  
  // Atualizar lastCalculated
  this.lastCalculated = new Date();
  
  next();
});

// Métodos estáticos
UserEngagementSchema.statics.findByUser = function(userId: string, limit: number = 30) {
  return this.find({ userId })
    .sort({ date: -1 })
    .limit(limit);
};

UserEngagementSchema.statics.getTopUsers = function(
  guildId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 10
) {
  return this.aggregate([
    {
      $match: {
        guildId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$userId',
        username: { $last: '$username' },
        displayName: { $last: '$displayName' },
        totalScore: { $sum: '$engagementScore' },
        avgScore: { $avg: '$engagementScore' },
        totalMessages: { $sum: '$messageCount' },
        totalVoiceMinutes: { $sum: '$voiceMinutes' },
        totalReactions: { $sum: '$reactionCount' },
        daysActive: { $sum: 1 },
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
        userId: '$_id',
        username: 1,
        displayName: 1,
        totalScore: 1,
        avgScore: { $round: ['$avgScore', 2] },
        totalMessages: 1,
        totalVoiceMinutes: 1,
        totalReactions: 1,
        daysActive: 1,
        _id: 0,
      },
    },
  ]);
};

UserEngagementSchema.statics.getEngagementTrends = function(
  guildId: string,
  userId?: string,
  days: number = 30
) {
  const match: any = {
    guildId,
    date: {
      $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    },
  };
  
  if (userId) {
    match.userId = userId;
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
          day: { $dayOfMonth: '$date' },
        },
        avgScore: { $avg: '$engagementScore' },
        totalMessages: { $sum: '$messageCount' },
        totalVoiceMinutes: { $sum: '$voiceMinutes' },
        uniqueUsers: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day',
          },
        },
        avgScore: { $round: ['$avgScore', 2] },
        totalMessages: 1,
        totalVoiceMinutes: 1,
        uniqueUserCount: { $size: '$uniqueUsers' },
      },
    },
    { $sort: { date: 1 } },
  ]);
};

UserEngagementSchema.statics.getChannelEngagement = function(
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
    { $unwind: '$channels' },
    {
      $group: {
        _id: '$channels.channelId',
        channelName: { $last: '$channels.channelName' },
        totalMessages: { $sum: '$channels.messageCount' },
        totalTimeSpent: { $sum: '$channels.timeSpent' },
        uniqueUsers: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        channelId: '$_id',
        channelName: 1,
        totalMessages: 1,
        totalTimeSpent: 1,
        uniqueUserCount: { $size: '$uniqueUsers' },
        avgMessagesPerUser: {
          $round: [{ $divide: ['$totalMessages', { $size: '$uniqueUsers' }] }, 2],
        },
        _id: 0,
      },
    },
    { $sort: { totalMessages: -1 } },
  ]);
};

UserEngagementSchema.statics.getTimeDistributionAnalysis = function(
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
    {
      $group: {
        _id: null,
        morningActivity: { $sum: '$timeDistribution.morning' },
        afternoonActivity: { $sum: '$timeDistribution.afternoon' },
        eveningActivity: { $sum: '$timeDistribution.evening' },
        nightActivity: { $sum: '$timeDistribution.night' },
        totalActivity: {
          $sum: {
            $add: [
              '$timeDistribution.morning',
              '$timeDistribution.afternoon',
              '$timeDistribution.evening',
              '$timeDistribution.night',
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        distribution: {
          morning: {
            count: '$morningActivity',
            percentage: {
              $round: [
                { $multiply: [{ $divide: ['$morningActivity', '$totalActivity'] }, 100] },
                1,
              ],
            },
          },
          afternoon: {
            count: '$afternoonActivity',
            percentage: {
              $round: [
                { $multiply: [{ $divide: ['$afternoonActivity', '$totalActivity'] }, 100] },
                1,
              ],
            },
          },
          evening: {
            count: '$eveningActivity',
            percentage: {
              $round: [
                { $multiply: [{ $divide: ['$eveningActivity', '$totalActivity'] }, 100] },
                1,
              ],
            },
          },
          night: {
            count: '$nightActivity',
            percentage: {
              $round: [
                { $multiply: [{ $divide: ['$nightActivity', '$totalActivity'] }, 100] },
                1,
              ],
            },
          },
        },
        totalActivity: 1,
      },
    },
  ]);
};

// Criar e exportar o modelo
export const UserEngagement: Model<IUserEngagement> = mongoose.model<IUserEngagement>('UserEngagement', UserEngagementSchema);
