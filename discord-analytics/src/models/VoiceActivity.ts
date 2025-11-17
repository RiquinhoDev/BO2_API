import mongoose, { Schema, Model } from 'mongoose';
import { IVoiceActivity } from '../types/database';

// Schema para atividade de voz
const VoiceActivitySchema = new Schema<IVoiceActivity>({
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
  channelId: {
    type: String,
    required: true,
    index: true,
  },
  channelName: {
    type: String,
    required: true,
    maxlength: 100,
  },
  
  // Dados da sessão
  joinTime: {
    type: Date,
    required: true,
    index: true,
  },
  leaveTime: {
    type: Date,
    index: true,
  },
  duration: {
    type: Number,
    min: 0,
  },
  date: {
    type: String,
    required: true,
    index: true,
  },
  
  // Estado da sessão
  status: {
    type: String,
    enum: ['active', 'completed', 'disconnected'],
    default: 'active',
    index: true,
  },
  
  // Dados adicionais
  wasDeafened: {
    type: Boolean,
    default: false,
  },
  wasMuted: {
    type: Boolean,
    default: false,
  },
  wasStreaming: {
    type: Boolean,
    default: false,
  },
  wasVideo: {
    type: Boolean,
    default: false,
  },
  
  guildId: {
    type: String,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'voice_activities',
});

// Índices compostos
VoiceActivitySchema.index({ guildId: 1, joinTime: -1 });
VoiceActivitySchema.index({ userId: 1, joinTime: -1 });
VoiceActivitySchema.index({ channelId: 1, joinTime: -1 });
VoiceActivitySchema.index({ guildId: 1, status: 1, joinTime: -1 });

// TTL index para limpar dados antigos (1 ano)
VoiceActivitySchema.index({ joinTime: 1 }, { expireAfterSeconds: 31536000 });

// Middleware para calcular duração
VoiceActivitySchema.pre('save', function(next) {
  // Calcular duração se leaveTime estiver definido
  if (this.leaveTime && this.joinTime) {
    this.duration = Math.max(0, Math.floor((this.leaveTime.getTime() - this.joinTime.getTime()) / (1000 * 60)));
    
    // Se há duração, marcar como completed
    if (this.status === 'active') {
      this.status = 'completed';
    }
  }
  
  next();
});

// Métodos estáticos
VoiceActivitySchema.statics.findActiveSession = function(userId: string, channelId: string) {
  return this.findOne({
    userId,
    channelId,
    status: 'active',
  });
};

VoiceActivitySchema.statics.findUserActiveSessions = function(userId: string) {
  return this.find({
    userId,
    status: 'active',
  });
};

VoiceActivitySchema.statics.endSession = function(userId: string, channelId: string, leaveTime: Date = new Date()) {
  return this.findOneAndUpdate(
    {
      userId,
      channelId,
      status: 'active',
    },
    {
      $set: {
        leaveTime,
        status: 'completed',
      },
    },
    { new: true }
  );
};

VoiceActivitySchema.statics.getUserVoiceStats = function(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const match: any = { userId, status: 'completed' };
  
  if (startDate || endDate) {
    match.joinTime = {};
    if (startDate) match.joinTime.$gte = startDate;
    if (endDate) match.joinTime.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        totalMinutes: { $sum: '$duration' },
        avgSessionDuration: { $avg: '$duration' },
        longestSession: { $max: '$duration' },
        shortestSession: { $min: '$duration' },
        channelsUsed: { $addToSet: '$channelId' },
        daysActive: {
          $addToSet: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$joinTime',
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalSessions: 1,
        totalMinutes: 1,
        totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
        avgSessionDuration: { $round: ['$avgSessionDuration', 1] },
        longestSession: 1,
        shortestSession: 1,
        uniqueChannels: { $size: '$channelsUsed' },
        daysActive: { $size: '$daysActive' },
      },
    },
  ]);
};

VoiceActivitySchema.statics.getChannelVoiceStats = function(
  channelId: string,
  startDate?: Date,
  endDate?: Date
) {
  const match: any = { channelId, status: 'completed' };
  
  if (startDate || endDate) {
    match.joinTime = {};
    if (startDate) match.joinTime.$gte = startDate;
    if (endDate) match.joinTime.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        totalMinutes: { $sum: '$duration' },
        avgSessionDuration: { $avg: '$duration' },
        uniqueUsers: { $addToSet: '$userId' },
        peakConcurrent: { $max: '$concurrent' }, // Será calculado separadamente
      },
    },
    {
      $project: {
        _id: 0,
        totalSessions: 1,
        totalMinutes: 1,
        totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
        avgSessionDuration: { $round: ['$avgSessionDuration', 1] },
        uniqueUsers: { $size: '$uniqueUsers' },
      },
    },
  ]);
};

VoiceActivitySchema.statics.getVoiceActivityTrends = function(
  guildId: string,
  days: number = 30
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        guildId,
        joinTime: { $gte: startDate },
        status: 'completed',
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$joinTime' },
          month: { $month: '$joinTime' },
          day: { $dayOfMonth: '$joinTime' },
        },
        totalSessions: { $sum: 1 },
        totalMinutes: { $sum: '$duration' },
        uniqueUsers: { $addToSet: '$userId' },
        uniqueChannels: { $addToSet: '$channelId' },
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
        totalSessions: 1,
        totalMinutes: 1,
        totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
        uniqueUsers: { $size: '$uniqueUsers' },
        uniqueChannels: { $size: '$uniqueChannels' },
        avgSessionDuration: {
          $round: [{ $divide: ['$totalMinutes', '$totalSessions'] }, 1],
        },
        _id: 0,
      },
    },
    { $sort: { date: 1 } },
  ]);
};

VoiceActivitySchema.statics.getHourlyDistribution = function(
  guildId: string,
  startDate?: Date,
  endDate?: Date
) {
  const match: any = { guildId, status: 'completed' };
  
  if (startDate || endDate) {
    match.joinTime = {};
    if (startDate) match.joinTime.$gte = startDate;
    if (endDate) match.joinTime.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $hour: '$joinTime' },
        totalSessions: { $sum: 1 },
        totalMinutes: { $sum: '$duration' },
        uniqueUsers: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        hour: '$_id',
        totalSessions: 1,
        totalMinutes: 1,
        totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
        uniqueUsers: { $size: '$uniqueUsers' },
        avgSessionDuration: {
          $round: [{ $divide: ['$totalMinutes', '$totalSessions'] }, 1],
        },
        _id: 0,
      },
    },
    { $sort: { hour: 1 } },
  ]);
};

VoiceActivitySchema.statics.getTopVoiceUsers = function(
  guildId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 10
) {
  return this.aggregate([
    {
      $match: {
        guildId,
        joinTime: { $gte: startDate, $lte: endDate },
        status: 'completed',
      },
    },
    {
      $group: {
        _id: '$userId',
        username: { $last: '$username' },
        displayName: { $last: '$displayName' },
        totalSessions: { $sum: 1 },
        totalMinutes: { $sum: '$duration' },
        avgSessionDuration: { $avg: '$duration' },
        longestSession: { $max: '$duration' },
        channelsUsed: { $addToSet: '$channelId' },
      },
    },
    {
      $project: {
        userId: '$_id',
        username: 1,
        displayName: 1,
        totalSessions: 1,
        totalMinutes: 1,
        totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
        avgSessionDuration: { $round: ['$avgSessionDuration', 1] },
        longestSession: 1,
        channelsUsed: { $size: '$channelsUsed' },
        _id: 0,
      },
    },
    { $sort: { totalMinutes: -1 } },
    { $limit: limit },
  ]);
};

VoiceActivitySchema.statics.getConcurrentUsers = function(
  guildId: string,
  timestamp: Date
) {
  return this.countDocuments({
    guildId,
    joinTime: { $lte: timestamp },
    $or: [
      { leaveTime: { $gte: timestamp } },
      { leaveTime: { $exists: false } },
      { status: 'active' },
    ],
  });
};

// Criar e exportar o modelo
export const VoiceActivity: Model<IVoiceActivity> = mongoose.model<IVoiceActivity>('VoiceActivity', VoiceActivitySchema);
