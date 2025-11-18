// src/middleware/v2Monitor.ts
// 🎯 SPRINT 5.2 - Middleware de Monitorização V2

import { Request, Response, NextFunction } from 'express'

interface V2Metrics {
  totalRequests: number
  v2Requests: number
  v1Requests: number
  avgResponseTime: number
  errors: number
}

const metrics: V2Metrics = {
  totalRequests: 0,
  v2Requests: 0,
  v1Requests: 0,
  avgResponseTime: 0,
  errors: 0
}

export const v2Monitor = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now()
  
  // Interceptar response
  const originalJson = res.json.bind(res)
  res.json = (body: any) => {
    const duration = Date.now() - startTime
    
    // Atualizar métricas
    metrics.totalRequests++
    
    if (body._v2Enabled) {
      metrics.v2Requests++
    } else {
      metrics.v1Requests++
    }
    
    // Média móvel do tempo de resposta
    metrics.avgResponseTime = 
      (metrics.avgResponseTime * (metrics.totalRequests - 1) + duration) / metrics.totalRequests
    
    if (res.statusCode >= 500) {
      metrics.errors++
    }
    
    // Log se request V1 (alerta)
    if (!body._v2Enabled && metrics.totalRequests > 100) {
      console.warn(`[V2Monitor] ⚠️ Request V1 detectado: ${req.method} ${req.path}`)
    }
    
    return originalJson(body)
  }
  
  next()
}

export const getV2Metrics = (): V2Metrics & { v2Percentage: number } => {
  const v2Percentage = metrics.totalRequests > 0
    ? (metrics.v2Requests / metrics.totalRequests) * 100
    : 0
  
  return {
    ...metrics,
    v2Percentage: Math.round(v2Percentage * 100) / 100
  }
}

