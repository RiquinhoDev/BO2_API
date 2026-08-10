// src/models/Class.ts
import mongoose, {
  Schema,
  Document,
  type HydratedDocument,
} from 'mongoose'

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

export const Class: mongoose.Model<IClass> = mongoose.models.Class || mongoose.model<IClass>('Class', ClassSchema)
