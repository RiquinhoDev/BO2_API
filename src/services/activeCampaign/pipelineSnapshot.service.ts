// ═══════════════════════════════════════════════════════════
// 📸 PIPELINE SNAPSHOT SERVICE
// Captura estado PRE/POST pipeline para comparação
// ═══════════════════════════════════════════════════════════

import type { Types } from 'mongoose'
import { UserProduct } from '../../models'
import logger from '../../utils/logger'
import fs from 'fs/promises'
import path from 'path'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido'
}

interface SnapshotUserLean {
  _id: Types.ObjectId
  email: string
}

interface SnapshotProductLean {
  _id: Types.ObjectId
  code: string
}

interface SnapshotEnrollmentLean {
  userId: SnapshotUserLean | null
  productId: SnapshotProductLean | null
  status: string
  activeCampaignData?: { tags?: string[] }
  engagement?: {
    engagementScore?: number
    daysInactive?: number
    loginsLast30Days?: number
    weeksActiveLast30Days?: number
  }
  progress?: {
    percentage?: number
    completed?: boolean
  }
}

function hasSnapshotReferences(
  enrollment: SnapshotEnrollmentLean,
): enrollment is SnapshotEnrollmentLean & {
  userId: SnapshotUserLean
  productId: SnapshotProductLean
} {
  return Boolean(enrollment.userId?.email && enrollment.productId?.code)
}

export interface UserProductSnapshot {
  userId: string
  email: string
  productId: string
  productCode: string
  status: string
  tags: string[]
  engagement: {
    score: number
    daysInactive?: number
    loginsLast30Days?: number
    weeksActiveLast30Days?: number
  }
  progress: {
    percentage: number
    completed: boolean
  }
}

export interface PipelineSnapshot {
  timestamp: Date
  type: 'PRE' | 'POST'
  totalUserProducts: number
  activeUserProducts: number
  userProducts: UserProductSnapshot[]
  stats: {
    totalUsers: number
    totalTags: number
    avgEngagementScore: number
    productBreakdown: Record<string, { total: number; avgScore: number }>
  }
}

export interface SnapshotComparison {
  pre: PipelineSnapshot
  post: PipelineSnapshot
  diff: {
    tagsAdded: Array<{ email: string; productCode: string; tags: string[] }>
    tagsRemoved: Array<{ email: string; productCode: string; tags: string[] }>
    engagementChanged: Array<{ email: string; productCode: string; before: number; after: number }>
    summary: {
      totalTagsAdded: number
      totalTagsRemoved: number
      usersAffected: number
      productsAffected: Set<string>
    }
  }
}

class PipelineSnapshotService {
  private snapshotsDir = path.join(process.cwd(), 'snapshots')

  async captureSnapshot(type: 'PRE' | 'POST'): Promise<PipelineSnapshot> {
    logger.info(`[Snapshot] 📸 Capturando snapshot ${type}...`)

    const startTime = Date.now()

    const userProducts = await UserProduct.find({ status: 'ACTIVE' })
      .populate({ path: 'userId', select: 'email' })
      .populate({ path: 'productId', select: 'code' })
      .lean<SnapshotEnrollmentLean[]>()

    logger.info(`[Snapshot] 📊 ${userProducts.length} UserProducts ativos encontrados`)

    const validUserProducts = userProducts.filter(hasSnapshotReferences)

    logger.info(`[Snapshot] ✅ ${validUserProducts.length} UserProducts válidos`)

    const snapshots: UserProductSnapshot[] = validUserProducts.map(up => ({
      userId: up.userId._id.toString(),
      email: up.userId.email,
      productId: up.productId._id.toString(),
      productCode: up.productId.code,
      status: up.status,
      tags: up.activeCampaignData?.tags || [],
      engagement: {
        score: up.engagement?.engagementScore || 0,
        daysInactive: up.engagement?.daysInactive,
        loginsLast30Days: up.engagement?.loginsLast30Days,
        weeksActiveLast30Days: up.engagement?.weeksActiveLast30Days
      },
      progress: {
        percentage: up.progress?.percentage || 0,
        completed: up.progress?.completed || false
      }
    }))

    const totalUsers = new Set(snapshots.map(s => s.userId)).size
    const totalTags = snapshots.reduce((sum, s) => sum + s.tags.length, 0)
    const avgEngagementScore =
      snapshots.reduce((sum, s) => sum + s.engagement.score, 0) / snapshots.length

    const productBreakdown: Record<string, { total: number; avgScore: number }> = {}
    snapshots.forEach(s => {
      if (!productBreakdown[s.productCode]) {
        productBreakdown[s.productCode] = { total: 0, avgScore: 0 }
      }
      productBreakdown[s.productCode].total++
      productBreakdown[s.productCode].avgScore += s.engagement.score
    })

    Object.keys(productBreakdown).forEach(code => {
      const total = productBreakdown[code].total
      productBreakdown[code].avgScore = productBreakdown[code].avgScore / total
    })

    const snapshot: PipelineSnapshot = {
      timestamp: new Date(),
      type,
      totalUserProducts: userProducts.length,
      activeUserProducts: validUserProducts.length,
      userProducts: snapshots,
      stats: {
        totalUsers,
        totalTags,
        avgEngagementScore: Math.round(avgEngagementScore * 100) / 100,
        productBreakdown
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000)
    logger.info(`[Snapshot] ✅ Snapshot ${type} capturado em ${duration}s`)

    return snapshot
  }

  async saveSnapshot(snapshot: PipelineSnapshot, filename?: string): Promise<string> {
    try {
      await fs.mkdir(this.snapshotsDir, { recursive: true })
      const timestamp = snapshot.timestamp.toISOString().replace(/[:.]/g, '-')
      const finalFilename = filename || `snapshot_${snapshot.type}_${timestamp}.json`
      const filepath = path.join(this.snapshotsDir, finalFilename)
      await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf-8')
      logger.info(`[Snapshot] 💾 Snapshot salvo: ${finalFilename}`)
      return filepath
    } catch (error: unknown) {
      logger.error(`[Snapshot] ❌ Erro ao salvar snapshot: ${errorMessage(error)}`)
      throw error
    }
  }

  async loadSnapshot(filepath: string): Promise<PipelineSnapshot> {
    try {
      const content = await fs.readFile(filepath, 'utf-8')
      const snapshot: PipelineSnapshot = JSON.parse(content)
      logger.info(`[Snapshot] 📂 Snapshot carregado: ${path.basename(filepath)}`)
      return snapshot
    } catch (error: unknown) {
      logger.error(`[Snapshot] ❌ Erro ao carregar snapshot: ${errorMessage(error)}`)
      throw error
    }
  }

  compareSnapshots(pre: PipelineSnapshot, post: PipelineSnapshot): SnapshotComparison {
    logger.info('[Snapshot] 🔍 Comparando snapshots PRE vs POST...')

    const tagsAdded: Array<{ email: string; productCode: string; tags: string[] }> = []
    const tagsRemoved: Array<{ email: string; productCode: string; tags: string[] }> = []
    const engagementChanged: Array<{
      email: string
      productCode: string
      before: number
      after: number
    }> = []

    const preMap = new Map<string, UserProductSnapshot>()
    pre.userProducts.forEach(up => {
      preMap.set(`${up.email}__${up.productCode}`, up)
    })

    const postMap = new Map<string, UserProductSnapshot>()
    post.userProducts.forEach(up => {
      postMap.set(`${up.email}__${up.productCode}`, up)
    })

    post.userProducts.forEach(postUp => {
      const key = `${postUp.email}__${postUp.productCode}`
      const preUp = preMap.get(key)

      if (!preUp) {
        if (postUp.tags.length > 0) {
          tagsAdded.push({ email: postUp.email, productCode: postUp.productCode, tags: postUp.tags })
        }
        return
      }

      const preTags = new Set(preUp.tags)
      const postTags = new Set(postUp.tags)
      const added = postUp.tags.filter(t => !preTags.has(t))
      const removed = preUp.tags.filter(t => !postTags.has(t))

      if (added.length > 0) tagsAdded.push({ email: postUp.email, productCode: postUp.productCode, tags: added })
      if (removed.length > 0) tagsRemoved.push({ email: postUp.email, productCode: postUp.productCode, tags: removed })

      const scoreDiff = Math.abs(postUp.engagement.score - preUp.engagement.score)
      if (scoreDiff > 5) {
        engagementChanged.push({
          email: postUp.email,
          productCode: postUp.productCode,
          before: preUp.engagement.score,
          after: postUp.engagement.score
        })
      }
    })

    const totalTagsAdded = tagsAdded.reduce((sum, item) => sum + item.tags.length, 0)
    const totalTagsRemoved = tagsRemoved.reduce((sum, item) => sum + item.tags.length, 0)
    const affectedUsers = new Set([...tagsAdded.map(i => i.email), ...tagsRemoved.map(i => i.email)])
    const affectedProducts = new Set([...tagsAdded.map(i => i.productCode), ...tagsRemoved.map(i => i.productCode)])

    logger.info('[Snapshot] ✅ Comparação concluída', {
      tagsAdded: totalTagsAdded,
      tagsRemoved: totalTagsRemoved,
      usersAffected: affectedUsers.size,
      productsAffected: affectedProducts.size
    })

    return {
      pre,
      post,
      diff: {
        tagsAdded,
        tagsRemoved,
        engagementChanged,
        summary: {
          totalTagsAdded,
          totalTagsRemoved,
          usersAffected: affectedUsers.size,
          productsAffected: affectedProducts
        }
      }
    }
  }

  async saveComparison(comparison: SnapshotComparison, filename?: string): Promise<string> {
    try {
      await fs.mkdir(this.snapshotsDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const finalFilename = filename || `comparison_${timestamp}.json`
      const filepath = path.join(this.snapshotsDir, finalFilename)
      await fs.writeFile(filepath, JSON.stringify(comparison, null, 2), 'utf-8')
      logger.info(`[Snapshot] 💾 Comparação salva: ${finalFilename}`)
      return filepath
    } catch (error: unknown) {
      logger.error(`[Snapshot] ❌ Erro ao salvar comparação: ${errorMessage(error)}`)
      throw error
    }
  }

  generateMarkdownReport(comparison: SnapshotComparison): string {
    const { pre, post, diff } = comparison
    let md = '# 📊 Relatório de Comparação Pipeline\n\n'
    md += `**Data**: ${new Date().toLocaleString('pt-PT')}\n\n`
    md += '## 📸 Snapshots\n\n'
    md += `- **PRE**: ${pre.timestamp.toLocaleString('pt-PT')} (${pre.activeUserProducts} UserProducts)\n`
    md += `- **POST**: ${post.timestamp.toLocaleString('pt-PT')} (${post.activeUserProducts} UserProducts)\n\n`
    md += '## 🎯 Resumo de Mudanças\n\n'
    md += `- **Tags Adicionadas**: ${diff.summary.totalTagsAdded}\n`
    md += `- **Tags Removidas**: ${diff.summary.totalTagsRemoved}\n`
    md += `- **Utilizadores Afetados**: ${diff.summary.usersAffected}\n`
    md += `- **Produtos Afetados**: ${diff.summary.productsAffected.size}\n\n`

    if (diff.tagsAdded.length > 0) {
      md += '## ✅ Tags Adicionadas\n\n| Email | Produto | Tags |\n|---|---|---|\n'
      diff.tagsAdded.slice(0, 20).forEach(item => {
        md += `| ${item.email} | ${item.productCode} | ${item.tags.join(', ')} |\n`
      })
      if (diff.tagsAdded.length > 20) md += `\n*... e mais ${diff.tagsAdded.length - 20} alterações*\n`
      md += '\n'
    }

    if (diff.tagsRemoved.length > 0) {
      md += '## ❌ Tags Removidas\n\n| Email | Produto | Tags |\n|---|---|---|\n'
      diff.tagsRemoved.slice(0, 20).forEach(item => {
        md += `| ${item.email} | ${item.productCode} | ${item.tags.join(', ')} |\n`
      })
      if (diff.tagsRemoved.length > 20) md += `\n*... e mais ${diff.tagsRemoved.length - 20} alterações*\n`
      md += '\n'
    }

    if (diff.engagementChanged.length > 0) {
      md += '## 📈 Mudanças de Engagement Score (>5 pontos)\n\n| Email | Produto | Antes | Depois | Δ |\n|---|---|---|---|---|\n'
      diff.engagementChanged.slice(0, 20).forEach(item => {
        const delta = item.after - item.before
        const sign = delta > 0 ? '+' : ''
        md += `| ${item.email} | ${item.productCode} | ${item.before} | ${item.after} | ${sign}${delta} |\n`
      })
      if (diff.engagementChanged.length > 20) md += `\n*... e mais ${diff.engagementChanged.length - 20} alterações*\n`
      md += '\n'
    }

    md += '## 📊 Estatísticas Gerais\n\n| Métrica | PRE | POST | Δ |\n|---|---|---|---|\n'
    md += `| Total Tags | ${pre.stats.totalTags} | ${post.stats.totalTags} | ${post.stats.totalTags - pre.stats.totalTags > 0 ? '+' : ''}${post.stats.totalTags - pre.stats.totalTags} |\n`
    md += `| Avg Engagement Score | ${pre.stats.avgEngagementScore.toFixed(2)} | ${post.stats.avgEngagementScore.toFixed(2)} | ${(post.stats.avgEngagementScore - pre.stats.avgEngagementScore).toFixed(2)} |\n`
    md += `| Total Utilizadores | ${pre.stats.totalUsers} | ${post.stats.totalUsers} | ${post.stats.totalUsers - pre.stats.totalUsers > 0 ? '+' : ''}${post.stats.totalUsers - pre.stats.totalUsers} |\n`
    md += '\n---\n*Gerado automaticamente pelo Pipeline Snapshot Service*\n'

    return md
  }

  async saveMarkdownReport(comparison: SnapshotComparison, filename?: string): Promise<string> {
    try {
      await fs.mkdir(this.snapshotsDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const finalFilename = filename || `report_${timestamp}.md`
      const filepath = path.join(this.snapshotsDir, finalFilename)
      const markdown = this.generateMarkdownReport(comparison)
      await fs.writeFile(filepath, markdown, 'utf-8')
      logger.info(`[Snapshot] 📝 Relatório markdown salvo: ${finalFilename}`)
      return filepath
    } catch (error: unknown) {
      logger.error(`[Snapshot] ❌ Erro ao salvar relatório: ${errorMessage(error)}`)
      throw error
    }
  }
}

export const pipelineSnapshotService = new PipelineSnapshotService()
export default pipelineSnapshotService
