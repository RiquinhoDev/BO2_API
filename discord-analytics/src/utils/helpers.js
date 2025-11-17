"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpers = exports.performanceHelpers = exports.formatHelpers = exports.statsHelpers = exports.engagementHelpers = exports.discordHelpers = exports.dateHelpers = void 0;
const moment_1 = __importDefault(require("moment"));
const lodash_1 = __importDefault(require("lodash"));
const logger_1 = require("./logger");
// Utilitários para datas
exports.dateHelpers = {
    // Obter início do dia
    startOfDay: (date = new Date()) => {
        return (0, moment_1.default)(date).startOf('day').toDate();
    },
    // Obter fim do dia
    endOfDay: (date = new Date()) => {
        return (0, moment_1.default)(date).endOf('day').toDate();
    },
    // Obter range de datas para analytics
    getDateRange: (days = 7, endDate = new Date()) => {
        const end = (0, moment_1.default)(endDate).endOf('day').toDate();
        const start = (0, moment_1.default)(endDate).subtract(days - 1, 'days').startOf('day').toDate();
        return { start, end };
    },
    // Formatar data para display
    formatDate: (date, format = 'DD/MM/YYYY HH:mm') => {
        return (0, moment_1.default)(date).format(format);
    },
    // Obter horário de maior atividade
    getMostActiveHours: (timestamps) => {
        const hourCounts = lodash_1.default.countBy(timestamps, timestamp => (0, moment_1.default)(timestamp).hour());
        return Object.entries(hourCounts)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }))
            .sort((a, b) => b.count - a.count);
    },
    // Verificar se é weekend
    isWeekend: (date) => {
        const day = (0, moment_1.default)(date).day();
        return day === 0 || day === 6; // Domingo ou Sábado
    },
    // Obter diferença em minutos
    getMinutesDiff: (start, end) => {
        return (0, moment_1.default)(end).diff((0, moment_1.default)(start), 'minutes');
    }
};
// Utilitários para Discord
exports.discordHelpers = {
    // Extrair menções de uma mensagem
    extractMentions: (content) => {
        return {
            users: (content.match(/<@!?(\d+)>/g) || []).map(match => match.replace(/<@!?(\d+)>/, '$1')),
            roles: (content.match(/<@&(\d+)>/g) || []).map(match => match.replace(/<@&(\d+)>/, '$1')),
            channels: (content.match(/<#(\d+)>/g) || []).map(match => match.replace(/<#(\d+)>/, '$1'))
        };
    },
    // Contar emojis em uma mensagem
    countEmojis: (content) => {
        const customEmojis = (content.match(/<:[^:]+:\d+>/g) || []).length;
        const unicodeEmojis = (content.match(/\p{Emoji}/gu) || []).length;
        return {
            custom: customEmojis,
            unicode: unicodeEmojis,
            total: customEmojis + unicodeEmojis
        };
    },
    // Verificar se usuário está online
    isUserOnline: (status) => {
        return ['online', 'idle', 'dnd'].includes(status);
    },
    // Obter nível de atividade baseado no status
    getActivityLevel: (status) => {
        switch (status) {
            case 'online': return 3;
            case 'idle': return 2;
            case 'dnd': return 1;
            case 'offline': return 0;
            default: return 0;
        }
    },
    // Sanitizar nome de usuário
    sanitizeUsername: (username) => {
        return username.replace(/[^\w\s-_]/g, '').trim().substring(0, 32);
    },
    // Verificar se canal é de voz
    isVoiceChannel: (channelType) => {
        return [2, 13].includes(channelType); // GUILD_VOICE ou GUILD_STAGE_VOICE
    }
};
// Utilitários para cálculos de engagement
exports.engagementHelpers = {
    // Calcular score de engagement baseado em atividades
    calculateEngagementScore: (activities) => {
        const { messages, voiceMinutes, reactions, mentions } = activities;
        return (messages * 1 +
            voiceMinutes * 0.5 +
            reactions * 0.2 +
            mentions * 0.3);
    },
    // Classificar nível de engagement
    classifyEngagement: (score) => {
        if (score < 10)
            return 'low';
        if (score < 50)
            return 'medium';
        if (score < 100)
            return 'high';
        return 'very_high';
    },
    // Calcular tendência de engagement
    calculateTrend: (current, previous) => {
        if (previous === 0) {
            return { percentage: 100, direction: 'up' };
        }
        const percentage = ((current - previous) / previous) * 100;
        let direction = 'stable';
        if (Math.abs(percentage) > 5) {
            direction = percentage > 0 ? 'up' : 'down';
        }
        return { percentage: Math.round(percentage), direction };
    },
    // Normalizar scores para comparação
    normalizeScores: (scores) => {
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        const range = max - min;
        if (range === 0)
            return scores.map(() => 1);
        return scores.map(score => (score - min) / range);
    }
};
// Utilitários para estatísticas
exports.statsHelpers = {
    // Calcular média
    average: (numbers) => {
        if (numbers.length === 0)
            return 0;
        return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    },
    // Calcular mediana
    median: (numbers) => {
        if (numbers.length === 0)
            return 0;
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    },
    // Calcular percentil
    percentile: (numbers, percentile) => {
        if (numbers.length === 0)
            return 0;
        const sorted = [...numbers].sort((a, b) => a - b);
        const index = (percentile / 100) * (sorted.length - 1);
        if (Math.floor(index) === index) {
            return sorted[index];
        }
        const lower = sorted[Math.floor(index)];
        const upper = sorted[Math.ceil(index)];
        return lower + (upper - lower) * (index - Math.floor(index));
    },
    // Calcular crescimento
    calculateGrowth: (current, previous) => {
        if (previous === 0)
            return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    },
    // Agrupar dados por período
    groupByPeriod: (data, getDate, period) => {
        return lodash_1.default.groupBy(data, item => {
            const date = (0, moment_1.default)(getDate(item));
            switch (period) {
                case 'hour':
                    return date.format('YYYY-MM-DD HH');
                case 'day':
                    return date.format('YYYY-MM-DD');
                case 'week':
                    return date.format('YYYY-[W]WW');
                case 'month':
                    return date.format('YYYY-MM');
                default:
                    return date.format('YYYY-MM-DD');
            }
        });
    }
};
// Utilitários para formatação
exports.formatHelpers = {
    // Formatar números grandes
    formatNumber: (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    },
    // Formatar duração em minutos
    formatDuration: (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    },
    // Formatar percentagem
    formatPercentage: (value, decimals = 1) => {
        return `${value.toFixed(decimals)}%`;
    },
    // Truncar texto
    truncateText: (text, maxLength = 100) => {
        if (text.length <= maxLength)
            return text;
        return text.substring(0, maxLength - 3) + '...';
    }
};
// Utilitários para cache e performance
exports.performanceHelpers = {
    // Debounce function
    debounce: (func, waitFor) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), waitFor);
        };
    },
    // Throttle function
    throttle: (func, waitFor) => {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, waitFor);
            }
        };
    },
    // Retry com backoff exponencial
    retryWithBackoff: async (fn, maxRetries = 3, baseDelay = 1000) => {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxRetries) {
                    throw lastError;
                }
                const delay = baseDelay * Math.pow(2, attempt);
                logger_1.logger.warn(`Tentativa ${attempt + 1} falhou, tentando novamente em ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
};
// Exportar tudo como um objeto
exports.helpers = {
    date: exports.dateHelpers,
    discord: exports.discordHelpers,
    engagement: exports.engagementHelpers,
    stats: exports.statsHelpers,
    format: exports.formatHelpers,
    performance: exports.performanceHelpers
};
