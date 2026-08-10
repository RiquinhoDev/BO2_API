import { Document, Model } from 'mongoose'

export interface IUser extends Document {
  // ðŸ”‘ CAMPOS PRINCIPAIS (ÃšNICOS E IMUTÃVEIS)
  email: string // Chave Ãºnica para identificar o utilizador
  name: string  // Nome pode ser atualizado pela fonte mais recente
  createdAt?: Date
  updatedAt?: Date
  // Compatibilidade com os fluxos legacy de gestÃ£o/movimento de turmas.
  classId?: string
  className?: string
  
  // ðŸŽ® DADOS DO DISCORD (apenas Discord pode alterar)
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
  
  // ðŸ›’ DADOS DA HOTMART (apenas Hotmart pode alterar)
  hotmart?: {
    hotmartUserId: string
    status?: 'ACTIVE' | 'INACTIVE'
    purchaseDate: Date
    signupDate: Date
    plusAccess: 'WITH_PLUS_ACCESS' | 'WITHOUT_PLUS_ACCESS'
    firstAccessDate?: Date
    lastAccessDate: Date,
    // ðŸ†• NOVO: Turmas da Hotmart
    enrolledClasses?: Array<{
      classId: string
      className: string
      source: 'hotmart'
      isActive: boolean
      enrolledAt?: Date
    }>
    
    // Progresso especÃ­fico da Hotmart
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
    
    // Metadados da sincronizaÃ§Ã£o
    lastSyncAt: Date
    syncVersion: string
  }
  
  // ðŸŽ“ DADOS DA CURSEDUCA (apenas CursedEuca pode alterar)
curseduca?: {
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // IDs DO MEMBRO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  curseducaUserId: string      // ID numÃ©rico do membro
  curseducaUuid?: string       // UUID do membro
  enrollmentsCount?: number    // ðŸ†• Quantos produtos tem
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TURMAS (Array para mÃºltiplas turmas)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  enrolledClasses?: Array<{
    classId: string        // UUID da turma
    className: string      
    curseducaId: string    // ID numÃ©rico
    curseducaUuid: string  // UUID
    enteredAt?: Date       // Data de entrada
    expiresAt?: Date       // Data de expiraÃ§Ã£o
    isActive: boolean      
    role: 'student' | 'assistant' | 'teacher'
  }>

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // IDs DO GRUPO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  groupId: string               // UUID do grupo (identificador principal)
  groupName: string
  groupCurseducaId?: string     // ID numÃ©rico do grupo
  groupCurseducaUuid?: string   // UUID do grupo (mesmo que groupId)
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // STATUS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  memberStatus: 'ACTIVE' | 'INACTIVE'
  neverLogged: boolean
  situation?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'  // ðŸ†• Status detalhado
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DATAS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  joinedDate: Date
  lastAccess: Date      // âœ… Mantido (retrocompatibilidade)
  lastLogin?: Date      // ðŸ†• Ãšltimo login real (do /members/{id})
  inactivatedAt?: Date
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PROGRESSO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  progress: {
    estimatedProgress: number
    activityLevel: 'HIGH' | 'MEDIUM' | 'LOW'
    groupEngagement: number
    progressSource: 'estimated'
    lastActivity?: Date
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ENGAGEMENT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  engagement: {
    alternativeEngagement: number
    activityLevel: 'HIGH' | 'MEDIUM' | 'LOW'
    engagementLevel: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO' | 'NONE'
    calculatedAt: Date
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // METADADOS DA SINCRONIZAÃ‡ÃƒO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  lastSyncAt: Date
  syncVersion: string
}

  // ðŸ’° DADOS DA GURU (apenas Guru pode alterar)
  guru?: {
    // Identificadores
    guruContactId: string
    subscriptionCode: string

    // Status e datas
    status: 'active' | 'pastdue' | 'canceled' | 'expired' | 'pending' | 'refunded' | 'suspended' | 'trial'
    updatedAt: Date
    nextCycleAt?: Date

    // Produto/Oferta
    offerId?: string
    productId?: string

    // Pagamento
    paymentUrl?: string

    // Trial
    isTrial: boolean
    trialStartedAt?: Date
    trialFinishedAt?: Date
    trialConvertedAt?: Date

    // Metadados
    lastSyncAt: Date
    syncVersion: string
    lastWebhookAt?: Date
  }

  // ðŸ“Š DADOS COMBINADOS (calculados automaticamente)
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
    
    // ðŸ†• NOVO: Engagement detalhado (agregado de todas as plataformas)
    engagement?: {
      score: number
      level: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO'
      sources: {
        hotmart?: number
        curseduca?: number
      }
    }
    
    // ðŸ†• NOVO: Todas as turmas de todas as plataformas
    allClasses?: Array<{
      classId: string
      className: string
      source: 'hotmart' | 'curseduca'
      isActive: boolean
      enrolledAt?: Date
      role?: string
    }>
    
    // ðŸ†• NOVO: Turma principal (com prioridade)
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
    sourcesAvailable: ('discord' | 'hotmart' | 'curseduca' | 'guru')[]
    dataQuality: 'EXCELLENT' | 'GOOD' | 'BASIC' | 'LIMITED'
    calculatedAt: Date
  }
  
  // âš™ï¸ METADADOS GERAIS
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
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸ”§ ACTIVE CAMPAIGN - ComunicaÃ§Ã£o por curso
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  // ðŸ† CONQUISTAS (avaliadas no sync semanal)
  engagement?: {
    streak?: {
      current: number
      best: number
      lastActiveDay?: string
      updatedAt?: Date
    }
  }

  achievements?: Array<{
    id: string                      // "primeiro_login", "streak_7_dias", etc.
    unlockedAt: Date | null         // null = nÃ£o desbloqueada
    seenAt?: Date | null            // null = desbloqueada mas ainda nÃ£o mostrada ao aluno
    progress?: {                    // opcional, para badges com progresso parcial
      current: number
      target: number
    }
  }>

  achievementStats?: {
    total: number                   // 26
    unlocked: number                // quantas desbloqueadas
    percentage: number              // 0-100
    currentStreak: number           // sequÃªncia actual em dias
    bestStreak: number              // melhor sequÃªncia de sempre
    lastEvaluatedAt: Date           // Ãºltimo cÃ¡lculo
  }

  // ðŸ†• INATIVAÃ‡ÃƒO MANUAL (para detetar renovaÃ§Ãµes)
  inactivation?: {
    isManuallyInactivated: boolean    // Flag se foi inativado manualmente
    inactivatedAt?: Date              // Data da inativaÃ§Ã£o
    inactivatedBy?: string            // Quem inativou (userId ou 'Sistema')
    reason?: string                   // Motivo da inativaÃ§Ã£o
    platforms?: string[]              // Plataformas afetadas ['hotmart', 'curseduca', 'discord', 'all']
    classId?: string                  // Turma que causou a inativaÃ§Ã£o (se aplicÃ¡vel)
    reactivatedAt?: Date              // Data da reativaÃ§Ã£o (se aplicÃ¡vel)
    reactivatedBy?: string            // Quem reativou
    reactivationReason?: string       // Motivo ('manual', 'renewal_detected', 'sync')
  }

  // MÃ©todos de instÃ¢ncia
  calculateCombinedData(): void
  getDisplayProgress(): number
  getDisplayEngagement(): number
  isDataEstimated(): boolean
  getDataSourceInfo(): any
}

// Interface para mÃ©todos estÃ¡ticos
export interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>
  findByHotmartId(hotmartUserId: string): Promise<IUser | null>
  findByCurseducaId(curseducaUserId: string): Promise<IUser | null>
  findByCurseducaUuid(curseducaUuid: string): Promise<IUser | null>
  findByDiscordId(discordId: string): Promise<IUser | null>
  findByGuruContactId(guruContactId: string): Promise<IUser | null>  // ðŸ’°
  findByGuruSubscriptionCode(subscriptionCode: string): Promise<IUser | null>  // ðŸ’°
  getDataSourceStats(): Promise<any>
  getEnhancedUsersList(filters?: any): Promise<any[]>
  getSourceStatistics(): Promise<any[]>
}
