import NodeCache from 'node-cache';
import { logger } from './logger';

class CacheManager {
  private cache: NodeCache;
  private stats: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
  };

  constructor() {
    this.cache = new NodeCache({
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
      logger.debug(`📦 Cache SET: ${key}`);
    });

    this.cache.on('del', (key, value) => {
      this.stats.deletes++;
      logger.debug(`🗑️ Cache DEL: ${key}`);
    });

    this.cache.on('expired', (key, value) => {
      logger.debug(`⏰ Cache EXPIRED: ${key}`);
    });

    this.cache.on('flush', () => {
      logger.info('🧹 Cache FLUSH: Todos os dados removidos');
    });

    logger.info('📦 CacheManager inicializado');
  }

  // Obter valor do cache
  get<T>(key: string): T | undefined {
    const value = this.cache.get<T>(key);
    
    if (value !== undefined) {
      this.stats.hits++;
      logger.debug(`✅ Cache HIT: ${key}`);
      return value;
    } else {
      this.stats.misses++;
      logger.debug(`❌ Cache MISS: ${key}`);
      return undefined;
    }
  }

  // Definir valor no cache
  set<T>(key: string, value: T, ttl?: number): boolean {
    try {
      const success = this.cache.set(key, value, ttl || 300);
      if (success) {
        logger.debug(`📦 Cache SET success: ${key} (TTL: ${ttl || 300}s)`);
      } else {
        logger.warn(`⚠️ Cache SET failed: ${key}`);
      }
      return success;
    } catch (error) {
      logger.error(`❌ Erro ao definir cache ${key}:`, error);
      return false;
    }
  }

  // Remover valor do cache
  del(key: string | string[]): number {
    try {
      const result = this.cache.del(key);
      logger.debug(`🗑️ Cache DEL: ${Array.isArray(key) ? key.join(', ') : key} (${result} removidos)`);
      return result;
    } catch (error) {
      logger.error(`❌ Erro ao remover cache:`, error);
      return 0;
    }
  }

  // Verificar se chave existe
  has(key: string): boolean {
    return this.cache.has(key);
  }

  // Obter todas as chaves
  keys(): string[] {
    return this.cache.keys();
  }

  // Limpar todo o cache
  flush(): void {
    this.cache.flushAll();
    this.resetStats();
    logger.info('🧹 Cache limpo completamente');
  }

  // Obter TTL de uma chave
  getTtl(key: string): number | undefined {
    return this.cache.getTtl(key);
  }

  // Atualizar TTL de uma chave
  touch(key: string, ttl: number): boolean {
    return this.cache.ttl(key, ttl);
  }

  // Obter estatísticas do cache
  getStats(): any {
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
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  // Método helper para cache com fallback
  async getOrSet<T>(
    key: string, 
    fetchFunction: () => Promise<T>, 
    ttl: number = 300
  ): Promise<T> {
    // Tentar obter do cache primeiro
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    try {
      // Se não existe no cache, buscar dados
      logger.debug(`🔄 Cache FETCH: ${key}`);
      const data = await fetchFunction();
      
      // Salvar no cache
      this.set(key, data, ttl);
      
      return data;
    } catch (error) {
      logger.error(`❌ Erro ao buscar dados para cache ${key}:`, error);
      throw error;
    }
  }

  // Método para cache com padrão namespace
  setNamespaced(namespace: string, key: string, value: any, ttl?: number): boolean {
    return this.set(`${namespace}:${key}`, value, ttl);
  }

  getNamespaced<T>(namespace: string, key: string): T | undefined {
    return this.get<T>(`${namespace}:${key}`);
  }

  delNamespaced(namespace: string, key: string): number {
    return this.del(`${namespace}:${key}`);
  }

  // Limpar cache por namespace
  flushNamespace(namespace: string): number {
    const keys = this.keys().filter(key => key.startsWith(`${namespace}:`));
    return this.del(keys);
  }

  // Método para invalidar cache baseado em padrão
  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    const keys = this.keys().filter(key => regex.test(key));
    
    if (keys.length > 0) {
      logger.info(`🔄 Cache INVALIDATE pattern ${pattern}: ${keys.length} chaves`);
      return this.del(keys);
    }
    
    return 0;
  }
}

// Instância singleton do cache
export const cache = new CacheManager();

// Cache específico para analytics
export const analyticsCache = {
  // Cache para overview do servidor
  getServerOverview: async (guildId: string, days: number, fetchFn: () => Promise<any>) => {
    const key = `analytics:overview:${guildId}:${days}`;
    return cache.getOrSet(key, fetchFn, 300); // 5 minutos
  },

  // Cache para mensagens
  getMessages: async (guildId: string, days: number, filters: any, fetchFn: () => Promise<any>) => {
    const filterKey = JSON.stringify(filters);
    const key = `analytics:messages:${guildId}:${days}:${Buffer.from(filterKey).toString('base64')}`;
    return cache.getOrSet(key, fetchFn, 180); // 3 minutos
  },

  // Cache para voz
  getVoice: async (guildId: string, days: number, fetchFn: () => Promise<any>) => {
    const key = `analytics:voice:${guildId}:${days}`;
    return cache.getOrSet(key, fetchFn, 300); // 5 minutos
  },

  // Cache para engagement
  getEngagement: async (guildId: string, fetchFn: () => Promise<any>) => {
    const key = `analytics:engagement:${guildId}`;
    return cache.getOrSet(key, fetchFn, 600); // 10 minutos
  },

  // Cache para usuário específico
  getUser: async (userId: string, days: number, fetchFn: () => Promise<any>) => {
    const key = `analytics:user:${userId}:${days}`;
    return cache.getOrSet(key, fetchFn, 120); // 2 minutos
  },

  // Invalidar cache relacionado a analytics
  invalidateAnalytics: (guildId?: string) => {
    if (guildId) {
      cache.invalidatePattern(`analytics:.*:${guildId}`);
    } else {
      cache.flushNamespace('analytics');
    }
  }
};

// Cache para dados do bot
export const botCache = {
  // Cache para status do bot
  getBotStatus: async (fetchFn: () => Promise<any>) => {
    return cache.getOrSet('bot:status', fetchFn, 30); // 30 segundos
  },

  // Cache para estatísticas do servidor Discord
  getGuildStats: async (guildId: string, fetchFn: () => Promise<any>) => {
    return cache.getOrSet(`bot:guild:${guildId}`, fetchFn, 60); // 1 minuto
  }
};

// Middleware para cache HTTP
export function cacheMiddleware(ttl: number = 300) {
  return (req: any, res: any, next: any) => {
    // Gerar chave baseada na URL e query params
    const key = `http:${req.method}:${req.originalUrl}`;
    
    // Tentar obter resposta do cache
    const cached = cache.get(key);
    
    if (cached) {
      logger.debug(`📦 HTTP Cache HIT: ${key}`);
      return res.json(cached);
    }

    // Interceptar a resposta para salvar no cache
    const originalSend = res.json;
    res.json = function(body: any) {
      // Salvar no cache apenas se for uma resposta de sucesso
      if (res.statusCode === 200 && body.success !== false) {
        cache.set(key, body, ttl);
        logger.debug(`📦 HTTP Cache SET: ${key}`);
      }
      
      return originalSend.call(this, body);
    };

    next();
  };
}

logger.info('📦 Sistema de cache inicializado');
