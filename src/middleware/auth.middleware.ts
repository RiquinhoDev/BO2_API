// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { verifyAppToken } from '../security/jwt'
import { getRequestRouteTemplate } from '../observability/requestRoute'
import logger, { type AppLogger } from '../utils/logger'

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        role: string
        permissions: string[]
      }
    }
  }
}

export function createAuthenticate(log: AppLogger = logger) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const route = getRequestRouteTemplate(req)
    try {
      const authHeader = req.headers.authorization

      log.debug('Pedido de autenticação', {
        method: req.method,
        route,
        credentialsPresent: Boolean(authHeader),
      })

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        log.warn('Token não fornecido ou formato incorreto', { method: req.method, route })
        return res.status(401).json({
          success: false,
          message: "Token não fornecido"
        })
      }

      const token = authHeader.substring(7)

      const decoded = verifyAppToken(token) as {
        id: string
        email: string
        role: string
        permissions: string[]
      }

      req.user = decoded
      log.info('Autenticação concluída', { method: req.method, route })
      next()
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        log.warn('Token inválido', { method: req.method, route, errorName: error.name })
        return res.status(401).json({
          success: false,
          message: "Token inválido"
        })
      }

      if (error instanceof jwt.TokenExpiredError) {
        log.warn('Token expirado', { method: req.method, route, errorName: error.name })
        return res.status(401).json({
          success: false,
          message: "Token expirado"
        })
      }

      log.error('Erro no middleware de autenticação', {
        method: req.method,
        route,
        error,
      })
      return res.status(500).json({
        success: false,
        message: "Erro na autenticação"
      })
    }
  }
}

export const authenticate = createAuthenticate()

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Não autenticado"
      })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Sem permissões suficientes"
      })
    }

    next()
  }
}
