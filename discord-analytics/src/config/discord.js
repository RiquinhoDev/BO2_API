"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discordConfig = void 0;
exports.validateDiscordConfig = validateDiscordConfig;
const discord_js_1 = require("discord.js");
exports.discordConfig = {
    // Token e IDs
    token: process.env.DISCORD_ANALYTICS_TOKEN,
    clientId: process.env.DISCORD_ANALYTICS_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    // Intents necessárias para o bot
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
        discord_js_1.GatewayIntentBits.GuildPresences,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildMessageReactions,
        discord_js_1.GatewayIntentBits.GuildEmojisAndStickers,
    ],
    // Partials para eventos incompletos
    partials: [
        discord_js_1.Partials.Message,
        discord_js_1.Partials.Channel,
        discord_js_1.Partials.Reaction,
        discord_js_1.Partials.User,
        discord_js_1.Partials.GuildMember,
    ],
    // Configurações de presença
    presence: {
        activities: [
            {
                name: 'Analytics do servidor',
                type: discord_js_1.ActivityType.Watching,
            },
        ],
        status: 'online',
    }
};
// Validar configurações obrigatórias
function validateDiscordConfig() {
    const required = ['DISCORD_ANALYTICS_TOKEN', 'DISCORD_GUILD_ID'];
    for (const env of required) {
        if (!process.env[env]) {
            throw new Error(`Variável de ambiente obrigatória não definida: ${env}`);
        }
    }
    console.log('✅ Configuração Discord validada');
}
