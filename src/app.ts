import express, { type Application } from 'express'
import compression from 'compression'
import cors from 'cors'
import { buildAllowedOrigins, isOriginAllowed } from './security/cors'
import {
  HEAVY_OPERATION_PATHS,
  LOGIN_PATHS,
  WEBHOOK_PATHS,
  createHttpPerimeter,
  type HttpPerimeter,
} from './security/httpPerimeter'
import {
  createErrorHandling,
  type ErrorHandling,
} from './security/errorHandling'

export interface CreateAppDependencies {
  registerRoutes: (app: Application) => void
  allowedOrigins?: readonly string[]
  createHttpPerimeter?: () => HttpPerimeter
  createErrorHandling?: () => ErrorHandling
}

export function createApp(_deps: CreateAppDependencies): Application {
  const app = express()
  const allowedOrigins = _deps.allowedOrigins ?? buildAllowedOrigins()
  const httpPerimeter = (_deps.createHttpPerimeter ?? createHttpPerimeter)()
  const errorHandling = (_deps.createErrorHandling ?? createErrorHandling)()
  app.set('trust proxy', 1)
  app.use(errorHandling.correlationId)
  app.use(httpPerimeter.helmet)
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true)
        return callback(new Error(`Origin ${origin} not allowed by CORS`))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'api_key', 'x-api-key'],
    }),
  )
  app.use(compression())
  app.use(LOGIN_PATHS, httpPerimeter.login)
  app.use(WEBHOOK_PATHS, httpPerimeter.webhook)
  app.use(HEAVY_OPERATION_PATHS, httpPerimeter.heavy)
  app.use(express.json({ limit: '100kb' }))
  _deps.registerRoutes(app)
  app.use(errorHandling.handler)
  return app
}
