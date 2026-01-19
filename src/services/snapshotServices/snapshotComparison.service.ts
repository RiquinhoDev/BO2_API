// ══════════════════════════════════════════════════════════════════════
// 📁 src/services/snapshotServices/snapshotComparison.service.ts
// Serviço para comparar snapshots e identificar alterações relevantes
// ══════════════════════════════════════════════════════════════════════

import type { IUserSnapshot, IProductSnapshot } from '../../models/UserSnapshot'
import type { IUser } from '../../models/user'
import type { IUserProduct } from '../../models/UserProduct'

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ChangeType =
  | 'PRODUCT_ADDED'           // Novo produto adicionado
  | 'PRODUCT_REMOVED'         // Produto removido
  | 'PRODUCT_STATUS_CHANGE'   // ACTIVE → INACTIVE ou vice-versa
  | 'PROGRESS_INCREASE'       // Progresso aumentou
  | 'PROGRESS_DECREASE'       // Progresso diminuiu (raro mas possível)
  | 'LESSONS_COMPLETED'       // Novas lições completadas
  | 'ENGAGEMENT_CHANGE'       // Engagement score mudou significativamente
  | 'LOGIN_ACTIVITY'          // Novos logins detectados
  | 'CLASS_ADDED'             // Adicionado a nova turma
  | 'CLASS_REMOVED'           // Removido de turma
  | 'CLASS_ROLE_CHANGE'       // Mudou role na turma
  | 'EMAIL_CHANGE'            // Email alterado
  | 'NAME_CHANGE'             // Nome alterado
  | 'FIRST_ENROLLMENT'        // Primeira inscrição no sistema
  | 'LAST_ACTIVITY_UPDATE'    // Última atividade atualizada
  | 'NO_CHANGES'              // Nenhuma alteração detectada

export interface ChangeDetail {
  changeType: ChangeType
  field?: string
  previousValue: any
  newValue: any
  productId?: string
  productName?: string
  platform?: 'hotmart' | 'curseduca' | 'discord'
  significance: 'HIGH' | 'MEDIUM' | 'LOW' // Quão importante é esta mudança?
  description: string // Descrição em português
  metadata?: any
}

export interface ComparisonResult {
  hasChanges: boolean
  changes: ChangeDetail[]
  summary: {
    totalChanges: number
    highPriorityChanges: number
    mediumPriorityChanges: number
    lowPriorityChanges: number
    changesByType: Record<ChangeType, number>
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPARAÇÃO DE SNAPSHOTS
// ═══════════════════════════════════════════════════════════════

/**
 * Compara dois snapshots e retorna lista de alterações detectadas
 */
export function compareSnapshots(
  beforeSnapshot: IUserSnapshot | null,
  afterState: {
    user: IUser
    products: IUserProduct[]
  }
): ComparisonResult {
  const changes: ChangeDetail[] = []

  // ✅ CASO 1: Primeiro snapshot (primeira inscrição)
  if (!beforeSnapshot) {
    changes.push({
      changeType: 'FIRST_ENROLLMENT',
      previousValue: null,
      newValue: afterState.user.email,
      significance: 'HIGH',
      description: 'Primeiro registo no sistema'
    })

    // Registar cada produto como novo
    afterState.products.forEach((product) => {
      changes.push({
        changeType: 'PRODUCT_ADDED',
        previousValue: null,
        newValue: product.status,
        productId: product.productId?.toString(),
        productName: (product.productId as any)?.name || 'Produto desconhecido',
        platform: product.platform,
        significance: 'HIGH',
        description: `Inscrito no produto ${(product.productId as any)?.name || 'desconhecido'}`
      })
    })

    return buildComparisonResult(changes)
  }

  // ✅ CASO 2: Comparação de estados

  // 2.1 - Comparar dados do user (nome, email)
  compareUserData(beforeSnapshot, afterState.user, changes)

  // 2.2 - Comparar produtos
  compareProducts(beforeSnapshot.products, afterState.products, changes)

  // ✅ CASO 3: Sem alterações
  if (changes.length === 0) {
    changes.push({
      changeType: 'NO_CHANGES',
      previousValue: null,
      newValue: null,
      significance: 'LOW',
      description: 'Sem alterações detectadas'
    })
  }

  return buildComparisonResult(changes)
}

// ═══════════════════════════════════════════════════════════════
// COMPARAÇÃO DE USER DATA
// ═══════════════════════════════════════════════════════════════

function compareUserData(
  snapshot: IUserSnapshot,
  currentUser: IUser,
  changes: ChangeDetail[]
): void {
  // Email
  if (snapshot.userState.email !== currentUser.email) {
    changes.push({
      changeType: 'EMAIL_CHANGE',
      field: 'email',
      previousValue: snapshot.userState.email,
      newValue: currentUser.email,
      significance: 'HIGH',
      description: `Email alterado de ${snapshot.userState.email} para ${currentUser.email}`
    })
  }

  // Nome
  if (snapshot.userState.name !== currentUser.name) {
    changes.push({
      changeType: 'NAME_CHANGE',
      field: 'name',
      previousValue: snapshot.userState.name,
      newValue: currentUser.name,
      significance: 'MEDIUM',
      description: `Nome alterado de "${snapshot.userState.name}" para "${currentUser.name}"`
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPARAÇÃO DE PRODUTOS
// ═══════════════════════════════════════════════════════════════

function compareProducts(
  beforeProducts: IProductSnapshot[],
  afterProducts: IUserProduct[],
  changes: ChangeDetail[]
): void {
  // Criar maps para comparação rápida
  const beforeMap = new Map<string, IProductSnapshot>()
  const afterMap = new Map<string, IUserProduct>()

  beforeProducts.forEach((p) => {
    const key = `${p.platform}:${p.productId}`
    beforeMap.set(key, p)
  })

  afterProducts.forEach((p) => {
    const key = `${p.platform}:${p.productId?.toString()}`
    afterMap.set(key, p)
  })

  // ✅ PRODUTOS REMOVIDOS
  beforeMap.forEach((beforeProduct, key) => {
    if (!afterMap.has(key)) {
      changes.push({
        changeType: 'PRODUCT_REMOVED',
        previousValue: beforeProduct.status,
        newValue: null,
        productId: beforeProduct.productId,
        productName: beforeProduct.productName,
        platform: beforeProduct.platform,
        significance: 'HIGH',
        description: `Removido do produto ${beforeProduct.productName}`
      })
    }
  })

  // ✅ PRODUTOS ADICIONADOS + ALTERAÇÕES EM PRODUTOS EXISTENTES
  afterMap.forEach((afterProduct, key) => {
    const beforeProduct = beforeMap.get(key)
    const productName = (afterProduct.productId as any)?.name || 'Produto desconhecido'

    // Produto novo
    if (!beforeProduct) {
      changes.push({
        changeType: 'PRODUCT_ADDED',
        previousValue: null,
        newValue: afterProduct.status,
        productId: afterProduct.productId?.toString(),
        productName,
        platform: afterProduct.platform,
        significance: 'HIGH',
        description: `Inscrito no produto ${productName}`
      })
      return
    }

    // ✅ COMPARAR ALTERAÇÕES NO PRODUTO EXISTENTE
    compareProductChanges(beforeProduct, afterProduct, productName, changes)
  })
}

// ═══════════════════════════════════════════════════════════════
// COMPARAÇÃO DE ALTERAÇÕES EM PRODUTO
// ═══════════════════════════════════════════════════════════════

function compareProductChanges(
  before: IProductSnapshot,
  after: IUserProduct,
  productName: string,
  changes: ChangeDetail[]
): void {
  const productId = after.productId?.toString()
  const platform = after.platform

  // 1️⃣ STATUS
  if (before.status !== after.status) {
    changes.push({
      changeType: 'PRODUCT_STATUS_CHANGE',
      field: 'status',
      previousValue: before.status,
      newValue: after.status,
      productId,
      productName,
      platform,
      significance: 'HIGH',
      description: `Status alterado de ${before.status} para ${after.status} em ${productName}`
    })
  }

  // 2️⃣ PROGRESSO
  const beforeProgress = before.progressPercentage || 0
  const afterProgress = after.progress?.percentage || 0

  if (afterProgress > beforeProgress) {
    const diff = afterProgress - beforeProgress
    changes.push({
      changeType: 'PROGRESS_INCREASE',
      field: 'progress.percentage',
      previousValue: beforeProgress,
      newValue: afterProgress,
      productId,
      productName,
      platform,
      significance: diff >= 10 ? 'HIGH' : 'MEDIUM',
      description: `Progresso aumentou de ${beforeProgress.toFixed(0)}% para ${afterProgress.toFixed(0)}% em ${productName}`
    })
  } else if (afterProgress < beforeProgress) {
    changes.push({
      changeType: 'PROGRESS_DECREASE',
      field: 'progress.percentage',
      previousValue: beforeProgress,
      newValue: afterProgress,
      productId,
      productName,
      platform,
      significance: 'MEDIUM',
      description: `Progresso diminuiu de ${beforeProgress.toFixed(0)}% para ${afterProgress.toFixed(0)}% em ${productName}`
    })
  }

  // 3️⃣ LIÇÕES COMPLETADAS
  const beforeLessons = before.completedLessons || 0
  const afterLessons = after.progress?.completed || 0

  if (afterLessons > beforeLessons) {
    const diff = afterLessons - beforeLessons
    changes.push({
      changeType: 'LESSONS_COMPLETED',
      field: 'progress.completed',
      previousValue: beforeLessons,
      newValue: afterLessons,
      productId,
      productName,
      platform,
      significance: diff >= 5 ? 'HIGH' : 'MEDIUM',
      description: `Completou ${diff} lições em ${productName} (${beforeLessons} → ${afterLessons})`
    })
  }

  // 4️⃣ ENGAGEMENT SCORE
  const beforeEngagement = before.engagementScore || 0
  const afterEngagement = after.engagement?.engagementScore || 0

  if (Math.abs(afterEngagement - beforeEngagement) >= 5) {
    changes.push({
      changeType: 'ENGAGEMENT_CHANGE',
      field: 'engagement.engagementScore',
      previousValue: beforeEngagement,
      newValue: afterEngagement,
      productId,
      productName,
      platform,
      significance: 'MEDIUM',
      description: `Engagement alterado de ${beforeEngagement.toFixed(0)} para ${afterEngagement.toFixed(0)} em ${productName}`
    })
  }

  // 5️⃣ TOTAL DE LOGINS
  const beforeLogins = before.totalLogins || 0
  const afterLogins = after.engagement?.totalLogins || 0

  if (afterLogins > beforeLogins) {
    const diff = afterLogins - beforeLogins
    changes.push({
      changeType: 'LOGIN_ACTIVITY',
      field: 'engagement.totalLogins',
      previousValue: beforeLogins,
      newValue: afterLogins,
      productId,
      productName,
      platform,
      significance: diff >= 10 ? 'HIGH' : 'LOW',
      description: `${diff} novos acessos em ${productName} (${beforeLogins} → ${afterLogins})`
    })
  }

  // 6️⃣ ÚLTIMA ATIVIDADE
  const beforeActivity = before.lastActivity ? new Date(before.lastActivity) : null
  const afterActivity = after.progress?.lastActivity ? new Date(after.progress.lastActivity) : null

  if (afterActivity && (!beforeActivity || afterActivity > beforeActivity)) {
    changes.push({
      changeType: 'LAST_ACTIVITY_UPDATE',
      field: 'progress.lastActivity',
      previousValue: beforeActivity,
      newValue: afterActivity,
      productId,
      productName,
      platform,
      significance: 'LOW',
      description: `Última atividade atualizada em ${productName}`
    })
  }

  // 7️⃣ TURMAS
  compareClasses(before, after, productName, changes)
}

// ═══════════════════════════════════════════════════════════════
// COMPARAÇÃO DE TURMAS
// ═══════════════════════════════════════════════════════════════

function compareClasses(
  before: IProductSnapshot,
  after: IUserProduct,
  productName: string,
  changes: ChangeDetail[]
): void {
  const beforeClasses = before.classes || []
  const afterClasses = after.classes || []

  const beforeMap = new Map(beforeClasses.map((c) => [c.classId, c]))
  const afterMap = new Map(afterClasses.map((c) => [c.classId, c]))

  // Turmas removidas
  beforeMap.forEach((beforeClass, classId) => {
    if (!afterMap.has(classId)) {
      changes.push({
        changeType: 'CLASS_REMOVED',
        previousValue: beforeClass.className,
        newValue: null,
        productId: before.productId,
        productName,
        platform: before.platform,
        significance: 'MEDIUM',
        description: `Removido da turma "${beforeClass.className}" em ${productName}`,
        metadata: { classId }
      })
    }
  })

  // Turmas adicionadas + mudanças de role
  afterMap.forEach((afterClass, classId) => {
    const beforeClass = beforeMap.get(classId)

    if (!beforeClass) {
      // Turma nova
      changes.push({
        changeType: 'CLASS_ADDED',
        previousValue: null,
        newValue: afterClass.className,
        productId: after.productId?.toString(),
        productName,
        platform: after.platform,
        significance: 'MEDIUM',
        description: `Adicionado à turma "${afterClass.className}" em ${productName}`,
        metadata: { classId, role: afterClass.role }
      })
    } else if (beforeClass.role !== afterClass.role) {
      // Mudança de role
      changes.push({
        changeType: 'CLASS_ROLE_CHANGE',
        previousValue: beforeClass.role,
        newValue: afterClass.role,
        productId: after.productId?.toString(),
        productName,
        platform: after.platform,
        significance: 'LOW',
        description: `Role alterado de "${beforeClass.role}" para "${afterClass.role}" na turma "${afterClass.className}"`,
        metadata: { classId }
      })
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// BUILD RESULT
// ═══════════════════════════════════════════════════════════════

function buildComparisonResult(changes: ChangeDetail[]): ComparisonResult {
  const changesByType: Record<string, number> = {}
  let highPriorityChanges = 0
  let mediumPriorityChanges = 0
  let lowPriorityChanges = 0

  changes.forEach((change) => {
    // Contar por tipo
    changesByType[change.changeType] = (changesByType[change.changeType] || 0) + 1

    // Contar por prioridade
    if (change.significance === 'HIGH') highPriorityChanges++
    else if (change.significance === 'MEDIUM') mediumPriorityChanges++
    else lowPriorityChanges++
  })

  return {
    hasChanges: changes.length > 0 && changes[0].changeType !== 'NO_CHANGES',
    changes,
    summary: {
      totalChanges: changes.length,
      highPriorityChanges,
      mediumPriorityChanges,
      lowPriorityChanges,
      changesByType: changesByType as Record<ChangeType, number>
    }
  }
}
