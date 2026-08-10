import User from '../../../models/user'
import UserProduct from '../../../models/UserProduct'
import Product from '../../../models/product/Product'
import { PLATFORM_MAPPINGS, asRecord, calculateEngagementLevel, firstDateValue, firstFiniteNumber, getNestedValue, stringifyId, type LegacyUserRecord, type ProductRecord, type UnifiedUserProduct } from './mapping'

interface CacheEntry {
  data: UnifiedUserProduct[]
  timestamp: number
  isWarming: boolean
  stats: { v1Count: number; v2Count: number; totalCount: number }
}

let unifiedCache: CacheEntry | null = null
const CACHE_TTL = 10 * 60 * 1000
const BACKGROUND_REFRESH_THRESHOLD = 8 * 60 * 1000
let warmupPromise: Promise<void> | null = null

async function buildUnifiedCache() {
  console.log('\n🔄 [DUAL READ v3.1] Construindo cache...')
  const startTime = Date.now()

  // ========================================================================
  // 1. BUSCAR TODOS OS USERS (V1)
  // ========================================================================
  const users = await User.find({ 
    isDeleted: { $ne: true } 
  }).lean<LegacyUserRecord[]>()
  
  console.log(`   ✅ ${users.length} users encontrados na BD`)

  // ========================================================================
  // 2. BUSCAR TODOS OS USERPRODUCTS V2 (se existirem)
  // ========================================================================
  const userProducts = await UserProduct.find()
    .populate('userId', 'name email')
    .populate('productId', 'name code platform')
    .lean<UnifiedUserProduct[]>()
  
  console.log(`   ✅ ${userProducts.length} UserProducts V2 encontrados`)

  // ========================================================================
  // 3. MAPEAR USERPRODUCTS V2 POR USERID
  // ========================================================================
  const userProductsByUserId = new Map<string, UnifiedUserProduct[]>()
  let validV2Count = 0
  
  userProducts.forEach(up => {
    const userId = stringifyId(up.userId)
    if (!userId || !up.productId) {
      console.warn(`   ⚠️ UserProduct ${up._id} sem populate (ignorado)`)
      return
    }
    
    if (!userProductsByUserId.has(userId)) {
      userProductsByUserId.set(userId, [])
    }
    
    userProductsByUserId.get(userId)!.push(up)
    validV2Count++
  })

  console.log(`   ✅ ${validV2Count} UserProducts V2 válidos mapeados`)

  // ========================================================================
  // 4. BUSCAR TODOS OS PRODUTOS DA BD (DINÂMICO!)
  // ========================================================================
  const products = await Product.find({ isActive: true }).lean<ProductRecord[]>()
  
  // Mapear produtos por plataforma
  const productsByPlatform = new Map<string, ProductRecord>()
  products.forEach(product => {
    const platform = product.platform.toLowerCase()
    if (!productsByPlatform.has(platform)) {
      productsByPlatform.set(platform, product)
    }
  })
  
  console.log(`   ✅ ${products.length} produtos ativos disponíveis:`)
  productsByPlatform.forEach((product, platform) => {
    const icon = 
      platform === 'hotmart' ? '🔥' :
      platform === 'curseduca' ? '📚' :
      platform === 'discord' ? '💬' : '🌟'
    console.log(`      ${icon} ${platform}: ${product.name} (${product.code})`)
  })

  // ========================================================================
  // 5. CONVERTER DADOS V1 → V2 (ESCALÁVEL!)
  // ========================================================================
  const unifiedUserProducts: UnifiedUserProduct[] = []
  const conversionStats = new Map<string, number>()
  const warnedPlatforms = new Set<string>()

  // Inicializar contadores
  PLATFORM_MAPPINGS.forEach(mapping => {
    conversionStats.set(mapping.platform, 0)
  })

  for (const user of users) {
    const userId = user._id.toString()

    // ─────────────────────────────────────────────────────────────
    // DETECTAR STATUS ATUAL DO USER
    // ─────────────────────────────────────────────────────────────
    let userStatus = 'ACTIVE' // Default para users novos
    
    if (userProductsByUserId.has(userId)) {
      const existingUps = userProductsByUserId.get(userId)!
      if (existingUps.length > 0) {
        userStatus = existingUps[0].status || 'ACTIVE'
      }
    }

    // ─────────────────────────────────────────────────────────────
    // SE USER JÁ TEM USERPRODUCTS V2 → USA ESSES!
    // ─────────────────────────────────────────────────────────────
    if (userProductsByUserId.has(userId)) {
      const ups = userProductsByUserId.get(userId)!
      unifiedUserProducts.push(...ups)
      continue
    }

    // ─────────────────────────────────────────────────────────────
    // ITERAR POR TODAS AS PLATAFORMAS DEFINIDAS
    // ─────────────────────────────────────────────────────────────
    for (const mapping of PLATFORM_MAPPINGS) {
      // ──────────────────────────────────────────────────────────
      // 1️⃣ VERIFICAR SE USER TEM ID VÁLIDO DESTA PLATAFORMA
      // ──────────────────────────────────────────────────────────
      let platformUserId: string | null = null
      
      const platformIdValue = getNestedValue(user, mapping.userIdField)
      if (
        Array.isArray(platformIdValue)
        && typeof platformIdValue[0] === 'string'
        && platformIdValue[0].trim() !== ''
      ) {
        platformUserId = platformIdValue[0]
      } else if (typeof platformIdValue === 'string' && platformIdValue.trim() !== '') {
        platformUserId = platformIdValue
      }

      // ❌ Sem ID válido → skip
      if (!platformUserId) continue

      // 2️⃣ Verificar se produto existe
      const product = productsByPlatform.get(mapping.platform)
      if (!product) {
        if (!warnedPlatforms.has(mapping.platform)) {
          console.warn(`   ⚠️ Produto ${mapping.platform} não existe na BD`)
          warnedPlatforms.add(mapping.platform)
        }
        continue
      }

      // 3️⃣ Buscar dados nested
      const platformData = asRecord(getNestedValue(user, mapping.dataPath)) ?? {}
      const hasData = Object.keys(platformData).length > 0
      
      const engagementData = hasData 
        ? (asRecord(getNestedValue(user, mapping.engagementPath)) ?? {})
        : {}
      
      const progressData = hasData
        ? (asRecord(getNestedValue(user, mapping.progressPath)) ?? {})
        : {}

      // 4️⃣ Calcular status
      let status: string
      if (hasData && mapping.statusLogic) {
        status = mapping.statusLogic(platformData)
      } else {
        status = userStatus // Herdar status do user
      }

      // 5️⃣ Calcular progresso
      let progressPercentage: number
      if (hasData && mapping.progressLogic) {
        progressPercentage = mapping.progressLogic(platformData)
      } else {
        progressPercentage = 0
      }

      // 6️⃣ Calcular engagement score
      let engagementScore: number
      if (hasData && mapping.engagementScoreLogic) {
        engagementScore = mapping.engagementScoreLogic(platformData)
      } else {
        // Fallback genérico
        engagementScore = firstFiniteNumber(
          engagementData.engagementScore,
          engagementData.alternativeEngagement,
          engagementData.accessCount,
        )
      }

      // 7️⃣ Extrair datas
      const enrolledAt = firstDateValue(
        platformData.signupDate,
        platformData.joinedDate,
        platformData.purchaseDate,
        platformData.createdAt,
        user.metadata?.createdAt,
        user.createdAt,
      ) ?? new Date()
      
      const lastActivity = firstDateValue(
        progressData.lastAccessDate,
        progressData.lastActivity,
        platformData.lastLogin,
        platformData.lastAccess,
      ) ?? null

      const engagementLevel = typeof engagementData.engagementLevel === 'string'
        && engagementData.engagementLevel !== ''
        ? engagementData.engagementLevel
        : calculateEngagementLevel(engagementScore)

      // 8️⃣ CRIAR USERPRODUCT CONVERTIDO
      unifiedUserProducts.push({
        _id: `v1-${mapping.platform}-${userId}`,
        userId: {
          _id: user._id,
          name: user.name,
          email: user.email
        },
        productId: product,
        platform: mapping.platform,
        platformUserId,
        status,
        progress: {
          percentage: progressPercentage,
          lastActivity: lastActivity
        },
        engagement: {
          engagementScore,
          engagementLevel,
        },
        enrolledAt: enrolledAt,
        source: 'MIGRATION',
        _isV1: true,
        _platform: mapping.platform,
        _hasNestedData: hasData,
        _schemaVersion: '3.1'  // ✅ Marcar versão do schema
      })

      // Incrementar contador
      const currentCount = conversionStats.get(mapping.platform) || 0
      conversionStats.set(mapping.platform, currentCount + 1)
    }
  }

  // ========================================================================
  // 6. STATS FINAIS
  // ========================================================================
  const duration = Date.now() - startTime
  const v1Count = unifiedUserProducts.filter(up => up._isV1).length
  const v2Count = unifiedUserProducts.filter(up => !up._isV1).length

  console.log(`\n   ✅ CONVERSÃO COMPLETA em ${duration}ms`)
  console.log(`   ════════════════════════════════════════`)
  console.log(`   📊 Total unificado: ${unifiedUserProducts.length} UserProducts`)
  console.log(`   📦 V2 (nativos): ${v2Count}`)
  console.log(`   🔄 V1 (convertidos): ${v1Count}`)
  
  conversionStats.forEach((count, platform) => {
    const icon = 
      platform === 'hotmart' ? '🔥' :
      platform === 'curseduca' ? '📚' :
      platform === 'discord' ? '💬' : '🌟'
    console.log(`      ${icon} ${platform}: ${count}`)
  })
  
  console.log(`   ════════════════════════════════════════\n`)

  // ═══════════════════════════════════════════════════════════════════════════
  // ATUALIZAR CACHE
  // ═══════════════════════════════════════════════════════════════════════════
  unifiedCache = {
    data: unifiedUserProducts,
    timestamp: Date.now(),
    isWarming: false,
    stats: {
      v1Count,
      v2Count,
      totalCount: unifiedUserProducts.length
    }
  }

  const cacheBuildDuration = Date.now() - startTime
  console.log(`💾 [CACHE] Construído: ${unifiedUserProducts.length} UserProducts (${cacheBuildDuration}ms)`)

  return unifiedUserProducts
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔥 WARM-UP: Construir cache ANTES do primeiro acesso
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function warmUpCache() {
  if (warmupPromise) {
    console.log('⏳ [WARM-UP] Já em progresso, aguardando...')
    return warmupPromise
  }

  console.log('\n🔥 [WARM-UP] Iniciando pré-aquecimento do cache...')

  warmupPromise = (async () => {
    try {
      if (unifiedCache) {
        unifiedCache.isWarming = true
      }

      const startTime = Date.now()
      await buildUnifiedCache()
      const duration = Date.now() - startTime

      console.log(`✅ [WARM-UP] Cache pré-aquecido em ${Math.round(duration/1000)}s`)
      console.log(`✅ [WARM-UP] Próximo acesso será instantâneo!\n`)

    } catch (error) {
      console.error('❌ [WARM-UP] Erro ao pré-aquecer cache:', error)
    } finally {
      warmupPromise = null
      if (unifiedCache) {
        unifiedCache.isWarming = false
      }
    }
  })()

  return warmupPromise
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔄 BACKGROUND REFRESH: Reconstrói cache ANTES de expirar
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function backgroundRefresh() {
  if (!unifiedCache || unifiedCache.isWarming) return

  const age = Date.now() - unifiedCache.timestamp

  if (age > BACKGROUND_REFRESH_THRESHOLD) {
    console.log('🔄 [BACKGROUND] Iniciando refresh preventivo do cache...')

    warmUpCache().catch(err => {
      console.error('❌ [BACKGROUND] Erro no refresh:', err)
    })
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🗑️ LIMPAR CACHE (Após syncs)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function clearUnifiedCache() {
  console.log('🗑️ [CACHE] Limpando cache')
  unifiedCache = null

  console.log('🔥 [CACHE] Iniciando warm-up em background...')
  warmUpCache().catch(err => {
    console.error('❌ [CACHE] Erro no warm-up após clear:', err)
  })
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 FUNÇÃO PRINCIPAL: getAllUsersUnified (COM CACHE)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function getAllUsersUnified() {
  // Verificar se cache está válido
  if (unifiedCache && !unifiedCache.isWarming) {
    const age = Date.now() - unifiedCache.timestamp

    if (age < CACHE_TTL) {
      console.log(`⚡ [CACHE HIT] ${unifiedCache.data.length} UserProducts (idade: ${Math.round(age/1000)}s)`)

      // Background refresh se próximo da expiração
      backgroundRefresh()

      return unifiedCache.data
    } else {
      console.log(`⏰ [CACHE] Expirado (${Math.round(age/1000)}s)`)
    }
  }

  // Cache miss - verificar se warm-up em progresso
  if (warmupPromise) {
    console.log('⏳ [CACHE] Warm-up em progresso...')
    console.log('⚡ [CACHE] Aguardando máximo 5 segundos...')
    
    const timeoutPromise = new Promise<void>((_, reject) => 
      setTimeout(() => reject(new Error('Warm-up timeout')), 5000)
    )
    
    try {
      await Promise.race([warmupPromise, timeoutPromise])
      if (unifiedCache) {
        console.log('✅ [CACHE] Warm-up completou dentro do timeout!')
        return unifiedCache.data
      }
    } catch {
      console.log('⚠️ [CACHE] Warm-up demorou >5s, construindo dados diretamente...')
    }
  }

  // Cache miss - construir novo
  console.log('🔄 [CACHE MISS] Reconstruindo cache...')
  return await buildUnifiedCache()
}

/**
 * Buscar users únicos dos UserProducts unificados
 */
export async function getUniqueUsersFromUnified(
  unifiedUserProducts: UnifiedUserProduct[],
): Promise<string[]> {
  const uniqueUserIds = [...new Set(
    unifiedUserProducts
      .filter(up => up.userId)
      .map(up => stringifyId(up.userId))
      .filter((userId): userId is string => userId !== undefined)
  )]

  return uniqueUserIds
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 GET CACHE STATS (para debugging)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function getCacheStats() {
  if (!unifiedCache) {
    return {
      exists: false,
      message: 'Cache não existe'
    }
  }

  const age = Date.now() - unifiedCache.timestamp
  const isExpired = age > CACHE_TTL

  return {
    exists: true,
    isExpired,
    age: Math.round(age / 1000),
    ttl: Math.round(CACHE_TTL / 1000),
    isWarming: unifiedCache.isWarming,
    stats: unifiedCache.stats,
    schemaVersion: '3.1'
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPORTS
 * ═══════════════════════════════════════════════════════════════════════════
 */
