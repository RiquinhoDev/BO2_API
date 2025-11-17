import { z } from 'zod';
import { isValidObjectId } from 'mongoose';

// Schema para validação de dados de mensagem
export const MessageDataSchema = z.object({
  userId: z.string().min(1, 'User ID é obrigatório'),
  username: z.string().min(1, 'Username é obrigatório'),
  displayName: z.string().min(1, 'Display name é obrigatório'),
  channelId: z.string().min(1, 'Channel ID é obrigatório'),
  channelName: z.string().min(1, 'Channel name é obrigatório'),
  messageLength: z.number().min(0, 'Message length deve ser positivo'),
  wordCount: z.number().min(0, 'Word count deve ser positivo'),
  hasAttachments: z.boolean(),
  hasMentions: z.boolean(),
  hasEmojis: z.boolean(),
  timestamp: z.date(),
  guildId: z.string().min(1, 'Guild ID é obrigatório'),
  messageId: z.string().min(1, 'Message ID é obrigatório'),
});

// Schema para validação de dados de voz
export const VoiceDataSchema = z.object({
  userId: z.string().min(1, 'User ID é obrigatório'),
  username: z.string().min(1, 'Username é obrigatório'),
  displayName: z.string().min(1, 'Display name é obrigatório'),
  channelId: z.string().nullable(),
  channelName: z.string().nullable(),
  action: z.enum(['join', 'leave', 'switch']),
  previousChannelId: z.string().nullable(),
  previousChannelName: z.string().nullable(),
  timestamp: z.date(),
  guildId: z.string().min(1, 'Guild ID é obrigatório'),
});

// Schema para validação de dados de presença
export const PresenceDataSchema = z.object({
  userId: z.string().min(1, 'User ID é obrigatório'),
  username: z.string().min(1, 'Username é obrigatório'),
  displayName: z.string().min(1, 'Display name é obrigatório'),
  status: z.enum(['online', 'idle', 'dnd', 'offline']),
  previousStatus: z.enum(['online', 'idle', 'dnd', 'offline']).nullable(),
  activities: z.array(z.object({
    name: z.string(),
    type: z.number(),
    details: z.string().nullable(),
    state: z.string().nullable(),
  })).optional(),
  timestamp: z.date(),
  guildId: z.string().min(1, 'Guild ID é obrigatório'),
});

// Schema para parâmetros de analytics
export const AnalyticsParamsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  userId: z.string().optional(),
  channelId: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  page: z.number().min(1).optional(),
});

// Validações customizadas
export const validators = {
  // Validar Discord ID (snowflake)
  isValidDiscordId: (id: string): boolean => {
    return /^\d{17,19}$/.test(id);
  },
  
  // Validar MongoDB ObjectId
  isValidMongoId: (id: string): boolean => {
    return isValidObjectId(id);
  },
  
  // Validar se é uma data válida
  isValidDate: (date: any): boolean => {
    return date instanceof Date && !isNaN(date.getTime());
  },
  
  // Validar range de datas
  isValidDateRange: (startDate: Date, endDate: Date): boolean => {
    return startDate <= endDate;
  },
  
  // Validar se o timestamp não é muito antigo (mais de 1 ano)
  isRecentTimestamp: (timestamp: Date): boolean => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return timestamp >= oneYearAgo;
  },
  
  // Validar estrutura de comando Discord
  isValidCommandData: (command: any): boolean => {
    return (
      command &&
      typeof command.data === 'object' &&
      typeof command.data.name === 'string' &&
      typeof command.execute === 'function'
    );
  },
  
  // Validar configurações do bot
  validateBotConfig: (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!process.env.DISCORD_ANALYTICS_TOKEN) {
      errors.push('DISCORD_ANALYTICS_TOKEN não definido');
    }
    
    if (!process.env.DISCORD_GUILD_ID) {
      errors.push('DISCORD_GUILD_ID não definido');
    }
    
    if (!process.env.MONGO_URI) {
      errors.push('MONGO_URI não definido');
    }
    
    if (process.env.PORT && isNaN(Number(process.env.PORT))) {
      errors.push('PORT deve ser um número válido');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  },
  
  // Sanitizar dados de entrada
  sanitizeString: (input: string, maxLength: number = 1000): string => {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, maxLength);
  },
  
  // Validar e sanitizar dados de mensagem
  sanitizeMessageData: (data: any): any => {
    try {
      return MessageDataSchema.parse({
        ...data,
        username: validators.sanitizeString(data.username, 32),
        displayName: validators.sanitizeString(data.displayName, 32),
        channelName: validators.sanitizeString(data.channelName, 100),
      });
    } catch (error) {
      throw new Error(`Dados de mensagem inválidos: ${error}`);
    }
  }
};

// Middleware de validação para Express
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse({
        ...req.query,
        ...req.params,
        ...req.body
      });
      
      req.validated = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Dados de entrada inválidos',
          details: error.errors
        });
      }
      
      return res.status(500).json({
        error: 'Erro interno de validação'
      });
    }
  };
};
