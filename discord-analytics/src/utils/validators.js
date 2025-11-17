"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = exports.validators = exports.AnalyticsParamsSchema = exports.PresenceDataSchema = exports.VoiceDataSchema = exports.MessageDataSchema = void 0;
const zod_1 = require("zod");
const mongoose_1 = require("mongoose");
// Schema para validação de dados de mensagem
exports.MessageDataSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1, 'User ID é obrigatório'),
    username: zod_1.z.string().min(1, 'Username é obrigatório'),
    displayName: zod_1.z.string().min(1, 'Display name é obrigatório'),
    channelId: zod_1.z.string().min(1, 'Channel ID é obrigatório'),
    channelName: zod_1.z.string().min(1, 'Channel name é obrigatório'),
    messageLength: zod_1.z.number().min(0, 'Message length deve ser positivo'),
    wordCount: zod_1.z.number().min(0, 'Word count deve ser positivo'),
    hasAttachments: zod_1.z.boolean(),
    hasMentions: zod_1.z.boolean(),
    hasEmojis: zod_1.z.boolean(),
    timestamp: zod_1.z.date(),
    guildId: zod_1.z.string().min(1, 'Guild ID é obrigatório'),
    messageId: zod_1.z.string().min(1, 'Message ID é obrigatório'),
});
// Schema para validação de dados de voz
exports.VoiceDataSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1, 'User ID é obrigatório'),
    username: zod_1.z.string().min(1, 'Username é obrigatório'),
    displayName: zod_1.z.string().min(1, 'Display name é obrigatório'),
    channelId: zod_1.z.string().nullable(),
    channelName: zod_1.z.string().nullable(),
    action: zod_1.z.enum(['join', 'leave', 'switch']),
    previousChannelId: zod_1.z.string().nullable(),
    previousChannelName: zod_1.z.string().nullable(),
    timestamp: zod_1.z.date(),
    guildId: zod_1.z.string().min(1, 'Guild ID é obrigatório'),
});
// Schema para validação de dados de presença
exports.PresenceDataSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1, 'User ID é obrigatório'),
    username: zod_1.z.string().min(1, 'Username é obrigatório'),
    displayName: zod_1.z.string().min(1, 'Display name é obrigatório'),
    status: zod_1.z.enum(['online', 'idle', 'dnd', 'offline']),
    previousStatus: zod_1.z.enum(['online', 'idle', 'dnd', 'offline']).nullable(),
    activities: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        type: zod_1.z.number(),
        details: zod_1.z.string().nullable(),
        state: zod_1.z.string().nullable(),
    })).optional(),
    timestamp: zod_1.z.date(),
    guildId: zod_1.z.string().min(1, 'Guild ID é obrigatório'),
});
// Schema para parâmetros de analytics
exports.AnalyticsParamsSchema = zod_1.z.object({
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
    userId: zod_1.z.string().optional(),
    channelId: zod_1.z.string().optional(),
    limit: zod_1.z.number().min(1).max(100).optional(),
    page: zod_1.z.number().min(1).optional(),
});
// Validações customizadas
exports.validators = {
    // Validar Discord ID (snowflake)
    isValidDiscordId: (id) => {
        return /^\d{17,19}$/.test(id);
    },
    // Validar MongoDB ObjectId
    isValidMongoId: (id) => {
        return (0, mongoose_1.isValidObjectId)(id);
    },
    // Validar se é uma data válida
    isValidDate: (date) => {
        return date instanceof Date && !isNaN(date.getTime());
    },
    // Validar range de datas
    isValidDateRange: (startDate, endDate) => {
        return startDate <= endDate;
    },
    // Validar se o timestamp não é muito antigo (mais de 1 ano)
    isRecentTimestamp: (timestamp) => {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return timestamp >= oneYearAgo;
    },
    // Validar estrutura de comando Discord
    isValidCommandData: (command) => {
        return (command &&
            typeof command.data === 'object' &&
            typeof command.data.name === 'string' &&
            typeof command.execute === 'function');
    },
    // Validar configurações do bot
    validateBotConfig: () => {
        const errors = [];
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
    sanitizeString: (input, maxLength = 1000) => {
        if (typeof input !== 'string')
            return '';
        return input.trim().substring(0, maxLength);
    },
    // Validar e sanitizar dados de mensagem
    sanitizeMessageData: (data) => {
        try {
            return exports.MessageDataSchema.parse({
                ...data,
                username: exports.validators.sanitizeString(data.username, 32),
                displayName: exports.validators.sanitizeString(data.displayName, 32),
                channelName: exports.validators.sanitizeString(data.channelName, 100),
            });
        }
        catch (error) {
            throw new Error(`Dados de mensagem inválidos: ${error}`);
        }
    }
};
// Middleware de validação para Express
const validateRequest = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse({
                ...req.query,
                ...req.params,
                ...req.body
            });
            req.validated = validated;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
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
exports.validateRequest = validateRequest;
