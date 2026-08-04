import type { Application } from 'express'
import { createApp, type CreateAppDependencies } from './app'
import { createHttpPerimeter } from './security/httpPerimeter'
import type { RateLimitStoreFactory } from './security/redisRateLimitStore'
import { loadConfig, type AppConfig } from './config/appConfig'
import { configureJwt } from './security/jwt'
import { configureDebugRoutes } from './security/debugRoutes'
import logger, { type AppLogger } from './utils/logger'

export interface Infrastructure {
  connectMongo: (config: AppConfig) => Promise<void>
  connectRedis: (config: AppConfig) => Promise<RateLimitStoreFactory | undefined>
  disconnect: () => Promise<void>
}

export type ModelRegistrar = () => Promise<void>
export type RouteRegistrar = CreateAppDependencies['registerRoutes']
export type JobStarter = (config: AppConfig) => Promise<void>
export type AppListener = (app: Application, port: number) => Promise<unknown>

export interface BootstrapOptions {
  env?: NodeJS.ProcessEnv
  loadInfrastructure?: () => Promise<Infrastructure>
  loadModelRegistrar?: () => Promise<ModelRegistrar>
  loadRouteRegistrar?: () => Promise<RouteRegistrar>
  loadJobStarter?: () => Promise<JobStarter>
  loadListener?: () => Promise<AppListener>
  log?: Pick<AppLogger, 'error'>
}

const defaultLoadInfrastructure = async (): Promise<Infrastructure> =>
  (await import('./runtime/infrastructure')).infrastructure
const defaultLoadModelRegistrar = async (): Promise<ModelRegistrar> =>
  (await import('./runtime/registerModels')).registerModels
const defaultLoadRouteRegistrar = async (): Promise<RouteRegistrar> =>
  (await import('./runtime/registerRoutes')).registerRoutes
const defaultLoadJobStarter = async (): Promise<JobStarter> =>
  (await import('./runtime/startJobs')).startJobs
const defaultLoadListener = async (): Promise<AppListener> =>
  (await import('./runtime/listen')).listen

export async function bootstrap(options: BootstrapOptions = {}): Promise<unknown> {
  const config = loadConfig(options.env)
  configureJwt(config)
  configureDebugRoutes(config)
  const log = options.log ?? logger
  if (config.nodeEnv === 'production' && !config.authEnforce) {
    log.error('AUTH_ENFORCE=false em producao: default-deny de autenticacao desligado')
  }
  const infrastructure = await (options.loadInfrastructure ?? defaultLoadInfrastructure)()
  let storeFactory: RateLimitStoreFactory | undefined
  try {
    await infrastructure.connectMongo(config)
    storeFactory = await infrastructure.connectRedis(config)
    if (config.nodeEnv === 'production' && !storeFactory) {
      throw new Error('CONFIG_INVALIDA: Redis rate-limit store factory obrigatoria em producao')
    }

    const registerModels = await (options.loadModelRegistrar ?? defaultLoadModelRegistrar)()
    await registerModels()

    const registerRoutes = await (options.loadRouteRegistrar ?? defaultLoadRouteRegistrar)()
    const app = createApp({
      createHttpPerimeter: () => createHttpPerimeter({ storeFactory }),
      registerRoutes,
      allowedOrigins: config.allowedOrigins,
      acWebhookSecret: config.acWebhookSecret,
      authEnforce: config.authEnforce,
    })

    const startJobs = await (options.loadJobStarter ?? defaultLoadJobStarter)()
    await startJobs(config)

    const listen = await (options.loadListener ?? defaultLoadListener)()
    return await listen(app, config.port)
  } catch (error) {
    try {
      await infrastructure.disconnect()
    } catch (cleanupError) {
      log.error('Erro ao limpar infraestrutura apos falha de arranque', cleanupError)
    }
    throw error
  }
}
