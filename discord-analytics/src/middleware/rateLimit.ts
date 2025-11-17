import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// Rate limiter geral para a API
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por IP por janela
  message: {
    success: false,
    error: 'Muitas requisições. Tente novamente em 15 minutos.',
    retryAfter: 15 * 60 // 15 minutos em segundos
  },
  standardHeaders: true, // Return rate limit info nos headers `RateLimit-*`
  legacyHeaders: false, // Disable os headers `X-RateLimit-*`
  
  // Handler customizado para logging
  handler: (req: Request, res: Response) => {
    logger.warn(`🚨 Rate limit excedido para IP ${req.ip} na rota ${req.originalUrl}`);
    res.status(429).json({
      success: false,
      error: 'Muitas requisições. Tente novamente em 15 minutos.',
      retryAfter: 15 * 60
    });
  },
  
  // Função para identificar clientes únicos
  keyGenerator: (req: Request) => {
    return req.ip || 'unknown';
  },
  
  // Skip requests baseado em condições
  skip: (req: Request) => {
    // Skip para health checks
    if (req.path === '/health') return true;
    
    // Skip para IPs whitelist
    const whitelist = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
    if (whitelist.includes(req.ip || '')) return true;
    
    return false;
  }
});

// Rate limiter mais restritivo para endpoints administrativos
export const adminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // 20 requests por IP por hora
  message: {
    success: false,
    error: 'Muitas requisições administrativas. Tente novamente em 1 hora.',
    retryAfter: 60 * 60 // 1 hora em segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req: Request, res: Response) => {
    logger.warn(`🚨 Rate limit admin excedido para IP ${req.ip} na rota ${req.originalUrl}`);
    res.status(429).json({
      success: false,
      error: 'Muitas requisições administrativas. Tente novamente em 1 hora.',
      retryAfter: 60 * 60
    });
  }
});

// Rate limiter específico para analytics (mais permissivo)
export const analyticsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 30, // 30 requests por IP por 5 minutos
  message: {
    success: false,
    error: 'Muitas consultas de analytics. Tente novamente em 5 minutos.',
    retryAfter: 5 * 60 // 5 minutos em segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req: Request, res: Response) => {
    logger.warn(`📊 Rate limit analytics excedido para IP ${req.ip} na rota ${req.originalUrl}`);
    res.status(429).json({
      success: false,
      error: 'Muitas consultas de analytics. Tente novamente em 5 minutos.',
      retryAfter: 5 * 60
    });
  }
});

// Rate limiter para refresh operations (muito restritivo)
export const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // 5 refresh operations por IP por hora
  message: {
    success: false,
    error: 'Muitas operações de refresh. Tente novamente em 1 hora.',
    retryAfter: 60 * 60 // 1 hora em segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req: Request, res: Response) => {
    logger.warn(`🔄 Rate limit refresh excedido para IP ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Muitas operações de refresh. Tente novamente em 1 hora.',
      retryAfter: 60 * 60
    });
  }
});

// Rate limiter para burst protection (proteção contra rajadas)
export const burstLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 20, // 20 requests por IP por minuto
  message: {
    success: false,
    error: 'Muitas requisições em pouco tempo. Aguarde 1 minuto.',
    retryAfter: 60 // 1 minuto em segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req: Request, res: Response) => {
    logger.warn(`⚡ Burst limit excedido para IP ${req.ip} na rota ${req.originalUrl}`);
    res.status(429).json({
      success: false,
      error: 'Muitas requisições em pouco tempo. Aguarde 1 minuto.',
      retryAfter: 60
    });
  }
});

// Função para criar rate limiter customizado
export function createCustomLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  name: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      success: false,
      error: options.message,
      retryAfter: Math.ceil(options.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    
    handler: (req: Request, res: Response) => {
      logger.warn(`🚨 Rate limit ${options.name} excedido para IP ${req.ip} na rota ${req.originalUrl}`);
      res.status(429).json({
        success: false,
        error: options.message,
        retryAfter: Math.ceil(options.windowMs / 1000)
      });
    }
  });
}

// Middleware para bypass rate limiting com API key válida
export function bypassRateLimitWithAuth(req: any, res: Response, next: any) {
  // Se autenticado com API key válida, pode bypassar alguns limits
  if (req.isAuthenticated && req.apiKey === process.env.API_SECRET_KEY) {
    // Marcar request como privilegiado
    req.rateLimit = {
      limit: Number.MAX_SAFE_INTEGER,
      current: 0,
      remaining: Number.MAX_SAFE_INTEGER,
      resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };
  }
  
  next();
}
