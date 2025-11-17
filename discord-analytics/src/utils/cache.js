"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.botCache = exports.analyticsCache = exports.cache = void 0;
exports.cacheMiddleware = cacheMiddleware;
const node_cache_1 = __importDefault(require("node-cache"));
const logger_1 = require("./logger");
class CacheManager {
    constructor() {
        this.cache = new node_cache_1.default({
            stdTTL: 300, // 5 minutos por padrão
            checkperiod: 60, // Verificar chaves expiradas a cada minuto
            useClones: false, // Performance - não clonar objetos
            deleteOnExpire: true,
            enableLegacyCallbacks: false,
            maxKeys: 1000 // Máximo de 1000 chaves em cache
        });
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
        // Event listeners para monitoramento
        this.cache.on('set', (key, value) => {
            this.stats.sets++;
            logger_1.logger.debug(`📦 Cache SET: ${key}`);
        });
        this.cache.on('del', (key, value) => {
            this.stats.deletes++;
            logger_1.logger.debug(`🗑️ Cache DEL: ${key}`);
        });
        this.cache.on('expired', (key, value) => {
            logger_1.logger.debug(`⏰ Cache EXPIRED: ${key}`);
        });
        this.cache.on('flush', () => {
            logger_1.logger.info('🧹 Cache FLUSH: Todos os dados removidos');
        });
        logger_1.logger.info('📦 CacheManager inicializado');
    }
    // Obter valor do cache
    get(key) {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.stats.hits++;
            logger_1.logger.debug(`✅ Cache HIT: ${key}`);
            return value;
        }
        else {
            this.stats.misses++;
            logger_1.logger.debug(`❌ Cache MISS: ${key}`);
            return undefined;
        }
    }
    // Definir valor no cache
    set(key, value, ttl) {
        try {
            const success = this.cache.set(key, value, ttl || 300);
            if (success) {
                logger_1.logger.debug(`📦 Cache SET success: ${key} (TTL: ${ttl || 300}s)`);
            }
            else {
                logger_1.logger.warn(`⚠️ Cache SET failed: ${key}`);
            }
            return success;
        }
        catch (error) {
            logger_1.logger.error(`❌ Erro ao definir cache ${key}:`, error);
            return false;
        }
    }
    // Remover valor do cache
    del(key) {
        try {
            const result = this.cache.del(key);
            logger_1.logger.debug(`🗑️ Cache DEL: ${Array.isArray(key) ? key.join(', ') : key} (${result} removidos)`);
            return result;
        }
        catch (error) {
            logger_1.logger.error(`❌ Erro ao remover cache:`, error);
            return 0;
        }
    }
    // Verificar se chave existe
    has(key) {
        return this.cache.has(key);
    }
    // Obter todas as chaves
    keys() {
        return this.cache.keys();
    }
    // Limpar todo o cache
    flush() {
        this.cache.flushAll();
        this.resetStats();
        logger_1.logger.info('🧹 Cache limpo completamente');
    }
    // Obter TTL de uma chave
    getTtl(key) {
        return this.cache.getTtl(key);
    }
    // Atualizar TTL de uma chave
    touch(key, ttl) {
        return this.cache.ttl(key, ttl);
    }
    // Obter estatísticas do cache
    getStats() {
        const cacheStats = this.cache.getStats();
        return {
            ...this.stats,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
            keys: cacheStats.keys,
            ksize: cacheStats.ksize,
            vsize: cacheStats.vsize
        };
    }
    // Resetar estatísticas
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
    }
    // Método helper para cache com fallback
    async getOrSet(key, fetchFunction, ttl = 300) {
        // Tentar obter do cache primeiro
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }
        try {
            // Se não existe no cache, buscar dados
            logger_1.logger.debug(`🔄 Cache FETCH: ${key}`);
            const data = await fetchFunction();
            // Salvar no cache
            this.set(key, data, ttl);
            return data;
        }
        catch (error) {
            logger_1.logger.error(`❌ Erro ao buscar dados para cache ${key}:`, error);
            throw error;
        }
    }
    // Método para cache com padrão namespace
    setNamespaced(namespace, key, value, ttl) {
        return this.set(`${namespace}:${key}`, value, ttl);
    }
    getNamespaced(namespace, key) {
        return this.get(`${namespace}:${key}`);
    }
    delNamespaced(namespace, key) {
        return this.del(`${namespace}:${key}`);
    }
    // Limpar cache por namespace
    flushNamespace(namespace) {
        const keys = this.keys().filter(key => key.startsWith(`${namespace}:`));
        return this.del(keys);
    }
    // Método para invalidar cache baseado em padrão
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        const keys = this.keys().filter(key => regex.test(key));
        if (keys.length > 0) {
            logger_1.logger.info(`🔄 Cache INVALIDATE pattern ${pattern}: ${keys.length} chaves`);
            return this.del(keys);
        }
        return 0;
    }
}
// Instância singleton do cache
exports.cache = new CacheManager();
// Cache específico para analytics
exports.analyticsCache = {
    // Cache para overview do servidor
    getServerOverview: async (guildId, days, fetchFn) => {
        const key = `analytics:overview:${guildId}:${days}`;
        return exports.cache.getOrSet(key, fetchFn, 300); // 5 minutos
    },
    // Cache para mensagens
    getMessages: async (guildId, days, filters, fetchFn) => {
        const filterKey = JSON.stringify(filters);
        const key = `analytics:messages:${guildId}:${days}:${Buffer.from(filterKey).toString('base64')}`;
        return exports.cache.getOrSet(key, fetchFn, 180); // 3 minutos
    },
    // Cache para voz
    getVoice: async (guildId, days, fetchFn) => {
        const key = `analytics:voice:${guildId}:${days}`;
        return exports.cache.getOrSet(key, fetchFn, 300); // 5 minutos
    },
    // Cache para engagement
    getEngagement: async (guildId, fetchFn) => {
        const key = `analytics:engagement:${guildId}`;
        return exports.cache.getOrSet(key, fetchFn, 600); // 10 minutos
    },
    // Cache para usuário específico
    getUser: async (userId, days, fetchFn) => {
        const key = `analytics:user:${userId}:${days}`;
        return exports.cache.getOrSet(key, fetchFn, 120); // 2 minutos
    },
    // Invalidar cache relacionado a analytics
    invalidateAnalytics: (guildId) => {
        if (guildId) {
            exports.cache.invalidatePattern(`analytics:.*:${guildId}`);
        }
        else {
            exports.cache.flushNamespace('analytics');
        }
    }
};
// Cache para dados do bot
exports.botCache = {
    // Cache para status do bot
    getBotStatus: async (fetchFn) => {
        return exports.cache.getOrSet('bot:status', fetchFn, 30); // 30 segundos
    },
    // Cache para estatísticas do servidor Discord
    getGuildStats: async (guildId, fetchFn) => {
        return exports.cache.getOrSet(`bot:guild:${guildId}`, fetchFn, 60); // 1 minuto
    }
};
// Middleware para cache HTTP
function cacheMiddleware(ttl = 300) {
    return (req, res, next) => {
        // Gerar chave baseada na URL e query params
        const key = `http:${req.method}:${req.originalUrl}`;
        // Tentar obter resposta do cache
        const cached = exports.cache.get(key);
        if (cached) {
            logger_1.logger.debug(`📦 HTTP Cache HIT: ${key}`);
            return res.json(cached);
        }
        // Interceptar a resposta para salvar no cache
        const originalSend = res.json;
        res.json = function (body) {
            // Salvar no cache apenas se for uma resposta de sucesso
            if (res.statusCode === 200 && body.success !== false) {
                exports.cache.set(key, body, ttl);
                logger_1.logger.debug(`📦 HTTP Cache SET: ${key}`);
            }
            return originalSend.call(this, body);
        };
        next();
    };
}
logger_1.logger.info('📦 Sistema de cache inicializado');
