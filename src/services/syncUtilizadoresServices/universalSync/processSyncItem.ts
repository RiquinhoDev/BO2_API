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
import UserSnapshot from '../../../models/UserSnapshot'
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
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import { assertHotmartUserMatchesPlan, hotmartUserOptimisticFilter, mergeHotmartClassPlan, type HotmartExecutionPlan } from './hotmartSafety'
import { assertCurseducaUserMatchesPlan, curseducaUserOptimisticFilter, mergeCurseducaClassPlan, type CurseducaExecutionPlan } from './curseducaSafety'

const expirationPolicy = new HotmartExpirationPolicy({ now: () => new Date() })

const beforeMutation = (hooks?: CronExecutionPhaseHooks, count = 1): void => {
  hooks?.assertOwnership?.()
  hooks?.localMutationStarted()
  hooks?.consumeMutation?.(count)
}

const planConflict = (syncType: UniversalSyncConfig['syncType']): Error => new Error(
  syncType === 'curseduca' ? 'CURSEDUCA_SYNC_PLAN_CONCURRENCY_CONFLICT' : 'HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT',
)

/**
 * Cria ou atualiza uma turma na tabela Class
 * Chamado durante o sync para garantir que todas as turmas são registadas
 */
// Devolve o nome real da turma (da BD) após criar/actualizar
export async function ensureClassExists(
  classId: string,
  className: string | undefined,
  source: 'hotmart' | 'curseduca',
  curseducaId?: string,
  curseducaUuid?: string,
  phaseHooks?: CronExecutionPhaseHooks,
  plannedClass?: IClass,
  plannedClassLookupProvided = false,
  onResolvedClass?: (classRow: Record<string, unknown>) => void,
  planConflictCode = 'HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT',
): Promise<string> {
  if (!classId) return className || `Turma ${classId}`

  try {
    // A prepared execution plan is authoritative, including a deliberate
    // null result. Never turn a planned miss into an unbounded live lookup.
    const existingClass = plannedClassLookupProvided
      ? plannedClass
      : await Class.findOne({ classId })

    if (!existingClass) {
      const displayName = className || `Turma ${classId}`

      beforeMutation(phaseHooks)
      const createdClass = await Class.create({
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
      onResolvedClass?.(createdClass as unknown as Record<string, unknown>)

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

      beforeMutation(phaseHooks)
      const updatedClass = await Class.findOneAndUpdate(
        {
          _id: existingClass._id,
          classId,
          ...(existingClass.updatedAt ? { updatedAt: existingClass.updatedAt } : { name: existingClass.name }),
        },
        updates,
        { new: true },
      )
      if (!updatedClass && plannedClassLookupProvided) throw new Error(planConflictCode)
      if (updatedClass) onResolvedClass?.(updatedClass as unknown as Record<string, unknown>)
      // Devolver o nome real da BD (que pode ter sido editado manualmente)
      return (isGenericName && hasNewName ? className : existingClass.name) || `Turma ${classId}`
    }
  } catch (error: unknown) {
    if (phaseHooks) throw error
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
  const executionPlan = config.hotmartExecutionPlan as (HotmartExecutionPlan | CurseducaExecutionPlan | undefined)
  const plannedUser = executionPlan?.usersByEmail[email]
  let user = await User.findOne({ email })
  if (executionPlan) {
    if (config.syncType === 'hotmart') assertHotmartUserMatchesPlan(plannedUser ?? null, user)
    else assertCurseducaUserMatchesPlan(plannedUser ?? null, user)
  }
  const isNew = !user

  if (!user) {
    beforeMutation(config.phaseHooks)
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
    const plannedClass = executionPlan?.classes.find(classRow => String(classRow.classId ?? '') === item.classId)
    const resolvedClass = item.classId
      ? {
        classId: item.classId,
        className: await ensureClassExists(
          item.classId,
          item.className,
          'hotmart',
          undefined,
          undefined,
          config.phaseHooks,
          plannedClass as unknown as IClass | undefined,
          executionPlan !== undefined,
          executionPlan
            ? classRow => config.syncType === 'hotmart'
              ? mergeHotmartClassPlan(executionPlan as HotmartExecutionPlan, classRow)
              : mergeCurseducaClassPlan(executionPlan as CurseducaExecutionPlan, classRow)
            : undefined,
        ),
      }
      : undefined

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

    Object.assign(updateFields, hotmartPlanToUpdateFields(plan))
    if (plan.needsUpdate) needsUpdate = true
    pendingHotmartClasses = plan.hotmart.enrolledClasses

    if (plan.classHistoryEvent) {
      const ev = plan.classHistoryEvent
      try {
        const StudentClassHistory = (await import('../../../models/StudentClassHistory')).default
        if (ev.type === 'class-changed') {
          beforeMutation(config.phaseHooks)
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
          beforeMutation(config.phaseHooks)
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
        if (config.phaseHooks) throw error
        logger.warn(`   ⚠️ Erro ao registrar histórico de turma para ${user.email}:`, errorMessage(error))
      }
    }

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
      const plannedClass = executionPlan?.classes.find(classRow => String(classRow.classId ?? '') === String(item.groupId))
      await ensureClassExists(
        String(item.groupId), item.groupName, 'curseduca', String(item.groupId), undefined, config.phaseHooks,
        plannedClass as unknown as IClass | undefined, executionPlan !== undefined,
        executionPlan ? classRow => config.syncType === 'curseduca'
          ? mergeCurseducaClassPlan(executionPlan as CurseducaExecutionPlan, classRow)
          : mergeHotmartClassPlan(executionPlan as HotmartExecutionPlan, classRow) : undefined,
        'CURSEDUCA_SYNC_PLAN_CONCURRENCY_CONFLICT',
      )
    }

    const plan = buildCurseducaMutationPlan({
      item,
      user: {
        hotmart: { enrolledClasses: user.hotmart?.enrolledClasses },
        curseduca: { curseducaUserId: user.curseduca?.curseducaUserId, enrolledClasses: user.curseduca?.enrolledClasses },
      },
    })

    Object.assign(updateFields, curseducaPlanToUpdateFields(plan))
    if (plan.needsUpdate) needsUpdate = true

    if (plan.reconcileParaInativar) {
      try {
        const userProductToUpdate = executionPlan
          ? executionPlan.userProducts.find((row) => String(row.userId ?? '') === userIdStr && row.platform === 'curseduca' && row.status === 'PARA_INATIVAR')
          : await UserProduct.findOne({
            userId: userIdStr,
            platform: 'curseduca',
            status: 'PARA_INATIVAR'
          })

        if (userProductToUpdate) {
          beforeMutation(config.phaseHooks)
          const plannedRow = userProductToUpdate as Record<string, unknown>
          const filter = executionPlan
            ? {
              _id: plannedRow._id,
              userId: userIdStr,
              platform: 'curseduca',
              status: 'PARA_INATIVAR',
              ...(plannedRow.updatedAt ? { updatedAt: plannedRow.updatedAt } : {}),
            }
            : {
              _id: plannedRow._id,
              userId: userIdStr,
              platform: 'curseduca',
              status: 'PARA_INATIVAR',
            }
          const updatedUserProduct = await UserProduct.findOneAndUpdate(filter, {
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
          }, { new: true })
          if (executionPlan && !updatedUserProduct) throw planConflict('curseduca')
          if (executionPlan && updatedUserProduct) {
            const planIndex = executionPlan.userProducts.findIndex(row => String(row._id ?? '') === String(plannedRow._id ?? ''))
            if (planIndex >= 0) {
              const refreshed = updatedUserProduct as unknown as Record<string, unknown>
              executionPlan.userProducts[planIndex] = {
                ...plannedRow,
                status: 'INACTIVE',
                ...(refreshed.updatedAt ? { updatedAt: refreshed.updatedAt } : {}),
              }
            }
          }
          debugLog(`   ✅ [CursEduca Sync] Removido de PARA_INATIVAR (já INACTIVE): ${user.email}`)
        }
      } catch (err: unknown) {
        if (config.phaseHooks) throw err
        logger.error(`⚠️ [CursEduca Sync] Erro ao atualizar UserProduct para ${user.email}:`, errorMessage(err))
      }
    }

    const curseducaSyncAt = new Date()
    updateFields['curseduca.lastSyncAt'] = curseducaSyncAt
    updateFields['metadata.updatedAt'] = curseducaSyncAt
    updateFields['metadata.sources.curseduca.lastSync'] = curseducaSyncAt
  }

  const purchaseDate = toDateOrNull(item.purchaseDate)
  const renewalResult = detectRenewal(user, purchaseDate, config.syncType, expirationPolicy)

  if (renewalResult.shouldReactivate) {
    // Utilizador renovou! Aplicar reativação automática
    Object.assign(updateFields, buildCanonicalActiveUserStatusUpdate())
    updateFields['inactivation.isManuallyInactivated'] = false
    updateFields['inactivation.reactivatedAt'] = new Date()
    updateFields['inactivation.reactivatedBy'] = 'Sistema - Sync Automático'
    updateFields['inactivation.reactivationReason'] = renewalResult.reactivationReason
    needsUpdate = true
    await applyAutoReactivation(
      userIdStr,
      user.email,
      renewalResult,
      config.phaseHooks,
      executionPlan?.renewalTargetsByUser[userIdStr] ?? 0,
      executionPlan?.userProducts,
      config.syncType === 'curseduca' ? 'CURSEDUCA_SYNC_PLAN_CONCURRENCY_CONFLICT' : 'HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT',
    )
    if (executionPlan) {
      for (const plannedProduct of executionPlan.userProducts) {
        if (
          String(plannedProduct.userId ?? '') === userIdStr
          && (plannedProduct.status === 'INACTIVE' || plannedProduct.status === 'PARA_INATIVAR')
        ) {
          plannedProduct.status = 'ACTIVE'
        }
      }
    }
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
      const reactivationExpected = executionPlan?.reactivationTargetsByUser[userIdStr] ?? 0
      beforeMutation(config.phaseHooks, Math.max(1, reactivationExpected))
      const reactivationResult = await UserProduct.updateMany(
        { userId: userIdStr, platform: 'hotmart', status: { $in: ['INACTIVE', 'PARA_INATIVAR'] } },
        { $set: { status: 'ACTIVE' } }
      )
      if (
        config.phaseHooks
        && reactivationExpected > 0
        && typeof reactivationResult.matchedCount === 'number'
        && reactivationResult.matchedCount !== reactivationExpected
      ) {
        throw new Error('HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT')
      }
      if (executionPlan) {
        for (const plannedProduct of executionPlan.userProducts) {
          if (
            String(plannedProduct.userId ?? '') === userIdStr
            && plannedProduct.platform === 'hotmart'
            && (plannedProduct.status === 'INACTIVE' || plannedProduct.status === 'PARA_INATIVAR')
          ) {
            plannedProduct.status = 'ACTIVE'
          }
        }
      }
    }
  }

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
  if (needsUpdate) {
    beforeMutation(config.phaseHooks)
    const userFilter = executionPlan && plannedUser
      ? config.syncType === 'curseduca' ? curseducaUserOptimisticFilter(plannedUser) : hotmartUserOptimisticFilter(plannedUser)
      : { _id: userIdStr }
    const updatedUser = await User.findOneAndUpdate(userFilter, { $set: updateFields }, { new: true })
    if (!updatedUser && executionPlan) throw planConflict(config.syncType)
    debugLog(`🔄 [UniversalSync] User atualizado: ${user.email}`)
  }

  const userProductResult = await persistUserProduct({
    item,
    syncType: config.syncType,
    user,
    userId: userIdStr,
    phaseHooks: config.phaseHooks,
    plannedUserProducts: executionPlan?.userProducts,
  })

  if (executionPlan && userProductResult.status === 'completed' && userProductResult.userProduct) {
    const persisted = userProductResult.userProduct as unknown as Record<string, unknown>
    const persistedId = String(persisted._id ?? '')
    const persistedIndex = executionPlan.userProducts.findIndex(product => String(product._id ?? '') === persistedId)
    if (persistedIndex >= 0) executionPlan.userProducts[persistedIndex] = persisted
    else executionPlan.userProducts.push(persisted)
  }

  if (userProductResult.status === 'missing-product') {
    return {
      action: isNew ? 'inserted' : needsUpdate ? 'updated' : 'unchanged',
      userId: userIdStr,
    }
  }

  try {
    const plannedProducts = executionPlan?.userProducts.filter(product =>
      String(product.userId ?? '') === userIdStr && product.productId !== undefined && product.productId !== null,
    )
    const userProducts = plannedProducts
      ? plannedProducts as unknown as import('../../../models/UserProduct').IUserProduct[]
      : await UserProduct.find({ userId: user._id }).populate('productId', 'name code platform')
    const plannedSnapshot = executionPlan?.snapshots
      .filter(snapshot => String(snapshot.userId ?? '') === userIdStr)
      .sort((left, right) => String(right.snapshotDate ?? '').localeCompare(String(left.snapshotDate ?? '')))[0]

    if (executionPlan) {
      const latestSnapshot = await UserSnapshot.findOne({ userId: user._id, syncType: config.syncType })
        .sort({ snapshotDate: -1 })
        .lean()
      const plannedSnapshotId = String(plannedSnapshot?._id ?? '')
      const latestSnapshotId = String(latestSnapshot?._id ?? '')
      const plannedSnapshotDate = String(plannedSnapshot?.snapshotDate ?? '')
      const latestSnapshotDate = String(latestSnapshot?.snapshotDate ?? '')
      if (plannedSnapshotId !== latestSnapshotId || plannedSnapshotDate !== latestSnapshotDate) {
        throw planConflict(config.syncType)
      }
    }

    const { comparison } = await snapshotAndCompare(
      user,
      userProducts,
      snapshotContext.syncType,
      snapshotContext.syncId,
      config.phaseHooks,
      plannedSnapshot as never,
    )

    if (comparison.hasChanges && comparison.summary.totalChanges > 1) {
      debugLog(`   📸 [Snapshot] ${comparison.summary.totalChanges} alterações registadas para ${user.email}`)
      debugLog(`      - HIGH: ${comparison.summary.highPriorityChanges}`)
      debugLog(`      - MEDIUM: ${comparison.summary.mediumPriorityChanges}`)
      debugLog(`      - LOW: ${comparison.summary.lowPriorityChanges}`)
    }
  } catch (snapshotError: unknown) {
    if (config.phaseHooks) throw snapshotError
    logger.error(`⚠️  [Snapshot] Erro ao criar snapshot para ${user.email}:`, errorMessage(snapshotError))
    // Não falhar o sync por erro no snapshot
  }

  return {
    action: isNew ? 'inserted' : (needsUpdate ? 'updated' : 'unchanged'),
    userId: userIdStr
  }
}
