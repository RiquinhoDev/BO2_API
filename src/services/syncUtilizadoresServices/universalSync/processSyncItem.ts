// ════════════════════════════════════════════════════════════
// 📁 universalSync/processSyncItem.ts
// The per-item use case extracted from universalSyncService.ts: given one
// UniversalSourceItem, upsert the User + UserProduct, drive class-history and
// expiration/renewal side effects, and snapshot. Pure builders decide the
// field mutations; this module owns the Mongo reads/writes and their order.
// ════════════════════════════════════════════════════════════

import mongoose, { type UpdateQuery } from 'mongoose'
import User from '../../../models/user'
import { Product, UserProduct } from '../../../models'
import { Class, type IClass } from '../../../models/Class'
import type { ProcessItemResult, UniversalSourceItem, UniversalSyncConfig, UniversalSyncType } from '../../../types/universalSync.types'
import { snapshotAndCompare } from '../../snapshotServices/userSnapshot.service'
import type { UniversalSnapshotContext } from '../universalSyncSnapshot'
import { debugLog } from './debugLog'
import { buildCanonicalActiveUserStatusUpdate } from './canonicalUserStatus'
import { errorMessage, mongoErrorCode, normalizeEmail, toDateOrNull } from './fieldUtils'
import { productsCache, type LeanProduct } from './productsCache'
import { HotmartExpirationPolicy, formatDateOnly, getActiveHotmartClassForExpiration } from './hotmartExpiration'
import { ExpiredStudentsCollector } from './expiredStudentsCollector'
import { calculateEngagementMetricsForUserProduct, type EngagementMetricsResult } from './engagement/engagementMetrics'
import { buildHotmartMutationPlan, hotmartPlanToUpdateFields, type HotmartClassEnrollment } from './builders/hotmartMutationPlan'
import { buildCurseducaMutationPlan, curseducaPlanToUpdateFields } from './builders/curseducaMutationPlan'
import { buildUserProductUpdatePlan, buildUserProductCreatePlan, planPrimaryReassignment } from './builders/userProductMutationPlan'
import { detectRenewal, planInactiveAutofix } from './renewalPolicy'
import { applyAutoReactivation } from './renewalExecutor'

const expirationPolicy = new HotmartExpirationPolicy({ now: () => new Date() })

/**
 * Determina o produto correto baseado nos dados do item e na plataforma
 * ✅ OTIMIZADO: Usa cache quando disponível
 */
async function determineProductId(
  item: UniversalSourceItem,
  syncType: UniversalSyncType
): Promise<mongoose.Types.ObjectId | null> {

  // ✅ Usar cache se disponível
  const useCache = productsCache.isLoaded()

  if (syncType === 'hotmart') {
    const productCode = item.productCode || 'OGI_V1'

    // Cache lookup
    if (useCache) {
      const cached = productsCache.get(`hotmart:${productCode}`) || productsCache.get(productCode)
      if (cached) {
        debugLog(`✅ [ProductMapping] Produto Hotmart do cache: ${productCode}`)
        return cached._id
      }
    }

    // Fallback: query BD
    const product = await Product.findOne({
      code: productCode,
      platform: 'hotmart',
      isActive: true
    }).select('_id').lean() as LeanProduct | null

    if (!product) {
      console.warn(`⚠️ [ProductMapping] Produto Hotmart não encontrado: ${productCode}`)
    }

    return product?._id || null
  }

  if (syncType === 'curseduca') {
    const groupId = String(item.groupId || '')

    if (groupId) {
      // Cache lookup por groupId
      if (useCache) {
        const cached = productsCache.get(`group_${groupId}`)
        if (cached) {
          debugLog(`✅ [ProductMapping] Produto CursEduca do cache (groupId ${groupId}): ${cached.code}`)
          return cached._id
        }
      }

      // Fallback: query BD
      const product = await Product.findOne({
        platform: 'curseduca',
        curseducaGroupId: groupId,
        isActive: true
      }).select('_id code').lean() as LeanProduct | null

      if (product) {
        debugLog(`✅ [ProductMapping] Produto encontrado por groupId ${groupId}: ${product.code}`)
        return product._id
      }
    }

    // 2ª tentativa: subscriptionType
    if (item.subscriptionType) {
      const productCode =
        item.subscriptionType === 'MONTHLY' ? 'CLAREZA_MENSAL' :
        item.subscriptionType === 'ANNUAL' ? 'CLAREZA_ANUAL' :
        null

      if (productCode) {
        // Cache lookup
        if (useCache) {
          const cached = productsCache.get(productCode)
          if (cached) {
            debugLog(`✅ [ProductMapping] Produto do cache (subscriptionType): ${productCode}`)
            return cached._id
          }
        }

        // Fallback: query BD
        const product = await Product.findOne({
          platform: 'curseduca',
          code: productCode,
          isActive: true
        }).select('_id code').lean() as LeanProduct | null

        if (product) {
          debugLog(`✅ [ProductMapping] Produto encontrado por subscriptionType ${item.subscriptionType}: ${product.code}`)
          return product._id
        }

        console.warn(`⚠️ [ProductMapping] Produto não encontrado para subscriptionType: ${item.subscriptionType} (${productCode})`)
      }
    }

    // 3ª tentativa: groupName (não usa cache - query dinâmica)
    if (item.groupName) {
      const product = await Product.findOne({
        platform: 'curseduca',
        name: { $regex: new RegExp(item.groupName, 'i') },
        isActive: true
      }).select('_id code').lean() as LeanProduct | null

      if (product) {
        console.log(`✅ [ProductMapping] Produto encontrado por groupName "${item.groupName}": ${product.code}`)
        return product._id
      }
    }

    // 4ª tentativa: default
    if (useCache) {
      const allCurseduca = Array.from(productsCache.values()).find(p => p.platform === 'curseduca')
      if (allCurseduca) {
        console.warn(`⚠️ [ProductMapping] Usando produto default CursEDuca: ${allCurseduca.code} (groupId: ${groupId})`)
        return allCurseduca._id
      }
    }

    const defaultProduct = await Product.findOne({
      platform: 'curseduca',
      isActive: true
    }).select('_id code').lean() as LeanProduct | null

    if (defaultProduct) {
      console.warn(`⚠️ [ProductMapping] Usando produto default CursEDuca: ${defaultProduct.code} (groupId: ${groupId})`)
      return defaultProduct._id
    }

    console.error(`❌ [ProductMapping] Nenhum produto CursEDuca ativo encontrado!`)
    return null
  }

  return null
}

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

      console.log(`   ✅ [Class] Nova turma criada: ${classId} - "${displayName}"`)
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
        console.log(`   📝 [Class] Nome atualizado: ${classId} - "${existingClass.name}" → "${className}"`)
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
      console.error(`   ⚠️ [Class] Erro ao criar/atualizar turma ${classId}:`, errorMessage(error))
    }
    return className || `Turma ${classId}`
  }
}


export const processSyncItem = async (
  item: UniversalSourceItem,
  config: UniversalSyncConfig,
  snapshotContext: UniversalSnapshotContext,
  expiredCollector: ExpiredStudentsCollector,
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
    console.log(`✨ [UniversalSync] Novo user criado: ${user.email}`)
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
          console.log(`   📝 [ClassChange] ${user.email}: "${ev.previousClassName}" → "${ev.className}"`)
        } else {
          await StudentClassHistory.create({
            studentId: user._id,
            classId: ev.classId,
            className: ev.className,
            dateMoved: ev.dateMoved,
            reason: 'Primeira inscrição na turma (data de compra)',
            movedBy: 'Sistema - Sync Automático'
          })
          console.log(`   ✨ [FirstEnrollment] ${user.email} inscrito em "${ev.className}"`)
        }
      } catch (error: unknown) {
        console.warn(`   ⚠️ Erro ao registrar histórico de turma para ${user.email}:`, errorMessage(error))
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
        console.error(`⚠️ [CursEduca Sync] Erro ao atualizar UserProduct para ${user.email}:`, errorMessage(err))
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
      console.log(`   🔄 [AutoFix] ${user.email} está INACTIVE mas tem ${validityDescription} → reativando`)
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
    const expiredStudent = expirationPolicy.check(
      userIdStr,
      user.email,
      user.name,
      purchaseDate,
      activeHotmartClass?.classId || item.classId,
      activeHotmartClass?.className || item.className
    )

    if (expiredStudent) {
      // Adicionar à lista para processar no final do sync
      expiredCollector.add(expiredStudent)
      debugLog(`   ⏰ [Expiration] ${user.email} marcado para inativação (${expiredStudent.expirationReason})`)
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
  // ═══════════════════════════════════════════════════════════

  try {
    // 1. Determinar productId usando função escalável
    const productId = await determineProductId(item, config.syncType)

    if (!productId) {
      console.warn(`⚠️ [UniversalSync] Produto não encontrado para ${config.syncType} - user: ${user.email}`)
      return {
        action: isNew ? 'inserted' : (needsUpdate ? 'updated' : 'unchanged'),
        userId: userIdStr
      }
    }

    // 2. Verificar se UserProduct já existe
    const existingUP = await UserProduct.findOne({
      userId: userIdStr,
      productId: productId
    })

    // ═══════════════════════════════════════════════════════════
    // CASO 1: ATUALIZAR USERPRODUCT EXISTENTE
    // ═══════════════════════════════════════════════════════════
    if (existingUP) {
      // PREPARE: engagement metrics (tolerant read + pure calc), matching the
      // original inner try/catch so a metrics failure never blocks the update.
      let metrics: EngagementMetricsResult | null = null
      try {
        const product = await Product.findById(productId)
        if (product) metrics = calculateEngagementMetricsForUserProduct(user, product)
      } catch (metricsError: unknown) {
        console.error(`   ❌ [Sprint 1.5B] Erro ao calcular engagement metrics:`, errorMessage(metricsError))
      }

      // PURE BUILDER: item + current UP state + metrics -> $set field map.
      const plan = buildUserProductUpdatePlan({
        item,
        syncType: config.syncType,
        existing: {
          progressPercentage: existingUP.progress?.percentage,
          engagementScore: existingUP.engagement?.engagementScore,
          classes: existingUP.classes || [],
        },
        metrics,
        clock: { now: () => new Date() },
      })

      // EXECUTOR: apply the plan in a single write, preserving the class-added log.
      if (plan.classAddedId) {
        console.log(`   📚 [Classes] Adicionada turma ${plan.classAddedId} para ${user.email}`)
      }
      if (plan.needsUpdate) {
        await UserProduct.findByIdAndUpdate(existingUP._id, { $set: plan.fields })
        debugLog(`   📦 UserProduct atualizado: ${user.email}`)
      }

    // ═══════════════════════════════════════════════════════════
    // CASO 2: CRIAR USERPRODUCT NOVO
    // ═══════════════════════════════════════════════════════════
    } else {
      const enrolledAt = toDateOrNull(item.enrolledAt) ||
                        toDateOrNull(item.purchaseDate) ||
                        toDateOrNull(item.joinedDate) ||
                        new Date()

      // PREPARE: isPrimary + the curseduca "one primary" reassignment (read, pure
      // decision, then the demote write) — same order as before, before the create.
      let isPrimaryValue = item.platformData?.isPrimary ?? true
      if (config.syncType === 'curseduca' && isPrimaryValue === true) {
        const existingPrimary = await UserProduct.findOne({
          userId: userIdStr,
          platform: 'curseduca',
          productId: { $ne: productId },
          isPrimary: true
        })

        if (existingPrimary) {
          console.log(`   🛡️ [Proteção] User ${item.email} já tem produto PRIMARY`)
          const reassign = planPrimaryReassignment(
            { enrolledAt: existingPrimary.enrolledAt, status: existingPrimary.status },
            enrolledAt,
            { now: () => new Date() },
          )
          isPrimaryValue = reassign.newIsPrimary
          if (reassign.demoteUpdate) {
            console.log(`      ✅ Novo produto mais recente → PRIMARY, antigo → INACTIVE`)
            await UserProduct.updateOne({ _id: existingPrimary._id }, { $set: reassign.demoteUpdate })
          } else {
            console.log(`      🔻 Novo produto mais antigo → SECONDARY (antigo mantém-se PRIMARY)`)
          }
        }
      }

      // PREPARE: engagement metrics (tolerant read + pure calc).
      let metrics: EngagementMetricsResult | null = null
      try {
        const product = await Product.findById(productId)
        if (product) metrics = calculateEngagementMetricsForUserProduct(user, product)
      } catch (metricsError: unknown) {
        console.error(`   ❌ [Sprint 1.5B] Erro ao calcular engagement metrics:`, errorMessage(metricsError))
      }

      // PURE BUILDER: assemble the new UserProduct (progress/engagement/classes + metrics merge).
      const newUserProduct = buildUserProductCreatePlan({
        item,
        syncType: config.syncType,
        userId: userIdStr,
        productId,
        enrolledAt,
        isPrimary: isPrimaryValue,
        metrics,
        clock: { now: () => new Date() },
      })

      // EXECUTOR: create.
      await UserProduct.create(newUserProduct)
      debugLog(`   ✨ UserProduct CRIADO: ${user.email} → ${config.syncType}`)
    }

  } catch (upError: unknown) {
    console.error(`❌ [UniversalSync] Erro ao criar/atualizar UserProduct para ${user.email}:`, errorMessage(upError))
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
    console.error(`⚠️  [Snapshot] Erro ao criar snapshot para ${user.email}:`, errorMessage(snapshotError))
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
