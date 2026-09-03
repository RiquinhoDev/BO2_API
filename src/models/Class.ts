// src/models/Class.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IClass extends Document {
  classId: string
  
  // 🆕 CAMPO CRÍTICO V2: Referência ao produto
  productId?: mongoose.Types.ObjectId  // Ref → Product
  
  // 🆕 CAMPOS CURSEDUCA
  curseducaId?: string      // ID numérico do Curseduca
  curseducaUuid?: string    // UUID do Curseduca
  
  name: string
  description?: string
  studentCount: number
  isActive: boolean
  estado: 'ativo' | 'inativo'
  source: 'hotmart_sync' | 'manual' | 'import' | 'curseduca_sync'  // 🆕 adicionar curseduca_sync
  lastSyncAt?: Date
  createdAt: Date
  updatedAt: Date
  stats?: {
    totalStudents: number
    activeStudents: number
    inactiveStudents: number
    lastMovement?: Date
  }
}

const ClassSchema = new Schema<IClass>({
  classId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  
  // 🆕 CAMPO CRÍTICO V2: Referência ao produto
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    index: true,
    sparse: true  // Opcional durante migração
  },
  
  // 🆕 NOVOS CAMPOS CURSEDUCA
  curseducaId: {
    type: String,
    trim: true,
    index: true,
    sparse: true  // Permite null, mas indexa quando existe
  },
  curseducaUuid: {
    type: String,
    trim: true,
    index: true,
    sparse: true
  },
  
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  studentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  estado: {
    type: String,
    enum: ['ativo', 'inativo'],
    default: 'ativo',
    index: true
  },
  source: {
    type: String,
    enum: ['hotmart_sync', 'manual', 'import', 'curseduca_sync'],  // 🆕 curseduca_sync
    default: 'manual',
    index: true
  },
  lastSyncAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  collection: 'classes'
})

// Índices compostos para melhor performance
ClassSchema.index({ isActive: 1, source: 1 })
ClassSchema.index({ isActive: 1, estado: 1 })
ClassSchema.index({ estado: 1, source: 1 })
ClassSchema.index({ name: 'text', description: 'text' })
ClassSchema.index({ createdAt: -1 })
ClassSchema.index({ updatedAt: -1 })

// 🆕 ÍNDICE COMPOSTO PARA CURSEDUCA
ClassSchema.index({ curseducaId: 1, curseducaUuid: 1 })
ClassSchema.index({ source: 1, curseducaUuid: 1 })

// 🆕 ÍNDICES V2: Para Product
ClassSchema.index({ productId: 1, isActive: 1 })
ClassSchema.index({ productId: 1, source: 1 })

// Métodos do modelo
ClassSchema.methods.updateStudentCount = async function() {
  const User = mongoose.model('User')
  const UserProduct = mongoose.model('UserProduct')

  // 🆕 Contar baseado na fonte da turma
  let count = 0

  if (this.source === 'curseduca_sync') {
    // ✅ CORRETO: Usar UserProduct com isPrimary=true para evitar duplicação
    // Isto garante que users com múltiplos produtos (Mensal + Anual) só contam 1x
    count = await UserProduct.countDocuments({
      platform: 'curseduca',
      isPrimary: true,
      status: 'ACTIVE',
      'classes': {
        $elemMatch: {
          classId: { $in: [this.classId, String(this.classId), Number(this.classId)] }
        }
      }
    })

    // 🔄 FALLBACK: Se não há UserProducts, tentar por User.curseduca (dados antigos)
    if (count === 0 && this.classId) {
      count = await User.countDocuments({
        'curseduca.groupId': this.classId,
        'curseduca.memberStatus': 'ACTIVE'
      })
    }
  } else {
    // Para outras turmas, usar classId (excluindo inativados manualmente)
    count = await User.countDocuments({
      classId: this.classId,
      status: 'ACTIVE',
      'inactivation.isManuallyInactivated': { $ne: true }
    })
  }

  this.studentCount = count
  await this.save()
  return count
}

ClassSchema.methods.getStats = async function() {
  const User = mongoose.model('User')

  let totalQuery: any = {
    classId: this.classId,
    'inactivation.isManuallyInactivated': { $ne: true }
  }
  let activeQuery: any = {
    classId: this.classId,
    status: 'ACTIVE',
    'inactivation.isManuallyInactivated': { $ne: true }
  }

  // 🆕 Ajustar queries para turmas Curseduca
  if (this.source === 'curseduca_sync') {
    // Tentar por UUID primeiro
    if (this.curseducaUuid) {
      totalQuery = {
        'curseduca.groupCurseducaUuid': this.curseducaUuid
      }
      activeQuery = {
        'curseduca.groupCurseducaUuid': this.curseducaUuid,
        'curseduca.memberStatus': 'ACTIVE'
      }
    } else if (this.classId) {
      // Fallback para groupId
      totalQuery = {
        'curseduca.groupId': this.classId
      }
      activeQuery = {
        'curseduca.groupId': this.classId,
        'curseduca.memberStatus': 'ACTIVE'
      }
    }
  }

  const [totalStudents, activeStudents] = await Promise.all([
    User.countDocuments(totalQuery),
    User.countDocuments(activeQuery)
  ])

  const lastMovement = await mongoose.model('ClassHistory').findOne(
    { classId: this.classId },
    {},
    { sort: { dateMoved: -1 } }
  )

  return {
    totalStudents,
    activeStudents,
    inactiveStudents: totalStudents - activeStudents,
    lastMovement: lastMovement?.dateMoved
  }
}

// Middleware pre-save
ClassSchema.pre('save', function(next) {
  if (this.isModified('name') || this.isModified('classId')) {
    this.name = this.name.trim()
    this.classId = this.classId.trim()
  }
  
  // Sincronizar isActive com estado
  if (this.isModified('isActive')) {
    this.estado = this.isActive ? 'ativo' : 'inativo'
  } else if (this.isModified('estado')) {
    this.isActive = this.estado === 'ativo'
  }
  
  next()
})

export const Class = mongoose.models.Class || mongoose.model<IClass>('Class', ClassSchema)

// ===== MODELO DE ESTUDANTE =====

export interface IStudent extends Document {
  _id: string
  name: string
  email: string
  classId?: string
  className?: string
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  discordIds: string[]
  hotmartId?: string
  enrollmentDate?: Date
  lastActivity?: Date
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const StudentSchema = new Schema<IStudent>({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  classId: {
    type: String,
    ref: 'Class',
    index: true
  },
  className: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    default: 'ACTIVE',
    index: true
  },
  discordIds: [{
    type: String,
    trim: true
  }],
  hotmartId: {
    type: String,
    trim: true,
    index: true
  },
  enrollmentDate: {
    type: Date,
    index: true
  },
  lastActivity: {
    type: Date,
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'students'
})

// Índices compostos
StudentSchema.index({ email: 1, status: 1 })
StudentSchema.index({ classId: 1, status: 1 })
StudentSchema.index({ discordIds: 1 })
StudentSchema.index({ name: 'text', email: 'text' })

export const Student = mongoose.model<IStudent>('Student', StudentSchema)

// ===== MODELO DE HISTÓRICO DE TURMAS =====

export interface IClassHistory extends Document {
  studentId: string
  studentEmail: string
  studentName: string
  classId: string
  className: string
  fromClassId?: string
  fromClassName?: string
  action: 'MOVE' | 'ENROLL' | 'REMOVE' | 'REACTIVATE'
  reason?: string
  dateMoved: Date
  performedBy?: string
  metadata?: Record<string, any>
  createdAt: Date
}

const ClassHistorySchema = new Schema<IClassHistory>({
  studentId: {
    type: String,
    required: true,
    index: true
  },
  studentEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  classId: {
    type: String,
    required: true,
    index: true
  },
  className: {
    type: String,
    required: true,
    trim: true
  },
  fromClassId: {
    type: String,
    index: true
  },
  fromClassName: {
    type: String,
    trim: true
  },
  action: {
    type: String,
    enum: ['MOVE', 'ENROLL', 'REMOVE', 'REACTIVATE'],
    required: true,
    index: true
  },
  reason: {
    type: String,
    trim: true
  },
  dateMoved: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  performedBy: {
    type: String,
    trim: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'class_history'
})

// Índices compostos para consultas otimizadas
ClassHistorySchema.index({ studentId: 1, dateMoved: -1 })
ClassHistorySchema.index({ classId: 1, dateMoved: -1 })
ClassHistorySchema.index({ studentEmail: 1, dateMoved: -1 })
ClassHistorySchema.index({ dateMoved: -1 })
ClassHistorySchema.index({ action: 1, dateMoved: -1 })

export const ClassHistory = mongoose.models.ClassHistory || mongoose.model<IClassHistory>('ClassHistory', ClassHistorySchema)

// ===== MODELO DE LISTAS DE INATIVAÇÃO =====
//
// Removido daqui a 2026-08-19. Havia dois modelos registados no mongoose com o
// mesmo nome 'InactivationList': este, ligado à colecção 'inactivation_lists',
// e o de models/InactivationList.ts, ligado a 'inactivationlists'. Quem grava
// é o segundo — este ficou sempre vazio (0 documentos), e como o controlador
// das estatísticas importava este, o Backoffice mostrava "0 concluídas · 0
// pendentes" tendo 98 e 2 na base.
//
// O schema daqui era também mais antigo (studentsAffected, results, estado
// 'REVERTED') e é contra ele que o Front ainda está escrito; a tradução para o
// vocabulário real ('students[]', 'REVERSED') é feita no getInactivationLists.
//
// Modelo único: src/models/InactivationList.ts

// ===== TIPOS E INTERFACES AUXILIARES =====

export interface ClassFilters {
  search?: string
  isActive?: boolean
  source?: string
  limit: number
  offset: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface ClassStats {
  totalClasses: number
  totalStudents: number
  activeClasses: number
  inactiveClasses: number
  recentMovements: number
  sourceBreakdown: {
    hotmart_sync: number
    manual: number
    import: number
    curseduca_sync: number  // 🆕
  }
  studentDistribution: {
    classId: string
    className: string
    studentCount: number
  }[]
}

export interface StudentMovement {
  studentId: string
  fromClassId?: string
  toClassId: string
  reason?: string
  performedBy?: string
}

export interface MovementResult {
  success: boolean
  studentId: string
  message: string
  movement?: IClassHistory
  error?: string
}

export interface SearchCriteria {
  email?: string
  name?: string
  discordId?: string
  classId?: string
  status?: string
  minProgress?: number
  maxProgress?: number
  minEngagement?: number
  maxEngagement?: number
}

// ===== FUNÇÕES AUXILIARES =====

/**
 * Valida o ID de uma turma
 * Aceita: letras, números, hífens, underscores e UUIDs
 */
export function validateClassId(classId: string): boolean {
  if (!classId || typeof classId !== 'string') {
    return false
  }
  
  // Aceitar UUIDs (para CursEduca) e classIds normais (Hotmart)
  // UUID: 8-4-4-4-12 caracteres hexadecimais separados por hífens
  // ClassId normal: letras, números, hífens e underscores
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const classIdRegex = /^[a-zA-Z0-9_-]+$/
  
  return uuidRegex.test(classId) || classIdRegex.test(classId)
}

/**
 * Normaliza o nome de uma turma
 * Remove espaços extras e capitaliza adequadamente
 */
export function normalizeClassName(name: string): string {
  if (!name || typeof name !== 'string') {
    return ''
  }
  
  // Remover espaços extras e trim
  return name.trim().replace(/\s+/g, ' ')
}