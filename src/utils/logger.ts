// ════════════════════════════════════════════════════════════
// 📁 src/utils/logger.ts
// Sistema de logging estruturado com Winston
// ════════════════════════════════════════════════════════════

import winston from 'winston'
import path from 'path'
import fs from 'fs'

// ─────────────────────────────────────────────────────────────
// CRIAR PASTA DE LOGS SE NÃO EXISTIR
// ─────────────────────────────────────────────────────────────

const logsDir = path.join(__dirname, '../../logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// ─────────────────────────────────────────────────────────────
// FORMATO DE LOGS
// ─────────────────────────────────────────────────────────────

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
)

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`
    }
    return msg
  })
)

// ─────────────────────────────────────────────────────────────
// CRIAR LOGGER
// ─────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'active-campaign' },
  transports: [
    // Logs de erro (apenas errors)
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // Logs combinados (todos os níveis)
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // Logs de jobs (CRON)
    new winston.transports.File({
      filename: path.join(logsDir, 'jobs.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
})

// ─────────────────────────────────────────────────────────────
// CONSOLE OUTPUT (apenas em desenvolvimento)
// ─────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat
    })
  )
}

// ─────────────────────────────────────────────────────────────
// MÉTODOS HELPER
// ─────────────────────────────────────────────────────────────

export const logJobStart = (jobName: string) => {
  logger.info(`🚀 Job iniciado: ${jobName}`, {
    job: jobName,
    status: 'started',
    timestamp: new Date().toISOString()
  })
}

export const logJobEnd = (jobName: string, stats: any) => {
  logger.info(`✅ Job completo: ${jobName}`, {
    job: jobName,
    status: 'completed',
    stats,
    timestamp: new Date().toISOString()
  })
}

export const logJobError = (jobName: string, error: any) => {
  logger.error(`❌ Erro no job: ${jobName}`, {
    job: jobName,
    status: 'failed',
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  })
}

export const logRuleExecution = (
  userId: string,
  courseId: string,
  ruleId: string,
  result: string
) => {
  logger.info(`🏷️ Regra executada`, {
    type: 'rule_execution',
    userId,
    courseId,
    ruleId,
    result,
    timestamp: new Date().toISOString()
  })
}

export const logEmailSent = (
  email: string,
  tag: string,
  courseId: string
) => {
  logger.info(`📧 Email enviado`, {
    type: 'email_sent',
    email,
    tag,
    courseId,
    timestamp: new Date().toISOString()
  })
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

export default logger
