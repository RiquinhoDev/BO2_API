// ════════════════════════════════════════════════════════════════════════════
// 📝 DETAILED LOGGER - Sistema de logs detalhados para debugging
// ════════════════════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

interface LogEntry {
  timestamp: string
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  module: string
  action: string
  data?: any
  error?: any
}

class DetailedLogger {
  private logs: LogEntry[] = []
  private logFile: string | null = null
  private enabled: boolean = false

  /**
   * Inicializa logger com ficheiro de output
   */
  init(filename?: string) {
    this.enabled = true

    if (filename) {
      const logsDir = path.join(process.cwd(), 'logs')
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true })
      }

      this.logFile = path.join(logsDir, filename)
      console.log(`📝 Logger inicializado: ${this.logFile}`)
    }
  }

  /**
   * Log genérico
   */
  private log(level: LogEntry['level'], module: string, action: string, data?: any, error?: any) {
    if (!this.enabled) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      action,
      data,
      error: error ? this.serializeError(error) : undefined
    }

    this.logs.push(entry)

    // Console output colorido
    const colors: Record<LogEntry['level'], string> = {
      DEBUG: '\x1b[36m',    // Cyan
      INFO: '\x1b[32m',     // Green
      WARN: '\x1b[33m',     // Yellow
      ERROR: '\x1b[31m',    // Red
      CRITICAL: '\x1b[35m'  // Magenta
    }

    const reset = '\x1b[0m'
    const color = colors[level]

    console.log(`${color}[${level}]${reset} [${module}] ${action}`)

    if (data) {
      console.log('  Data:', JSON.stringify(data, null, 2))
    }

    if (error) {
      console.error('  Error:', error)
    }
  }

  /**
   * Serializa erro para JSON
   */
  private serializeError(error: any): any {
    if (error instanceof Error) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    }
    return error
  }

  debug(module: string, action: string, data?: any) {
    this.log('DEBUG', module, action, data)
  }

  info(module: string, action: string, data?: any) {
    this.log('INFO', module, action, data)
  }

  warn(module: string, action: string, data?: any) {
    this.log('WARN', module, action, data)
  }

  error(module: string, action: string, error: any, data?: any) {
    this.log('ERROR', module, action, data, error)
  }

  critical(module: string, action: string, error: any, data?: any) {
    this.log('CRITICAL', module, action, data, error)
  }

  /**
   * Marca início de uma operação
   */
  startOperation(module: string, operation: string, params?: any) {
    this.info(module, `▶️ START: ${operation}`, params)
  }

  /**
   * Marca fim de uma operação
   */
  endOperation(module: string, operation: string, result?: any) {
    this.info(module, `✅ END: ${operation}`, result)
  }

  /**
   * Marca operação falhada
   */
  failOperation(module: string, operation: string, error: any) {
    this.error(module, `❌ FAIL: ${operation}`, error)
  }

  /**
   * Log de decisão (para DecisionEngine)
   */
  decision(ruleName: string, shouldExecute: boolean, reason: string, conditions?: any) {
    this.log(
      shouldExecute ? 'INFO' : 'DEBUG',
      'DecisionEngine',
      `Decision: ${ruleName}`,
      {
        ruleName,
        shouldExecute,
        reason,
        conditions
      }
    )
  }

  /**
   * Log de API call
   */
  apiCall(service: string, method: string, endpoint: string, params?: any) {
    this.debug(service, `API Call: ${method} ${endpoint}`, params)
  }

  /**
   * Log de API response
   */
  apiResponse(service: string, endpoint: string, status: number, data?: any) {
    const level = status >= 400 ? 'ERROR' : 'DEBUG'
    this.log(level, service, `API Response: ${endpoint}`, { status, data })
  }

  /**
   * Log de query na BD
   */
  dbQuery(model: string, operation: string, filter?: any, result?: any) {
    this.debug('Database', `${model}.${operation}`, { filter, result })
  }

  /**
   * Guarda logs em ficheiro
   */
  async save(): Promise<string> {
    if (!this.logFile) {
      throw new Error('Logger não inicializado com ficheiro')
    }

    const content = this.logs.map(log => JSON.stringify(log)).join('\n')

    await fs.promises.writeFile(this.logFile, content, 'utf-8')

    console.log(`\n📄 Logs guardados: ${this.logFile}`)
    console.log(`📊 Total de entradas: ${this.logs.length}`)

    return this.logFile
  }

  /**
   * Exporta logs em formato legível
   */
  async saveReadable(): Promise<string> {
    if (!this.logFile) {
      throw new Error('Logger não inicializado com ficheiro')
    }

    const readableFile = this.logFile.replace('.json', '.txt')

    let content = '════════════════════════════════════════════════════════════════\n'
    content += `                    LOG DE EXECUÇÃO\n`
    content += `════════════════════════════════════════════════════════════════\n`
    content += `Total de entradas: ${this.logs.length}\n`
    content += `Gerado em: ${new Date().toISOString()}\n`
    content += '════════════════════════════════════════════════════════════════\n\n'

    this.logs.forEach((log, idx) => {
      content += `[${idx + 1}] ${log.timestamp} [${log.level}] [${log.module}]\n`
      content += `    ${log.action}\n`

      if (log.data) {
        content += `    Data: ${JSON.stringify(log.data, null, 4)}\n`
      }

      if (log.error) {
        content += `    Error: ${JSON.stringify(log.error, null, 4)}\n`
      }

      content += '\n'
    })

    await fs.promises.writeFile(readableFile, content, 'utf-8')

    console.log(`📄 Log legível guardado: ${readableFile}`)

    return readableFile
  }

  /**
   * Retorna estatísticas dos logs
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {} as Record<string, number>,
      byModule: {} as Record<string, number>,
      errors: this.logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length
    }

    this.logs.forEach(log => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1
      stats.byModule[log.module] = (stats.byModule[log.module] || 0) + 1
    })

    return stats
  }

  /**
   * Limpa logs
   */
  clear() {
    this.logs = []
  }

  /**
   * Desativa logger
   */
  disable() {
    this.enabled = false
  }

  /**
   * Ativa logger
   */
  enable() {
    this.enabled = true
  }
}

// Singleton
export const logger = new DetailedLogger()
export default logger
