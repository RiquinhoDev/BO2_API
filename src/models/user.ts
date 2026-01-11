// src/models/user.ts - MODELO SEGREGADO POR FONTE DE DADOS
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IUser extends Document {
  // 🔑 CAMPOS PRINCIPAIS (ÚNICOS E IMUTÁVEIS)
  email: string // Chave única para identificar o utilizador
  name: string  // Nome pode ser atualizado pela fonte mais recente
  
  // 🎮 DADOS DO DISCORD (apenas Discord pode alterar)
  discord?: {
    discordIds: string[]
    acceptedTerms: boolean
    isDeletable: boolean
    isDeleted: boolean
    role: 'STUDENT' | 'ADMIN' | 'MODERATOR'
    priority: 'HIGH' | 'MEDIUM' | 'LOW'
    locale: string
    lastEditedBy: string
    lastEditedAt: Date
    createdAt: Date
  }
  
  // 🛒 DADOS DA HOTMART (apenas Hotmart pode alterar)
  hotmart?: {
    hotmartUserId: string
    purchaseDate: Date
    signupDate: Date
    plusAccess: 'WITH_PLUS_ACCESS' | 'WITHOUT_PLUS_ACCESS'
    firstAccessDate?: Date
    lastAccessDate: Date,
    // 🆕 NOVO: Turmas da Hotmart
    enrolledClasses?: Array<{
      classId: string
      className: string
      source: 'hotmart'
      isActive: boolean
      enrolledAt?: Date
    }>
    
    // Progresso específico da Hotmart
    progress: {
      totalTimeMinutes: number
      completedLessons: number
      lessonsData: Array<{
        lessonId: string
        title: string
        completed: boolean
        completedAt?: Date
        timeSpent: number
      }>
      lastAccessDate?: Date
    }
    
    // Engagement baseado em dados reais da Hotmart
    engagement: {
      accessCount: number
      engagementScore: number
      engagementLevel: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO' | 'NONE'
      calculatedAt: Date
    }
    
    // Metadados da sincronização
    lastSyncAt: Date
    syncVersion: string
  }
  
  // 🎓 DADOS DA CURSEDUCA (apenas CursedEuca pode alterar)
curseduca?: {
  // ═══════════════════════════════════════════════════════════
  // IDs DO MEMBRO
  // ═══════════════════════════════════════════════════════════
  curseducaUserId: string      // ID numérico do membro
  curseducaUuid?: string       // UUID do membro
  enrollmentsCount?: number    // 🆕 Quantos produtos tem
  
  // ═══════════════════════════════════════════════════════════
  // TURMAS (Array para múltiplas turmas)
  // ═══════════════════════════════════════════════════════════
  enrolledClasses?: Array<{
    classId: string        // UUID da turma
    className: string      
    curseducaId: string    // ID numérico
    curseducaUuid: string  // UUID
    enteredAt?: Date       // Data de entrada
    expiresAt?: Date       // Data de expiração
    isActive: boolean      
    role: 'student' | 'assistant' | 'teacher'
  }>

  // ═══════════════════════════════════════════════════════════
  // IDs DO GRUPO
  // ═══════════════════════════════════════════════════════════
  groupId: string               // UUID do grupo (identificador principal)
  groupName: string
  groupCurseducaId?: string     // ID numérico do grupo
  groupCurseducaUuid?: string   // UUID do grupo (mesmo que groupId)
  
  // ═══════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════
  memberStatus: 'ACTIVE' | 'INACTIVE'
  neverLogged: boolean
  situation?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'  // 🆕 Status detalhado
  
  // ═══════════════════════════════════════════════════════════
  // DATAS
  // ═══════════════════════════════════════════════════════════
  joinedDate: Date
  lastAccess: Date      // ✅ Mantido (retrocompatibilidade)
  lastLogin?: Date      // 🆕 Último login real (do /members/{id})
  
  // ═══════════════════════════════════════════════════════════
  // PROGRESSO
  // ═══════════════════════════════════════════════════════════
  progress: {
    estimatedProgress: number
    activityLevel: 'HIGH' | 'MEDIUM' | 'LOW'
    groupEngagement: number
    progressSource: 'estimated'
    lastActivity?: Date
  }
  
  // ═══════════════════════════════════════════════════════════
  // ENGAGEMENT
  // ═══════════════════════════════════════════════════════════
  engagement: {
    alternativeEngagement: number
    activityLevel: 'HIGH' | 'MEDIUM' | 'LOW'
    engagementLevel: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO' | 'NONE'
    calculatedAt: Date
  }
  
  // ═══════════════════════════════════════════════════════════
  // METADADOS DA SINCRONIZAÇÃO
  // ═══════════════════════════════════════════════════════════
  lastSyncAt: Date
  syncVersion: string
}
  
  // 📊 DADOS COMBINADOS (calculados automaticamente)
  combined?: {
    // Status geral (prioridade: Discord > Hotmart > CursedEuca)
    status: 'ACTIVE' | 'INACTIVE'
    
    // Progresso combinado
    totalProgress: number
    totalTimeMinutes: number
    totalLessons: number
    
    // Engagement combinado
    combinedEngagement: number
    bestEngagementSource: 'hotmart' | 'curseduca' | 'estimated'
    
    // 🆕 NOVO: Engagement detalhado (agregado de todas as plataformas)
    engagement?: {
      score: number
      level: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO'
      sources: {
        hotmart?: number
        curseduca?: number
      }
    }
    
    // 🆕 NOVO: Todas as turmas de todas as plataformas
    allClasses?: Array<{
      classId: string
      className: string
      source: 'hotmart' | 'curseduca'
      isActive: boolean
      enrolledAt?: Date
      role?: string
    }>
    
    // 🆕 NOVO: Turma principal (com prioridade)
    primaryClass?: {
      classId: string
      className: string
      source: 'hotmart' | 'curseduca'
    }
    
    // Turma (retrocompatibilidade - deprecated)
    classId?: string
    className?: string
    
    // Metadados
    lastActivity?: Date
    sourcesAvailable: ('discord' | 'hotmart' | 'curseduca')[]
    dataQuality: 'EXCELLENT' | 'GOOD' | 'BASIC' | 'LIMITED'
    calculatedAt: Date
  }
  
  // ⚙️ METADADOS GERAIS
  metadata: {
    createdAt: Date
    updatedAt: Date
    firstSystemEntry?: Date
      activeCampaignId?: string
    sources: {
      discord?: { lastSync: Date, version: string }
      hotmart?: { lastSync: Date, version: string }
      curseduca?: { lastSync: Date, version: string }
    }
  }
  
  // ════════════════════════════════════════════════════════════
  // 🔧 ACTIVE CAMPAIGN - Comunicação por curso
  // ════════════════════════════════════════════════════════════
communicationByCourse?: Map<string, {
  currentPhase: 'ENGAGEMENT' | 'REENGAGEMENT' | 'COMPLETION' | 'POST_COMPLETION'
  currentTags: string[]
  lastTagAppliedAt?: Date
  lastEmailSentAt?: Date

  emailStats: {
    totalSent: number
    totalOpened: number
    totalClicked: number
    engagementRate: number
  }

  courseSpecificData: {
    lastReportOpenedAt?: Date
    reportsOpenedLastWeek?: number
    reportsOpenedLastMonth?: number
    totalReportsOpened?: number
    lastModuleCompletedAt?: Date
    currentModule?: number
  }
}>

  // 🆕 INATIVAÇÃO MANUAL (para detetar renovações)
  inactivation?: {
    isManuallyInactivated: boolean    // Flag se foi inativado manualmente
    inactivatedAt?: Date              // Data da inativação
    inactivatedBy?: string            // Quem inativou (userId ou 'Sistema')
    reason?: string                   // Motivo da inativação
    platforms?: string[]              // Plataformas afetadas ['hotmart', 'curseduca', 'discord', 'all']
    classId?: string                  // Turma que causou a inativação (se aplicável)
    reactivatedAt?: Date              // Data da reativação (se aplicável)
    reactivatedBy?: string            // Quem reativou
    reactivationReason?: string       // Motivo ('manual', 'renewal_detected', 'sync')
  }

  // Métodos de instância
  calculateCombinedData(): void
  getDisplayProgress(): number
  getDisplayEngagement(): number
  isDataEstimated(): boolean
  getDataSourceInfo(): any
}

// Interface para métodos estáticos
interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>
  findByHotmartId(hotmartUserId: string): Promise<IUser | null>
  findByCurseducaId(curseducaUserId: string): Promise<IUser | null>
  findByCurseducaUuid(curseducaUuid: string): Promise<IUser | null>  // 🆕
  findByDiscordId(discordId: string): Promise<IUser | null>
  getDataSourceStats(): Promise<any>
  getEnhancedUsersList(filters?: any): Promise<any[]>
  getSourceStatistics(): Promise<any[]>
}

const UserSchema: Schema = new Schema({
  // Campos principais
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    trim: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  
  // Dados do Discord
  discord: {
    discordIds: [{ type: String }],
    acceptedTerms: { type: Boolean, default: false },
    isDeletable: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    role: { 
      type: String, 
      enum: ['STUDENT', 'ADMIN', 'MODERATOR'], 
      default: 'STUDENT' 
    },
    priority: { 
      type: String, 
      enum: ['HIGH', 'MEDIUM', 'LOW'], 
      default: 'MEDIUM' 
    },
    locale: { type: String, default: 'pt_BR' },
    lastEditedBy: String,
    lastEditedAt: Date,
    createdAt: Date
  },
  
  // Dados da Hotmart
  hotmart: {
    hotmartUserId: { type: String },
    purchaseDate: Date,
    signupDate: Date,
    plusAccess: { 
      type: String, 
      enum: ['WITH_PLUS_ACCESS', 'WITHOUT_PLUS_ACCESS'],
      default: 'WITHOUT_PLUS_ACCESS'
    },
    firstAccessDate: Date,
      lastAccessDate: Date,
    // 🆕 NOVO: Turmas da Hotmart
    enrolledClasses: [{
      classId: { type: String },
      className: { type: String },
      source: { type: String, default: 'hotmart' },
      isActive: { type: Boolean, default: true },
      enrolledAt: { type: Date }
    }],
    
    progress: {
      totalTimeMinutes: { type: Number, default: 0 },
      completedLessons: { type: Number, default: 0 },
      lessonsData: [{
        lessonId: String,
        title: String,
        completed: { type: Boolean, default: false },
        completedAt: Date,
        timeSpent: { type: Number, default: 0 }
      }],
      lastAccessDate: Date
    },
    
    engagement: {
      accessCount: { type: Number, default: 0 },
      engagementScore: { type: Number, default: 0 },
      engagementLevel: { 
        type: String, 
        enum: ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO', 'NONE'],
        default: 'NONE'
      },
      calculatedAt: { type: Date, default: Date.now }
    },
    
    lastSyncAt: { type: Date, default: Date.now },
    syncVersion: { type: String, default: '1.0' }
  },
  
  // 🎓 Dados da CursedEuca - ATUALIZADOS
// 🎓 Dados da CursedEuca - CORRIGIDOS
curseduca: {
  // ═══════════════════════════════════════════════════════════
  // IDs DO MEMBRO
  // ═══════════════════════════════════════════════════════════
  curseducaUserId: { 
    type: String, 
    trim: true
    // Índice definido em UserSchema.index() na linha ~866
  },
  curseducaUuid: { 
    type: String, 
    trim: true,
    sparse: true
    // Índice definido em UserSchema.index() na linha ~867
  },
  enrollmentsCount: { 
    type: Number, 
    default: 0 
  },  // 🆕 Quantos produtos tem
  
  // ═══════════════════════════════════════════════════════════
  // TURMAS (Array para múltiplas turmas)
  // ═══════════════════════════════════════════════════════════
  enrolledClasses: [{
    classId: { type: String, trim: true },
    className: { type: String },      
    curseducaId: { type: String },
    curseducaUuid: { type: String },
    enteredAt: { type: Date },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },      
    role: {
      type: String,
      enum: ['student', 'assistant', 'teacher'],
      default: 'student'
    }
  }],
  
  // ═══════════════════════════════════════════════════════════
  // IDs DO GRUPO
  // ═══════════════════════════════════════════════════════════
  groupId: { 
    type: String, 
    trim: true
  },
  groupName: String,
  groupCurseducaId: { 
    type: String, 
    trim: true,
    sparse: true
    // Índice definido em UserSchema.index() na linha ~869
  },
  groupCurseducaUuid: { 
    type: String, 
    trim: true,
    sparse: true
    // Índice definido em UserSchema.index() na linha ~868
  },
  
  // ═══════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════
  memberStatus: { 
    type: String, 
    enum: ['ACTIVE', 'INACTIVE'], 
    default: 'ACTIVE' 
  },
  neverLogged: { 
    type: Boolean, 
    default: false 
  },
  situation: {  // 🆕 Status detalhado
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    default: 'ACTIVE'
  },
  
  // ═══════════════════════════════════════════════════════════
  // DATAS
  // ═══════════════════════════════════════════════════════════
  joinedDate: Date,
  lastAccess: Date,      // ✅ Mantido (retrocompatibilidade)
  lastLogin: Date,       // 🆕 Último login real
  
  // ═══════════════════════════════════════════════════════════
  // PROGRESSO
  // ═══════════════════════════════════════════════════════════
  progress: {
    estimatedProgress: { type: Number, default: 0 },
    activityLevel: { 
      type: String, 
      enum: ['HIGH', 'MEDIUM', 'LOW'], 
      default: 'LOW' 
    },
    groupEngagement: { type: Number, default: 0 },
    progressSource: { 
      type: String, 
      enum: ['estimated'], 
      default: 'estimated' 
    },
    lastActivity: Date
  },
  
  // ═══════════════════════════════════════════════════════════
  // ENGAGEMENT
  // ═══════════════════════════════════════════════════════════
  engagement: {
    alternativeEngagement: { type: Number, default: 0 },
    activityLevel: { 
      type: String, 
      enum: ['HIGH', 'MEDIUM', 'LOW'], 
      default: 'LOW' 
    },
    engagementLevel: { 
      type: String, 
      enum: ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO', 'NONE'],
      default: 'NONE'
    },
    calculatedAt: { type: Date, default: Date.now }
  },
  
  // ═══════════════════════════════════════════════════════════
  // METADADOS DA SINCRONIZAÇÃO
  // ═══════════════════════════════════════════════════════════
  lastSyncAt: { type: Date, default: Date.now },
  syncVersion: { type: String, default: '3.0' }
},

  
  // Dados combinados (calculados automaticamente)
  combined: {
    status: { 
      type: String, 
      enum: ['ACTIVE', 'INACTIVE'], 
      default: 'ACTIVE' 
    },
    
    totalProgress: { type: Number, default: 0 },
    totalTimeMinutes: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    
    combinedEngagement: { type: Number, default: 0 },
    bestEngagementSource: { 
      type: String, 
      enum: ['hotmart', 'curseduca', 'estimated'],
      default: 'estimated'
    },
    
    // 🆕 NOVO: Engagement detalhado (agregado de todas as plataformas)
    engagement: {
      score: { type: Number, default: 0 },
      level: { 
        type: String, 
        enum: ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO'],
        default: 'MUITO_BAIXO'
      },
      sources: {
        hotmart: { type: Number, default: 0 },
        curseduca: { type: Number, default: 0 }
      }
    },
    
    // 🆕 NOVO: Todas as turmas de todas as plataformas
    allClasses: [{
      classId: { type: String },
      className: { type: String },
      source: { 
        type: String, 
        enum: ['hotmart', 'curseduca'] 
      },
      isActive: { type: Boolean, default: true },
      enrolledAt: { type: Date },
      role: { type: String }
    }],
    
    // 🆕 NOVO: Turma principal
    primaryClass: {
      classId: { type: String },
      className: { type: String },
      source: { 
        type: String, 
        enum: ['hotmart', 'curseduca'] 
      }
    },
    
    // Retrocompatibilidade (deprecated)
    classId: String,
    className: String,
    
    lastActivity: Date,
    sourcesAvailable: [{ 
      type: String, 
      enum: ['discord', 'hotmart', 'curseduca'] 
    }],
    dataQuality: { 
      type: String, 
      enum: ['EXCELLENT', 'GOOD', 'BASIC', 'LIMITED'],
      default: 'LIMITED'
    },
    calculatedAt: { type: Date, default: Date.now }
  },
  
  // Metadados
  metadata: {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    firstSystemEntry: { 
    type: Date,
    description: 'Data da primeira entrada do user no sistema (calculada automaticamente)'
    },
    activeCampaignId: { type: String },
    sources: {
      discord: {
        lastSync: Date,
        version: String
      },
      hotmart: {
        lastSync: Date,
        version: String
      },
      curseduca: {
        lastSync: Date,
        version: String
      }
    }
  },
  
  // ════════════════════════════════════════════════════════════
  // 🔧 ACTIVE CAMPAIGN - Comunicação por curso
  // ════════════════════════════════════════════════════════════
  communicationByCourse: {
    type: Map,
    of: {
      currentPhase: {
        type: String,
        enum: ['ENGAGEMENT', 'REENGAGEMENT', 'COMPLETION', 'POST_COMPLETION'],
        default: 'ENGAGEMENT'
      },
      currentTags: [{ type: String }],
      lastTagAppliedAt: { type: Date },
      lastEmailSentAt: { type: Date },
      
      emailStats: {
        totalSent: { type: Number, default: 0 },
        totalOpened: { type: Number, default: 0 },
        totalClicked: { type: Number, default: 0 },
        engagementRate: { type: Number, default: 0 }
      },
      
      courseSpecificData: {
        lastReportOpenedAt: { type: Date },
        reportsOpenedLastWeek: { type: Number, default: 0 },
        reportsOpenedLastMonth: { type: Number, default: 0 },
        totalReportsOpened: { type: Number, default: 0 },
        lastModuleCompletedAt: { type: Date },
        currentModule: { type: Number }
      }
    },
    default: {}
  },

  // 🆕 INATIVAÇÃO MANUAL (para detetar renovações)
  inactivation: {
    isManuallyInactivated: { type: Boolean, default: false },
    inactivatedAt: { type: Date },
    inactivatedBy: { type: String },
    reason: { type: String },
    platforms: [{ type: String, enum: ['hotmart', 'curseduca', 'discord', 'all'] }],
    classId: { type: String },
    reactivatedAt: { type: Date },
    reactivatedBy: { type: String },
    reactivationReason: { type: String, enum: ['manual', 'renewal_detected', 'sync'] }
  }

}, {
  timestamps: false,
  collection: 'users'
})

// 🔄 MIDDLEWARE PARA NORMALIZAR EMAIL E CALCULAR DADOS COMBINADOS
UserSchema.pre<IUser>('save', function(next) {
  // ✅ NORMALIZAR EMAIL PARA LOWERCASE
  if (this.email) {
    this.email = this.email.toLowerCase().trim()
  }
  
  if (this.metadata) {
    this.metadata.updatedAt = new Date()
  } else {
    this.metadata = {
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: {}
    }
  }
  
  this.calculateCombinedData()
  next()
})

// 📊 MÉTODO PARA CALCULAR DADOS COMBINADOS
UserSchema.methods.calculateCombinedData = function(this: IUser) {
  const sourcesAvailable: ('discord' | 'hotmart' | 'curseduca')[] = []
  
  if (this.discord) sourcesAvailable.push('discord')
  if (this.hotmart) sourcesAvailable.push('hotmart')
  if (this.curseduca) sourcesAvailable.push('curseduca')
  
  let status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
  if (this.discord?.isDeleted) status = 'INACTIVE'
  else if (this.curseduca?.memberStatus === 'INACTIVE') status = 'INACTIVE'
  
  let totalProgress = 0
  let totalTimeMinutes = 0
  let totalLessons = 0
  
  // ✅ CALCULAR PROGRESSO CORRETAMENTE usando lições, não tempo
  if (this.hotmart?.progress) {
    const hotmartProgress = this.hotmart.progress
    totalTimeMinutes += hotmartProgress.totalTimeMinutes || 0
    
    // ✅ CORRETO: Usar lessonsData.length (total de lições)
    if (hotmartProgress.lessonsData && hotmartProgress.lessonsData.length > 0) {
      const completed = hotmartProgress.completedLessons || 0
      const total = hotmartProgress.lessonsData.length
      totalLessons = total
      totalProgress = Math.round((completed / total) * 100)
    }
  }
  
  // Usar Curseduca como fallback apenas se Hotmart não tiver dados
  if (this.curseduca?.progress && totalProgress === 0) {
    totalProgress = this.curseduca.progress.estimatedProgress || 0
  }
  
  // ✅ CALCULAR ENGAGEMENT COMBINADO (agregado de todas as plataformas)
  let combinedEngagement = 0
  let bestEngagementSource: 'hotmart' | 'curseduca' | 'estimated' = 'estimated'
  
  const hotmartScore = this.hotmart?.engagement?.engagementScore || 0
  const curseducaScore = this.curseduca?.engagement?.alternativeEngagement || 0
  
  // Usar o maior score disponível para retrocompatibilidade
  if (hotmartScore > 0) {
    combinedEngagement = hotmartScore
    bestEngagementSource = 'hotmart'
  } else if (curseducaScore > 0) {
    combinedEngagement = curseducaScore
    bestEngagementSource = 'curseduca'
  }
  
  // 🆕 CALCULAR ENGAGEMENT AGREGADO (média se ambos existirem)
  let avgEngagementScore = 0
  let engagementCount = 0
  
  if (hotmartScore > 0) {
    avgEngagementScore += hotmartScore
    engagementCount++
  }
  
  if (curseducaScore > 0) {
    avgEngagementScore += curseducaScore
    engagementCount++
  }
  
  avgEngagementScore = engagementCount > 0 
    ? Math.round(avgEngagementScore / engagementCount) 
    : 0
  
  // Determinar nível combinado baseado no score médio
  let engagementLevel: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO' = 'MUITO_BAIXO'
  if (avgEngagementScore >= 80) engagementLevel = 'MUITO_ALTO'
  else if (avgEngagementScore >= 60) engagementLevel = 'ALTO'
  else if (avgEngagementScore >= 40) engagementLevel = 'MEDIO'
  else if (avgEngagementScore >= 25) engagementLevel = 'BAIXO'
  
  // 🆕 AGREGAR TURMAS DE TODAS AS PLATAFORMAS
  const allClasses: any[] = []
  
  // Turmas da Hotmart
  if (this.hotmart?.enrolledClasses && Array.isArray(this.hotmart.enrolledClasses)) {
    this.hotmart.enrolledClasses.forEach(cls => {
      allClasses.push({
        classId: cls.classId,
        className: cls.className,
        source: 'hotmart',
        isActive: cls.isActive,
        enrolledAt: cls.enrolledAt
      })
    })
  }
  
  // Turmas do Curseduca
  if (this.curseduca?.enrolledClasses && Array.isArray(this.curseduca.enrolledClasses)) {
    this.curseduca.enrolledClasses.forEach(cls => {
      allClasses.push({
        classId: cls.classId,
        className: cls.className,
        source: 'curseduca',
        isActive: cls.isActive,
        enrolledAt: cls.enteredAt,
        role: cls.role
      })
    })
  }
  
  // 🆕 DEFINIR TURMA PRINCIPAL (prioridade: Hotmart > Curseduca)
  let primaryClass: any = undefined
  let classId: string | undefined = undefined
  let className: string | undefined = undefined
  
  // Priorizar turma ativa da Hotmart
  const hotmartActiveClass = allClasses.find(c => c.source === 'hotmart' && c.isActive)
  if (hotmartActiveClass) {
    primaryClass = {
      classId: hotmartActiveClass.classId,
      className: hotmartActiveClass.className,
      source: 'hotmart'
    }
    classId = hotmartActiveClass.classId
    className = hotmartActiveClass.className
  } else {
    // Senão, usar primeira turma ativa do Curseduca
    const curseducaActiveClass = allClasses.find(c => c.source === 'curseduca' && c.isActive)
    if (curseducaActiveClass) {
      primaryClass = {
        classId: curseducaActiveClass.classId,
        className: curseducaActiveClass.className,
        source: 'curseduca'
      }
      classId = curseducaActiveClass.classId
      className = curseducaActiveClass.className
    }
  }
  
  let dataQuality: 'EXCELLENT' | 'GOOD' | 'BASIC' | 'LIMITED' = 'LIMITED'
  if (this.hotmart && this.curseduca) dataQuality = 'EXCELLENT'
  else if (this.hotmart) dataQuality = 'GOOD'
  else if (this.curseduca) dataQuality = 'BASIC'
  
  let lastActivity = this.metadata?.createdAt || new Date()
  if (this.hotmart?.progress?.lastAccessDate) {
    lastActivity = this.hotmart.progress.lastAccessDate
  } else if (this.curseduca?.joinedDate) {
    lastActivity = this.curseduca.joinedDate
  }
  
  this.combined = {
    status,
    totalProgress: Math.round(totalProgress),
    totalTimeMinutes: Math.round(totalTimeMinutes),
    totalLessons,
    combinedEngagement: Math.round(combinedEngagement),
    bestEngagementSource,
    // 🆕 NOVO: Engagement detalhado agregado
    engagement: {
      score: avgEngagementScore,
      level: engagementLevel,
      sources: {
        hotmart: hotmartScore,
        curseduca: curseducaScore
      }
    },
    allClasses,           // 🆕 NOVO
    primaryClass,         // 🆕 NOVO
    classId,              // Retrocompatibilidade
    className,            // Retrocompatibilidade
    lastActivity,
    sourcesAvailable,
    dataQuality,
    calculatedAt: new Date()
  }
}

// 📊 MÉTODOS DE INSTÂNCIA ADICIONAIS
UserSchema.methods.getDisplayProgress = function(this: IUser): number {
  return this.combined?.totalProgress || this.curseduca?.progress?.estimatedProgress || 0
}

UserSchema.methods.getDisplayEngagement = function(this: IUser): number {
  return this.combined?.combinedEngagement || 0
}

UserSchema.methods.isDataEstimated = function(this: IUser): boolean {
  return this.curseduca?.progress?.progressSource === 'estimated' || !this.hotmart
}

UserSchema.methods.getDataSourceInfo = function(this: IUser) {
  const sources = this.combined?.sourcesAvailable || []
  return {
    primary: sources.includes('hotmart') ? 'hotmart' : sources.includes('curseduca') ? 'curseduca' : 'discord',
    available: sources,
    quality: this.combined?.dataQuality || 'LIMITED',
    hasRealData: sources.includes('hotmart'),
    hasEstimatedData: sources.includes('curseduca')
  }
}

// 🔍 MÉTODOS DE BUSCA
UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase().trim() })
}

UserSchema.statics.findByHotmartId = function(hotmartUserId: string) {
  return this.findOne({ 'hotmart.hotmartUserId': hotmartUserId })
}

UserSchema.statics.findByCurseducaId = function(curseducaUserId: string) {
  return this.findOne({ 'curseduca.curseducaUserId': curseducaUserId })
}

// 🆕 NOVO MÉTODO: Buscar por UUID do Curseduca
UserSchema.statics.findByCurseducaUuid = function(curseducaUuid: string) {
  return this.findOne({ 'curseduca.curseducaUuid': curseducaUuid })
}

UserSchema.statics.findByDiscordId = function(discordId: string) {
  return this.findOne({ 'discord.discordIds': discordId })
}

// 📊 MÉTODOS DE ESTATÍSTICAS
UserSchema.statics.getSourceStatistics = async function() {
  return this.aggregate([
    {
      $project: {
        hasDiscord: { $cond: [{ $ifNull: ['$discord', false] }, 1, 0] },
        hasHotmart: { $cond: [{ $ifNull: ['$hotmart', false] }, 1, 0] },
        hasCurseduca: { $cond: [{ $ifNull: ['$curseduca', false] }, 1, 0] },
        dataQuality: '$combined.dataQuality'
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        withDiscord: { $sum: '$hasDiscord' },
        withHotmart: { $sum: '$hasHotmart' },
        withCurseduca: { $sum: '$hasCurseduca' },
        excellent: { $sum: { $cond: [{ $eq: ['$dataQuality', 'EXCELLENT'] }, 1, 0] } },
        good: { $sum: { $cond: [{ $eq: ['$dataQuality', 'GOOD'] }, 1, 0] } },
        basic: { $sum: { $cond: [{ $eq: ['$dataQuality', 'BASIC'] }, 1, 0] } },
        limited: { $sum: { $cond: [{ $eq: ['$dataQuality', 'LIMITED'] }, 1, 0] } }
      }
    }
  ])
}

UserSchema.statics.getDataSourceStats = async function() {
  const [hotmartStats, curseducaStats] = await Promise.all([
    this.aggregate([
      { $match: { hotmart: { $exists: true } } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: { $sum: { $cond: [{ $eq: ['$combined.status', 'ACTIVE'] }, 1, 0] } },
          averageEngagement: { $avg: '$hotmart.engagement.engagementScore' },
          averageProgress: { $avg: '$combined.totalProgress' }
        }
      }
    ]),
    this.aggregate([
      { $match: { curseduca: { $exists: true } } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: { $sum: { $cond: [{ $eq: ['$curseduca.memberStatus', 'ACTIVE'] }, 1, 0] } },
          averageEstimatedProgress: { $avg: '$curseduca.progress.estimatedProgress' },
          averageAlternativeEngagement: { $avg: '$curseduca.engagement.alternativeEngagement' }
        }
      }
    ])
  ])
  
  return {
    hotmart: hotmartStats[0] || { totalUsers: 0, activeUsers: 0, averageEngagement: 0, averageProgress: 0 },
    curseduca: curseducaStats[0] || { totalUsers: 0, activeUsers: 0, averageEstimatedProgress: 0, averageAlternativeEngagement: 0 }
  }
}

UserSchema.statics.getEnhancedUsersList = async function(filters = {}) {
  const query = { ...filters }
  
  return this.find(query)
    .sort({ 'metadata.updatedAt': -1, 'combined.combinedEngagement': -1 })
    .lean()
    .then((users: any[]) => users.map(user => ({
      ...user,
      displayProgress: user.combined?.totalProgress || user.curseduca?.progress?.estimatedProgress || 0,
      displayEngagement: user.combined?.combinedEngagement || 0,
      isEstimated: !user.hotmart || user.curseduca?.progress?.progressSource === 'estimated',
      sourceInfo: {
        primary: user.hotmart ? 'hotmart' : user.curseduca ? 'curseduca' : 'discord',
        available: user.combined?.sourcesAvailable || [],
        quality: user.combined?.dataQuality || 'LIMITED'
      }
    })))
}

// 🆕 ÍNDICES ATUALIZADOS para Curseduca
// Nota: email já tem índice automático via unique: true
UserSchema.index({ 'discord.discordIds': 1 })
UserSchema.index({ 'hotmart.hotmartUserId': 1 })
UserSchema.index({ 'curseduca.curseducaUserId': 1 })
UserSchema.index({ 'curseduca.curseducaUuid': 1 })  // 🆕 UUID do membro
UserSchema.index({ 'curseduca.groupCurseducaUuid': 1 })  // 🆕 UUID do grupo
UserSchema.index({ 'curseduca.groupCurseducaId': 1 })  // 🆕 ID numérico do grupo
UserSchema.index({ 'combined.dataQuality': 1 })
UserSchema.index({ 'combined.combinedEngagement': -1 })
UserSchema.index({ 'metadata.updatedAt': -1 })

// 🔧 VERIFICAR SE MODELO JÁ EXISTE ANTES DE CRIAR
let UserModel: IUserModel

try {
  UserModel = mongoose.model<IUser, IUserModel>('User')
  console.log('♻️ Modelo User já existe, reutilizando...')
} catch (error) {
  UserModel = mongoose.model<IUser, IUserModel>('User', UserSchema)
  console.log('✅ Novo modelo User criado com estrutura segregada')
}

export default UserModel