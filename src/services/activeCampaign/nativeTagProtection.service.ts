// ═══════════════════════════════════════════════════════════
// 🛡️ NATIVE TAG PROTECTION SERVICE
// Protege tags nativas da AC de serem removidas pelo BO
// ═══════════════════════════════════════════════════════════

import ACNativeTagsSnapshot from '../../models/acTags/ACNativeTagsSnapshot'
import activeCampaignService from './activeCampaignService'
import logger from '../../utils/logger'

// ═══════════════════════════════════════════════════════════
// IDENTIFICAÇÃO DE TAGS
// ═══════════════════════════════════════════════════════════

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido'
}

/**
 * Verifica se uma tag é uma tag BO (criada pelo nosso sistema)
 *
 * 🛡️ CAMADA 4 DE PROTEÇÃO: TODAS as tags BO têm prefixo "BO_"
 *
 * Padrão BO: "BO_CODIGO - Descrição"
 * Exemplos:
 *   ✅ BO: "BO_OGI_V1 - Inativo 14d"
 *   ✅ BO: "BO_CLAREZA_ANUAL - Alto Engajamento"
 *   ❌ NATIVA: "Cliente VIP"
 *   ❌ NATIVA: "Testemunho Gravado"
 *   ❌ NATIVA: "OGI_V1 - Inativo 14d" (sem prefixo BO_)
 */
export function isBOTag(tagName: string): boolean {
  if (!tagName || typeof tagName !== 'string') return false

  // 🛡️ VERIFICAÇÃO TRIPLA:
  // 1. Deve começar com "BO_"
  // 2. Deve ter formato: "BO_CODIGO - Descrição"
  // 3. CODIGO deve ser maiúsculas/números/underscores
  const trimmed = tagName.trim()

  // Padrão: BO_CODIGO - Descrição
  return /^BO_[A-Z_0-9]+ - .+$/.test(trimmed)
}

/**
 * Classifica tags em BO vs Nativas
 */
export function classifyTags(tags: string[]): {
  boTags: string[]
  nativeTags: string[]
} {
  const boTags: string[] = []
  const nativeTags: string[] = []

  tags.forEach(tag => {
    if (isBOTag(tag)) {
      boTags.push(tag)
    } else {
      nativeTags.push(tag)
    }
  })

  return { boTags, nativeTags }
}

// ═══════════════════════════════════════════════════════════
// SNAPSHOT DE TAGS NATIVAS
// ═══════════════════════════════════════════════════════════

/**
 * Captura e guarda tags nativas da AC para um utilizador
 */
export async function captureNativeTags(
  email: string,
  source: string = 'UNKNOWN'
): Promise<{
  success: boolean
  nativeTags: string[]
  boTags: string[]
  isFirstCapture: boolean
}> {
  try {
    // Buscar tags atuais da AC
    const allTagsFromAC = await activeCampaignService.getContactTagsByEmail(email)

    if (!allTagsFromAC || allTagsFromAC.length === 0) {
      logger.info(`[NativeTagProtection] ${email} não tem tags na AC`)
      return {
        success: true,
        nativeTags: [],
        boTags: [],
        isFirstCapture: false
      }
    }

    // Classificar tags
    const { boTags, nativeTags } = classifyTags(allTagsFromAC)

    logger.info(`[NativeTagProtection] ${email}:`, {
      totalTags: allTagsFromAC.length,
      boTags: boTags.length,
      nativeTags: nativeTags.length
    })

    // Buscar snapshot existente
    let snapshot = await ACNativeTagsSnapshot.findOne({ email })

    const isFirstCapture = !snapshot

    if (!snapshot) {
      // Criar novo snapshot
      snapshot = await ACNativeTagsSnapshot.create({
        email,
        nativeTags,
        boTags,
        capturedAt: new Date(),
        lastSyncAt: new Date(),
        syncCount: 1,
        history: [{
          timestamp: new Date(),
          action: 'INITIAL_CAPTURE',
          tags: nativeTags,
          source
        }]
      })

      logger.info(`[NativeTagProtection] ✅ Snapshot inicial criado para ${email}`)
    } else {
      // Atualizar snapshot existente
      const previousNativeTags = new Set(snapshot.nativeTags)
      const currentNativeTags = new Set(nativeTags)

      // Detectar tags adicionadas
      const addedTags = nativeTags.filter(t => !previousNativeTags.has(t))

      // Detectar tags removidas
      const removedTags = snapshot.nativeTags.filter(t => !currentNativeTags.has(t))

      // Adicionar ao histórico se houver mudanças
      if (addedTags.length > 0) {
        snapshot.history.push({
          timestamp: new Date(),
          action: 'ADDED',
          tags: addedTags,
          source
        })
        logger.info(`[NativeTagProtection] ➕ ${email}: ${addedTags.length} tags nativas adicionadas`)
      }

      if (removedTags.length > 0) {
        snapshot.history.push({
          timestamp: new Date(),
          action: 'REMOVED',
          tags: removedTags,
          source
        })
        logger.warn(`[NativeTagProtection] ⚠️  ${email}: ${removedTags.length} tags nativas removidas!`)
      }

      // Atualizar snapshot
      snapshot.nativeTags = nativeTags
      snapshot.boTags = boTags
      snapshot.lastSyncAt = new Date()
      snapshot.syncCount += 1

      await snapshot.save()

      logger.info(`[NativeTagProtection] ✅ Snapshot atualizado para ${email} (sync #${snapshot.syncCount})`)
    }

    return {
      success: true,
      nativeTags,
      boTags,
      isFirstCapture
    }
  } catch (error: unknown) {
    logger.error(`[NativeTagProtection] ❌ Erro ao capturar tags para ${email}:`, errorMessage(error))
    return {
      success: false,
      nativeTags: [],
      boTags: [],
      isFirstCapture: false
    }
  }
}

/**
 * Captura tags nativas para múltiplos utilizadores (batch)
 */
export async function captureNativeTagsBatch(
  emails: string[],
  source: string = 'UNKNOWN',
  batchSize: number = 50
): Promise<{
  success: boolean
  processed: number
  captured: number
  errors: number
}> {
  logger.info(`[NativeTagProtection] 🚀 Iniciando captura batch de ${emails.length} utilizadores...`)

  let processed = 0
  let captured = 0
  let errors = 0

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)

    for (const email of batch) {
      const result = await captureNativeTags(email, source)
      processed++

      if (result.success) {
        captured++
      } else {
        errors++
      }

      // Log progresso a cada 100 users
      if (processed % 100 === 0) {
        logger.info(`[NativeTagProtection] 📊 Progresso: ${processed}/${emails.length} (${captured} capturados, ${errors} erros)`)
      }
    }

    // Rate limiting: pausa entre batches
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  logger.info(`[NativeTagProtection] ✅ Captura batch concluída:`, {
    processed,
    captured,
    errors
  })

  return {
    success: errors === 0,
    processed,
    captured,
    errors
  }
}

// ═══════════════════════════════════════════════════════════
// PROTEÇÃO CONTRA REMOÇÃO
// ═══════════════════════════════════════════════════════════

/**
 * Valida se uma tag pode ser removida (CRÍTICO!)
 *
 * Retorna:
 * - canRemove: true se pode remover, false se NÃO pode
 * - reason: motivo se não puder remover
 */
export async function canRemoveTag(
  email: string,
  tagName: string
): Promise<{
  canRemove: boolean
  reason?: string
  isNative: boolean
  isBO: boolean
}> {
  // ═══════════════════════════════════════════════════════════
  // VERIFICAÇÃO 1: Tag é BO? (padrão CODIGO - Descrição)
  // ═══════════════════════════════════════════════════════════

  const isBO = isBOTag(tagName)

  if (!isBO) {
    // NÃO é tag BO → NÃO PODE REMOVER!
    logger.error(`[NativeTagProtection] 🚨 BLOQUEADO: Tentativa de remover tag NATIVA "${tagName}" de ${email}`)
    return {
      canRemove: false,
      reason: 'Tag não segue o padrão BO (CODIGO - Descrição)',
      isNative: true,
      isBO: false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // VERIFICAÇÃO 2: Tag está no snapshot de nativas?
  // ═══════════════════════════════════════════════════════════

  const snapshot = await ACNativeTagsSnapshot.findOne({ email })

  if (snapshot && snapshot.nativeTags.includes(tagName)) {
    // Tag está no snapshot de NATIVAS → NÃO PODE REMOVER!
    logger.error(`[NativeTagProtection] 🚨 BLOQUEADO: Tag "${tagName}" está no snapshot de tags nativas de ${email}`)
    return {
      canRemove: false,
      reason: 'Tag está registada como tag nativa no snapshot',
      isNative: true,
      isBO: false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // VERIFICAÇÃO 3: Tag tem histórico de ser nativa?
  // ═══════════════════════════════════════════════════════════

  if (snapshot && snapshot.history) {
    const wasNative = snapshot.history.some(entry =>
      entry.action === 'INITIAL_CAPTURE' && entry.tags.includes(tagName)
    )

    if (wasNative) {
      logger.error(`[NativeTagProtection] 🚨 BLOQUEADO: Tag "${tagName}" tem histórico de ser nativa para ${email}`)
      return {
        canRemove: false,
        reason: 'Tag tem histórico de ser tag nativa',
        isNative: true,
        isBO: false
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ TODAS AS VERIFICAÇÕES PASSARAM - PODE REMOVER
  // ═══════════════════════════════════════════════════════════

  logger.debug(`[NativeTagProtection] ✅ Tag "${tagName}" pode ser removida de ${email}`)

  return {
    canRemove: true,
    isNative: false,
    isBO: true
  }
}

/**
 * Filtra lista de tags para remover apenas tags seguras (BO)
 *
 * CRÍTICO: Esta função NUNCA deve permitir remoção de tags nativas!
 */
export async function filterSafeTagsToRemove(
  email: string,
  tagsToRemove: string[]
): Promise<{
  safeTags: string[]
  blockedTags: string[]
  reasons: Record<string, string>
}> {
  const safeTags: string[] = []
  const blockedTags: string[] = []
  const reasons: Record<string, string> = {}

  for (const tag of tagsToRemove) {
    const validation = await canRemoveTag(email, tag)

    if (validation.canRemove) {
      safeTags.push(tag)
    } else {
      blockedTags.push(tag)
      reasons[tag] = validation.reason || 'Motivo desconhecido'
    }
  }

  if (blockedTags.length > 0) {
    logger.warn(`[NativeTagProtection] ⚠️  ${email}: ${blockedTags.length}/${tagsToRemove.length} tags bloqueadas`)
    logger.warn(`[NativeTagProtection] Tags bloqueadas:`, blockedTags)
  }

  return {
    safeTags,
    blockedTags,
    reasons
  }
}

// ═══════════════════════════════════════════════════════════
// AUDITORIA E RELATÓRIOS
// ═══════════════════════════════════════════════════════════

/**
 * Gera relatório de tags nativas para um utilizador
 */
export async function getNativeTagsReport(email: string): Promise<any> {
  const snapshot = await ACNativeTagsSnapshot.findOne({ email })

  if (!snapshot) {
    return {
      email,
      exists: false,
      message: 'Nenhum snapshot encontrado'
    }
  }

  return {
    email,
    exists: true,
    capturedAt: snapshot.capturedAt,
    lastSyncAt: snapshot.lastSyncAt,
    syncCount: snapshot.syncCount,
    nativeTags: snapshot.nativeTags,
    boTags: snapshot.boTags,
    totalTags: snapshot.nativeTags.length + snapshot.boTags.length,
    history: snapshot.history.map(h => ({
      timestamp: h.timestamp,
      action: h.action,
      tagsCount: h.tags.length,
      tags: h.tags,
      source: h.source
    }))
  }
}

/**
 * Gera estatísticas globais de proteção
 */
export async function getProtectionStats(): Promise<any> {
  const totalSnapshots = await ACNativeTagsSnapshot.countDocuments()

  const snapshotsWithNativeTags = await ACNativeTagsSnapshot.countDocuments({
    nativeTags: { $exists: true, $ne: [] }
  })

  const avgNativeTagsPerUser = await ACNativeTagsSnapshot.aggregate([
    { $match: { nativeTags: { $exists: true, $ne: [] } } },
    { $project: { nativeTagsCount: { $size: '$nativeTags' } } },
    { $group: { _id: null, avg: { $avg: '$nativeTagsCount' } } }
  ])

  return {
    totalSnapshots,
    snapshotsWithNativeTags,
    avgNativeTagsPerUser: avgNativeTagsPerUser[0]?.avg || 0,
    protectionActive: true
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export default {
  // Identificação
  isBOTag,
  classifyTags,

  // Snapshot
  captureNativeTags,
  captureNativeTagsBatch,

  // Proteção
  canRemoveTag,
  filterSafeTagsToRemove,

  // Relatórios
  getNativeTagsReport,
  getProtectionStats
}
