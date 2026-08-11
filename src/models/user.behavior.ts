import { Schema } from 'mongoose'
import { IUser } from './user.types'

export function attachUserBehavior(schema: Schema): void {
// ðŸ”„ MIDDLEWARE PARA NORMALIZAR EMAIL E CALCULAR DADOS COMBINADOS
schema.pre<IUser>('save', function(next) {
  // âœ… NORMALIZAR EMAIL PARA LOWERCASE
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

  // âœ… SÃ“ CALCULAR DADOS COMBINADOS SE TIVER HOTMART OU CURSEDUCA
  // (NÃ£o calcular para users que sÃ³ tÃªm Guru/Discord)
  if (this.hotmart || this.curseduca) {
    this.calculateCombinedData()
  }

  next()
})

// ðŸ“Š MÃ‰TODO PARA CALCULAR DADOS COMBINADOS
schema.methods.calculateCombinedData = function(this: IUser) {
  const sourcesAvailable: ('discord' | 'hotmart' | 'curseduca' | 'guru')[] = []

  if (this.discord) sourcesAvailable.push('discord')
  if (this.hotmart) sourcesAvailable.push('hotmart')
  if (this.curseduca) sourcesAvailable.push('curseduca')
  if (this.guru) sourcesAvailable.push('guru')
  
  let status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
  if (this.discord?.isDeleted) status = 'INACTIVE'
  else if (this.curseduca?.memberStatus === 'INACTIVE') status = 'INACTIVE'
  
  let totalProgress = 0
  let totalTimeMinutes = 0
  let totalLessons = 0
  
  // âœ… CALCULAR PROGRESSO CORRETAMENTE usando liÃ§Ãµes, nÃ£o tempo
  if (this.hotmart?.progress) {
    const hotmartProgress = this.hotmart.progress
    totalTimeMinutes += hotmartProgress.totalTimeMinutes || 0
    
    // âœ… CORRETO: Usar lessonsData.length (total de liÃ§Ãµes)
    if (hotmartProgress.lessonsData && hotmartProgress.lessonsData.length > 0) {
      const completed = hotmartProgress.completedLessons || 0
      const total = hotmartProgress.lessonsData.length
      totalLessons = total
      totalProgress = Math.round((completed / total) * 100)
    }
  }
  
  // Usar Curseduca como fallback apenas se Hotmart nÃ£o tiver dados
  if (this.curseduca?.progress && totalProgress === 0) {
    totalProgress = this.curseduca.progress.estimatedProgress || 0
  }
  
  // âœ… CALCULAR ENGAGEMENT COMBINADO (agregado de todas as plataformas)
  let combinedEngagement = 0
  let bestEngagementSource: 'hotmart' | 'curseduca' | 'estimated' = 'estimated'
  
  const hotmartScore = this.hotmart?.engagement?.engagementScore || 0
  const curseducaScore = this.curseduca?.engagement?.alternativeEngagement || 0
  
  // Usar o maior score disponÃ­vel para retrocompatibilidade
  if (hotmartScore > 0) {
    combinedEngagement = hotmartScore
    bestEngagementSource = 'hotmart'
  } else if (curseducaScore > 0) {
    combinedEngagement = curseducaScore
    bestEngagementSource = 'curseduca'
  }
  
  // ðŸ†• CALCULAR ENGAGEMENT AGREGADO (mÃ©dia se ambos existirem)
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
  
  // Determinar nÃ­vel combinado baseado no score mÃ©dio
  let engagementLevel: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO' = 'MUITO_BAIXO'
  if (avgEngagementScore >= 80) engagementLevel = 'MUITO_ALTO'
  else if (avgEngagementScore >= 60) engagementLevel = 'ALTO'
  else if (avgEngagementScore >= 40) engagementLevel = 'MEDIO'
  else if (avgEngagementScore >= 25) engagementLevel = 'BAIXO'
  
  // ðŸ†• AGREGAR TURMAS DE TODAS AS PLATAFORMAS
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
  
  // ðŸ†• DEFINIR TURMA PRINCIPAL (prioridade: Hotmart > Curseduca)
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
    // SenÃ£o, usar primeira turma ativa do Curseduca
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
    // ðŸ†• NOVO: Engagement detalhado agregado
    engagement: {
      score: avgEngagementScore,
      level: engagementLevel,
      sources: {
        hotmart: hotmartScore,
        curseduca: curseducaScore
      }
    },
    allClasses,           // ðŸ†• NOVO
    primaryClass,         // ðŸ†• NOVO
    classId,              // Retrocompatibilidade
    className,            // Retrocompatibilidade
    lastActivity,
    sourcesAvailable,
    dataQuality,
    calculatedAt: new Date()
  }
}

// ðŸ“Š MÃ‰TODOS DE INSTÃ‚NCIA ADICIONAIS
schema.methods.getDisplayProgress = function(this: IUser): number {
  return this.combined?.totalProgress || this.curseduca?.progress?.estimatedProgress || 0
}

schema.methods.getDisplayEngagement = function(this: IUser): number {
  return this.combined?.combinedEngagement || 0
}

schema.methods.isDataEstimated = function(this: IUser): boolean {
  return this.curseduca?.progress?.progressSource === 'estimated' || !this.hotmart
}

schema.methods.getDataSourceInfo = function(this: IUser) {
  const sources = this.combined?.sourcesAvailable || []
  return {
    primary: sources.includes('hotmart') ? 'hotmart' : sources.includes('curseduca') ? 'curseduca' : 'discord',
    available: sources,
    quality: this.combined?.dataQuality || 'LIMITED',
    hasRealData: sources.includes('hotmart'),
    hasEstimatedData: sources.includes('curseduca')
  }
}

// ðŸ” MÃ‰TODOS DE BUSCA
schema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase().trim() })
}

schema.statics.findByHotmartId = function(hotmartUserId: string) {
  return this.findOne({ 'hotmart.hotmartUserId': hotmartUserId })
}

schema.statics.findByCurseducaId = function(curseducaUserId: string) {
  return this.findOne({ 'curseduca.curseducaUserId': curseducaUserId })
}

// ðŸ†• NOVO MÃ‰TODO: Buscar por UUID do Curseduca
schema.statics.findByCurseducaUuid = function(curseducaUuid: string) {
  return this.findOne({ 'curseduca.curseducaUuid': curseducaUuid })
}

schema.statics.findByDiscordId = function(discordId: string) {
  return this.findOne({ 'discord.discordIds': discordId })
}

// ðŸ’° NOVO MÃ‰TODO: Buscar por ID do Guru
schema.statics.findByGuruContactId = function(guruContactId: string) {
  return this.findOne({ 'guru.guruContactId': guruContactId })
}

schema.statics.findByGuruSubscriptionCode = function(subscriptionCode: string) {
  return this.findOne({ 'guru.subscriptionCode': subscriptionCode })
}

// ðŸ“Š MÃ‰TODOS DE ESTATÃSTICAS
schema.statics.getSourceStatistics = async function() {
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
  ]).allowDiskUse(true)
}

schema.statics.getDataSourceStats = async function() {
  const [stats] = await this.aggregate([
    {
      $facet: {
        hotmart: [
          { $match: { hotmart: { $exists: true } } },
          { $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: [{ $eq: ['$combined.status', 'ACTIVE'] }, 1, 0] } },
            averageEngagement: { $avg: '$hotmart.engagement.engagementScore' },
            averageProgress: { $avg: '$combined.totalProgress' }
          } }
        ],
        curseduca: [
          { $match: { curseduca: { $exists: true } } },
          { $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: [{ $eq: ['$curseduca.memberStatus', 'ACTIVE'] }, 1, 0] } },
            averageEstimatedProgress: { $avg: '$curseduca.progress.estimatedProgress' },
            averageAlternativeEngagement: { $avg: '$curseduca.engagement.alternativeEngagement' }
          } }
        ]
      }
    }
  ]).allowDiskUse(true)
  return {
    hotmart: stats?.hotmart[0] || { totalUsers: 0, activeUsers: 0, averageEngagement: 0, averageProgress: 0 },
    curseduca: stats?.curseduca[0] || { totalUsers: 0, activeUsers: 0, averageEstimatedProgress: 0, averageAlternativeEngagement: 0 }
  }
}
schema.statics.getEnhancedUsersList = async function(filters = {}) {
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
}
