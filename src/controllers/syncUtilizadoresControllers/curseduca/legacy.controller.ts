import { NextFunction, Request, Response } from 'express'
import type { CurseducaCleanupInput } from '../../../security/curseducaDestructiveInput'
import { syncCurseducaUsers } from './sync.controller'
import { errorMessage, type SyncResponse } from '../../../services/curseducaServices/controllerSupport'

export const getGroups = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use POST /api/curseduca/sync'
  })
}

export const getMembers = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use POST /api/curseduca/sync'
  })
}

export const getMemberByEmail = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use POST /api/curseduca/sync/email/:email'
  })
}

export const getAccessReports = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/curseduca/dashboard'
  })
}

export const getCurseducaUsers = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/users?source=CURSEDUCA'
  })
}

export const debugCurseducaAPI = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/curseduca/health (se disponível)'
  })
}


export const getSyncReport = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/sync/reports/:reportId'
  })
}

export const getUserByEmail = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/users?email=:email'
  })
}

export const cleanupDuplicates = async (
  _input: CurseducaCleanupInput,
  res: Response,
): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Funcionalidade não implementada',
    note: 'Deduplicação é feita automaticamente no sync'
  })
}

// ✅ Alias para compatibilidade
export const syncCurseducaUsersUniversal = syncCurseducaUsers

// ═══════════════════════════════════════════════════════════════
// 🔄 SYNC EM BACKGROUND (evita timeout/CORS no proxy)
//
// O sync universal pode demorar minutos (enrich de centenas de
// membros via /members/{id}). Em vez de bloquear o request HTTP
// (que estoura o timeout do proxy → CORS), inicia em fundo e
// devolve 202 imediatamente. O frontend faz polling de /sync/status.
//
// Reutiliza 100% o handler existente syncCurseducaUsers via um
// "res" falso que captura o resultado. O endpoint síncrono
// /sync/universal continua intacto para cron e outros callers.
// ═══════════════════════════════════════════════════════════════

/**
 * GET /curseduca/sync/universal/start
 * Inicia o sync universal em background. Devolve 202 imediatamente.
 */
export const syncCurseducaUsersStart = async (req: Request, res: Response): Promise<void> => {
  if (global.__curseducaSyncRunning) {
    res.status(409).json({
      success: false,
      running: true,
      startedAt: global.__curseducaSyncStartedAt || null,
      message: 'Já existe um sync CursEduca em curso. Aguarde a conclusão.'
    })
    return
  }

  // Marcar como em execução
  global.__curseducaSyncRunning = true
  global.__curseducaSyncStartedAt = new Date()
  global.__curseducaSyncFinishedAt = null
  global.__curseducaSyncResult = null
  global.__curseducaSyncError = null

  // Responder JÁ (não bloquear → sem timeout)
  res.status(202).json({
    success: true,
    started: true,
    startedAt: global.__curseducaSyncStartedAt,
    message: 'Sincronização CursEduca iniciada em background. Use /curseduca/sync/status para acompanhar.'
  })

  // Correr em fundo reutilizando o handler existente com um res falso
  const fakeRes: SyncResponse & { statusCode: number } = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this },
    json(payload: Record<string, unknown>) {
      global.__curseducaSyncResult = { httpStatus: this.statusCode, ...payload }
      return this
    }
  }

  const captureBackgroundFailure: NextFunction = (error) => {
    global.__curseducaSyncError = errorMessage(error)
  }

  // fire-and-forget — o processo Railway mantém o event loop vivo
  Promise.resolve()
    .then(() => syncCurseducaUsers(req, fakeRes, captureBackgroundFailure))
    .catch((error: unknown) => { global.__curseducaSyncError = errorMessage(error) })
    .finally(() => {
      global.__curseducaSyncRunning = false
      global.__curseducaSyncFinishedAt = new Date()
      const startedAt = global.__curseducaSyncStartedAt
      const dur = startedAt
        ? Math.round((global.__curseducaSyncFinishedAt.getTime() - startedAt.getTime()) / 1000)
        : 0
      console.log(`✅ [CursEduca BG] Sync background concluído em ${dur}s`)
    })
}

/**
 * GET /curseduca/sync/status
 * Estado do sync background (para polling do frontend).
 */
export const getCurseducaSyncStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    running: Boolean(global.__curseducaSyncRunning),
    startedAt: global.__curseducaSyncStartedAt || null,
    finishedAt: global.__curseducaSyncFinishedAt || null,
    error: global.__curseducaSyncError || null,
    result: global.__curseducaSyncResult || null
  })
}
