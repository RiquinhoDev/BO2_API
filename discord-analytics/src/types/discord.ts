import { Client, Guild, User, GuildMember, TextChannel, VoiceChannel } from 'discord.js';

// Tipos básicos do Discord
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot: boolean;
  displayName?: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  categoryId?: string;
  categoryName?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  memberCount: number;
  icon: string | null;
}

// Tipos para activities
export interface DiscordActivity {
  name: string;
  type: number;
  details?: string | null;
  state?: string | null;
  url?: string | null;
  timestamps?: {
    start?: number;
    end?: number;
  };
}

// Tipos para presença
export interface DiscordPresence {
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activities: DiscordActivity[];
  clientStatus?: {
    desktop?: string;
    mobile?: string;
    web?: string;
  };
}

// Eventos do bot
export interface BotEvent {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => Promise<void> | void;
}

export interface BotCommand {
  data: {
    name: string;
    description: string;
    options?: any[];
  };
  execute: (interaction: any) => Promise<void>;
  cooldown?: number;
}

// Contexto do bot
export interface BotContext {
  client: Client;
  commands: Map<string, BotCommand>;
}

// Dados de comando slash
export interface CommandInteraction {
  id: string;
  commandName: string;
  user: DiscordUser;
  guild: DiscordGuild;
  channel: DiscordChannel;
  options: Map<string, any>;
  createdTimestamp: number;
}

// Permissões
export interface PermissionLevel {
  level: number;
  name: string;
  check: (member: GuildMember) => boolean;
}
