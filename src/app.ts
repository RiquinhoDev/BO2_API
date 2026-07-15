import express, { type Application } from 'express'
import compression from 'compression'
import cors from 'cors'

export interface CreateAppDependencies {
  registerRoutes: (app: Application) => void
  nodeEnv?: 'development' | 'test' | 'production'
}

const allowedOrigins = [
  'https://www.backoffice.serriquinho.com',
  'https://backoffice.serriquinho.com',
  'https://lp.serriquinho.com',
  'https://osriquinhos.serriquinho.com',
  'https://www.osriquinhos.serriquinho.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://comunidadelogin-production.up.railway.app',
]

export function createApp(_deps: CreateAppDependencies): Application {
  const app = express()
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
        if (_deps.nodeEnv === 'production') {
          return callback(new Error(`Origin ${origin} not allowed by CORS`))
        }
        return callback(null, true)
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
