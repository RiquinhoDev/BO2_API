// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { verifyAppToken } from '../security/jwt'

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

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization

    console.log('🔐 Auth Middleware - URL:', req.method, req.originalUrl)
    console.log('🔐 Auth Header:', authHeader ? `${authHeader.substring(0, 30)}...` : 'NENHUM')

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn('⚠️ Token não fornecido ou formato incorreto')
      return res.status(401).json({
        success: false,
        message: "Token não fornecido"
      })
    }

    const token = authHeader.substring(7) // Remove "Bearer "
    console.log('🔑 Token extraído:', `${token.substring(0, 20)}...`)

    // Verify token
    const decoded = verifyAppToken(token) as {
      id: string
      email: string
      role: string
      permissions: string[]
    }

    console.log('✅ Token válido para user:', decoded.email)

    // Attach user to request
    req.user = decoded

    next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      console.error('❌ Token inválido:', error.message)
      return res.status(401).json({
        success: false,
        message: "Token inválido"
      })
    }

    if (error instanceof jwt.TokenExpiredError) {
      console.error('❌ Token expirado:', error.message)
      return res.status(401).json({
        success: false,
        message: "Token expirado"
      })
    }

    console.error("❌ Auth middleware error:", error)
    res.status(500).json({
      success: false,
      message: "Erro na autenticação"
    })
  }
}

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
