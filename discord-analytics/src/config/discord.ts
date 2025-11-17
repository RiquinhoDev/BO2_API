import { GatewayIntentBits, Partials, ActivityType } from 'discord.js';

export const discordConfig = {
  // Token e IDs
  token: process.env.DISCORD_ANALYTICS_TOKEN,
  clientId: process.env.DISCORD_ANALYTICS_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  
  // Intents necessárias para o bot
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  
  // Partials para eventos incompletos
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
  
  // Configurações de presença
  presence: {
    activities: [
      {
        name: 'Analytics do servidor',
        type: ActivityType.Watching,
      },
    ],
    status: 'online' as const,
  }
};

// Validar configurações obrigatórias
export function validateDiscordConfig(): void {
  const required = ['DISCORD_ANALYTICS_TOKEN', 'DISCORD_GUILD_ID'];
  
  for (const env of required) {
    if (!process.env[env]) {
      throw new Error(`Variável de ambiente obrigatória não definida: ${env}`);
    }
  }
  
  console.log('✅ Configuração Discord validada');
}