import mongoose, { Schema, Document } from 'mongoose';

// Interface para atividade do Discord
export interface IDiscordActivity extends Document {
  userId: string;
  username: string;
  displayName?: string;
  date: string; // YYYY-MM-DD
  type: 'message' | 'voice' | 'presence';
  guildId: string;
  
  // Contadores
  count: number;
  totalCharacters?: number;
  totalWords?: number;
  totalMinutes?: number;
  
  // Detalhes específicos
  channels: string[];
  hours: number[];
  attachments?: number;
  mentions?: number;
  emojis?: number;
  
  // Status e timestamps
  currentStatus?: 'online' | 'idle' | 'dnd' | 'offline';
  lastActivity: Date;
  
  // Arrays de dados recentes
  recentMessages?: Array<{
    messageId: string;
    channelId: string;
    timestamp: Date;
    length: number;
  }>;
  
  statusChanges?: Array<{
    status: string;
    timestamp: Date;
  }>;
  
  createdAt: Date;
  updatedAt: Date;
}

// Schema MongoDB
const discordActivitySchema = new Schema<IDiscordActivity>({
  userId: { 
    type: String, 
    required: true,
    index: true 
  },
  username: { 
    type: String, 
    required: true 
  },
  displayName: String,
  date: { 
    type: String, 
    required: true,
    index: true 
  },
  type: { 
    type: String, 
    enum: ['message', 'voice', 'presence'], 
    required: true,
    index: true 
  },
  guildId: { 
    type: String, 
    required: true,
    index: true 
  },
  
  // Contadores
  count: { 
    type: Number, 
    default: 0 
  },
  totalCharacters: { 
    type: Number, 
    default: 0 
  },
  totalWords: { 
    type: Number, 
    default: 0 
  },
  totalMinutes: { 
    type: Number, 
    default: 0 
  },
  
  // Arrays
  channels: [String],
  hours: [Number],
  attachments: { 
    type: Number, 
    default: 0 
  },
  mentions: { 
    type: Number, 
    default: 0 
  },
  emojis: { 
    type: Number, 
    default: 0 
  },
  
  // Status
  currentStatus: {
    type: String,
    enum: ['online', 'idle', 'dnd', 'offline']
  },
  lastActivity: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  
  // Dados recentes
  recentMessages: [{
    messageId: String,
    channelId: String,
    timestamp: Date,
    length: Number
  }],
  
  statusChanges: [{
    status: String,
    timestamp: Date
  }]
  
}, {
  timestamps: true,
  collection: 'discord_activities'
});

// Índices compostos para performance
discordActivitySchema.index({ userId: 1, date: 1, type: 1 });
discordActivitySchema.index({ guildId: 1, date: 1 });
discordActivitySchema.index({ date: 1, type: 1 });
discordActivitySchema.index({ lastActivity: -1 });

// Middleware para limpar dados antigos (opcional)
discordActivitySchema.pre('save', function(next) {
  // Limpar dados mais antigos que 90 dias
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  if (this.statusChanges) {
    this.statusChanges = this.statusChanges.filter(
      change => change.timestamp > ninetyDaysAgo
    );
  }
  
  if (this.recentMessages) {
    this.recentMessages = this.recentMessages.filter(
      msg => msg.timestamp > ninetyDaysAgo
    );
  }
  
  next();
});

export const DiscordActivity = mongoose.model<IDiscordActivity>('DiscordActivity', discordActivitySchema);