import logger from '../../../utils/logger'
// ════════════════════════════════════════════════════════════
// 📁 universalSync/processSyncItem.ts
// The per-item use case extracted from universalSyncService.ts: given one
// UniversalSourceItem, upsert the User + UserProduct, drive class-history and
// expiration/renewal side effects, and snapshot. Pure builders decide the
// field mutations; this module owns the Mongo reads/writes and their order.
// ════════════════════════════════════════════════════════════

import type { UpdateQuery } from 'mongoose'
import User from '../../../models/user'
import { UserProduct } from '../../../models'
import { Class, type IClass } from '../../../models/Class'
import type { ProcessItemResult, UniversalSourceItem, UniversalSyncConfig } from '../../../types/universalSync.types'
import { snapshotAndCompare } from '../../snapshotServices/userSnapshot.service'
import type { UniversalSnapshotContext } from '../universalSyncSnapshot'
import { debugLog } from './debugLog'
import { buildCanonicalActiveUserStatusUpdate } from './canonicalUserStatus'
import { errorMessage, mongoErrorCode, normalizeEmail, toDateOrNull } from './fieldUtils'
import { HotmartExpirationPolicy, formatDateOnly, getActiveHotmartClassForExpiration } from './hotmartExpiration'
import { buildHotmartMutationPlan, hotmartPlanToUpdateFields, type HotmartClassEnrollment } from './builders/hotmartMutationPlan'
import { buildCurseducaMutationPlan, curseducaPlanToUpdateFields } from './builders/curseducaMutationPlan'
import { detectRenewal, planInactiveAutofix } from './renewalPolicy'
import { applyAutoReactivation } from './renewalExecutor'
import { persistUserProduct } from './userProductPersistence'

const expirationPolicy = new HotmartExpirationPolicy({ now: () => new Date() })

/**
 * Cria ou atualiza uma turma na tabela Class
 * Chamado durante o sync para garantir que todas as turmas são registadas
 */
// Devolve o nome real da turma (da BD) após criar/actualizar
async function ensureClassExists(
  classId: string,
  className: string | undefined,
  source: 'hotmart' | 'curseduca',
  curseducaId?: string,
  curseducaUuid?: string
): Promise<string> {
  if (!classId) return className || `Turma ${classId}`

  try {
    const existingClass = await Class.findOne({ classId })

    if (!existingClass) {
      const displayName = className || `Turma ${classId}`

      await Class.create({
        classId,
        name: displayName,
        curseducaId: source === 'curseduca' ? curseducaId : undefined,
        curseducaUuid: source === 'curseduca' ? curseducaUuid : undefined,
        source: source === 'hotmart' ? 'hotmart_sync' : 'curseduca_sync',
        isActive: true,
        estado: 'ativo',
        studentCount: 1,
        lastSyncAt: new Date()
      })

      logger.info(`   ✅ [Class] Nova turma criada: ${classId} - "${displayName}"`)
      return displayName

    } else {
      const updates: UpdateQuery<IClass> = {
        lastSyncAt: new Date(),
        $inc: { studentCount: 0 }
      }

      const isGenericName = existingClass.name.match(/^Turma [a-zA-Z0-9]+$/)
      const hasNewName = className && className !== existingClass.name && !className.match(/^Turma [a-zA-Z0-9]+$/)

      if (isGenericName && hasNewName) {
        updates.name = className
        logger.info(`   📝 [Class] Nome atualizado: ${classId} - "${existingClass.name}" → "${className}"`)
      }

      if (source === 'curseduca') {
        if (curseducaId && !existingClass.curseducaId) updates.curseducaId = curseducaId
        if (curseducaUuid && !existingClass.curseducaUuid) updates.curseducaUuid = curseducaUuid
      }

      await Class.findByIdAndUpdate(existingClass._id, updates)
      // Devolver o nome real da BD (que pode ter sido editado manualmente)
      return (isGenericName && hasNewName ? className : existingClass.name) || `Turma ${classId}`
    }
  } catch (error: unknown) {
    if (mongoErrorCode(error) !== 11000) {
      logger.error(`   ⚠️ [Class] Erro ao criar/atualizar turma ${classId}:`, errorMessage(error))
    }
    return className || `Turma ${classId}`
  }
}


export const processSyncItem = async (
  item: UniversalSourceItem,
  config: UniversalSyncConfig,
  snapshotContext: UniversalSnapshotContext,
): Promise<ProcessItemResult> => {
  // ═══════════════════════════════════════════════════════════
  // VALIDAÇÃO INICIAL
  // ═══════════════════════════════════════════════════════════
  if (!item.email || !item.email.trim()) {
    throw new Error('Item sem email')
  }

  const email = normalizeEmail(item.email)
  const name = item.name && item.name.trim() ? item.name.trim() : email

  // ═══════════════════════════════════════════════════════════
  // BUSCAR OU CRIAR USER
  // ═══════════════════════════════════════════════════════════
  let user = await User.findOne({ email })
  const isNew = !user

  if (!user) {
    user = await User.create({
      email,
      name
    })
    logger.info(`✨ [UniversalSync] Novo user criado: ${user.email}`)
  }

  const userIdStr = String(user._id)

  // ═══════════════════════════════════════════════════════════
  // PREPARAR UPDATES DO USER
  // ═══════════════════════════════════════════════════════════
  const updateFields: Record<string, unknown> = {}
  let pendingHotmartClasses: HotmartClassEnrollment[] | undefined
  let needsUpdate = false

  if (name && user.name !== name) {
    updateFields.name = name
    needsUpdate = true
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ HOTMART - VERSÃO COMPLETA (MANTÉM TUDO!)
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'hotmart') {
    // PREPARE: resolve the real class (ensureClassExists stays out of the pure builder).
    const resolvedClass = item.classId
      ? { classId: item.classId, className: await ensureClassExists(item.classId, item.className, 'hotmart') }
      : undefined

    // PURE BUILDER: item + current user state + resolved class -> explicit plan (no I/O).
    const plan = buildHotmartMutationPlan({
      item,
      user: {
        classId: user.classId,
        hotmart: { enrolledClasses: user.hotmart?.enrolledClasses },
        curseduca: { enrolledClasses: user.curseduca?.enrolledClasses },
      },
      isNew,
      resolvedClass,
      clock: { now: () => new Date() },
    })

    // EXECUTOR: apply the plan's field changes onto updateFields.
    Object.assign(updateFields, hotmartPlanToUpdateFields(plan))
    if (plan.needsUpdate) needsUpdate = true
    // Expose the pending classes to the post-branch expiration check (shared contract).
    pendingHotmartClasses = plan.hotmart.enrolledClasses

    // EXECUTOR: class-history side effect (non-fatal), driven by the plan event.
    if (plan.classHistoryEvent) {
      const ev = plan.classHistoryEvent
      try {
        const StudentClassHistory = (await import('../../../models/StudentClassHistory')).default
        if (ev.type === 'class-changed') {
          await StudentClassHistory.create({
            studentId: user._id,
            classId: ev.classId,
            className: ev.className,
            previousClassId: ev.previousClassId,
            previousClassName: ev.previousClassName,
            dateMoved: ev.dateMoved,
            reason: 'Mudança detectada no sync Hotmart',
            movedBy: 'Sistema - Sync Automático'
          })
          logger.info(`   📝 [ClassChange] ${user.email}: "${ev.previousClassName}" → "${ev.className}"`)
        } else {
          await StudentClassHistory.create({
            studentId: user._id,
            classId: ev.classId,
            className: ev.className,
            dateMoved: ev.dateMoved,
            reason: 'Primeira inscrição na turma (data de compra)',
            movedBy: 'Sistema - Sync Automático'
          })
          logger.info(`   ✨ [FirstEnrollment] ${user.email} inscrito em "${ev.className}"`)
        }
      } catch (error: unknown) {
        logger.warn(`   ⚠️ Erro ao registrar histórico de turma para ${user.email}:`, errorMessage(error))
      }
    }

    // EXECUTOR: sync timestamps stamped AFTER the history effect (temporal order).
    const hotmartSyncAt = new Date()
    updateFields['hotmart.lastSyncAt'] = hotmartSyncAt
    updateFields['metadata.updatedAt'] = hotmartSyncAt
    updateFields['metadata.sources.hotmart.lastSync'] = hotmartSyncAt
  }

// ═══════════════════════════════════════════════════════════
// ✅ CURSEDUCA - VERSÃO COMPLETA COM TODOS OS CAMPOS NOVOS
// ═══════════════════════════════════════════════════════════
  if (config.syncType === 'curseduca') {
    // PREPARE: ensure the group's class exists (side effect only; groupId is the classId, never the student uuid).
    if (item.groupId) {
      await ensureClassExists(String(item.groupId), item.groupName, 'curseduca', String(item.groupId), undefined)
    }

    // PURE BUILDER: item + current user state -> explicit plan (no I/O).
    const plan = buildCurseducaMutationPlan({
      item,
      user: {
        hotmart: { enrolledClasses: user.hotmart?.enrolledClasses },
        curseduca: { curseducaUserId: user.curseduca?.curseducaUserId, enrolledClasses: user.curseduca?.enrolledClasses },
      },
    })

    // EXECUTOR: apply the plan's field changes onto updateFields.
    Object.assign(updateFields, curseducaPlanToUpdateFields(plan))
    if (plan.needsUpdate) needsUpdate = true

    // EXECUTOR: reconcile a PARA_INATIVAR userproduct when the member is inactive
    // (read + write kept together, non-fatal), matching the original flow.
    if (plan.reconcileParaInativar) {
      try {
        const userProductToUpdate = await UserProduct.findOne({
          userId: userIdStr,
          platform: 'curseduca',
          status: 'PARA_INATIVAR'
        })

        if (userProductToUpdate) {
          await UserProduct.findByIdAndUpdate(userProductToUpdate._id, {
            $set: {
              status: 'INACTIVE',
              'metadata.inactivatedAt': new Date(),
              'metadata.inactivatedBy': 'curseduca_sync_auto',
              'metadata.inactivatedReason': 'Já estava INACTIVE no CursEduca durante sync'
            },
            $unset: {
              'metadata.markedForInactivationAt': 1,
              'metadata.markedForInactivationReason': 1
            }
          })
          debugLog(`   ✅ [CursEduca Sync] Removido de PARA_INATIVAR (já INACTIVE): ${user.email}`)
        }
      } catch (err: unknown) {
        logger.error(`⚠️ [CursEduca Sync] Erro ao atualizar UserProduct para ${user.email}:`, errorMessage(err))
      }
    }

    // EXECUTOR: sync timestamps stamped AFTER the reconcile effect (temporal order).
    const curseducaSyncAt = new Date()
    updateFields['curseduca.lastSyncAt'] = curseducaSyncAt
    updateFields['metadata.updatedAt'] = curseducaSyncAt
    updateFields['metadata.sources.curseduca.lastSync'] = curseducaSyncAt
  }

  // ═══════════════════════════════════════════════════════════
  // 🆕 DETETAR RENOVAÇÕES (antes de aplicar updates)
  // ═══════════════════════════════════════════════════════════
  const purchaseDate = toDateOrNull(item.purchaseDate)
  const renewalResult = detectRenewal(user, purchaseDate, config.syncType, expirationPolicy)

  if (renewalResult.shouldReactivate) {
    // Utilizador renovou! Aplicar reativação automática
    await applyAutoReactivation(userIdStr, user.email, renewalResult)
  }

  // ═══════════════════════════════════════════════════════════
  // 🔥 FIX: Reativar se compra recente mas status = INACTIVE
  // detectRenewal só corre quando isManuallyInactivated=true.
  // Se isManuallyInactivated=false mas status ainda está INACTIVE
  // (e a compra não está expirada), reativar User + UserProduct.
  // ═══════════════════════════════════════════════════════════
  if (
    config.syncType === 'hotmart' &&
    !renewalResult.shouldReactivate
  ) {
    const activeHotmartClass = getActiveHotmartClassForExpiration(
      user,
      pendingHotmartClasses,
      item.classId,
      item.className
    )
    const autofix = planInactiveAutofix(user, purchaseDate, activeHotmartClass?.className, expirationPolicy)

    if (autofix.reactivate) {
      const validityDescription = autofix.validity.kind === 'class'
        ? `acesso válido até ${formatDateOnly(autofix.validity.accessEnd)}`
        : `compra recente (${autofix.validity.daysSincePurchase}d)`
      logger.info(`   🔄 [AutoFix] ${user.email} está INACTIVE mas tem ${validityDescription} → reativando`)
      Object.assign(updateFields, buildCanonicalActiveUserStatusUpdate())
      updateFields['inactivation.isManuallyInactivated'] = false
      updateFields['inactivation.reactivatedAt'] = new Date()
      updateFields['inactivation.reactivatedBy'] = 'Sistema - Sync Automático (compra recente)'
      needsUpdate = true

      // Também reativar UserProduct (apenas Hotmart - CursEduca é gerido pelo Guru)
      await UserProduct.updateMany(
        { userId: userIdStr, platform: 'hotmart', status: { $in: ['INACTIVE', 'PARA_INATIVAR'] } },
        { $set: { status: 'ACTIVE' } }
      )
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🆕 VERIFICAR EXPIRAÇÃO REAL DA TURMA - só para Hotmart
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'hotmart' && !renewalResult.shouldReactivate) {
    const activeHotmartClass = getActiveHotmartClassForExpiration(
      user,
      pendingHotmartClasses,
      item.classId,
      item.className
    )
    const expiration = expirationPolicy.evaluate(
      purchaseDate,
      activeHotmartClass?.className || item.className
    )

    if (expiration.canEvaluate && expiration.isExpired) {
      debugLog(
        `   ⏰ [Expiration] ${user.email} requer revisão manual (${expiration.expirationReason})`
      )
    }
  }
  // ═══════════════════════════════════════════════════════════
  // APLICAR UPDATES NO USER
  // ═══════════════════════════════════════════════════════════
  if (needsUpdate) {
    await User.findByIdAndUpdate(userIdStr, { $set: updateFields })
    debugLog(`🔄 [UniversalSync] User atualizado: ${user.email}`)
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ CRIAR/ATUALIZAR USERPRODUCT AUTOMATICAMENTE
  const userProductResult = await persistUserProduct({
    item,
    syncType: config.syncType,
    user,
    userId: userIdStr,
  })

  if (userProductResult.status === 'missing-product') {
    return {
      action: isNew ? 'inserted' : needsUpdate ? 'updated' : 'unchanged',
      userId: userIdStr,
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 📸 SNAPSHOT E HISTÓRICO
  // ═══════════════════════════════════════════════════════════

  try {
    // Buscar todos os produtos do user APÓS atualização
    const userProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'name code platform')

    // Criar snapshot, comparar com anterior e registar histórico
    const { comparison } = await snapshotAndCompare(
      user,
      userProducts,
      snapshotContext.syncType,
      snapshotContext.syncId,
    )

    if (comparison.hasChanges && comparison.summary.totalChanges > 1) {
      debugLog(`   📸 [Snapshot] ${comparison.summary.totalChanges} alterações registadas para ${user.email}`)
      debugLog(`      - HIGH: ${comparison.summary.highPriorityChanges}`)
      debugLog(`      - MEDIUM: ${comparison.summary.mediumPriorityChanges}`)
      debugLog(`      - LOW: ${comparison.summary.lowPriorityChanges}`)
    }
  } catch (snapshotError: unknown) {
    logger.error(`⚠️  [Snapshot] Erro ao criar snapshot para ${user.email}:`, errorMessage(snapshotError))
    // Não falhar o sync por erro no snapshot
  }

  // ═══════════════════════════════════════════════════════════
  // RETORNAR RESULTADO
  // ═══════════════════════════════════════════════════════════

  return {
    action: isNew ? 'inserted' : (needsUpdate ? 'updated' : 'unchanged'),
    userId: userIdStr
  }
}
