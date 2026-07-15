import type { Application } from 'express'
import { createApp, type CreateAppDependencies } from './app'
import { loadConfig, type AppConfig } from './config/appConfig'
import { configureJwt } from './security/jwt'

export interface Infrastructure {
  connectMongo: (config: AppConfig) => Promise<void>
  connectRedis: (config: AppConfig) => Promise<void>
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
  const infrastructure = await (options.loadInfrastructure ?? defaultLoadInfrastructure)()
  await infrastructure.connectMongo(config)
  await infrastructure.connectRedis(config)

  const registerModels = await (options.loadModelRegistrar ?? defaultLoadModelRegistrar)()
  await registerModels()

  const registerRoutes = await (options.loadRouteRegistrar ?? defaultLoadRouteRegistrar)()
  const app = createApp({ registerRoutes, nodeEnv: config.nodeEnv })

  const startJobs = await (options.loadJobStarter ?? defaultLoadJobStarter)()
  await startJobs(config)

  const listen = await (options.loadListener ?? defaultLoadListener)()
  return listen(app, config.port)
}
