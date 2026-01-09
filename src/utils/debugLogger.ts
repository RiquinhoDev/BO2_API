// ════════════════════════════════════════════════════════════
// 📁 src/utils/debugLogger.ts
// Sistema de logging detalhado para debug (guarda em ficheiro MD)
// ════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

interface DebugLog {
  timestamp: string
  step: string
  action: string
  data?: any
  endpoint?: string
  response?: any
  error?: any
}

class DebugLogger {
  private logs: DebugLog[] = []
  private sessionId: string
  private logFile: string
  private startTime: Date

  constructor(sessionName: string) {
    this.sessionId = new Date().toISOString().replace(/:/g, '-').split('.')[0]
    this.startTime = new Date()

    const logsDir = path.join(process.cwd(), 'logs', 'debug')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }

    this.logFile = path.join(logsDir, `${sessionName}-${this.sessionId}.md`)

    this.writeHeader(sessionName)
  }

  private writeHeader(sessionName: string): void {
    const header = [
      '# 🔍 DEBUG LOG',
      '',
      `**Sessão**: ${sessionName}`,
      `**Início**: ${this.startTime.toLocaleString('pt-PT')}`,
      `**SessionID**: ${this.sessionId}`,
      '',
      '---',
      ''
    ].join('\n')

    fs.writeFileSync(this.logFile, header)
  }

  log(step: string, action: string, data?: any): void {
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      step,
      action,
      ...(data && { data })
    }

    this.logs.push(log)
    this.appendToFile(log)

    // Console também (simplificado)
    console.log(`[${step}] ${action}`)
  }

  logEndpoint(step: string, method: string, endpoint: string, params?: any): void {
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      step,
      action: `${method} ${endpoint}`,
      endpoint,
      ...(params && { data: params })
    }

    this.logs.push(log)
    this.appendToFile(log)

    console.log(`[${step}] 📡 ${method} ${endpoint}`)
  }

  logResponse(step: string, endpoint: string, response: any): void {
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      step,
      action: `Response from ${endpoint}`,
      endpoint,
      response
    }

    this.logs.push(log)
    this.appendToFile(log)

    console.log(`[${step}] ✅ Response received`)
  }

  logError(step: string, action: string, error: any): void {
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      step,
      action: `ERROR: ${action}`,
      error: {
        message: error.message,
        stack: error.stack,
        response: error.response?.data
      }
    }

    this.logs.push(log)
    this.appendToFile(log)

    console.error(`[${step}] ❌ ${action}`)
  }

  private appendToFile(log: DebugLog): void {
    const lines = [
      '',
      `## ${log.step} - ${log.action}`,
      '',
      `**Time**: ${new Date(log.timestamp).toLocaleTimeString('pt-PT')}`,
      ''
    ]

    if (log.endpoint) {
      lines.push(`**Endpoint**: \`${log.endpoint}\``, '')
    }

    if (log.data) {
      lines.push('**Data**:', '```json', JSON.stringify(log.data, null, 2), '```', '')
    }

    if (log.response) {
      lines.push('**Response**:', '```json', JSON.stringify(log.response, null, 2), '```', '')
    }

    if (log.error) {
      lines.push('**Error**:', '```json', JSON.stringify(log.error, null, 2), '```', '')
    }

    lines.push('---', '')

    fs.appendFileSync(this.logFile, lines.join('\n'))
  }

  finalize(): string {
    const endTime = new Date()
    const duration = endTime.getTime() - this.startTime.getTime()
    const durationMin = Math.floor(duration / 60000)
    const durationSec = Math.floor((duration % 60000) / 1000)

    const footer = [
      '',
      '---',
      '',
      '# 📊 RESUMO',
      '',
      `**Fim**: ${endTime.toLocaleString('pt-PT')}`,
      `**Duração**: ${durationMin}min ${durationSec}s`,
      `**Total de logs**: ${this.logs.length}`,
      '',
      `**Ficheiro**: \`${this.logFile}\``,
      ''
    ].join('\n')

    fs.appendFileSync(this.logFile, footer)

    console.log(`\n📁 Debug log guardado em: ${this.logFile}`)

    return this.logFile
  }
}

export default DebugLogger
