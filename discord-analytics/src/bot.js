"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// discord-analytics/src/bot.ts - VERSÃO ALINHADA COM FIX
const discord_js_1 = require("discord.js");
const dotenv_1 = require("dotenv");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
// 🔧 CARREGAR .ENV DA PASTA PRINCIPAL
(0, dotenv_1.config)({ path: './.env' });
// 🎯 IMPORTAR TODOS OS MODELOS PRIMEIRO (CRITICAL FIX!)
require("./models"); // Isto vai criar as collections
const models_1 = require("./models"); // Garantir índices
// Imports após dotenv
const logger_1 = require("./utils/logger");
const database_1 = require("./config/database");
const discord_1 = require("./config/discord");
class DiscordAnalyticsBot {
    constructor() {
        // Validar configuração antes de inicializar
        try {
            (0, discord_1.validateDiscordConfig)();
        }
        catch (error) {
            logger_1.logger.error('❌ Erro de configuração:', error);
            process.exit(1);
        }
        // Inicializar Discord Client com todas as intents necessárias
        this.client = new discord_js_1.Client({
            intents: [
                discord_js_1.GatewayIntentBits.Guilds,
                discord_js_1.GatewayIntentBits.GuildMembers,
                discord_js_1.GatewayIntentBits.GuildMessages,
                discord_js_1.GatewayIntentBits.GuildVoiceStates,
                discord_js_1.GatewayIntentBits.GuildPresences,
                discord_js_1.GatewayIntentBits.MessageContent,
                discord_js_1.GatewayIntentBits.GuildMessageReactions,
                discord_js_1.GatewayIntentBits.GuildEmojisAndStickers
            ],
            partials: [
                discord_js_1.Partials.Message,
                discord_js_1.Partials.Channel,
                discord_js_1.Partials.Reaction,
                discord_js_1.Partials.User,
                discord_js_1.Partials.GuildMember
            ]
        });
        // Collection para comandos
        this.commands = new discord_js_1.Collection();
        // Configurar API Express
        this.apiServer = (0, express_1.default)();
        this.setupAPI();
        // Carregar events e commands
        this.loadEvents();
        this.loadCommands();
    }
    // 🔧 Configurar API Express
    setupAPI() {
        this.apiServer.use((0, cors_1.default)());
        this.apiServer.use(express_1.default.json());
        // Health check detalhado
        this.apiServer.get('/health', (req, res) => {
            const health = {
                status: 'online',
                timestamp: new Date().toISOString(),
                uptime: Math.floor(process.uptime()),
                bot: {
                    username: this.client.user?.username || 'offline',
                    id: this.client.user?.id || null,
                    guilds: this.client.guilds.cache.size,
                    users: this.client.users.cache.size,
                    ping: this.client.ws.ping
                },
                database: {
                    status: (0, database_1.getDatabaseStatus)()
                },
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                },
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development'
            };
            res.json(health);
        });
        // Endpoint de teste básico
        this.apiServer.get('/api/test', (req, res) => {
            res.json({
                message: 'Discord Analytics API funcionando!',
                timestamp: new Date().toISOString(),
                bot: this.client.user?.username || 'offline'
            });
        });
        // Endpoint para estatísticas básicas
        this.apiServer.get('/api/stats', (req, res) => {
            const targetGuildId = process.env.DISCORD_GUILD_ID;
            const guild = targetGuildId ? this.client.guilds.cache.get(targetGuildId) : null;
            res.json({
                guild: guild ? {
                    id: guild.id,
                    name: guild.name,
                    memberCount: guild.memberCount,
                    channels: {
                        text: guild.channels.cache.filter(c => c.type === 0).size,
                        voice: guild.channels.cache.filter(c => c.type === 2).size
                    }
                } : null,
                bot: {
                    guilds: this.client.guilds.cache.size,
                    users: this.client.users.cache.size
                }
            });
        });
        // Carregar routes da API
        this.loadAPIRoutes();
        // Iniciar servidor API
        const PORT = process.env.PORT || 3002;
        this.apiServer.listen(PORT, () => {
            logger_1.logger.info(`🌐 API Server rodando em http://localhost:${PORT}`);
        });
    }
    // 📁 Carregar Event Handlers
    loadEvents() {
        const eventsPath = path_1.default.join(__dirname, 'events');
        if (!fs_1.default.existsSync(eventsPath)) {
            logger_1.logger.warn('📁 Pasta events não encontrada');
            return;
        }
        const eventFiles = fs_1.default.readdirSync(eventsPath)
            .filter(file => file.endsWith('.ts') || file.endsWith('.js'));
        for (const file of eventFiles) {
            try {
                const filePath = path_1.default.join(eventsPath, file);
                const event = require(filePath);
                if (event.name) {
                    if (event.once) {
                        this.client.once(event.name, (...args) => event.execute(...args));
                    }
                    else {
                        this.client.on(event.name, (...args) => event.execute(...args));
                    }
                    logger_1.logger.info(`✅ Event carregado: ${event.name}`);
                }
                else {
                    logger_1.logger.warn(`⚠️ Event ${file} não tem propriedade 'name'`);
                }
            }
            catch (error) {
                logger_1.logger.error(`❌ Erro ao carregar event ${file}:`, error);
            }
        }
    }
    // ⚡ Carregar Slash Commands
    loadCommands() {
        const commandsPath = path_1.default.join(__dirname, 'commands');
        if (!fs_1.default.existsSync(commandsPath)) {
            logger_1.logger.info('📁 Pasta commands não encontrada - pular comandos');
            return;
        }
        const commandFiles = fs_1.default.readdirSync(commandsPath)
            .filter(file => file.endsWith('.ts') || file.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const filePath = path_1.default.join(commandsPath, file);
                const command = require(filePath);
                if (command.data && command.execute) {
                    this.commands.set(command.data.name, command);
                    logger_1.logger.info(`✅ Comando carregado: /${command.data.name}`);
                }
                else {
                    logger_1.logger.warn(`⚠️ Comando ${file} não tem data ou execute`);
                }
            }
            catch (error) {
                logger_1.logger.error(`❌ Erro ao carregar comando ${file}:`, error);
            }
        }
    }
    // 🌐 Carregar Routes da API
    loadAPIRoutes() {
        try {
            const analyticsRoutes = require('./routes/analytics');
            this.apiServer.use('/api/analytics', analyticsRoutes.default || analyticsRoutes);
            logger_1.logger.info('✅ Routes de analytics carregadas');
        }
        catch (error) {
            logger_1.logger.error('❌ Erro ao carregar routes de analytics:', error);
        }
    }
    // 🚀 Inicializar Bot
    async start() {
        try {
            logger_1.logger.info('🔄 Inicializando Discord Analytics Bot...');
            logger_1.logger.info(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            // Conectar à base de dados
            await (0, database_1.connectDatabase)();
            logger_1.logger.info('✅ Base de dados conectada');
            // 🎯 GARANTIR QUE OS MODELOS EXISTEM (CRITICAL FIX!)
            try {
                await (0, models_1.ensureIndexes)();
                logger_1.logger.info('✅ Modelos e índices inicializados');
            }
            catch (error) {
                logger_1.logger.warn('⚠️ Erro ao inicializar índices:', error);
                // Não parar o bot por causa dos índices
            }
            // Login do bot Discord
            await this.client.login(process.env.DISCORD_ANALYTICS_TOKEN);
            logger_1.logger.info('🤖 Discord Analytics Bot iniciado com sucesso!');
            // Log de audit para startup
            if (this.client.user) {
                (0, logger_1.logAuditEvent)('SYSTEM_STARTUP', this.client.user.id, {
                    version: '1.0.0',
                    environment: process.env.NODE_ENV,
                    timestamp: new Date().toISOString()
                });
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Erro crítico ao inicializar bot:', error);
            process.exit(1);
        }
    }
    // 🛑 Shutdown graceful
    async shutdown() {
        logger_1.logger.info('🛑 Iniciando encerramento do Discord Analytics Bot...');
        try {
            // Log de audit para shutdown
            if (this.client.user) {
                (0, logger_1.logAuditEvent)('SYSTEM_SHUTDOWN', this.client.user.id, {
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString()
                });
            }
            // Destruir cliente Discord
            this.client.destroy();
            logger_1.logger.info('✅ Cliente Discord desconectado');
            // Desconectar base de dados
            await (0, database_1.disconnectDatabase)();
            logger_1.logger.info('✅ Base de dados desconectada');
            logger_1.logger.info('✅ Encerramento concluído com sucesso');
            process.exit(0);
        }
        catch (error) {
            logger_1.logger.error('❌ Erro durante encerramento:', error);
            process.exit(1);
        }
    }
}
// 🎯 Inicializar aplicação
const analyticsBot = new DiscordAnalyticsBot();
// Handlers para shutdown graceful
process.on('SIGINT', () => {
    logger_1.logger.info('📥 Recebido SIGINT (Ctrl+C)');
    analyticsBot.shutdown();
});
process.on('SIGTERM', () => {
    logger_1.logger.info('📥 Recebido SIGTERM');
    analyticsBot.shutdown();
});
// Iniciar bot
analyticsBot.start();
exports.default = analyticsBot;
