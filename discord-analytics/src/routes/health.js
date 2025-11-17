"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const DiscordActivity_1 = require("../models/DiscordActivity");
const VoiceActivity_1 = require("../models/VoiceActivity");
const UserEngagement_1 = require("../models/UserEngagement");
const cache_1 = require("../utils/cache");
const logger_1 = require("../utils/logger");
const mongoose_1 = __importDefault(require("mongoose"));
const router = express_1.default.Router();
// GET /health - Health check principal
router.get('/', async (req, res) => {
    try {
        const startTime = Date.now();
        // Verificar todos os serviços em paralelo
        const [databaseHealth, botHealth, cacheHealth, systemMetrics] = await Promise.all([
            checkDatabaseHealth(),
            checkBotHealth(req.app.locals.bot),
            checkCacheHealth(),
            getSystemMetrics()
        ]);
        // Determinar status geral
        let overallStatus = 'healthy';
        const alerts = [];
        // Verificar status dos serviços
        if (databaseHealth.status === 'disconnected' || databaseHealth.status === 'error') {
            overallStatus = 'unhealthy';
            alerts.push('Database connection issues');
        }
        if (botHealth.status === 'offline') {
            overallStatus = 'unhealthy';
            alerts.push('Discord bot offline');
        }
        if (botHealth.status === 'connecting') {
            overallStatus = 'degraded';
            alerts.push('Discord bot connecting');
        }
        if (databaseHealth.latency && databaseHealth.latency > 1000) {
            overallStatus = 'degraded';
            alerts.push('High database latency');
        }
        if (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal > 0.9) {
            overallStatus = 'degraded';
            alerts.push('High memory usage');
        }
        const healthStatus = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            services: {
                database: databaseHealth,
                bot: botHealth,
                cache: cacheHealth
            },
            metrics: systemMetrics,
            ...(alerts.length > 0 && { alerts })
        };
        const responseTime = Date.now() - startTime;
        // Definir status HTTP baseado no status geral
        const httpStatus = overallStatus === 'healthy' ? 200 :
            overallStatus === 'degraded' ? 200 : 503;
        res.status(httpStatus).json({
            ...healthStatus,
            responseTime: `${responseTime}ms`
        });
        // Log do health check
        logger_1.logger.info(`🏥 Health check: ${overallStatus} (${responseTime}ms)`);
    }
    catch (error) {
        logger_1.logger.error('❌ Erro no health check:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            uptime: process.uptime()
        });
    }
});
// GET /health/database - Health check específico do database
router.get('/database', async (req, res) => {
    try {
        const dbHealth = await checkDatabaseHealth();
        const status = dbHealth.status === 'connected' ? 200 : 503;
        res.status(status).json({
            service: 'database',
            ...dbHealth,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(503).json({
            service: 'database',
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// GET /health/bot - Health check específico do bot
router.get('/bot', async (req, res) => {
    try {
        const botHealth = await checkBotHealth(req.app.locals.bot);
        const status = botHealth.status === 'online' ? 200 : 503;
        res.status(status).json({
            service: 'discord_bot',
            ...botHealth,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(503).json({
            service: 'discord_bot',
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// GET /health/cache - Health check específico do cache
router.get('/cache', async (req, res) => {
    try {
        const cacheHealth = await checkCacheHealth();
        res.json({
            service: 'cache',
            ...cacheHealth,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(503).json({
            service: 'cache',
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// GET /health/metrics - Métricas do sistema
router.get('/metrics', async (req, res) => {
    try {
        const metrics = await getSystemMetrics();
        res.json({
            service: 'system',
            ...metrics,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            service: 'system',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// Função para verificar saúde do database
async function checkDatabaseHealth() {
    try {
        const startTime = Date.now();
        // Testar conexão básica
        const dbState = mongoose_1.default.connection.readyState;
        if (dbState !== 1) {
            return {
                status: 'disconnected',
                collections: { activities: 0, voice: 0, engagement: 0 }
            };
        }
        // Testar consulta simples para medir latência
        await DiscordActivity_1.DiscordActivity.findOne().lean().limit(1);
        const latency = Date.now() - startTime;
        // Contar documentos nas coleções principais
        const [activitiesCount, voiceCount, engagementCount] = await Promise.all([
            DiscordActivity_1.DiscordActivity.countDocuments(),
            VoiceActivity_1.VoiceActivity.countDocuments(),
            UserEngagement_1.UserEngagement.countDocuments()
        ]);
        return {
            status: 'connected',
            latency,
            collections: {
                activities: activitiesCount,
                voice: voiceCount,
                engagement: engagementCount
            }
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Erro ao verificar saúde do database:', error);
        return {
            status: 'error',
            collections: { activities: 0, voice: 0, engagement: 0 }
        };
    }
}
// Função para verificar saúde do bot
async function checkBotHealth(bot) {
    try {
        if (!bot || !bot.client) {
            return {
                status: 'offline',
                guilds: 0,
                users: 0,
                channels: 0
            };
        }
        const client = bot.client;
        if (!client.user) {
            return {
                status: 'connecting',
                guilds: 0,
                users: 0,
                channels: 0
            };
        }
        // Calcular estatísticas do bot
        const guilds = client.guilds.cache.size;
        const users = client.users.cache.size;
        const channels = client.channels.cache.size;
        const ping = client.ws.ping;
        return {
            status: 'online',
            username: client.user.username,
            guilds,
            users,
            channels,
            ping: ping > 0 ? ping : undefined
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Erro ao verificar saúde do bot:', error);
        return {
            status: 'offline',
            guilds: 0,
            users: 0,
            channels: 0
        };
    }
}
// Função para verificar saúde do cache
async function checkCacheHealth() {
    try {
        const stats = cache_1.cache.getStats();
        return {
            status: 'active',
            hitRate: Math.round(stats.hitRate * 100) / 100,
            keys: stats.keys,
            memory: stats.vsize || 0
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Erro ao verificar saúde do cache:', error);
        return {
            status: 'inactive',
            hitRate: 0,
            keys: 0,
            memory: 0
        };
    }
}
// Função para obter métricas do sistema
async function getSystemMetrics() {
    try {
        const memory = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const loadAverage = require('os').loadavg();
        // Simular métricas de eventos (em produção, isso viria de contadores reais)
        const events = {
            processed: 0, // TODO: Implementar contador real
            errors: 0 // TODO: Implementar contador real
        };
        return {
            memory,
            cpu: {
                usage: Math.round((cpuUsage.user + cpuUsage.system) / 1000000), // Convert to ms
                loadAverage
            },
            events
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Erro ao obter métricas do sistema:', error);
        return {
            memory: process.memoryUsage(),
            cpu: {
                usage: 0,
                loadAverage: [0, 0, 0]
            },
            events: {
                processed: 0,
                errors: 0
            }
        };
    }
}
exports.default = router;
