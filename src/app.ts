import express, { type Application, type RequestHandler } from 'express'
import compression from 'compression'
import cors from 'cors'
import { buildAllowedOrigins, isOriginAllowed } from './security/cors'
import {
  AC_WEBHOOK_PATHS,
  createAcWebhookSecurity,
  type AcWebhookReplayStore,
} from './security/acWebhookSecurity'
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
import { createDefaultDenyAuth } from './security/defaultDenyAuth'

export interface CreateAppDependencies {
  registerRoutes: (app: Application) => void
  allowedOrigins?: readonly string[]
  createHttpPerimeter?: () => HttpPerimeter
  createErrorHandling?: () => ErrorHandling
  acWebhookSecret?: string
  acWebhookReplayStore?: AcWebhookReplayStore
  authEnforce?: boolean
  authenticateRequest?: RequestHandler
}

export function createApp(_deps: CreateAppDependencies): Application {
  const app = express()
  const allowedOrigins = _deps.allowedOrigins ?? buildAllowedOrigins()
  const httpPerimeter = (_deps.createHttpPerimeter ?? createHttpPerimeter)()
  const errorHandling = (_deps.createErrorHandling ?? createErrorHandling)()
  const defaultDenyAuth = createDefaultDenyAuth({
    enabled: _deps.authEnforce,
    authenticateRequest: _deps.authenticateRequest,
  })
  const acWebhookSecurity = createAcWebhookSecurity({
    secret: _deps.acWebhookSecret,
    replayStore: _deps.acWebhookReplayStore,
  })
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
  app.use(AC_WEBHOOK_PATHS, acWebhookSecurity.jsonParser)
  app.use(AC_WEBHOOK_PATHS, acWebhookSecurity.urlencodedParser)
  app.use(AC_WEBHOOK_PATHS, acWebhookSecurity.replayGuard)
  app.use(defaultDenyAuth)
  app.use(express.json({ limit: '100kb' }))
  _deps.registerRoutes(app)
  app.use(errorHandling.handler)
  return app
}
