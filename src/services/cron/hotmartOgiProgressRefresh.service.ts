// ════════════════════════════════════════════════════════════
// 📁 src/services/cron/hotmartOgiProgressRefresh.service.ts
// Cron diário (06:00 Lisboa) — captura a % de progresso OGI directamente do
// Hotmart Club para os alunos ACTIVOS.
//
// Porquê: o endpoint /club/api/v1/users em massa devolve progress a zeros; só
// /users?subdomain&email= traz o número real (completed_percentage). O
// denominador da Hotmart (ex.: 82 aulas) difere do nosso sync por lições
// (ex.: 199), por isso a única forma de o dashboard mostrar EXACTAMENTE o que o
// aluno vê no Club é ir buscar aluno a aluno.
//
// Escrita: userProduct.progress.hotmart{Percentage,Completed,Total,RefreshedAt}
// (campos próprios — NÃO mexe no progress.percentage calculado pelo sync).
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import axios from 'axios'
import logger from '../../utils/logger'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import User from '../../models/user'
import { getHotmartAccessToken, requestWithRetry } from '../syncUtilizadoresServices/hotmartServices/hotmart/transport'
import { getOptionalHotmartSubdomain } from '../requestDrivenRuntimeConfig'

export interface HotmartOgiProgressRefreshResult {
  total: number
  updated: number
  skipped: number
  errors: number
}

const CONCURRENCY = 3

interface RefreshTarget {
  userProductId: mongoose.Types.ObjectId
  email: string
}

async function resolveOgiProduct(): Promise<{ _id: mongoose.Types.ObjectId; subdomain?: string } | null> {
  return Product.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }],
  })
    .select('_id subdomain')
    .lean()
    .exec() as Promise<{ _id: mongoose.Types.ObjectId; subdomain?: string } | null>
}

async function collectActiveTargets(productId: mongoose.Types.ObjectId): Promise<RefreshTarget[]> {
  const userProducts = (await UserProduct.find({ productId, platform: 'hotmart', status: 'ACTIVE' })
    .select('_id userId')
    .lean()
    .exec()) as unknown as Array<{ _id: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId }>

  if (userProducts.length === 0) return []

  const users = (await User.find({ _id: { $in: userProducts.map((u) => u.userId) } })
    .select('email inactivation.isManuallyInactivated')
    .lean()
    .exec()) as unknown as Array<{
      _id: mongoose.Types.ObjectId
      email?: string
      inactivation?: { isManuallyInactivated?: boolean }
    }>

  const usersById = new Map(users.map((u) => [String(u._id), u]))
  const targets: RefreshTarget[] = []
  for (const up of userProducts) {
    const user = usersById.get(String(up.userId))
    if (!user?.email || user.inactivation?.isManuallyInactivated === true) continue
    targets.push({ userProductId: up._id, email: user.email.toLowerCase().trim() })
  }
  return targets
}

async function fetchHotmartClubProgress(
  email: string,
  subdomain: string,
  token: string,
): Promise<{ percentage: number; completed: number; total: number } | null> {
  const response = await requestWithRetry(
    () =>
      axios.get('https://developers.hotmart.com/club/api/v1/users', {
        params: { subdomain, email },
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      }),
    { maxRetries: 4, baseDelayMs: 800 },
  )

  const item = (response.data?.items ?? [])[0]
  const progress = item?.progress
  if (!progress || typeof progress.completed_percentage !== 'number') return null

  return {
    percentage: Math.round(progress.completed_percentage),
    completed: Number(progress.completed) || 0,
    total: Number(progress.total) || 0,
  }
}

export async function runHotmartOgiProgressRefresh(): Promise<HotmartOgiProgressRefreshResult> {
  const result: HotmartOgiProgressRefreshResult = { total: 0, updated: 0, skipped: 0, errors: 0 }

  const product = await resolveOgiProduct()
  if (!product) {
    logger.warn('[HotmartOgiProgressRefresh] produto OGI não encontrado — nada a fazer')
    return result
  }

  const subdomain = getOptionalHotmartSubdomain() || product.subdomain
  if (!subdomain) {
    logger.warn('[HotmartOgiProgressRefresh] subdomain Hotmart em falta — nada a fazer')
    return result
  }

  const targets = await collectActiveTargets(product._id)
  result.total = targets.length
  if (targets.length === 0) return result

  const token = await getHotmartAccessToken()
  const now = new Date()

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (target) => {
        try {
          const progress = await fetchHotmartClubProgress(target.email, subdomain, token)
          if (!progress) {
            // aluno não encontrado no Club / sem progresso — mantém o valor anterior
            result.skipped += 1
            return
          }
          await UserProduct.updateOne(
            { _id: target.userProductId },
            {
              $set: {
                'progress.hotmartPercentage': progress.percentage,
                'progress.hotmartCompleted': progress.completed,
                'progress.hotmartTotal': progress.total,
                'progress.hotmartRefreshedAt': now,
              },
            },
          )
          result.updated += 1
        } catch (error) {
          result.errors += 1
          logger.warn('[HotmartOgiProgressRefresh] falha num aluno', {
            email: target.email,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }),
    )
  }

  logger.info(
    `[HotmartOgiProgressRefresh] total=${result.total} updated=${result.updated} skipped=${result.skipped} errors=${result.errors}`,
  )
  return result
}

export default runHotmartOgiProgressRefresh
