import { Document, ObjectId } from 'mongoose';

// Base interface para documentos MongoDB
export interface BaseDocument extends Document {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Interface para DiscordActivity document
export interface IDiscordActivity extends BaseDocument {
  userId: string;
  username: string;
  displayName: string;
  activityType: 'message' | 'voice' | 'presence';
  channelId?: string;
  channelName?: string;
  data: {
    // Para mensagens
    messageLength?: number;
    wordCount?: number;
    hasAttachments?: boolean;
    hasMentions?: boolean;
    hasEmojis?: boolean;
    messageId?: string;
    
    // Para voz
    action?: 'join' | 'leave' | 'switch';
    sessionDuration?: number;
    previousChannelId?: string;
    previousChannelName?: string;
    
    // Para presença
    status?: 'online' | 'idle' | 'dnd' | 'offline';
    previousStatus?: 'online' | 'idle' | 'dnd' | 'offline';
    activities?: Array<{
      name: string;
      type: number;
      details?: string;
      state?: string;
    }>;
  };
  timestamp: Date;
  guildId: string;
  processed: boolean;
}

// Interface para UserEngagement document
export interface IUserEngagement extends BaseDocument {
  userId: string;
  username: string;
  displayName: string;
  date: Date;
  
  // Métricas básicas
  messageCount: number;
  voiceMinutes: number;
  reactionCount: number;
  mentionCount: number;
  
  // Score e nível
  engagementScore: number;
  engagementLevel: 'low' | 'medium' | 'high' | 'very_high';
  
  // Detalhes por canal
  channels: Array<{
    channelId: string;
    channelName: string;
    messageCount: number;
    timeSpent: number; // em minutos
  }>;
  
  // Análise temporal
  timeDistribution: {
    morning: number;   // 06:00-12:00
    afternoon: number; // 12:00-18:00
    evening: number;   // 18:00-24:00
    night: number;     // 00:00-06:00
  };
  
  guildId: string;
  lastCalculated: Date;
}

// Interface para ServerStats document
export interface IServerStats extends BaseDocument {
  guildId: string;
  date: Date;
  
  // Estatísticas gerais
  totalMembers: number;
  activeMembers: number;
  onlineMembers: number;
  newMembers: number;
  
  // Atividade
  totalMessages: number;
  totalVoiceMinutes: number;
  totalReactions: number;
  
  // Top performers
  topChannels: Array<{
    channelId: string;
    channelName: string;
    messageCount: number;
    uniqueUsers: number;
    voiceMinutes?: number;
  }>;
  
  topUsers: Array<{
    userId: string;
    username: string;
    engagementScore: number;
    messageCount: number;
    voiceMinutes: number;
    rank: number;
  }>;
  
  // Métricas de crescimento
  growthMetrics: {
    memberGrowth: number;
    messageGrowth: number;
    engagementGrowth: number;
    retentionRate: number;
  };
  
  // Análise temporal
  hourlyDistribution: Array<{
    hour: number;
    messageCount: number;
    activeUsers: number;
  }>;
  
  lastCalculated: Date;
}

// Interface para VoiceActivity document
export interface IVoiceActivity extends BaseDocument {
  userId: string;
  username: string;
  displayName: string;
  channelId: string;
  channelName: string;
  
  // Dados da sessão
  joinTime: Date;
  leaveTime?: Date;
  duration?: number; // em minutos
  
  // Estado da sessão
  status: 'active' | 'completed' | 'disconnected';
  
  // Dados adicionais
  wasDeafened?: boolean;
  wasMuted?: boolean;
  wasStreaming?: boolean;
  wasVideo?: boolean;
  
  guildId: string;
}

// Interface para Reports document
export interface IAnalyticsReport extends BaseDocument {
  title: string;
  description?: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  
  dateRange: {
    start: Date;
    end: Date;
  };
  
  guildId: string;
  
  // Configurações do relatório
  config: {
    includeMessages: boolean;
    includeVoice: boolean;
    includeEngagement: boolean;
    topUsersLimit: number;
    topChannelsLimit: number;
  };
  
  // Dados calculados
  data: {
    overview: {
      totalMessages: number;
      totalVoiceMinutes: number;
      activeUsers: number;
      averageEngagement: number;
      memberGrowth: number;
    };
    
    trends: {
      messagesTrend: number;
      voiceTrend: number;
      engagementTrend: number;
      usersTrend: number;
    };
    
    topUsers: Array<{
      userId: string;
      username: string;
      score: number;
      rank: number;
      change?: number;
    }>;
    
    topChannels: Array<{
      channelId: string;
      channelName: string;
      activity: number;
      rank: number;
      change?: number;
    }>;
    
    timeAnalysis: {
      mostActiveHours: Array<{
        hour: number;
        activity: number;
      }>;
      mostActiveDays: Array<{
        day: string;
        activity: number;
      }>;
    };
  };
  
  // Metadados
  status: 'generating' | 'completed' | 'failed';
  generatedAt?: Date;
  generatedBy?: string;
  error?: string;
}

// Interface para configurações e cache
export interface IBotSettings extends BaseDocument {
  guildId: string;
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  lastModified: Date;
  modifiedBy?: string;
}

// Interface para cache de dados
export interface IDataCache extends BaseDocument {
  key: string;
  data: any;
  expiresAt: Date;
  tags?: string[];
  size?: number;
}

// Types para queries e aggregations
export interface QueryOptions {
  limit?: number;
  page?: number;
  sort?: Record<string, 1 | -1>;
  populate?: string | string[];
  select?: string;
}

export interface AggregationPipeline {
  $match?: any;
  $group?: any;
  $sort?: any;
  $limit?: number;
  $skip?: number;
  $project?: any;
  $lookup?: any;
  $unwind?: any;
}

// Interface para bulk operations
export interface BulkOperation {
  operation: 'insert' | 'update' | 'delete';
  data: any;
  filter?: any;
  options?: any;
}

// Interface para dados de sincronização
export interface ISyncStatus extends BaseDocument {
  type: 'members' | 'channels' | 'roles' | 'messages';
  guildId: string;
  lastSync: Date;
  status: 'success' | 'error' | 'in_progress';
  recordsProcessed: number;
  errors?: Array<{
    error: string;
    data?: any;
    timestamp: Date;
  }>;
  duration: number; // em milissegundos
}
