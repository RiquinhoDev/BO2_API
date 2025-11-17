"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateApiKey = validateApiKey;
exports.optionalAuth = optionalAuth;
exports.requireAdmin = requireAdmin;
exports.logAccess = logAccess;
exports.corsMiddleware = corsMiddleware;
const logger_1 = require("../utils/logger");
// Middleware de validação de API Key
function validateApiKey(req, res, next) {
    try {
        const apiKey = req.headers['x-api-key'];
        const expectedKey = process.env.API_SECRET_KEY;
        // Se não há chave configurada, permitir acesso (desenvolvimento)
        if (!expectedKey) {
            logger_1.logger.warn('⚠️ API_SECRET_KEY não configurada - acesso sem autenticação');
            req.isAuthenticated = false;
            return next();
        }
        // Verificar se a chave foi fornecida
        if (!apiKey) {
            logger_1.logger.warn(`🔒 Tentativa de acesso sem API key de ${req.ip}`);
            return res.status(401).json({
                success: false,
                error: 'API key obrigatória. Forneça a chave no header X-API-Key.'
            });
        }
        // Verificar se a chave é válida
        if (apiKey !== expectedKey) {
            logger_1.logger.warn(`🔒 Tentativa de acesso com API key inválida de ${req.ip}: ${apiKey.substring(0, 8)}...`);
            return res.status(401).json({
                success: false,
                error: 'API key inválida.'
            });
        }
        // Autenticação bem-sucedida
        req.apiKey = apiKey;
        req.isAuthenticated = true;
        logger_1.logger.debug(`✅ Acesso autorizado de ${req.ip}`);
        next();
    }
    catch (error) {
        logger_1.logger.error('❌ Erro no middleware de autenticação:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno de autenticação'
        });
    }
}
// Middleware opcional - permite acesso sem autenticação mas registra
function optionalAuth(req, res, next) {
    try {
        const apiKey = req.headers['x-api-key'];
        const expectedKey = process.env.API_SECRET_KEY;
        if (apiKey && expectedKey && apiKey === expectedKey) {
            req.isAuthenticated = true;
            req.apiKey = apiKey;
            logger_1.logger.debug(`✅ Acesso autenticado de ${req.ip}`);
        }
        else {
            req.isAuthenticated = false;
            logger_1.logger.debug(`ℹ️ Acesso não autenticado de ${req.ip}`);
        }
        next();
    }
    catch (error) {
        logger_1.logger.error('❌ Erro no middleware de autenticação opcional:', error);
        req.isAuthenticated = false;
        next();
    }
}
// Middleware para verificar permissões de admin
function requireAdmin(req, res, next) {
    try {
        if (!req.isAuthenticated) {
            return res.status(401).json({
                success: false,
                error: 'Autenticação obrigatória para operações administrativas'
            });
        }
        // Verificar se é uma chave admin (pode ter níveis diferentes)
        const adminKeys = process.env.ADMIN_API_KEYS?.split(',') || [];
        if (adminKeys.length > 0 && !adminKeys.includes(req.apiKey || '')) {
            logger_1.logger.warn(`🔒 Tentativa de acesso admin sem permissão de ${req.ip}`);
            return res.status(403).json({
                success: false,
                error: 'Permissões administrativas obrigatórias'
            });
        }
        logger_1.logger.debug(`👑 Acesso admin autorizado de ${req.ip}`);
        next();
    }
    catch (error) {
        logger_1.logger.error('❌ Erro na verificação de permissões admin:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno de autorização'
        });
    }
}
// Middleware para logging de acesso
function logAccess(req, res, next) {
    const startTime = Date.now();
    // Interceptar o final da response
    const originalSend = res.send;
    res.send = function (body) {
        const duration = Date.now() - startTime;
        const status = res.statusCode;
        const method = req.method;
        const url = req.originalUrl;
        const ip = req.ip;
        const userAgent = req.headers['user-agent'];
        const authenticated = req.isAuthenticated ? '🔑' : '🔓';
        logger_1.logger.info(`${authenticated} ${method} ${url} - ${status} - ${duration}ms - ${ip} - ${userAgent}`);
        return originalSend.call(this, body);
    };
    next();
}
// Middleware para CORS específico
function corsMiddleware(req, res, next) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin || '') || !origin) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    }
    else {
        next();
    }
}
