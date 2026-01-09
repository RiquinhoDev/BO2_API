// ════════════════════════════════════════════════════════════
// 📁 src/utils/syncLogger.ts
// Sistema de logging estruturado para sincronização BD → AC
// ════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
type SyncPhase = 'SYNC_PRODUCTS' | 'RECALC_ENGAGEMENT' | 'PRE_CREATE_TAGS' | 'VERIFY_TAGS' | 'APPLY_TAGS' | 'CLEANUP'

interface LogEntry {
  timestamp: string
  level: LogLevel
  phase: SyncPhase
  message: string
  data?: any
}

interface SyncStats {
  startTime: Date
  endTime?: Date
  totalUsers: number
  totalProducts: number
  tagsApplied: number
  tagsRemoved: number
  errors: number
  phase: SyncPhase
}

class SyncLogger {
  private logFile: string
  private statsFile: string
  private logs: LogEntry[] = []
  private stats: SyncStats
  private sessionId: string

  constructor() {
    const logsDir = path.join(process.cwd(), 'logs', 'sync')

    // Criar diretório se não existir
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }

    // Criar ficheiros únicos por sessão
    this.sessionId = new Date().toISOString().replace(/:/g, '-').split('.')[0]
    this.logFile = path.join(logsDir, `sync-${this.sessionId}.log`)
    this.statsFile = path.join(logsDir, `sync-${this.sessionId}-stats.json`)

    // Inicializar stats
    this.stats = {
      startTime: new Date(),
      totalUsers: 0,
      totalProducts: 0,
      tagsApplied: 0,
      tagsRemoved: 0,
      errors: 0,
      phase: 'SYNC_PRODUCTS'
    }

    // Escrever header
    this.writeHeader()
  }

  private writeHeader(): void {
    const header = [
      '═'.repeat(80),
      `📊 SYNC BD → AC - ${this.sessionId}`,
      `Início: ${this.stats.startTime.toLocaleString('pt-PT')}`,
      '═'.repeat(80),
      ''
    ].join('\n')

    fs.writeFileSync(this.logFile, header)
  }

  // ════════════════════════════════════════════════════════════
  // LOGGING POR FASE
  // ════════════════════════════════════════════════════════════

  phase(phase: SyncPhase, message: string): void {
    this.stats.phase = phase
    this.log('INFO', phase, `🔷 ${message}`)
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`🔷 ${message}`)
    console.log('─'.repeat(60))
  }

  info(message: string, data?: any): void {
    this.log('INFO', this.stats.phase, message, data)
    console.log(`ℹ️  ${message}`)
  }

  success(message: string, data?: any): void {
    this.log('SUCCESS', this.stats.phase, message, data)
    console.log(`✅ ${message}`)
  }

  warn(message: string, data?: any): void {
    this.log('WARN', this.stats.phase, message, data)
    console.warn(`⚠️  ${message}`)
  }

  error(message: string, data?: any): void {
    this.stats.errors++
    this.log('ERROR', this.stats.phase, message, data)
    console.error(`❌ ${message}`)
  }

  // ════════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════════

  updateStats(update: Partial<SyncStats>): void {
    Object.assign(this.stats, update)
  }

  incrementTagsApplied(count: number = 1): void {
    this.stats.tagsApplied += count
  }

  incrementTagsRemoved(count: number = 1): void {
    this.stats.tagsRemoved += count
  }

  // ════════════════════════════════════════════════════════════
  // PROGRESS
  // ════════════════════════════════════════════════════════════

  progress(current: number, total: number, message?: string): void {
    const percentage = Math.floor((current / total) * 100)
    const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2))
    const msg = `[${bar}] ${percentage}% (${current}/${total})${message ? ` - ${message}` : ''}`

    // Apenas log para ficheiro, não console (evita spam)
    this.log('INFO', this.stats.phase, msg)

    // Console apenas a cada 10%
    if (percentage % 10 === 0 || current === total) {
      console.log(`   ${percentage}% (${current}/${total})${message ? ` - ${message}` : ''}`)
    }
  }

  // ════════════════════════════════════════════════════════════
  // PERSISTÊNCIA
  // ════════════════════════════════════════════════════════════

  private log(level: LogLevel, phase: SyncPhase, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
      ...(data && { data })
    }

    this.logs.push(entry)

    // Escrever no ficheiro (append)
    const line = `[${entry.timestamp}] [${level}] [${phase}] ${message}${data ? ` | ${JSON.stringify(data)}` : ''}\n`
    fs.appendFileSync(this.logFile, line)
  }

  finalize(): void {
    this.stats.endTime = new Date()
    const duration = this.stats.endTime.getTime() - this.stats.startTime.getTime()
    const durationMin = Math.floor(duration / 60000)
    const durationSec = Math.floor((duration % 60000) / 1000)

    // Resumo final
    const summary = [
      '',
      '═'.repeat(80),
      '📊 RESUMO FINAL',
      '═'.repeat(80),
      `⏱️  Duração: ${durationMin}min ${durationSec}s`,
      `👥 Users processados: ${this.stats.totalUsers}`,
      `📦 Produtos processados: ${this.stats.totalProducts}`,
      `✅ Tags aplicadas: ${this.stats.tagsApplied}`,
      `🗑️  Tags removidas: ${this.stats.tagsRemoved}`,
      `❌ Erros: ${this.stats.errors}`,
      `Fim: ${this.stats.endTime.toLocaleString('pt-PT')}`,
      '═'.repeat(80),
      ''
    ].join('\n')

    fs.appendFileSync(this.logFile, summary)

    // Guardar stats em JSON
    fs.writeFileSync(this.statsFile, JSON.stringify({
      ...this.stats,
      duration: `${durationMin}min ${durationSec}s`,
      durationMs: duration,
      logFile: this.logFile
    }, null, 2))

    // Mostrar no console
    console.log(summary)
    console.log(`📁 Logs guardados em: ${this.logFile}`)
    console.log(`📊 Stats guardados em: ${this.statsFile}`)
  }
}

// ════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════

export default SyncLogger
