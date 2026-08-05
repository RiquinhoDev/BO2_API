import type {
  ActiveCampaignTagsView,
  FrontendClass,
  PopulatedUserProductRecord,
  UserTransformSource,
} from './studentSearch.contract'

/**
 * Flattens the segregated user document back into the shape the Front has
 * always consumed. Pure: every input arrives as an argument.
 */
export function transformUserForFrontend(
  user: UserTransformSource,
  userProductsMap?: Map<string, PopulatedUserProductRecord[]>,
) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,

    // discord.discordIds -> discordIds
    discordIds: user.discord?.discordIds || [],

    // combined.status -> status, with a deleted Discord identity forcing INACTIVE
    status: (user.combined?.status === 'INACTIVE' || user.discord?.isDeleted) ? 'INACTIVE' : 'ACTIVE',

    // discord.role -> role
    role: user.discord?.role || 'STUDENT',

    acceptedTerms: user.discord?.acceptedTerms || false,
    isDeletable: user.discord?.isDeletable !== false,
    priority: user.discord?.priority || 'MEDIUM',
    locale: user.discord?.locale || 'pt_BR',

    hotmartUserId: user.hotmart?.hotmartUserId,
    purchaseDate: user.hotmart?.purchaseDate,
    signupDate: user.hotmart?.signupDate,
    plusAccess: user.hotmart?.plusAccess,
    firstAccessDate: user.hotmart?.firstAccessDate,
    lastAccessDate: user.hotmart?.lastAccessDate || user.hotmart?.progress?.lastAccessDate || user.curseduca?.lastLogin || user.curseduca?.lastAccess,

    curseducaUserId: user.curseduca?.curseducaUserId,

    progress: user.combined ? {
      completedPercentage: user.combined.totalProgress || 0,
      total: user.combined.totalLessons || 0,
      completed: Math.round((user.combined.totalProgress / 100) * (user.combined.totalLessons || 0)),
      lastUpdated: user.hotmart?.lastAccessDate || user.hotmart?.progress?.lastAccessDate || user.curseduca?.lastLogin || user.curseduca?.lastAccess
    } : undefined,

    engagement: user.combined?.engagement?.level || 'NONE',
    engagementScore: user.combined?.engagement?.score || 0,
    engagementLevel: user.combined?.engagement?.level,
    engagementCalculatedAt: user.combined?.calculatedAt,

    classId: user.combined?.classId,
    className: user.combined?.className,

    // Products become virtual classes when they are not already listed.
    combined: (() => {
      const allClasses: FrontendClass[] = [...(user.combined?.allClasses || [])]
      const baseCombined = {
        ...user.combined,
        allClasses,
        primaryClass: user.combined?.primaryClass
      }

      if (userProductsMap) {
        const userId = user._id.toString()
        const userProducts = userProductsMap.get(userId) || []

        userProducts.forEach(up => {
          const productCode = up.productId?.code || 'UNKNOWN'
          const productName = up.productId?.name || 'Produto Desconhecido'

          const existingClass = baseCombined.allClasses.find(
            currentClass => currentClass.classId === productCode
              || currentClass.className.includes(productName)
          )

          if (!existingClass) {
            baseCombined.allClasses.push({
              classId: productCode,
              className: productName,
              source: up.platform,
              isActive: up.status === 'ACTIVE',
              enrolledAt: up.enrolledAt,
              role: 'student'
            })
          }
        })
      }

      return baseCombined
    })(),

    performanceMetrics: user.hotmart?.engagement ? {
      dailyAccess: 0,
      weeklyAccess: 0,
      monthlyAccess: 0
    } : undefined,

    accessCount: user.hotmart?.engagement?.accessCount || 0,

    lastActivityAt: user.combined?.lastActivity,
    lastEditedAt: user.discord?.lastEditedAt,
    lastEditedBy: user.discord?.lastEditedBy,
    createdAt: user.metadata?.createdAt || user.discord?.createdAt,
    updatedAt: user.metadata?.updatedAt,

    username: user.username,
    // Reads combined.status only, so it can disagree with `status` above.
    estado: user.combined?.status === 'ACTIVE' ? 'ativo' : 'inativo',
    timer: user.combined?.totalTimeMinutes || 0,
    isDeleted: user.discord?.isDeleted || false,
    deletedAt: user.deletedAt,
    deletedBy: user.deletedBy,
    tags: user.tags,
    notes: user.notes,
    source: user.source,
    type: user.type,

    acTagsByProduct: (() => {
      const userId = user._id.toString()
      const userProducts = userProductsMap ? (userProductsMap.get(userId) || []) : []

      const acc = userProducts.reduce<Record<string, ActiveCampaignTagsView>>((tagsByProduct, up) => {
        if (up.activeCampaignData?.tags && up.activeCampaignData.tags.length > 0) {
          const productCode = up.productId?.code || up.productId?._id?.toString() || 'UNKNOWN'
          const productName = up.productId?.name || 'Produto Desconhecido'

          tagsByProduct[productCode] = {
            productCode,
            productName,
            tags: up.activeCampaignData.tags,
            lastSyncAt: up.activeCampaignData.lastSyncAt
          }
        }
        return tagsByProduct
      }, {})

      const testimonialData = user.communicationByCourse?.get('TESTIMONIALS')
      const testimonialTags = testimonialData?.currentTags || []

      if (testimonialTags.length > 0) {
        acc.TESTIMONIALS = {
          productCode: 'TESTIMONIALS',
          productName: 'Testemunhos',
          tags: testimonialTags,
          lastSyncAt: testimonialData?.lastTagAppliedAt
        }
      }

      return acc
    })(),
  }
}

export type TransformedStudent = ReturnType<typeof transformUserForFrontend>
