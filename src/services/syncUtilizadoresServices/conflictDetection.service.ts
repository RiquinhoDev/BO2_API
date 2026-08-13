import { errorMessage } from './universalSync/fieldUtils'
import logger from '../../utils/logger'
// ════════════════════════════════════════════════════════════
// 📁 src/services/conflictDetection.service.ts
// Service: Conflict Detection
// Deteção e resolução automática de conflitos durante syncs
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import SyncConflict, { ConflictSeverity, ConflictType, ISyncConflict, ResolutionAction } from '../../models/SyncModels/SyncConflict'
import { User } from '../../models'
import { canAutoResolveConflict, getAutoResolutionPlan, getSuggestedConflictAction } from './conflictDetection/resolutionPolicy'

interface ConflictUserRecord extends Record<string, unknown> {
  _id?: mongoose.Types.ObjectId
  email?: string
  name?: string
  classId?: string
  hotmartUserId?: string
  curseducaUserId?: string
  discordId?: string
  userId?: string
}

interface DetectConflictDTO {
  email: string
  existingUser?: ConflictUserRecord
  newUserData: ConflictUserRecord
  platform: 'hotmart' | 'curseduca' | 'discord'
  syncHistoryId: mongoose.Types.ObjectId
}

interface ConflictDetectionResult {
  hasConflict: boolean
  conflicts: ISyncConflict[]
  canAutoResolve: boolean
  suggestedAction?: ResolutionAction
}

interface ResolveConflictDTO {
  conflictId: mongoose.Types.ObjectId
  action: ResolutionAction
  adminId: mongoose.Types.ObjectId
  notes?: string
  appliedChanges?: Record<string, unknown>
}

export class ConflictDetectionService {
  async detectConflicts(dto: DetectConflictDTO): Promise<ConflictDetectionResult> {
    const conflicts: ISyncConflict[] = []

    const duplicateEmailConflict = await this.checkDuplicateEmail(dto)
    if (duplicateEmailConflict) conflicts.push(duplicateEmailConflict)

    const differentIdsConflict = await this.checkDifferentIds(dto)
    if (differentIdsConflict) conflicts.push(differentIdsConflict)

    const missingDataConflict = await this.checkMissingData(dto)
    if (missingDataConflict) conflicts.push(missingDataConflict)

    const invalidDataConflict = await this.checkInvalidData(dto)
    if (invalidDataConflict) conflicts.push(invalidDataConflict)

    const platformMismatchConflict = await this.checkPlatformMismatch(dto)
    if (platformMismatchConflict) conflicts.push(platformMismatchConflict)

    const classConflict = await this.checkClassConflict(dto)
    if (classConflict) conflicts.push(classConflict)

    const canAutoResolve = conflicts.length > 0 && conflicts.every(c => canAutoResolveConflict(c))
    const suggestedAction = canAutoResolve
      ? getSuggestedConflictAction(conflicts[0])
      : undefined

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      canAutoResolve,
      suggestedAction
    }
  }

  private async checkDuplicateEmail(dto: DetectConflictDTO): Promise<ISyncConflict | null> {
    const existingUsers = await User.find({
      email: dto.email.toLowerCase().trim()
    }).lean()

    if (existingUsers.length > 1) {
      logger.info(`⚠️ Email duplicado detectado: ${dto.email}`)

      return await SyncConflict.create({
        email: dto.email,
        userId: dto.existingUser?._id,
        syncHistoryId: dto.syncHistoryId,
        conflictType: 'DUPLICATE_EMAIL',
        severity: 'HIGH',
        title: 'Email Duplicado',
        description: `Email ${dto.email} existe em múltiplos registros (${existingUsers.length} users)`,
        conflictData: {
          field: 'email',
          existingValue: existingUsers.map(u => u._id),
          newValue: dto.newUserData.email,
          platform: dto.platform
        },
        status: 'PENDING',
        detectedAt: new Date()
      })
    }

    return null
  }

  private async checkDifferentIds(dto: DetectConflictDTO): Promise<ISyncConflict | null> {
    if (!dto.existingUser) return null

    const platformIdField = this.getPlatformIdField(dto.platform)
    const existingId = dto.existingUser[platformIdField]
    const newId = dto.newUserData[platformIdField]

    if (existingId && newId && existingId !== newId) {
      logger.info(`⚠️ IDs diferentes detectados: ${existingId} vs ${newId}`)

      return await SyncConflict.create({
        email: dto.email,
        userId: dto.existingUser._id,
        syncHistoryId: dto.syncHistoryId,
        conflictType: 'DIFFERENT_IDS',
        severity: 'CRITICAL',
        title: 'IDs Diferentes para Mesmo Email',
        description: `User ${dto.email} tem ${platformIdField} diferente: existente=${existingId}, novo=${newId}`,
        conflictData: {
          field: platformIdField,
          existingValue: existingId,
          newValue: newId,
          platform: dto.platform
        },
        suggestedResolution: {
          action: 'MANUAL',
          reason: 'IDs críticos diferentes requerem resolução manual',
          confidence: 0
        },
        status: 'PENDING',
        detectedAt: new Date()
      })
    }

    return null
  }

  private async checkMissingData(dto: DetectConflictDTO): Promise<ISyncConflict | null> {
    const requiredFields: Array<'email' | 'name'> = ['email', 'name']
    const missingFields = requiredFields.filter(field => !dto.newUserData[field])

    if (missingFields.length > 0) {
      logger.info(`⚠️ Dados obrigatórios em falta: ${missingFields.join(', ')}`)

      return await SyncConflict.create({
        email: dto.email,
        userId: dto.existingUser?._id,
        syncHistoryId: dto.syncHistoryId,
        conflictType: 'MISSING_DATA',
        severity: 'MEDIUM',
        title: 'Dados Obrigatórios em Falta',
        description: `Campos obrigatórios em falta: ${missingFields.join(', ')}`,
        conflictData: {
          field: missingFields.join(', '),
          existingValue: null,
          newValue: dto.newUserData,
          platform: dto.platform
        },
        suggestedResolution: {
          action: 'KEPT_EXISTING',
          reason: 'Manter dados existentes pois novos dados estão incompletos',
          confidence: 80
        },
        status: 'PENDING',
        detectedAt: new Date()
      })
    }

    return null
  }

  private async checkInvalidData(dto: DetectConflictDTO): Promise<ISyncConflict | null> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(dto.email)) {
      logger.info(`⚠️ Email inválido: ${dto.email}`)

      return await SyncConflict.create({
        email: dto.email,
        userId: dto.existingUser?._id,
        syncHistoryId: dto.syncHistoryId,
        conflictType: 'INVALID_DATA',
        severity: 'HIGH',
        title: 'Email Inválido',
        description: `Email ${dto.email} não tem formato válido`,
        conflictData: {
          field: 'email',
          existingValue: dto.existingUser?.email,
          newValue: dto.email,
          platform: dto.platform
        },
        status: 'PENDING',
        detectedAt: new Date()
      })
    }

    return null
  }

  private async checkPlatformMismatch(dto: DetectConflictDTO): Promise<ISyncConflict | null> {
    if (!dto.existingUser) return null

    const platformFields: Record<'hotmart' | 'curseduca' | 'discord', keyof ConflictUserRecord> = {
      hotmart: 'hotmartUserId',
      curseduca: 'curseducaUserId',
      discord: 'discordId'
    }

    const otherPlatforms = Object.entries(platformFields)
      .filter(([platform, field]) =>
        platform !== dto.platform && Boolean(dto.existingUser?.[field])
      )

    if (otherPlatforms.length > 0) {
      logger.info(`ℹ️ User multi-plataforma: ${dto.email}`)
    }

    return null
  }

  private async checkClassConflict(dto: DetectConflictDTO): Promise<ISyncConflict | null> {
    if (!dto.existingUser || !dto.newUserData.classId) return null

    const existingClassId = dto.existingUser.classId
    const newClassId = dto.newUserData.classId

    if (existingClassId && newClassId && existingClassId !== newClassId) {
      logger.info(`⚠️ Conflito de turmas: ${existingClassId} vs ${newClassId}`)

      return await SyncConflict.create({
        email: dto.email,
        userId: dto.existingUser._id,
        syncHistoryId: dto.syncHistoryId,
        conflictType: 'CLASS_CONFLICT',
        severity: 'LOW',
        title: 'Turmas Diferentes',
        description: `User tem turmas diferentes: existente=${existingClassId}, nova=${newClassId}`,
        conflictData: {
          field: 'classId',
          existingValue: existingClassId,
          newValue: newClassId,
          platform: dto.platform
        },
        suggestedResolution: {
          action: 'USED_NEW',
          reason: 'Usar turma mais recente da plataforma',
          confidence: 70
        },
        status: 'PENDING',
        detectedAt: new Date()
      })
    }

    return null
  }

  async autoResolveConflicts(
    conflictIds: mongoose.Types.ObjectId[]
  ): Promise<{
    resolved: number
    failed: number
    skipped: number
  }> {
    logger.info(`🤖 Auto-resolvendo ${conflictIds.length} conflitos...`)

    let resolved = 0
    let failed = 0
    let skipped = 0

    for (const conflictId of conflictIds) {
      try {
        const conflict = await SyncConflict.findById(conflictId)

        if (!conflict) {
          skipped++
          continue
        }

        if (!canAutoResolveConflict(conflict)) {
          logger.info(`⏭️ Conflito ${conflictId} não pode ser auto-resolvido`)
          skipped++
          continue
        }

        const rule = getAutoResolutionPlan(conflict)

        if (!rule) {
          skipped++
          continue
        }

        await conflict.autoResolve(rule.action, rule.reason)
        resolved++

        logger.info(`✅ Conflito ${conflictId} auto-resolvido: ${rule.action}`)

      } catch (error: unknown) {
        logger.error(`❌ Erro ao auto-resolver conflito ${conflictId}:`, errorMessage(error))
        failed++
      }
    }

    logger.info(`✅ Auto-resolução completa: ${resolved} resolvidos, ${skipped} skipped, ${failed} falhas`)

    return { resolved, failed, skipped }
  }

  async resolveConflict(dto: ResolveConflictDTO): Promise<ISyncConflict> {
    logger.info(`✅ Resolvendo conflito: ${dto.conflictId}`)

    const conflict = await SyncConflict.findById(dto.conflictId)

    if (!conflict) {
      throw new Error('Conflito não encontrado')
    }

    if (conflict.isResolved()) {
      throw new Error('Conflito já foi resolvido')
    }

    await conflict.resolve(
      dto.action,
      dto.adminId,
      dto.notes,
      dto.appliedChanges
    )

    logger.info(`✅ Conflito resolvido: ${dto.action}`)

    return conflict
  }

  async bulkResolveConflicts(
    conflictIds: mongoose.Types.ObjectId[],
    action: ResolutionAction,
    adminId: mongoose.Types.ObjectId,
    notes?: string
  ): Promise<number> {
    logger.info(`✅ Resolvendo ${conflictIds.length} conflitos em bulk...`)

    const resolved = await SyncConflict.bulkResolve(
      conflictIds,
      action,
      adminId,
      notes
    )

    logger.info(`✅ ${resolved} conflitos resolvidos`)

    return resolved
  }

  async ignoreConflict(
    conflictId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    reason?: string
  ): Promise<ISyncConflict> {
    logger.info(`🙈 Ignorando conflito: ${conflictId}`)

    const conflict = await SyncConflict.findById(conflictId)

    if (!conflict) {
      throw new Error('Conflito não encontrado')
    }

    await conflict.ignore(adminId, reason)

    logger.info(`✅ Conflito ignorado`)

    return conflict
  }

  async getPendingConflicts(filters?: {
    severity?: ConflictSeverity
    conflictType?: ConflictType
    email?: string
    limit?: number
  }): Promise<ISyncConflict[]> {
    return SyncConflict.getPendingConflicts(filters)
  }

  async getCriticalConflicts(limit: number = 20): Promise<ISyncConflict[]> {
    return SyncConflict.getCriticalConflicts(limit)
  }

  async getOldPendingConflicts(daysOld: number = 7): Promise<ISyncConflict[]> {
    return SyncConflict.getOldPendingConflicts(daysOld)
  }

  async getConflictStats() {
    return SyncConflict.getConflictStats()
  }

  async getConflictsByType() {
    return SyncConflict.getConflictsByType()
  }

  private getPlatformIdField(
    platform: string
  ): 'hotmartUserId' | 'curseducaUserId' | 'discordId' | 'userId' {
    if (platform === 'hotmart') return 'hotmartUserId'
    if (platform === 'curseduca') return 'curseducaUserId'
    if (platform === 'discord') return 'discordId'
    return 'userId'
  }

  async getConflictById(conflictId: mongoose.Types.ObjectId): Promise<ISyncConflict | null> {
    return SyncConflict.findById(conflictId)
      .populate('userId', 'name email')
      .populate('syncHistoryId', 'type startedAt')
  }

  async getUserConflicts(userId: mongoose.Types.ObjectId): Promise<ISyncConflict[]> {
    return SyncConflict.find({ userId })
      .sort({ detectedAt: -1 })
      .populate('syncHistoryId', 'type startedAt')
  }

  async getSyncConflicts(syncHistoryId: mongoose.Types.ObjectId): Promise<ISyncConflict[]> {
    return SyncConflict.find({ syncHistoryId })
      .sort({ severity: -1, detectedAt: -1 })
      .populate('userId', 'name email')
  }
}

export const conflictDetectionService = new ConflictDetectionService()

export default conflictDetectionService