// ═══════════════════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/dualReadService.ts
// 🔄 DUAL READ SERVICE - VERSÃO FINAL ESCALÁVEL E CORRIGIDA
// ═══════════════════════════════════════════════════════════════════════════
// Data: 03 Janeiro 2026
// Arquitetura: Configuration Over Code
// 
// FEATURES:
// - ✅ Lê TODOS os produtos da BD automaticamente
// - ✅ Converte users MESMO SEM dados nested (usa defaults)
// - ✅ Para cada user, verifica TODAS as plataformas possíveis
// - ✅ NÃO hardcoded - funciona com quantos produtos quiseres
// - ✅ Adiciona produto novo → Funciona imediatamente
// - ✅ CORRIGIDO: Alinhado com schema User atual (v3.1)
// - ✅ CORRIGIDO: Usa campos corretos (lastLogin, situation, etc)
// ═══════════════════════════════════════════════════════════════════════════

import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import Product from '../../models/product/Product'
import { isCurseducaEnrollmentActive } from './curseducaServices/curseducaMemberships'

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 CACHE COM WARM-UP E BACKGROUND REFRESH
// ═══════════════════════════════════════════════════════════════════════════
interface CacheEntry {
  data: any[]
  timestamp: number
  isWarming: boolean
  stats: {
    v1Count: number
    v2Count: number
    totalCount: number
  }
}

let unifiedCache: CacheEntry | null = null
const CACHE_TTL = 10 * 60 * 1000 // 10 minutos
const BACKGROUND_REFRESH_THRESHOLD = 8 * 60 * 1000 // Refresh 2 min antes de expirar
let warmupPromise: Promise<void> | null = null

/**
 * 📋 MAPEAMENTO DE CAMPOS V1 POR PLATAFORMA
 * 
 * Define onde encontrar os dados de cada plataforma no User V1
 * 
 * ✅ VERSÃO 3.1 - ALINHADA COM SCHEMA ATUAL
 * 
 * ADICIONAR NOVA PLATAFORMA:
 * 1. Adicionar entrada aqui com os campos corretos
 * 2. Sistema automaticamente processa
 */
interface PlatformMapping {
  platform: string
  userIdField: string              // Campo que tem o ID da plataforma
  dataPath: string                 // Caminho para os dados nested
  engagementPath: string           // Caminho para engagement
  progressPath: string             // Caminho para progresso
  statusLogic?: (data: any) => string      // Lógica custom de status
  progressLogic?: (data: any) => number    // Lógica custom de progresso
  engagementScoreLogic?: (data: any) => number  // ✅ NOVO: Engagement score
}

const PLATFORM_MAPPINGS: PlatformMapping[] = [
  // ─────────────────────────────────────────────────────────────
  // HOTMART
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'hotmart',
    userIdField: 'hotmart.hotmartUserId',  // ✅ CORRIGIDO (schema atual)
    dataPath: 'hotmart',
    engagementPath: 'hotmart.engagement',
    progressPath: 'hotmart.progress',
    
    statusLogic: (data: any) => {
      // ✅ HOTMART = LOGIN-BASED
      // Usar lastAccessDate (não lastLogin, Hotmart não tem esse campo)
      const lastAccessDate = data?.progress?.lastAccessDate
      if (!lastAccessDate) return 'INACTIVE'
      
      const daysSince = (Date.now() - new Date(lastAccessDate).getTime()) / (1000 * 60 * 60 * 24)
      return daysSince > 30 ? 'INACTIVE' : 'ACTIVE'
    },
    
    progressLogic: (data: any) => {
      // ✅ CORRIGIDO: Usar totalProgress do schema
      if (data?.progress?.totalProgress !== undefined) {
        return Math.min(Math.max(data.progress.totalProgress, 0), 100)
      }
      
      // Fallback: currentModule (assumindo 10 módulos total)
      if (data?.currentModule !== undefined) {
        return Math.min((data.currentModule / 10) * 100, 100)
      }
      
      return 0
    },
    
    engagementScoreLogic: (data: any) => {
      // ✅ Usar accessCount do engagement
      return data?.engagement?.accessCount || 0
    }
  },
  
  // ─────────────────────────────────────────────────────────────
  // CURSEDUCA
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'curseduca',
    userIdField: 'curseduca.curseducaUserId',
    dataPath: 'curseduca',
    engagementPath: 'curseduca.progress',  // ✅ CORRIGIDO (curseduca não tem .engagement)
    progressPath: 'curseduca.progress',
    
    statusLogic: (data: any) => {
      // ✅ CURSEDUCA = ACTION-BASED
      // 1. Verificar situation (ACTIVE/INACTIVE/SUSPENDED)
      if (!isCurseducaEnrollmentActive(data?.situation)) {
        return 'INACTIVE'
      }
      
      // 2. Verificar lastLogin (se >30 dias = INACTIVE)
      const lastLogin = data?.lastLogin
      if (!lastLogin) return 'INACTIVE'
      
      const daysSince = (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24)
      return daysSince > 30 ? 'INACTIVE' : 'ACTIVE'
    },
    
    progressLogic: (data: any) => {
      // ✅ Usar estimatedProgress
      return data?.progress?.estimatedProgress || 0
    },
    
    engagementScoreLogic: (data: any) => {
      // ✅ CursEduca não tem engagement direto, calcular baseado em progresso
      const progress = data?.progress?.estimatedProgress || 0
      return Math.min(100, progress * 2) // Progresso de 50% = engagement de 100
    }
  },
  
  // ─────────────────────────────────────────────────────────────
  // DISCORD
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'discord',
    userIdField: 'discord.discordIds',  // Array de IDs
    dataPath: 'discord',
    engagementPath: 'discord',
    progressPath: 'discord',
    
    statusLogic: (data: any) => {
      return data?.isDeleted ? 'INACTIVE' : 'ACTIVE'
    },
    
    progressLogic: () => 0,  // Discord não tem progresso mensurável
    
    engagementScoreLogic: () => 0  // Discord não tem engagement score
  }
  
  // ─────────────────────────────────────────────────────────────
  // 🆕 ADICIONAR NOVAS PLATAFORMAS AQUI
  // ─────────────────────────────────────────────────────────────
]

/**
 * Helper: Obter valor de campo nested usando path
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

/**
 * Helper: Calcular engagement level baseado em score
 */
function calculateEngagementLevel(score: number): string {
  if (score >= 80) return 'MUITO_ALTO'
  if (score >= 60) return 'ALTO'
  if (score >= 40) return 'MEDIO'
  if (score >= 25) return 'BAIXO'
  return 'MUITO_BAIXO'
}

/**
 * 🔄 DUAL READ: Combina dados V1 (User) + V2 (UserProduct)
 * 
 * ARQUITETURA ESCALÁVEL:
 * 1. Busca TODOS os produtos da BD
 * 2. Para cada user, itera por TODAS as plataformas definidas em PLATFORM_MAPPINGS
 * 3. Se user tem ID da plataforma → cria UserProduct (MESMO sem dados nested)
 * 4. Sistema funciona com quantos produtos quiseres adicionar
 */
async function buildUnifiedCache() {
  console.log('\n🔄 [DUAL READ v3.1] Construindo cache...')
  const startTime = Date.now()

  // ========================================================================
  // 1. BUSCAR TODOS OS USERS (V1)
  // ========================================================================
  const users = await User.find({ 
    isDeleted: { $ne: true } 
  }).lean() as any[]
  
  console.log(`   ✅ ${users.length} users encontrados na BD`)

  // ========================================================================
  // 2. BUSCAR TODOS OS USERPRODUCTS V2 (se existirem)
  // ========================================================================
  const userProducts = await UserProduct.find()
    .populate('userId', 'name email')
    .populate('productId', 'name code platform')
    .lean()
  
  console.log(`   ✅ ${userProducts.length} UserProducts V2 encontrados`)

  // ========================================================================
  // 3. MAPEAR USERPRODUCTS V2 POR USERID
  // ========================================================================
  const userProductsByUserId = new Map<string, any[]>()
  let validV2Count = 0
  
  userProducts.forEach(up => {
    if (!up.userId || !up.productId) {
      console.warn(`   ⚠️ UserProduct ${up._id} sem populate (ignorado)`)
      return
    }
    
    const userId = (up.userId as any)._id?.toString() || up.userId.toString()
    
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
  const products = await Product.find({ isActive: true }).lean() as any[]
  
  // Mapear produtos por plataforma
  const productsByPlatform = new Map<string, any>()
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
  const unifiedUserProducts: any[] = []
  const conversionStats = new Map<string, number>()
  const warnedPlatforms = new Set<string>()
  let v2Used = 0

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
      v2Used += ups.length
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
      
      if (mapping.userIdField.includes('.')) {
        // Campo nested (ex: discord.discordIds, curseduca.curseducaUserId)
        const value = getNestedValue(user, mapping.userIdField)
        
        if (Array.isArray(value) && value.length > 0) {
          platformUserId = value[0]
        } else if (value && typeof value === 'string' && value.trim() !== '') {
          platformUserId = value
        }
      } else {
        // Campo direto
        const value = user[mapping.userIdField]
        if (value && typeof value === 'string' && value.trim() !== '') {
          platformUserId = value
        }
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
      const platformData = getNestedValue(user, mapping.dataPath) || {}
      const hasData = platformData && Object.keys(platformData).length > 0
      
      const engagementData = hasData 
        ? (getNestedValue(user, mapping.engagementPath) || {})
        : {}
      
      const progressData = hasData
        ? (getNestedValue(user, mapping.progressPath) || {})
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
        engagementScore = 
          engagementData.engagementScore || 
          engagementData.alternativeEngagement || 
          engagementData.accessCount ||
          0
      }

      // 7️⃣ Extrair datas
      const enrolledAt = 
        platformData.signupDate || 
        platformData.joinedDate || 
        platformData.purchaseDate ||
        platformData.createdAt || 
        user.metadata?.createdAt ||
        user.createdAt || 
        new Date()
      
      const lastActivity = 
        progressData.lastAccessDate || 
        progressData.lastActivity ||
        platformData.lastLogin ||
        platformData.lastAccess ||
        null

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
          engagementLevel: engagementData.engagementLevel || calculateEngagementLevel(engagementScore)
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
  const v1Count = unifiedUserProducts.filter((up: any) => up._isV1).length
  const v2Count = unifiedUserProducts.filter((up: any) => !up._isV1).length

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
    } catch (error) {
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
export async function getUniqueUsersFromUnified(unifiedUserProducts: any[]) {
  const uniqueUserIds = [...new Set(
    unifiedUserProducts
      .filter(up => up.userId)
      .map(up => {
        const userId = up.userId
        return typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString()
      })
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
export default {
  getAllUsersUnified,
  getUniqueUsersFromUnified,
  warmUpCache,
  clearUnifiedCache,
  getCacheStats
}
