// ═══════════════════════════════════════════════════════════════════════════
// 📁 BO2_API/src/services/dualReadService.ts
// 🔄 DUAL READ SERVICE - VERSÃO FINAL ESCALÁVEL
// ═══════════════════════════════════════════════════════════════════════════
// Data: 27 Novembro 2025
// Arquitetura: Configuration Over Code
// 
// FEATURES:
// - ✅ Lê TODOS os produtos da BD automaticamente
// - ✅ Converte users MESMO SEM dados nested (usa defaults)
// - ✅ Para cada user, verifica TODAS as plataformas possíveis
// - ✅ NÃO hardcoded - funciona com quantos produtos quiseres
// - ✅ Adiciona produto novo → Funciona imediatamente
// ═══════════════════════════════════════════════════════════════════════════

import User from '../models/user';
import UserProduct from '../models/UserProduct';
import Product from '../models/Product';

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 CACHE COM WARM-UP E BACKGROUND REFRESH
// ═══════════════════════════════════════════════════════════════════════════
interface CacheEntry {
  data: any[];
  timestamp: number;
  isWarming: boolean;
  stats: {
    v1Count: number;
    v2Count: number;
    totalCount: number;
  };
}

let unifiedCache: CacheEntry | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const BACKGROUND_REFRESH_THRESHOLD = 8 * 60 * 1000; // Refresh 2 min antes de expirar
let warmupPromise: Promise<void> | null = null;

/**
 * 📋 MAPEAMENTO DE CAMPOS V1 POR PLATAFORMA
 * 
 * Define onde encontrar os dados de cada plataforma no User V1
 * 
 * ADICIONAR NOVA PLATAFORMA:
 * 1. Adicionar entrada aqui com os campos corretos
 * 2. Sistema automaticamente processa
 */
interface PlatformMapping {
  platform: string;
  userIdField: string;              // Campo que tem o ID da plataforma (ex: "hotmartUserId")
  dataPath: string;                 // Caminho para os dados nested (ex: "hotmart")
  engagementPath: string;           // Caminho para engagement
  progressPath: string;             // Caminho para progresso
  statusLogic?: (data: any) => string;  // Lógica custom de status
  progressLogic?: (data: any) => number; // Lógica custom de progresso
}

const PLATFORM_MAPPINGS: PlatformMapping[] = [
  // ─────────────────────────────────────────────────────────────
  // HOTMART
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'hotmart',
    userIdField: 'hotmartUserId',
    dataPath: 'hotmart',
    engagementPath: 'hotmart.engagement',
    progressPath: 'hotmart.progress',
    statusLogic: (data: any) => {
      const lastAccessDate = data?.progress?.lastAccessDate;
      if (!lastAccessDate) return 'INACTIVE';
      
      const daysSince = (Date.now() - new Date(lastAccessDate).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30 ? 'INACTIVE' : 'ACTIVE';
    },
    progressLogic: (data: any) => {
      const progress = data?.progress;
      if (!progress) return 0;
      
      // Calcular baseado em lições completadas
      if (progress.lessonsData && progress.lessonsData.length > 0) {
        const completed = progress.lessonsData.filter((l: any) => l.completed).length;
        return Math.round((completed / progress.lessonsData.length) * 100);
      }
      
      // Fallback
      return Math.min(progress.completedLessons || 0, 100);
    }
  },
  
  // ─────────────────────────────────────────────────────────────
  // CURSEDUCA
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'curseduca',
    userIdField: 'curseduca.curseducaUserId',
    dataPath: 'curseduca',
    engagementPath: 'curseduca.engagement',
    progressPath: 'curseduca.progress',
    statusLogic: (data: any) => {
      const expiresAt = data?.enrolledClasses?.[0]?.expiresAt;
      if (expiresAt && new Date(expiresAt) < new Date()) {
        return 'INACTIVE';
      }
      return data?.memberStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
    },
    progressLogic: (data: any) => {
      return data?.progress?.estimatedProgress || 0;
    }
  },
  
  // ─────────────────────────────────────────────────────────────
  // DISCORD
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'discord',
    userIdField: 'discord.discordIds',  // Array
    dataPath: 'discord',
    engagementPath: 'discord.engagement',
    progressPath: 'discord.progress',
    statusLogic: (data: any) => {
      return data?.isDeleted ? 'INACTIVE' : 'ACTIVE';
    },
    progressLogic: () => 0  // Discord não tem progresso mensurável
  }
  
  // ─────────────────────────────────────────────────────────────
  // 🆕 ADICIONAR NOVAS PLATAFORMAS AQUI
  // ─────────────────────────────────────────────────────────────
  // Exemplo para TikTok Shop:
  // {
  //   platform: 'tiktok',
  //   userIdField: 'tiktokUserId',
  //   dataPath: 'tiktok',
  //   engagementPath: 'tiktok.engagement',
  //   progressPath: 'tiktok.progress',
  //   statusLogic: (data: any) => data?.isActive ? 'ACTIVE' : 'INACTIVE',
  //   progressLogic: (data: any) => data?.progress?.percentage || 0
  // }
];

/**
 * Helper: Obter valor de campo nested usando path
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Helper: Calcular engagement level baseado em score
 */
function calculateEngagementLevel(score: number): string {
  if (score >= 80) return 'MUITO_ALTO';
  if (score >= 60) return 'ALTO';
  if (score >= 40) return 'MEDIO';
  if (score >= 25) return 'BAIXO';
  return 'MUITO_BAIXO';
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
  console.log('\n🔄 [DUAL READ ESCALÁVEL] Construindo cache...');
  const startTime = Date.now();

  // ========================================================================
  // 1. BUSCAR TODOS OS USERS (V1)
  // ========================================================================
  const users = await User.find({ 
    isDeleted: { $ne: true } 
  }).lean() as any[];
  
  console.log(`   ✅ ${users.length} users encontrados na BD`);

  // ========================================================================
  // 2. BUSCAR TODOS OS USERPRODUCTS V2 (se existirem)
  // ========================================================================
  const userProducts = await UserProduct.find()
    .populate('userId', 'name email')
    .populate('productId', 'name code platform')
    .lean();
  
  console.log(`   ✅ ${userProducts.length} UserProducts V2 encontrados`);

  // ========================================================================
  // 3. MAPEAR USERPRODUCTS V2 POR USERID
  // ========================================================================
  const userProductsByUserId = new Map<string, any[]>();
  let validV2Count = 0;
  
  userProducts.forEach(up => {
    if (!up.userId || !up.productId) {
      console.warn(`   ⚠️ UserProduct ${up._id} sem populate (ignorado)`);
      return;
    }
    
    const userId = (up.userId as any)._id?.toString() || up.userId.toString();
    
    if (!userProductsByUserId.has(userId)) {
      userProductsByUserId.set(userId, []);
    }
    
    userProductsByUserId.get(userId)!.push(up);
    validV2Count++;
  });

  console.log(`   ✅ ${validV2Count} UserProducts V2 válidos mapeados`);

  // ========================================================================
  // 4. BUSCAR TODOS OS PRODUTOS DA BD (DINÂMICO!)
  // ========================================================================
  const products = await Product.find().lean() as any[];
  
  // Mapear produtos por plataforma
  const productsByPlatform = new Map<string, any>();
  products.forEach(product => {
    const platform = product.platform.toLowerCase();
    if (!productsByPlatform.has(platform)) {
      productsByPlatform.set(platform, product);
    }
  });
  
  console.log(`   ✅ ${products.length} produtos disponíveis:`);
  productsByPlatform.forEach((product, platform) => {
    const icon = 
      platform === 'hotmart' ? '🔥' :
      platform === 'curseduca' ? '📚' :
      platform === 'discord' ? '💬' :
      platform === 'tiktok' ? '🎵' :
      platform === 'shopify' ? '🛒' : '🌟';
    console.log(`      ${icon} ${platform}: ${product.name}`);
  });

  // ========================================================================
  // 5. CONVERTER DADOS V1 → V2 (ESCALÁVEL!)
  // ========================================================================
  const unifiedUserProducts: any[] = [];
  const conversionStats = new Map<string, number>();
  const warnedPlatforms = new Set<string>(); // Para não repetir warnings
  let v2Used = 0;

  // Inicializar contadores para cada plataforma
  PLATFORM_MAPPINGS.forEach(mapping => {
    conversionStats.set(mapping.platform, 0);
  });

  for (const user of users) {
    const userId = user._id.toString();

    // ─────────────────────────────────────────────────────────────
    // ✅ CORREÇÃO 2: DETECTAR STATUS ATUAL DO USER (ANTES do continue!)
    // Se user já tem UserProducts V2, usar status deles
    // Se user é novo, default 'ACTIVE'
    // ─────────────────────────────────────────────────────────────
    let userStatus = 'ACTIVE'; // Default para users completamente novos
    
    if (userProductsByUserId.has(userId)) {
      // User já tem produtos, pegar status de qualquer um
      // (Todos UserProducts do mesmo user devem ter mesmo status)
      const existingUps = userProductsByUserId.get(userId)!;
      if (existingUps.length > 0) {
        userStatus = existingUps[0].status || 'ACTIVE';
      }
    }

    // ─────────────────────────────────────────────────────────────
    // SE USER JÁ TEM USERPRODUCTS V2 → USA ESSES!
    // ─────────────────────────────────────────────────────────────
    if (userProductsByUserId.has(userId)) {
      const ups = userProductsByUserId.get(userId)!;
      unifiedUserProducts.push(...ups);
      v2Used += ups.length;
      continue;
    }

    // ─────────────────────────────────────────────────────────────
    // ITERAR POR TODAS AS PLATAFORMAS DEFINIDAS (ESCALÁVEL!)
    // ─────────────────────────────────────────────────────────────
    for (const mapping of PLATFORM_MAPPINGS) {
      // ──────────────────────────────────────────────────────────
      // 1️⃣ VERIFICAR SE USER TEM ID VÁLIDO DESTA PLATAFORMA
      // ──────────────────────────────────────────────────────────
      let platformUserId: string | null = null;
      
      if (mapping.userIdField.includes('.')) {
        // Campo nested (ex: discord.discordIds, curseduca.curseducaUserId)
        const value = getNestedValue(user, mapping.userIdField);
        
        if (Array.isArray(value) && value.length > 0) {
          // ✅ Array COM elementos
          platformUserId = value[0];
        } else if (value && typeof value === 'string' && value.trim() !== '') {
          // ✅ String válida (não vazia)
          platformUserId = value;
        }
        // ❌ Array vazio [], null, undefined, "" → platformUserId fica null
      } else {
        // Campo direto na raiz (ex: hotmartUserId)
        const value = user[mapping.userIdField];
        if (value && typeof value === 'string' && value.trim() !== '') {
          platformUserId = value;
        }
      }

      // ❌ CRÍTICO: Se não tem ID VÁLIDO, skip IMEDIATAMENTE
      // Não importa se tem estrutura - sem ID não cria UserProduct!
      if (!platformUserId) continue;

      // 2️⃣ Verificar se produto desta plataforma existe
      const product = productsByPlatform.get(mapping.platform);
      if (!product) {
        // Só avisar uma vez por plataforma
        if (!warnedPlatforms.has(mapping.platform)) {
          console.warn(`   ⚠️ Produto ${mapping.platform} não existe na BD`);
          warnedPlatforms.add(mapping.platform);
        }
        continue;
      }

      // 3️⃣ Buscar dados nested (se existirem)
      const platformData = getNestedValue(user, mapping.dataPath) || {};
      
      // ✅ MUDANÇA CRÍTICA: NÃO skip se não tiver dados!
      // Continua mesmo sem dados, usa defaults
      const hasData = platformData && Object.keys(platformData).length > 0;
      
      // 4️⃣ Extrair engagement e progress (com fallbacks)
      const engagementData = hasData 
        ? (getNestedValue(user, mapping.engagementPath) || {})
        : {};
      
      const progressData = hasData
        ? (getNestedValue(user, mapping.progressPath) || {})
        : {};

      // 5️⃣ ✅ CORREÇÃO 2: Manter status do user se já existir
      // Se user já tem UserProducts → usa status deles
      // Se user é novo → default 'ACTIVE'
      // Status reflete turmas Discord, NÃO statusLogic das plataformas
      const status: string = userStatus;

      // 6️⃣ Calcular progresso (usar lógica custom SE houver dados)
      let progressPercentage: number;
      if (hasData && mapping.progressLogic) {
        progressPercentage = mapping.progressLogic(platformData);
      } else {
        // Default: 0% se não houver dados
        progressPercentage = 0;
      }

      // 7️⃣ Extrair engagement score
      const engagementScore = 
        engagementData.engagementScore || 
        engagementData.alternativeEngagement || 
        0;

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
          lastActivity: progressData.lastAccessDate || progressData.lastActivity || null
        },
        engagement: {
          engagementScore,
          engagementLevel: engagementData.engagementLevel || calculateEngagementLevel(engagementScore)
        },
        enrolledAt: platformData.signupDate || platformData.joinedDate || platformData.createdAt || user.createdAt || new Date(),
        source: 'MIGRATION',
        _isV1: true,
        _platform: mapping.platform,
        _hasNestedData: hasData  // 🆕 Flag para debug
      });

      // Incrementar contador
      const currentCount = conversionStats.get(mapping.platform) || 0;
      conversionStats.set(mapping.platform, currentCount + 1);
    }
  }

  // ========================================================================
  // 6. STATS FINAIS
  // ========================================================================
  const duration = Date.now() - startTime;
  const v1Count = unifiedUserProducts.filter((up: any) => up._isV1).length;
  const v2Count = unifiedUserProducts.filter((up: any) => !up._isV1).length;

  console.log(`\n   ✅ CONVERSÃO COMPLETA em ${duration}ms`);
  console.log(`   ════════════════════════════════════════`);
  console.log(`   📊 Total unificado: ${unifiedUserProducts.length} UserProducts`);
  console.log(`   📦 V2 (nativos): ${v2Count}`);
  console.log(`   🔄 V1 (convertidos): ${v1Count}`);
  
  // Mostrar stats por plataforma (dinâmico!)
  conversionStats.forEach((count, platform) => {
    const icon = 
      platform === 'hotmart' ? '🔥' :
      platform === 'curseduca' ? '📚' :
      platform === 'discord' ? '💬' :
      platform === 'tiktok' ? '🎵' :
      platform === 'shopify' ? '🛒' : '🌟';
    console.log(`      ${icon} ${platform}: ${count}`);
  });
  
  console.log(`   ════════════════════════════════════════\n`);

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
  };

  const cacheBuildDuration = Date.now() - startTime;
  console.log(`💾 [CACHE] Construído: ${unifiedUserProducts.length} UserProducts (${cacheBuildDuration}ms)`);

  return unifiedUserProducts;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔥 WARM-UP: Construir cache ANTES do primeiro acesso
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function warmUpCache() {
  if (warmupPromise) {
    console.log('⏳ [WARM-UP] Já em progresso, aguardando...');
    return warmupPromise;
  }

  console.log('\n🔥 [WARM-UP] Iniciando pré-aquecimento do cache...');

  warmupPromise = (async () => {
    try {
      if (unifiedCache) {
        unifiedCache.isWarming = true;
      }

      const startTime = Date.now();
      await buildUnifiedCache();
      const duration = Date.now() - startTime;

      console.log(`✅ [WARM-UP] Cache pré-aquecido em ${Math.round(duration/1000)}s`);
      console.log(`✅ [WARM-UP] Próximo acesso será instantâneo!\n`);

    } catch (error) {
      console.error('❌ [WARM-UP] Erro ao pré-aquecer cache:', error);
    } finally {
      warmupPromise = null;
      if (unifiedCache) {
        unifiedCache.isWarming = false;
      }
    }
  })();

  return warmupPromise;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔄 BACKGROUND REFRESH: Reconstrói cache ANTES de expirar
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function backgroundRefresh() {
  if (!unifiedCache || unifiedCache.isWarming) return;

  const age = Date.now() - unifiedCache.timestamp;

  if (age > BACKGROUND_REFRESH_THRESHOLD) {
    console.log('🔄 [BACKGROUND] Iniciando refresh preventivo do cache...');

    warmUpCache().catch(err => {
      console.error('❌ [BACKGROUND] Erro no refresh:', err);
    });
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🗑️ LIMPAR CACHE (Após syncs)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function clearUnifiedCache() {
  console.log('🗑️ [CACHE] Limpando cache');
  unifiedCache = null;

  console.log('🔥 [CACHE] Iniciando warm-up em background...');
  warmUpCache().catch(err => {
    console.error('❌ [CACHE] Erro no warm-up após clear:', err);
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 FUNÇÃO PRINCIPAL: getAllUsersUnified (COM CACHE)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function getAllUsersUnified() {
  // Verificar se cache está válido
  if (unifiedCache && !unifiedCache.isWarming) {
    const age = Date.now() - unifiedCache.timestamp;

    if (age < CACHE_TTL) {
      console.log(`⚡ [CACHE HIT] ${unifiedCache.data.length} UserProducts (idade: ${Math.round(age/1000)}s)`);

      // Background refresh se próximo da expiração
      backgroundRefresh();

      return unifiedCache.data;
    } else {
      console.log(`⏰ [CACHE] Expirado (${Math.round(age/1000)}s)`);
    }
  }

  // Cache miss - verificar se warm-up em progresso
  if (warmupPromise) {
    console.log('⏳ [CACHE] Aguardando warm-up em progresso...');
    await warmupPromise;
    return unifiedCache!.data;
  }

  // Cache miss - construir novo
  console.log('🔄 [CACHE MISS] Reconstruindo cache...');
  return await buildUnifiedCache();
}

/**
 * Buscar users únicos dos UserProducts unificados
 */
export async function getUniqueUsersFromUnified(unifiedUserProducts: any[]) {
  const uniqueUserIds = [...new Set(
    unifiedUserProducts
      .filter(up => up.userId)
      .map(up => {
        const userId = up.userId;
        return typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
      })
  )];

  return uniqueUserIds;
}