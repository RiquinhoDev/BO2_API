import fs from 'fs'
import path from 'path'

export interface SyncResponse {
  status(code: number): SyncResponse
  json(payload: Record<string, unknown>): SyncResponse
}

interface BackgroundSyncResult extends Record<string, unknown> {
  httpStatus: number
}

declare global {
  var __curseducaSyncRunning: boolean | undefined
  var __curseducaSyncStartedAt: Date | undefined
  var __curseducaSyncFinishedAt: Date | null | undefined
  var __curseducaSyncResult: BackgroundSyncResult | null | undefined
  var __curseducaSyncError: string | null | undefined
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

export class SyncLogger {
  private logFile: string
  private startTime: number

  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.logFile = path.join(process.cwd(), 'logs', `curseduca-sync-${timestamp}.log`)
    this.startTime = Date.now()
    
    const logDir = path.dirname(this.logFile)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    
    this.log('═'.repeat(80))
    this.log('🚀 CURSEDUCA UNIVERSAL SYNC - DEBUG LOG')
    this.log('═'.repeat(80))
    this.log(`📅 Início: ${new Date().toLocaleString('pt-PT')}`)
    this.log(`📁 Log File: ${this.logFile}`)
    this.log('═'.repeat(80))
    this.log('')
  }

  log(message: string) {
    const timestamp = new Date().toISOString()
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2)
    const line = `[${timestamp}] [+${elapsed}s] ${message}`
    
    console.log(message)
    fs.appendFileSync(this.logFile, line + '\n')
  }

  section(title: string) {
    this.log('')
    this.log('─'.repeat(80))
    this.log(`📍 ${title}`)
    this.log('─'.repeat(80))
  }

  success(message: string) {
    this.log(`✅ ${message}`)
  }

  error(message: string) {
    this.log(`❌ ${message}`)
  }

  warn(message: string) {
    this.log(`⚠️  ${message}`)
  }

  info(message: string) {
    this.log(`ℹ️  ${message}`)
  }

  getLogPath() {
    return this.logFile
  }
}

// ═══════════════════════════════════════════════════════════
