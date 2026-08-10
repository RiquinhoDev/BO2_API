import { Schema } from 'mongoose'

export const userSchemaDefinition: Schema = new Schema({
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
  // Compatibilidade com os fluxos legacy de gestÃ£o/movimento de turmas.
  classId: { type: String, trim: true },
  className: { type: String, trim: true },
  
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
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
    },
    purchaseDate: Date,
    signupDate: Date,
    plusAccess: { 
      type: String, 
      enum: ['WITH_PLUS_ACCESS', 'WITHOUT_PLUS_ACCESS'],
      default: 'WITHOUT_PLUS_ACCESS'
    },
    firstAccessDate: Date,
      lastAccessDate: Date,
    // ðŸ†• NOVO: Turmas da Hotmart
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
  
  // ðŸŽ“ Dados da CursedEuca - ATUALIZADOS
// ðŸŽ“ Dados da CursedEuca - CORRIGIDOS
curseduca: {
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // IDs DO MEMBRO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  curseducaUserId: { 
    type: String, 
    trim: true
    // Ãndice definido em UserSchema.index() na linha ~866
  },
  curseducaUuid: { 
    type: String, 
    trim: true,
    sparse: true
    // Ãndice definido em UserSchema.index() na linha ~867
  },
  enrollmentsCount: { 
    type: Number, 
    default: 0 
  },  // ðŸ†• Quantos produtos tem
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TURMAS (Array para mÃºltiplas turmas)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // IDs DO GRUPO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  groupId: { 
    type: String, 
    trim: true
  },
  groupName: String,
  groupCurseducaId: { 
    type: String, 
    trim: true,
    sparse: true
    // Ãndice definido em UserSchema.index() na linha ~869
  },
  groupCurseducaUuid: { 
    type: String, 
    trim: true,
    sparse: true
    // Ãndice definido em UserSchema.index() na linha ~868
  },
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // STATUS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  memberStatus: { 
    type: String, 
    enum: ['ACTIVE', 'INACTIVE'], 
    default: 'ACTIVE' 
  },
  neverLogged: { 
    type: Boolean, 
    default: false 
  },
  situation: {  // ðŸ†• Status detalhado
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    default: 'ACTIVE'
  },
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DATAS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  joinedDate: Date,
  lastAccess: Date,      // âœ… Mantido (retrocompatibilidade)
  lastLogin: Date,       // ðŸ†• Ãšltimo login real
  inactivatedAt: Date,
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PROGRESSO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ENGAGEMENT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // METADADOS DA SINCRONIZAÃ‡ÃƒO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  lastSyncAt: { type: Date, default: Date.now },
  syncVersion: { type: String, default: '3.0' }
},

  // ðŸ’° Dados da Guru
  guru: {
    // Identificadores
    guruContactId: { type: String, sparse: true },
    subscriptionCode: { type: String, sparse: true },

    // Status e datas
    status: {
      type: String,
      enum: ['active', 'pastdue', 'canceled', 'expired', 'pending', 'refunded', 'suspended', 'trial'],
      default: 'pending'
    },
    updatedAt: { type: Date },
    nextCycleAt: { type: Date },

    // Produto/Oferta
    offerId: { type: String },
    productId: { type: String },

    // Pagamento
    paymentUrl: { type: String },

    // Trial
    isTrial: { type: Boolean, default: false },
    trialStartedAt: { type: Date },
    trialFinishedAt: { type: Date },
    trialConvertedAt: { type: Date },

    // Metadados
    lastSyncAt: { type: Date, default: Date.now },
    syncVersion: { type: String, default: '1.0' },
    lastWebhookAt: { type: Date }
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
    
    // ðŸ†• NOVO: Engagement detalhado (agregado de todas as plataformas)
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
    
    // ðŸ†• NOVO: Todas as turmas de todas as plataformas
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
    
    // ðŸ†• NOVO: Turma principal
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
      enum: ['discord', 'hotmart', 'curseduca', 'guru']
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
      },
      guru: {
        lastSync: Date,
        version: String
      }
    }
  },
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸ”§ ACTIVE CAMPAIGN - ComunicaÃ§Ã£o por curso
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  // ðŸ† CONQUISTAS
  engagement: {
    streak: {
      current: { type: Number, default: 0 },
      best: { type: Number, default: 0 },
      lastActiveDay: { type: String },
      updatedAt: { type: Date }
    }
  },

  achievements: [{
    id: { type: String, required: true },
    unlockedAt: { type: Date, default: null },
    seenAt: { type: Date, default: null },
    progress: {
      current: { type: Number },
      target: { type: Number }
    }
  }],

  achievementStats: {
    total: { type: Number, default: 26 },
    unlocked: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    lastEvaluatedAt: { type: Date }
  },

  // ðŸ†• INATIVAÃ‡ÃƒO MANUAL (para detetar renovaÃ§Ãµes)
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
