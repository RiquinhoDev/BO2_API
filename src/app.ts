import express, { type Application } from 'express'
import compression from 'compression'
import cors from 'cors'
import { buildAllowedOrigins, isOriginAllowed } from './security/cors'

export interface CreateAppDependencies {
  registerRoutes: (app: Application) => void
  allowedOrigins?: readonly string[]
}

export function createApp(_deps: CreateAppDependencies): Application {
  const app = express()
  const allowedOrigins = _deps.allowedOrigins ?? buildAllowedOrigins()
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
  app.use(express.json())
  _deps.registerRoutes(app)
  return app
}
