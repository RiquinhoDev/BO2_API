// discord-analytics/src/bot.ts - VERSÃO ALINHADA COM FIX
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';

// 🔧 CARREGAR .ENV DA PASTA PRINCIPAL
config({ path: './.env' });

// 🎯 IMPORTAR TODOS OS MODELOS PRIMEIRO (CRITICAL FIX!)
import './models'; // Isto vai criar as collections
import { ensureIndexes } from './models'; // Garantir índices

// Imports após dotenv
import { logger, logAuditEvent } from './utils/logger';
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from './config/database';
import { validateDiscordConfig } from './config/discord';

class DiscordAnalyticsBot {
  public client: Client;
  public commands: Collection<string, any>;
  private apiServer: express.Application;

  constructor() {
    // Validar configuração antes de inicializar
    try {
      validateDiscordConfig();
    } catch (error) {
      logger.error('❌ Erro de configuração:', error);
      process.exit(1);
    }

    // Inicializar Discord Client com todas as intents necessárias
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildEmojisAndStickers
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
      ]
    });

    // Collection para comandos
    this.commands = new Collection();

    // Configurar API Express
    this.apiServer = express();
    this.setupAPI();

    // Carregar events e commands
    this.loadEvents();
    this.loadCommands();
  }

  // 🔧 Configurar API Express
  private setupAPI(): void {
    this.apiServer.use(cors());
    this.apiServer.use(express.json());

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
          status: getDatabaseStatus()
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
      logger.info(`🌐 API Server rodando em http://localhost:${PORT}`);
    });
  }

  // 📁 Carregar Event Handlers
  private loadEvents(): void {
    const eventsPath = path.join(__dirname, 'events');
    
    if (!fs.existsSync(eventsPath)) {
      logger.warn('📁 Pasta events não encontrada');
      return;
    }

    const eventFiles = fs.readdirSync(eventsPath)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

    for (const file of eventFiles) {
      try {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        
        if (event.name) {
          if (event.once) {
            this.client.once(event.name, (...args) => event.execute(...args));
          } else {
            this.client.on(event.name, (...args) => event.execute(...args));
          }
          logger.info(`✅ Event carregado: ${event.name}`);
        } else {
          logger.warn(`⚠️ Event ${file} não tem propriedade 'name'`);
        }
      } catch (error) {
        logger.error(`❌ Erro ao carregar event ${file}:`, error);
      }
    }
  }

  // ⚡ Carregar Slash Commands
  private loadCommands(): void {
    const commandsPath = path.join(__dirname, 'commands');
    
    if (!fs.existsSync(commandsPath)) {
      logger.info('📁 Pasta commands não encontrada - pular comandos');
      return;
    }

    const commandFiles = fs.readdirSync(commandsPath)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if (command.data && command.execute) {
          this.commands.set(command.data.name, command);
          logger.info(`✅ Comando carregado: /${command.data.name}`);
        } else {
          logger.warn(`⚠️ Comando ${file} não tem data ou execute`);
        }
      } catch (error) {
        logger.error(`❌ Erro ao carregar comando ${file}:`, error);
      }
    }
  }

  // 🌐 Carregar Routes da API
  private loadAPIRoutes(): void {
    try {
      const analyticsRoutes = require('./routes/analytics');
      this.apiServer.use('/api/analytics', analyticsRoutes.default || analyticsRoutes);
      logger.info('✅ Routes de analytics carregadas');
    } catch (error) {
      logger.error('❌ Erro ao carregar routes de analytics:', error);
    }
  }

  // 🚀 Inicializar Bot
  public async start(): Promise<void> {
    try {
      logger.info('🔄 Inicializando Discord Analytics Bot...');
      logger.info(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);

      // Conectar à base de dados
      await connectDatabase();
      logger.info('✅ Base de dados conectada');

      // 🎯 GARANTIR QUE OS MODELOS EXISTEM (CRITICAL FIX!)
      try {
        await ensureIndexes();
        logger.info('✅ Modelos e índices inicializados');
      } catch (error) {
        logger.warn('⚠️ Erro ao inicializar índices:', error);
        // Não parar o bot por causa dos índices
      }

      // Login do bot Discord
      await this.client.login(process.env.DISCORD_ANALYTICS_TOKEN);
      logger.info('🤖 Discord Analytics Bot iniciado com sucesso!');

      // Log de audit para startup
      if (this.client.user) {
        logAuditEvent('SYSTEM_STARTUP', this.client.user.id, {
          version: '1.0.0',
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      logger.error('❌ Erro crítico ao inicializar bot:', error);
      process.exit(1);
    }
  }

  // 🛑 Shutdown graceful
  public async shutdown(): Promise<void> {
    logger.info('🛑 Iniciando encerramento do Discord Analytics Bot...');
    
    try {
      // Log de audit para shutdown
      if (this.client.user) {
        logAuditEvent('SYSTEM_SHUTDOWN', this.client.user.id, {
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        });
      }

      // Destruir cliente Discord
      this.client.destroy();
      logger.info('✅ Cliente Discord desconectado');

      // Desconectar base de dados
      await disconnectDatabase();
      logger.info('✅ Base de dados desconectada');

      logger.info('✅ Encerramento concluído com sucesso');
      process.exit(0);
      
    } catch (error) {
      logger.error('❌ Erro durante encerramento:', error);
      process.exit(1);
    }
  }
}

// 🎯 Inicializar aplicação
const analyticsBot = new DiscordAnalyticsBot();

// Handlers para shutdown graceful
process.on('SIGINT', () => {
  logger.info('📥 Recebido SIGINT (Ctrl+C)');
  analyticsBot.shutdown();
});

process.on('SIGTERM', () => {
  logger.info('📥 Recebido SIGTERM');
  analyticsBot.shutdown();
});

// Iniciar bot
analyticsBot.start();

export default analyticsBot;