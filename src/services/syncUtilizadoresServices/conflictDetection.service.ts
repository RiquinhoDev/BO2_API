// ════════════════════════════════════════════════════════════
// 📁 src/services/conflictDetection.service.ts
// Service: Conflict Detection
// Deteção e resolução automática de conflitos durante syncs
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import SyncConflict, { ConflictSeverity, ConflictType, ISyncConflict, ResolutionAction } from '../../models/SyncModels/SyncConflict'
import { User } from '../../models'


// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface DetectConflictDTO {
  email: string
  existingUser?: any
  newUserData: any
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
  appliedChanges?: any
}

interface AutoResolutionRule {
  conflictType: ConflictType
  conditions: (conflict: any) => boolean
  action: ResolutionAction
  confidence: number
  reason: string
}

// ─────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────

export class ConflictDetectionService {

  // ═══════════════════════════════════════════════════════════
  // CONFLICT DETECTION
  // ═══════════════════════════════════════════════════════════
  
  async detectConflicts(dto: DetectConflictDTO): Promise<ConflictDetectionResult> {
    const conflicts: ISyncConflict[] = []

    // 1. Email duplicado (múltiplos users com mesmo email)
    const duplicateEmailConflict = await this.checkDuplicateEmail(dto)
    if (duplicateEmailConflict) {
      conflicts.push(duplicateEmailConflict)
    }

    // 2. IDs diferentes para mesmo email
    const differentIdsConflict = await this.checkDifferentIds(dto)
    if (differentIdsConflict) {
      conflicts.push(differentIdsConflict)
    }

    // 3. Dados obrigatórios em falta
    const missingDataConflict = await this.checkMissingData(dto)
    if (missingDataConflict) {
      conflicts.push(missingDataConflict)
    }

    // 4. Dados inválidos
    const invalidDataConflict = await this.checkInvalidData(dto)
    if (invalidDataConflict) {
      conflicts.push(invalidDataConflict)
    }

    // 5. Mismatch entre plataformas
    const platformMismatchConflict = await this.checkPlatformMismatch(dto)
    if (platformMismatchConflict) {
      conflicts.push(platformMismatchConflict)
    }

    // 6. Conflito de turmas
    const classConflict = await this.checkClassConflict(dto)
    if (classConflict) {
      conflicts.push(classConflict)
    }

    // Verificar se pode auto-resolver
    const canAutoResolve = conflicts.length > 0 && 
      conflicts.every(c => this.canAutoResolveConflict(c))

    const suggestedAction = canAutoResolve 
      ? this.getSuggestedAction(conflicts[0])
      : undefined

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      canAutoResolve,
      suggestedAction
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INDIVIDUAL CONFLICT CHECKS
  // ═══════════════════════════════════════════════════════════
  
  private async checkDuplicateEmail(dto: DetectConflictDTO): Promise<ISyncConflict | null> {
    // Verificar se já existe outro user com mesmo email
    const existingUsers = await User.find({ 
      email: dto.email.toLowerCase().trim() 
    }).lean()

    if (existingUsers.length > 1) {
      console.log(`⚠️ Email duplicado detectado: ${dto.email}`)

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
      console.log(`⚠️ IDs diferentes detectados: ${existingId} vs ${newId}`)

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
    const requiredFields = ['email', 'name']
    const missingFields = requiredFields.filter(field => !dto.newUserData[field])

    if (missingFields.length > 0) {
      console.log(`⚠️ Dados obrigatórios em falta: ${missingFields.join(', ')}`)

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
    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(dto.email)) {
      console.log(`⚠️ Email inválido: ${dto.email}`)

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

    // Exemplo: User tem hotmartUserId mas está sendo sincronizado do CursEduca
    const platformFields = {
      hotmart: 'hotmartUserId',
      curseduca: 'curseducaUserId',
      discord: 'discordId'
    }

    const otherPlatforms = Object.entries(platformFields)
      .filter(([platform, field]) => 
        platform !== dto.platform && 
        dto.existingUser[field]
      )

    if (otherPlatforms.length > 0) {
      // Isto não é necessariamente um conflito (multi-plataforma é normal)
      // Mas pode ser útil registrar para auditoria
      console.log(`ℹ️ User multi-plataforma: ${dto.email}`)
    }

    return null
  }

  private async checkClassConflict(dto: DetectConflictDTO): Promise<ISyncConflict | null> {
    if (!dto.existingUser || !dto.newUserData.classId) return null

    const existingClassId = dto.existingUser.classId
    const newClassId = dto.newUserData.classId

    if (existingClassId && newClassId && existingClassId !== newClassId) {
      console.log(`⚠️ Conflito de turmas: ${existingClassId} vs ${newClassId}`)

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

  // ═══════════════════════════════════════════════════════════
  // AUTO-RESOLUTION
  // ═══════════════════════════════════════════════════════════
  
  private autoResolutionRules: AutoResolutionRule[] = [
    {
      conflictType: 'MISSING_DATA',
      conditions: (conflict) => conflict.severity !== 'CRITICAL',
      action: 'KEPT_EXISTING',
      confidence: 80,
      reason: 'Dados novos incompletos, mantendo existentes'
    },
    {
      conflictType: 'CLASS_CONFLICT',
      conditions: (conflict) => true,
      action: 'USED_NEW',
      confidence: 70,
      reason: 'Usar turma mais recente da sincronização'
    },
    {
      conflictType: 'PLATFORM_MISMATCH',
      conditions: (conflict) => conflict.severity === 'LOW',
      action: 'MERGED',
      confidence: 90,
      reason: 'Merge de dados multi-plataforma'
    }
  ]

  private canAutoResolveConflict(conflict: ISyncConflict): boolean {
    // Conflitos CRITICAL nunca são auto-resolvidos
    if (conflict.severity === 'CRITICAL') {
      return false
    }

    // Verificar se existe regra de auto-resolução
    const rule = this.autoResolutionRules.find(
      r => r.conflictType === conflict.conflictType && r.conditions(conflict)
    )

    return !!rule && rule.confidence >= 70
  }

  private getSuggestedAction(conflict: ISyncConflict): ResolutionAction {
    const rule = this.autoResolutionRules.find(
      r => r.conflictType === conflict.conflictType && r.conditions(conflict)
    )

    return rule?.action || 'MANUAL'
  }

  async autoResolveConflicts(
    conflictIds: mongoose.Types.ObjectId[]
  ): Promise<{
    resolved: number
    failed: number
    skipped: number
  }> {
    console.log(`🤖 Auto-resolvendo ${conflictIds.length} conflitos...`)

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

        if (!this.canAutoResolveConflict(conflict)) {
          console.log(`⏭️ Conflito ${conflictId} não pode ser auto-resolvido`)
          skipped++
          continue
        }

        const rule = this.autoResolutionRules.find(
          r => r.conflictType === conflict.conflictType && r.conditions(conflict)
        )

        if (!rule) {
          skipped++
          continue
        }

        await conflict.autoResolve(rule.action, rule.reason)
        resolved++
        
        console.log(`✅ Conflito ${conflictId} auto-resolvido: ${rule.action}`)

      } catch (error: any) {
        console.error(`❌ Erro ao auto-resolver conflito ${conflictId}:`, error.message)
        failed++
      }
    }

    console.log(`✅ Auto-resolução completa: ${resolved} resolvidos, ${skipped} skipped, ${failed} falhas`)

    return { resolved, failed, skipped }
  }

  // ═══════════════════════════════════════════════════════════
  // MANUAL RESOLUTION
  // ═══════════════════════════════════════════════════════════
  
  async resolveConflict(dto: ResolveConflictDTO): Promise<ISyncConflict> {
    console.log(`✅ Resolvendo conflito: ${dto.conflictId}`)

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

    console.log(`✅ Conflito resolvido: ${dto.action}`)

    return conflict
  }

  async bulkResolveConflicts(
    conflictIds: mongoose.Types.ObjectId[],
    action: ResolutionAction,
    adminId: mongoose.Types.ObjectId,
    notes?: string
  ): Promise<number> {
    console.log(`✅ Resolvendo ${conflictIds.length} conflitos em bulk...`)

    const resolved = await SyncConflict.bulkResolve(
      conflictIds,
      action,
      adminId,
      notes
    )

    console.log(`✅ ${resolved} conflitos resolvidos`)

    return resolved
  }

  async ignoreConflict(
    conflictId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    reason?: string
  ): Promise<ISyncConflict> {
    console.log(`🙈 Ignorando conflito: ${conflictId}`)

    const conflict = await SyncConflict.findById(conflictId)
    
    if (!conflict) {
      throw new Error('Conflito não encontrado')
    }

    await conflict.ignore(adminId, reason)

    console.log(`✅ Conflito ignorado`)

    return conflict
  }

  // ═══════════════════════════════════════════════════════════
  // GET CONFLICTS
  // ═══════════════════════════════════════════════════════════
  
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

  async getConflictStats(): Promise<any> {
    return SyncConflict.getConflictStats()
  }

  async getConflictsByType(): Promise<any[]> {
    return SyncConflict.getConflictsByType()
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════
  
  private getPlatformIdField(platform: string): string {
    const fieldMap: Record<string, string> = {
      hotmart: 'hotmartUserId',
      curseduca: 'curseducaUserId',
      discord: 'discordId'
    }
    
    return fieldMap[platform] || 'userId'
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

// ─────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────

export const conflictDetectionService = new ConflictDetectionService()

export default conflictDetectionService