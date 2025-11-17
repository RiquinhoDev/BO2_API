import moment from 'moment';
import _ from 'lodash';
import { logger } from './logger';

// Utilitários para datas
export const dateHelpers = {
  // Obter início do dia
  startOfDay: (date: Date = new Date()): Date => {
    return moment(date).startOf('day').toDate();
  },
  
  // Obter fim do dia
  endOfDay: (date: Date = new Date()): Date => {
    return moment(date).endOf('day').toDate();
  },
  
  // Obter range de datas para analytics
  getDateRange: (days: number = 7, endDate: Date = new Date()): { start: Date; end: Date } => {
    const end = moment(endDate).endOf('day').toDate();
    const start = moment(endDate).subtract(days - 1, 'days').startOf('day').toDate();
    
    return { start, end };
  },
  
  // Formatar data para display
  formatDate: (date: Date, format: string = 'DD/MM/YYYY HH:mm'): string => {
    return moment(date).format(format);
  },
  
  // Obter horário de maior atividade
  getMostActiveHours: (timestamps: Date[]): { hour: number; count: number }[] => {
    const hourCounts = _.countBy(timestamps, timestamp => 
      moment(timestamp).hour()
    );
    
    return Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count);
  },
  
  // Verificar se é weekend
  isWeekend: (date: Date): boolean => {
    const day = moment(date).day();
    return day === 0 || day === 6; // Domingo ou Sábado
  },
  
  // Obter diferença em minutos
  getMinutesDiff: (start: Date, end: Date): number => {
    return moment(end).diff(moment(start), 'minutes');
  }
};

// Utilitários para Discord
export const discordHelpers = {
  // Extrair menções de uma mensagem
  extractMentions: (content: string): {
    users: string[];
    roles: string[];
    channels: string[];
  } => {
    return {
      users: (content.match(/<@!?(\d+)>/g) || []).map(match => 
        match.replace(/<@!?(\d+)>/, '$1')
      ),
      roles: (content.match(/<@&(\d+)>/g) || []).map(match => 
        match.replace(/<@&(\d+)>/, '$1')
      ),
      channels: (content.match(/<#(\d+)>/g) || []).map(match => 
        match.replace(/<#(\d+)>/, '$1')
      )
    };
  },
  
  // Contar emojis em uma mensagem
  countEmojis: (content: string): { custom: number; unicode: number; total: number } => {
    const customEmojis = (content.match(/<:[^:]+:\d+>/g) || []).length;
    const unicodeEmojis = (content.match(/\p{Emoji}/gu) || []).length;
    
    return {
      custom: customEmojis,
      unicode: unicodeEmojis,
      total: customEmojis + unicodeEmojis
    };
  },
  
  // Verificar se usuário está online
  isUserOnline: (status: string): boolean => {
    return ['online', 'idle', 'dnd'].includes(status);
  },
  
  // Obter nível de atividade baseado no status
  getActivityLevel: (status: string): number => {
    switch (status) {
      case 'online': return 3;
      case 'idle': return 2;
      case 'dnd': return 1;
      case 'offline': return 0;
      default: return 0;
    }
  },
  
  // Sanitizar nome de usuário
  sanitizeUsername: (username: string): string => {
    return username.replace(/[^\w\s-_]/g, '').trim().substring(0, 32);
  },
  
  // Verificar se canal é de voz
  isVoiceChannel: (channelType: number): boolean => {
    return [2, 13].includes(channelType); // GUILD_VOICE ou GUILD_STAGE_VOICE
  }
};

// Utilitários para cálculos de engagement
export const engagementHelpers = {
  // Calcular score de engagement baseado em atividades
  calculateEngagementScore: (activities: {
    messages: number;
    voiceMinutes: number;
    reactions: number;
    mentions: number;
  }): number => {
    const { messages, voiceMinutes, reactions, mentions } = activities;
    
    return (
      messages * 1 +
      voiceMinutes * 0.5 +
      reactions * 0.2 +
      mentions * 0.3
    );
  },
  
  // Classificar nível de engagement
  classifyEngagement: (score: number): 'low' | 'medium' | 'high' | 'very_high' => {
    if (score < 10) return 'low';
    if (score < 50) return 'medium';
    if (score < 100) return 'high';
    return 'very_high';
  },
  
  // Calcular tendência de engagement
  calculateTrend: (current: number, previous: number): {
    percentage: number;
    direction: 'up' | 'down' | 'stable';
  } => {
    if (previous === 0) {
      return { percentage: 100, direction: 'up' };
    }
    
    const percentage = ((current - previous) / previous) * 100;
    
    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(percentage) > 5) {
      direction = percentage > 0 ? 'up' : 'down';
    }
    
    return { percentage: Math.round(percentage), direction };
  },
  
  // Normalizar scores para comparação
  normalizeScores: (scores: number[]): number[] => {
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const range = max - min;
    
    if (range === 0) return scores.map(() => 1);
    
    return scores.map(score => (score - min) / range);
  }
};

// Utilitários para estatísticas
export const statsHelpers = {
  // Calcular média
  average: (numbers: number[]): number => {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  },
  
  // Calcular mediana
  median: (numbers: number[]): number => {
    if (numbers.length === 0) return 0;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  },
  
  // Calcular percentil
  percentile: (numbers: number[], percentile: number): number => {
    if (numbers.length === 0) return 0;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    
    if (Math.floor(index) === index) {
      return sorted[index];
    }
    
    const lower = sorted[Math.floor(index)];
    const upper = sorted[Math.ceil(index)];
    return lower + (upper - lower) * (index - Math.floor(index));
  },
  
  // Calcular crescimento
  calculateGrowth: (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  },
  
  // Agrupar dados por período
  groupByPeriod: <T>(
    data: T[], 
    getDate: (item: T) => Date, 
    period: 'hour' | 'day' | 'week' | 'month'
  ): Record<string, T[]> => {
    return _.groupBy(data, item => {
      const date = moment(getDate(item));
      
      switch (period) {
        case 'hour':
          return date.format('YYYY-MM-DD HH');
        case 'day':
          return date.format('YYYY-MM-DD');
        case 'week':
          return date.format('YYYY-[W]WW');
        case 'month':
          return date.format('YYYY-MM');
        default:
          return date.format('YYYY-MM-DD');
      }
    });
  }
};

// Utilitários para formatação
export const formatHelpers = {
  // Formatar números grandes
  formatNumber: (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  },
  
  // Formatar duração em minutos
  formatDuration: (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  },
  
  // Formatar percentagem
  formatPercentage: (value: number, decimals: number = 1): string => {
    return `${value.toFixed(decimals)}%`;
  },
  
  // Truncar texto
  truncateText: (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
};

// Utilitários para cache e performance
export const performanceHelpers = {
  // Debounce function
  debounce: <T extends (...args: any[]) => any>(
    func: T,
    waitFor: number
  ): (...args: Parameters<T>) => void => {
    let timeout: NodeJS.Timeout;
    
    return (...args: Parameters<T>): void => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), waitFor);
    };
  },
  
  // Throttle function
  throttle: <T extends (...args: any[]) => any>(
    func: T,
    waitFor: number
  ): (...args: Parameters<T>) => void => {
    let inThrottle: boolean;
    
    return (...args: Parameters<T>): void => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, waitFor);
      }
    };
  },
  
  // Retry com backoff exponencial
  retryWithBackoff: async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> => {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`Tentativa ${attempt + 1} falhou, tentando novamente em ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
};

// Exportar tudo como um objeto
export const helpers = {
  date: dateHelpers,
  discord: discordHelpers,
  engagement: engagementHelpers,
  stats: statsHelpers,
  format: formatHelpers,
  performance: performanceHelpers
};
