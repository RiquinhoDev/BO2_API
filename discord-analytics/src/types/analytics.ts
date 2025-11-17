// Tipos para analytics de mensagens
export interface MessageAnalytics {
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

// Tipos para analytics de voz
export interface VoiceAnalytics {
  userId: string;
  username: string;
  displayName: string;
  channelId: string | null;
  channelName: string | null;
  action: 'join' | 'leave' | 'switch';
  previousChannelId?: string | null;
  previousChannelName?: string | null;
  timestamp: Date;
  guildId: string;
  sessionDuration?: number; // em minutos
}

// Tipos para analytics de presença
export interface PresenceAnalytics {
  userId: string;
  username: string;
  displayName: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  previousStatus?: 'online' | 'idle' | 'dnd' | 'offline' | null;
  activities: Array<{
    name: string;
    type: number;
    details?: string | null;
    state?: string | null;
  }>;
  timestamp: Date;
  guildId: string;
}

// Tipos para engagement de usuário
export interface UserEngagement {
  userId: string;
  username: string;
  displayName: string;
  date: Date;
  messageCount: number;
  voiceMinutes: number;
  reactionCount: number;
  mentionCount: number;
  engagementScore: number;
  engagementLevel: 'low' | 'medium' | 'high' | 'very_high';
  channels: Array<{
    channelId: string;
    channelName: string;
    messageCount: number;
    timeSpent: number;
  }>;
  guildId: string;
}

// Tipos para estatísticas do servidor
export interface ServerStats {
  guildId: string;
  date: Date;
  totalMembers: number;
  activeMembers: number;
  onlineMembers: number;
  totalMessages: number;
  totalVoiceMinutes: number;
  topChannels: Array<{
    channelId: string;
    channelName: string;
    messageCount: number;
    uniqueUsers: number;
  }>;
  topUsers: Array<{
    userId: string;
    username: string;
    engagementScore: number;
    messageCount: number;
    voiceMinutes: number;
  }>;
  growthMetrics: {
    newMembers: number;
    memberRetention: number;
    messageGrowth: number;
    engagementGrowth: number;
  };
}

// Tipos para relatórios
export interface AnalyticsReport {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  dateRange: {
    start: Date;
    end: Date;
  };
  guildId: string;
  data: {
    overview: {
      totalMessages: number;
      totalVoiceMinutes: number;
      activeUsers: number;
      averageEngagement: number;
    };
    trends: {
      messagesTrend: number;
      voiceTrend: number;
      engagementTrend: number;
    };
    topUsers: Array<{
      userId: string;
      username: string;
      score: number;
      rank: number;
    }>;
    topChannels: Array<{
      channelId: string;
      channelName: string;
      activity: number;
      rank: number;
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
  createdAt: Date;
  createdBy?: string;
}

// Tipos para filtros de analytics
export interface AnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  channelId?: string;
  messageType?: 'all' | 'text' | 'attachment' | 'mention';
  engagementLevel?: 'low' | 'medium' | 'high' | 'very_high';
  timeZone?: string;
}

// Tipos para métricas agregadas
export interface AggregatedMetrics {
  period: string; // ISO date string
  metrics: {
    messages: {
      total: number;
      average: number;
      peak: number;
    };
    voice: {
      totalMinutes: number;
      averageSession: number;
      peakConcurrent: number;
    };
    engagement: {
      averageScore: number;
      distribution: {
        low: number;
        medium: number;
        high: number;
        very_high: number;
      };
    };
    users: {
      total: number;
      active: number;
      new: number;
      returning: number;
    };
  };
}

// Tipos para comparações
export interface ComparisonData {
  current: AggregatedMetrics;
  previous: AggregatedMetrics;
  change: {
    messages: number;
    voice: number;
    engagement: number;
    users: number;
  };
  trend: 'up' | 'down' | 'stable';
}

// Tipos para dashboard
export interface DashboardData {
  overview: {
    totalMembers: number;
    activeToday: number;
    messagestoday: number;
    voiceMinutesToday: number;
  };
  trends: ComparisonData;
  topPerformers: {
    users: Array<{
      userId: string;
      username: string;
      score: number;
      change: number;
    }>;
    channels: Array<{
      channelId: string;
      channelName: string;
      activity: number;
      change: number;
    }>;
  };
  recentActivity: Array<{
    type: 'message' | 'voice' | 'join' | 'leave';
    userId: string;
    username: string;
    details: string;
    timestamp: Date;
  }>;
  alerts: Array<{
    type: 'info' | 'warning' | 'error';
    message: string;
    timestamp: Date;
  }>;
}
