// Denominadores de negocio. Sem isto o painel so diz "gastamos X"; com isto diz
// "gastamos X por aluno", que e a unica forma de responder a pergunta "e se
// entrarem mais N clientes?".
//
// Nao recalculamos nada: `estimatedDocumentCount` le metadados da coleccao (nao
// percorre documentos) e o resto vem da vista materializada que o dashboard ja
// mantem.

import mongoose from 'mongoose'
import { DashboardStats } from '../../../models/DashboardStats'

export interface BusinessScale {
  readonly students: number
  readonly activeStudents: number | null
  readonly enrollments: number
  readonly activeProducts: number | null
  readonly measuredAt: Date
}

export interface BusinessProbePort {
  estimatedCount(collection: string): Promise<number>
  latestDashboardOverview(): Promise<{
    activeCount: number
    activeProducts: number
    totalStudents: number
  } | null>
}

export function createBusinessProbePort(): BusinessProbePort {
  const requireDb = () => {
    const db = mongoose.connection.db
    if (!db) throw new Error('Mongo is not connected')
    return db
  }

  return {
    estimatedCount: async (collection) =>
      requireDb().collection(collection).estimatedDocumentCount(),
    latestDashboardOverview: async () => {
      const latest = await DashboardStats.findOne()
        .sort({ calculatedAt: -1 })
        .select({ overview: 1 })
        .lean()
      const overview = (latest as { overview?: Record<string, unknown> } | null)?.overview
      if (!overview) return null
      return {
        activeCount: Number(overview.activeCount) || 0,
        activeProducts: Number(overview.activeProducts) || 0,
        totalStudents: Number(overview.totalStudents) || 0,
      }
    },
  }
}

async function safeCount(port: BusinessProbePort, collection: string): Promise<number> {
  try {
    return await port.estimatedCount(collection)
  } catch {
    return 0
  }
}

export async function probeBusinessScale(
  port: BusinessProbePort,
  now: Date = new Date(),
): Promise<BusinessScale> {
  const [students, enrollments] = await Promise.all([
    safeCount(port, 'users'),
    safeCount(port, 'userproducts'),
  ])

  let overview: Awaited<ReturnType<BusinessProbePort['latestDashboardOverview']>> = null
  try {
    overview = await port.latestDashboardOverview()
  } catch {
    overview = null
  }

  return {
    students: students || overview?.totalStudents || 0,
    activeStudents: overview?.activeCount ?? null,
    enrollments,
    activeProducts: overview?.activeProducts ?? null,
    measuredAt: now,
  }
}
