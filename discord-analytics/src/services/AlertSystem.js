"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertSystem = void 0;
const EngagementCalculator_1 = require("./EngagementCalculator");
const DiscordActivity_1 = require("../models/DiscordActivity");
const logger_1 = require("../utils/logger");
const helpers_1 = require("../utils/helpers");
const discord_js_1 = require("discord.js");
class AlertSystem {
    // Inicializar sistema de alertas
    static initialize(bot) {
        if (!this.config.enabled) {
            logger_1.logger.info('🚨 Sistema de alertas desativado');
            return;
        }
        logger_1.logger.info('🚨 Sistema de alertas inicializado');
        // Executar verificações periódicas
        setInterval(() => {
            this.runPeriodicChecks(bot);
        }, 15 * 60 * 1000); // A cada 15 minutos
        // Verificação inicial após 5 minutos
        setTimeout(() => {
            this.runPeriodicChecks(bot);
        }, 5 * 60 * 1000);
    }
    // Executar verificações periódicas
    static async runPeriodicChecks(bot) {
        try {
            const guildId = process.env.DISCORD_GUILD_ID;
            if (!guildId)
                return;
            logger_1.logger.debug('🔍 Executando verificações periódicas de alertas...');
            await Promise.all([
                this.checkLowActivity(guildId, bot),
                this.checkHighActivity(guildId, bot),
                this.checkNewMemberSpike(guildId, bot),
                this.checkEngagementDrop(guildId, bot),
                this.checkDataAnomalies(guildId, bot)
            ]);
        }
        catch (error) {
            logger_1.logger.error('❌ Erro nas verificações periódicas de alertas:', error);
            await this.sendAlert(bot, {
                type: 'system_error',
                severity: 'medium',
                title: 'Erro no Sistema de Alertas',
                description: 'Erro durante verificações periódicas',
                data: { error: error.message }
            });
        }
    }
    // Verificar baixa atividade
    static async checkLowActivity(guildId, bot) {
        try {
            const today = helpers_1.helpers.date.startOfDay();
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            const dayBefore = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);
            const todayStr = today.toISOString().split('T')[0];
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const dayBeforeStr = dayBefore.toISOString().split('T')[0];
            // Buscar atividade dos últimos 3 dias
            const [todayActivity, yesterdayActivity, dayBeforeActivity] = await Promise.all([
                DiscordActivity_1.DiscordActivity.aggregate([
                    { $match: { guildId, date: todayStr, type: 'message' } },
                    { $group: { _id: null, total: { $sum: '$count' } } }
                ]),
                DiscordActivity_1.DiscordActivity.aggregate([
                    { $match: { guildId, date: yesterdayStr, type: 'message' } },
                    { $group: { _id: null, total: { $sum: '$count' } } }
                ]),
                DiscordActivity_1.DiscordActivity.aggregate([
                    { $match: { guildId, date: dayBeforeStr, type: 'message' } },
                    { $group: { _id: null, total: { $sum: '$count' } } }
                ])
            ]);
            const todayTotal = todayActivity[0]?.total || 0;
            const yesterdayTotal = yesterdayActivity[0]?.total || 0;
            const dayBeforeTotal = dayBeforeActivity[0]?.total || 0;
            // Calcular média dos dois dias anteriores
            const avgPrevious = (yesterdayTotal + dayBeforeTotal) / 2;
            if (avgPrevious > 0) {
                const drop = ((avgPrevious - todayTotal) / avgPrevious) * 100;
                if (drop >= this.config.thresholds.lowActivity) {
                    await this.sendAlert(bot, {
                        type: 'low_activity',
                        severity: drop >= 70 ? 'high' : 'medium',
                        title: 'Baixa Atividade Detectada',
                        description: `Queda de ${drop.toFixed(1)}% na atividade de mensagens`,
                        data: {
                            today: todayTotal,
                            average: Math.round(avgPrevious),
                            drop: Math.round(drop),
                            date: todayStr
                        }
                    });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Erro ao verificar baixa atividade:', error);
        }
    }
    // Verificar alta atividade anômala
    static async checkHighActivity(guildId, bot) {
        try {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
            // Contar mensagens na última hora vs hora anterior
            const [lastHour, previousHour] = await Promise.all([
                DiscordActivity_1.DiscordActivity.aggregate([
                    {
                        $match: {
                            guildId,
                            type: 'message',
                            lastActivity: { $gte: oneHourAgo, $lte: now }
                        }
                    },
                    { $group: { _id: null, total: { $sum: '$count' } } }
                ]),
                DiscordActivity_1.DiscordActivity.aggregate([
                    {
                        $match: {
                            guildId,
                            type: 'message',
                            lastActivity: { $gte: twoHoursAgo, $lte: oneHourAgo }
                        }
                    },
                    { $group: { _id: null, total: { $sum: '$count' } } }
                ])
            ]);
            const lastHourTotal = lastHour[0]?.total || 0;
            const previousHourTotal = previousHour[0]?.total || 0;
            if (previousHourTotal > 0 && lastHourTotal > 10) {
                const spike = ((lastHourTotal - previousHourTotal) / previousHourTotal) * 100;
                if (spike >= this.config.thresholds.highActivity) {
                    await this.sendAlert(bot, {
                        type: 'high_activity',
                        severity: spike >= 500 ? 'high' : 'medium',
                        title: 'Pico de Atividade Detectado',
                        description: `Aumento de ${spike.toFixed(1)}% na atividade na última hora`,
                        data: {
                            lastHour: lastHourTotal,
                            previousHour: previousHourTotal,
                            spike: Math.round(spike),
                            timestamp: now.toISOString()
                        }
                    });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Erro ao verificar alta atividade:', error);
        }
    }
    // Verificar pico de novos membros
    static async checkNewMemberSpike(guildId, bot) {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const newMembers = await DiscordActivity_1.DiscordActivity.countDocuments({
                guildId,
                type: 'member_join',
                timestamp: { $gte: oneHourAgo }
            });
            if (newMembers >= this.config.thresholds.newMemberSpike) {
                await this.sendAlert(bot, {
                    type: 'new_member_spike',
                    severity: newMembers >= 20 ? 'high' : 'medium',
                    title: 'Pico de Novos Membros',
                    description: `${newMembers} novos membros na última hora`,
                    data: {
                        newMembers,
                        timestamp: new Date().toISOString(),
                        threshold: this.config.thresholds.newMemberSpike
                    }
                });
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Erro ao verificar pico de novos membros:', error);
        }
    }
    // Verificar queda no engagement
    static async checkEngagementDrop(guildId, bot) {
        try {
            const stats = await EngagementCalculator_1.EngagementCalculator.getEngagementStats(guildId);
            if (stats && stats.totalUsers > 0) {
                const lowEngagementPercentage = (stats.lowEngagement / stats.totalUsers) * 100;
                const trendingDownPercentage = (stats.trendingDown / stats.totalUsers) * 100;
                if (trendingDownPercentage >= this.config.thresholds.engagementDrop) {
                    await this.sendAlert(bot, {
                        type: 'engagement_drop',
                        severity: trendingDownPercentage >= 50 ? 'high' : 'medium',
                        title: 'Queda no Engagement',
                        description: `${trendingDownPercentage.toFixed(1)}% dos utilizadores com engagement em queda`,
                        data: {
                            totalUsers: stats.totalUsers,
                            trendingDown: stats.trendingDown,
                            percentage: Math.round(trendingDownPercentage),
                            averageScore: Math.round(stats.averageScore * 10) / 10
                        }
                    });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Erro ao verificar queda no engagement:', error);
        }
    }
    // Verificar anomalias nos dados
    static async checkDataAnomalies(guildId, bot) {
        try {
            const today = helpers_1.helpers.date.startOfDay().toISOString().split('T')[0];
            // Verificar se há dados muito discrepantes
            const extremeMessages = await DiscordActivity_1.DiscordActivity.find({
                guildId,
                date: today,
                type: 'message',
                count: { $gte: 1000 } // Mais de 1000 mensagens de um usuário em um dia
            }).limit(5);
            if (extremeMessages.length > 0) {
                await this.sendAlert(bot, {
                    type: 'data_anomaly',
                    severity: 'low',
                    title: 'Anomalia nos Dados Detectada',
                    description: `Encontrados ${extremeMessages.length} usuários com atividade extremamente alta`,
                    data: {
                        users: extremeMessages.map(u => ({
                            username: u.username,
                            count: u.count
                        })),
                        date: today
                    }
                });
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Erro ao verificar anomalias nos dados:', error);
        }
    }
    // Enviar alerta
    static async sendAlert(bot, alertData) {
        try {
            // Verificar cooldown
            const lastAlert = this.lastAlertTimes.get(alertData.type);
            const cooldownMs = (this.config.cooldown[alertData.type] || 60) * 60 * 1000;
            if (lastAlert && Date.now() - lastAlert.getTime() < cooldownMs) {
                logger_1.logger.debug(`🚨 Alerta ${alertData.type} em cooldown`);
                return;
            }
            // Criar alerta
            const alert = {
                id: `${alertData.type}_${Date.now()}`,
                timestamp: new Date(),
                resolved: false,
                ...alertData
            };
            // Salvar alerta
            this.alerts.set(alert.id, alert);
            this.lastAlertTimes.set(alertData.type, alert.timestamp);
            // Criar embed
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`🚨 ${alert.title}`)
                .setDescription(alert.description)
                .setColor(this.getSeverityColor(alert.severity))
                .addFields({ name: 'Tipo', value: alert.type.replace('_', ' '), inline: true }, { name: 'Severidade', value: alert.severity.toUpperCase(), inline: true }, { name: 'Timestamp', value: `<t:${Math.floor(alert.timestamp.getTime() / 1000)}:F>`, inline: true })
                .setFooter({
                text: `Alert ID: ${alert.id}`,
                iconURL: bot.client?.user?.displayAvatarURL()
            })
                .setTimestamp();
            // Adicionar dados específicos do alerta
            if (alert.data && Object.keys(alert.data).length > 0) {
                const dataString = Object.entries(alert.data)
                    .map(([key, value]) => `**${key}:** ${value}`)
                    .join('\n');
                embed.addFields({ name: 'Dados', value: dataString, inline: false });
            }
            // Enviar para canal de alertas
            if (this.config.channels.alerts && bot.client) {
                try {
                    const channel = await bot.client.channels.fetch(this.config.channels.alerts);
                    if (channel) {
                        await channel.send({ embeds: [embed] });
                        logger_1.logger.info(`🚨 Alerta enviado: ${alert.type} (${alert.severity})`);
                    }
                }
                catch (channelError) {
                    logger_1.logger.error('❌ Erro ao enviar alerta para canal:', channelError);
                }
            }
            // Enviar via webhook se configurado
            if (this.config.channels.webhookUrl) {
                try {
                    const webhook = new discord_js_1.WebhookClient({ url: this.config.channels.webhookUrl });
                    await webhook.send({ embeds: [embed] });
                }
                catch (webhookError) {
                    logger_1.logger.error('❌ Erro ao enviar alerta via webhook:', webhookError);
                }
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Erro ao enviar alerta:', error);
        }
    }
    // Obter cor baseada na severidade
    static getSeverityColor(severity) {
        switch (severity) {
            case 'low': return 0x00FF00; // Verde
            case 'medium': return 0xFFFF00; // Amarelo
            case 'high': return 0xFF8000; // Laranja
            case 'critical': return 0xFF0000; // Vermelho
            default: return 0x808080; // Cinza
        }
    }
    // Obter todos os alertas
    static getAlerts() {
        return Array.from(this.alerts.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    // Obter alertas não resolvidos
    static getUnresolvedAlerts() {
        return this.getAlerts().filter(alert => !alert.resolved);
    }
    // Resolver alerta
    static resolveAlert(alertId) {
        const alert = this.alerts.get(alertId);
        if (alert) {
            alert.resolved = true;
            logger_1.logger.info(`✅ Alerta resolvido: ${alertId}`);
            return true;
        }
        return false;
    }
    // Configurar sistema de alertas
    static configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger_1.logger.info('⚙️ Configuração de alertas atualizada');
    }
    // Obter configuração atual
    static getConfig() {
        return { ...this.config };
    }
    // Testar sistema de alertas
    static async testAlert(bot) {
        await this.sendAlert(bot, {
            type: 'system_error',
            severity: 'low',
            title: 'Teste do Sistema de Alertas',
            description: 'Este é um alerta de teste para verificar se o sistema está funcionando.',
            data: {
                test: true,
                timestamp: new Date().toISOString()
            }
        });
    }
}
exports.AlertSystem = AlertSystem;
AlertSystem.alerts = new Map();
AlertSystem.lastAlertTimes = new Map();
AlertSystem.config = {
    enabled: process.env.ALERTS_ENABLED === 'true',
    thresholds: {
        lowActivity: 50, // 50% drop
        highActivity: 200, // 200% spike
        newMemberSpike: 10, // 10 members in 1 hour
        engagementDrop: 30 // 30% drop
    },
    channels: {
        alerts: process.env.ALERTS_CHANNEL_ID || '',
        webhookUrl: process.env.ALERTS_WEBHOOK_URL
    },
    cooldown: {
        low_activity: 60, // 1 hour
        high_activity: 30, // 30 minutes
        new_member_spike: 120, // 2 hours
        engagement_drop: 180, // 3 hours
        system_error: 15, // 15 minutes
        data_anomaly: 60 // 1 hour
    }
};
