import path from 'node:path'
import winston from 'winston'
import type Transport from 'winston-transport'
import { redactSensitiveData } from '../observability/redaction'
import type { ObservabilityConfig } from '../config/configTypes'

export interface StructuredLoggerOptions {
  level?: string
  transports?: Transport[]
  silent?: boolean
  logDirectory?: string
  metricsEnabled?: boolean
  fileLoggingEnabled?: boolean
  consoleLoggingEnabled?: boolean
}

export type AppLogger = Pick<winston.Logger, 'debug' | 'info' | 'warn' | 'error'>

const redactFormat = winston.format((info) => {
  const redacted = redactSensitiveData(info) as typeof info
  const level = Symbol.for('level')
  const withSymbols = info as Record<PropertyKey, unknown>
  if (withSymbols[level] !== undefined) {
    Object.defineProperty(redacted, level, {
      configurable: true,
      enumerable: false,
      value: withSymbols[level],
    })
  }
  return redacted
})

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    const suffix = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : ''
    return `${timestamp} [${level}]: ${message}${suffix}`
  }),
)

const DEFAULT_LOG_DIRECTORY = path.join(__dirname, '../../logs')

function createRuntimeTransports(
  logDirectory = DEFAULT_LOG_DIRECTORY,
  fileLoggingEnabled = true,
  consoleLoggingEnabled = true,
): Transport[] {
  const logsDir = logDirectory
  const transports: Transport[] = []

  if (fileLoggingEnabled) {
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 5_242_880,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 5_242_880,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'jobs.log'),
        level: 'info',
        maxsize: 5_242_880,
        maxFiles: 5,
      }),
    )
  }

  if (consoleLoggingEnabled) {
    transports.push(new winston.transports.Console({ format: consoleFormat }))
  }
  return transports
}

export function createStructuredLogger(options: StructuredLoggerOptions = {}): winston.Logger {
  return winston.createLogger({
    level: options.level ?? 'info',
    silent: options.silent,
    defaultMeta: {
      service: 'bo2-api',
      ...(options.metricsEnabled ? { metricsEnabled: true } : {}),
    },
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      redactFormat(),
      winston.format.json(),
    ),
    transports:
      options.transports ??
      createRuntimeTransports(
        options.logDirectory,
        options.fileLoggingEnabled,
        options.consoleLoggingEnabled,
      ),
  })
}

let singleton: winston.Logger | undefined
let singletonOptions: StructuredLoggerOptions = {
  level: 'info',
  silent: true,
  transports: [],
}

export function configureLogger(config: ObservabilityConfig): void {
  singletonOptions = {
    level: config.logLevel,
    logDirectory: config.logDirectory,
    metricsEnabled: config.metricsEnabled,
    fileLoggingEnabled: config.fileLoggingEnabled,
    consoleLoggingEnabled: config.consoleLoggingEnabled,
    silent: !config.fileLoggingEnabled && !config.consoleLoggingEnabled,
  }
  if (singleton) {
    singleton.close()
    singleton = undefined
  }
}

function getLogger(): winston.Logger {
  if (!singleton) singleton = createStructuredLogger(singletonOptions)
  return singleton
}

const logger = new Proxy({} as AppLogger, {
  get: (_target, property: keyof AppLogger) => {
    const instance = getLogger()
    return instance[property].bind(instance)
  },
})

export function logHttpError(event: object): void {
  logger.error('HTTP request failed', event)
}

export const logJobStart = (jobName: string): void => {
  logger.info('Job iniciado', {
    job: jobName,
    status: 'started',
    timestamp: new Date().toISOString(),
  })
}

export const logJobEnd = (jobName: string, stats: unknown): void => {
  logger.info('Job completo', {
    job: jobName,
    status: 'completed',
    stats,
    timestamp: new Date().toISOString(),
  })
}

export const logJobError = (jobName: string, error: unknown): void => {
  logger.error('Erro no job', {
    job: jobName,
    status: 'failed',
    error,
    timestamp: new Date().toISOString(),
  })
}

export const logRuleExecution = (
  userId: string,
  courseId: string,
  ruleId: string,
  result: string,
): void => {
  logger.info('Regra executada', {
    type: 'rule_execution',
    userId,
    courseId,
    ruleId,
    result,
    timestamp: new Date().toISOString(),
  })
}

export const logEmailSent = (email: string, tag: string, courseId: string): void => {
  logger.info('Email enviado', {
    type: 'email_sent',
    email,
    tag,
    courseId,
    timestamp: new Date().toISOString(),
  })
}

export default logger
