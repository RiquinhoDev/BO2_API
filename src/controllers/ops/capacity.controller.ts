// =====================================================
// 📁 src/controllers/ops/capacity.controller.ts
// Painel de capacidade: consumo, tetos e projecao de escala
// =====================================================

import type { NextFunction, Request, Response } from 'express'
import { buildCapacityReport, DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS } from '../../services/ops/capacityReport.service'
import { probeLiveCapacity } from '../../services/ops/capacityLive.service'
import { forwardApplicationError } from '../../security/forwardApplicationError'
import { successResponse } from '../../contracts/responseContract'

function parseDays(raw: unknown): number {
  if (typeof raw !== 'string' || raw.trim() === '') return DEFAULT_RANGE_DAYS
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_RANGE_DAYS
  return Math.min(parsed, MAX_RANGE_DAYS)
}

/**
 * GET /api/ops/capacity
 * Relatorio completo a partir dos snapshots ja gravados.
 */
export const getCapacityReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await buildCapacityReport({ days: parseDays(req.query.days) })
    res.json(successResponse(report, { generatedAt: report.generatedAt }))
  } catch (error: unknown) {
    forwardApplicationError(next, error, 'Erro ao construir relatorio de capacidade', 'CAPACITY_REPORT_FAILED')
  }
}

/**
 * GET /api/ops/capacity/live
 * Sondagem imediata. Corre probes de verdade — usar para verificar, nao para
 * refrescar o painel em ciclo.
 */
export const getLiveCapacity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeCollections = req.query.collections === 'true'
    const live = await probeLiveCapacity({ includeCollections })
    res.json(successResponse(live, { measuredAt: live.measuredAt }))
  } catch (error: unknown) {
    forwardApplicationError(next, error, 'Erro ao sondar capacidade', 'CAPACITY_LIVE_FAILED')
  }
}
