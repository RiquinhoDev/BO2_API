// BO2_API/src/services/dualReadService.ts
// 🔄 DUAL READ SERVICE - Combina dados V1 (User) + V2 (UserProduct)
// Data: 26 Novembro 2025

import User from '../models/user';
import UserProduct from '../models/UserProduct';
import Product from '../models/Product';

/**
 * 🔄 DUAL READ: Combina dados V1 (User) + V2 (UserProduct)
 * 
 * Retorna estrutura unificada:
 * - Se user tem UserProducts → usa V2
 * - Se user só tem dados V1 (hotmart/curseduca/discord) → converte para formato V2
 * - Combina ambos se existirem
 * 
 * @returns Array de UserProducts unificados (V1 convertidos + V2 nativos)
 */
export async function getAllUsersUnified() {
  console.log('🔄 [DUAL READ] Iniciando...');
  const startTime = Date.now();

  // ========================================================================
  // 1. BUSCAR TODOS OS USERS
  // ========================================================================
  const users = await User.find().lean();
  console.log(`   ✅ ${users.length} users encontrados`);

  // ========================================================================
  // 2. BUSCAR TODOS OS USERPRODUCTS V2
  // ========================================================================
  const userProducts = await UserProduct.find()
    .populate('userId', 'name email')
    .populate('productId', 'name code platform')
    .lean();
  console.log(`   ✅ ${userProducts.length} UserProducts V2 encontrados`);

  // ========================================================================
  // 3. MAPEAR USERPRODUCTS POR USERID
  // ========================================================================
  const userProductsByUserId = new Map<string, any[]>();
  const validUserProducts: any[] = [];
  
  userProducts.forEach(up => {
    // Validar populate
    if (!up.userId || !up.productId) {
      console.warn(`   ⚠️ UserProduct ${up._id} sem populate completo (ignorado)`);
      return;
    }
    
    const userId = (up.userId as any)._id?.toString() || up.userId.toString();
    if (!userProductsByUserId.has(userId)) {
      userProductsByUserId.set(userId, []);
    }
    userProductsByUserId.get(userId)!.push(up);
    validUserProducts.push(up);
  });

  console.log(`   ✅ ${validUserProducts.length} UserProducts V2 válidos`);

  // ========================================================================
  // 4. BUSCAR PRODUTOS PARA CONVERSÃO V1→V2
  // ========================================================================
  const products = await Product.find().lean();
  const productsByCode = new Map(products.map(p => [p.code, p]));
  const productsByPlatform = new Map<string, any>();
  
  // Mapear produtos por plataforma (fallback se code não existir)
  products.forEach(p => {
    if (p.platform && !productsByPlatform.has(p.platform)) {
      productsByPlatform.set(p.platform, p);
    }
  });

  console.log(`   ✅ ${products.length} produtos disponíveis para conversão`);

  // ========================================================================
  // 5. CONVERTER V1 PARA FORMATO V2
  // ========================================================================
  const convertedUserProducts: any[] = [];
  let hotmartConverted = 0;
  let curseducaConverted = 0;
  let discordConverted = 0;

  for (const user of users) {
    const userId = user._id.toString();

    // Se user JÁ TEM UserProducts V2, pular conversão
    if (userProductsByUserId.has(userId)) {
      continue;
    }

    // ===========================================================
    // HOTMART V1 → V2
    // ===========================================================
    if (user.hotmart?.email) {
      // Tentar encontrar produto Hotmart
      let hotmartProduct = productsByCode.get('OGI'); // Código comum Hotmart
      if (!hotmartProduct) {
        hotmartProduct = productsByCode.get('HOTMART');
      }
      if (!hotmartProduct) {
        hotmartProduct = productsByPlatform.get('hotmart');
      }

      if (hotmartProduct) {
        const hotmartData = user.hotmart;
        convertedUserProducts.push({
          _id: `v1-hotmart-${userId}`, // ID virtual
          userId: {
            _id: user._id,
            name: user.name,
            email: user.email
          },
          productId: hotmartProduct,
          platform: 'hotmart',
          status: hotmartData.memberStatus === 'active' ? 'ACTIVE' : 
                  hotmartData.memberStatus === 'cancelled' ? 'CANCELLED' :
                  hotmartData.memberStatus === 'inactive' ? 'INACTIVE' : 'ACTIVE',
          progress: {
            percentage: hotmartData.progress?.completedPercentage || 
                       hotmartData.progress?.progressPercentage || 0,
            lastActivity: hotmartData.progress?.lastActivity || hotmartData.lastLogin
          },
          engagement: {
            engagementScore: hotmartData.engagement?.engagementScore || 
                            hotmartData.engagement?.score || 0,
            lastLogin: hotmartData.lastLogin
          },
          enrolledAt: hotmartData.joinedDate || user.createdAt,
          source: 'MIGRATION', // Marcado como V1
          _isV1: true, // Flag para debug
          _v1Source: 'hotmart'
        });
        hotmartConverted++;
      }
    }

    // ===========================================================
    // CURSEDUCA V1 → V2
    // ===========================================================
    if (user.curseduca?.curseducaUserId) {
      let curseducaProduct = productsByCode.get('CLAREZA');
      if (!curseducaProduct) {
        curseducaProduct = productsByCode.get('CURSEDUCA');
      }
      if (!curseducaProduct) {
        curseducaProduct = productsByPlatform.get('curseduca');
      }

      if (curseducaProduct) {
        const curseducaData = user.curseduca;
        convertedUserProducts.push({
          _id: `v1-curseduca-${userId}`,
          userId: {
            _id: user._id,
            name: user.name,
            email: user.email
          },
          productId: curseducaProduct,
          platform: 'curseduca',
          status: curseducaData.memberStatus === 'active' ? 'ACTIVE' : 
                  curseducaData.memberStatus === 'cancelled' ? 'CANCELLED' :
                  curseducaData.memberStatus === 'inactive' ? 'INACTIVE' : 'ACTIVE',
          progress: {
            percentage: curseducaData.progress?.completedPercentage || 
                       curseducaData.progress?.progressPercentage || 0,
            lastActivity: curseducaData.progress?.lastActivity || curseducaData.lastLogin
          },
          engagement: {
            engagementScore: curseducaData.engagement?.engagementScore || 
                            curseducaData.engagement?.score || 0,
            lastLogin: curseducaData.lastLogin
          },
          enrolledAt: curseducaData.joinedDate || user.createdAt,
          source: 'MIGRATION',
          _isV1: true,
          _v1Source: 'curseduca'
        });
        curseducaConverted++;
      }
    }

    // ===========================================================
    // DISCORD V1 → V2
    // ===========================================================
    if (user.discord?.discordId) {
      let discordProduct = productsByCode.get('DISCORD');
      if (!discordProduct) {
        discordProduct = productsByPlatform.get('discord');
      }

      if (discordProduct) {
        const discordData = user.discord;
        convertedUserProducts.push({
          _id: `v1-discord-${userId}`,
          userId: {
            _id: user._id,
            name: user.name,
            email: user.email
          },
          productId: discordProduct,
          platform: 'discord',
          status: 'ACTIVE', // Discord sempre ativo se tem ID
          progress: {
            percentage: 0, // Discord não tem progresso de curso
            lastActivity: discordData.lastSeen || discordData.joinedDate
          },
          engagement: {
            engagementScore: discordData.engagement?.engagementScore || 
                            discordData.engagement?.score || 0,
            lastLogin: discordData.lastSeen
          },
          enrolledAt: discordData.joinedDate || user.createdAt,
          source: 'MIGRATION',
          _isV1: true,
          _v1Source: 'discord'
        });
        discordConverted++;
      }
    }
  }

  console.log(`   ✅ Conversão V1→V2 completa:`);
  console.log(`      - Hotmart: ${hotmartConverted}`);
  console.log(`      - CursEduca: ${curseducaConverted}`);
  console.log(`      - Discord: ${discordConverted}`);

  // ========================================================================
  // 6. COMBINAR V1 + V2
  // ========================================================================
  const unifiedUserProducts = [...validUserProducts, ...convertedUserProducts];
  
  const duration = Date.now() - startTime;
  console.log(`✅ [DUAL READ] ${unifiedUserProducts.length} UserProducts unificados em ${duration}ms`);
  console.log(`   📊 V2 Nativos: ${validUserProducts.length}`);
  console.log(`   📊 V1 Convertidos: ${convertedUserProducts.length}`);

  return unifiedUserProducts;
}

/**
 * Buscar users únicos dos UserProducts unificados
 */
export function getUniqueUsersFromUnified(unifiedUserProducts: any[]): string[] {
  const uniqueUserIds = [...new Set(
    unifiedUserProducts
      .filter(up => up.userId)
      .map(up => {
        const userId = up.userId;
        // Se é objeto (populate), pegar _id
        if (typeof userId === 'object' && userId._id) {
          return userId._id.toString();
        }
        // Se é string (já é o ID)
        return userId.toString();
      })
  )];

  return uniqueUserIds;
}

/**
 * Helper: Verificar se UserProduct é V1 convertido
 */
export function isV1Converted(userProduct: any): boolean {
  return userProduct._isV1 === true || 
         userProduct.source === 'MIGRATION' ||
         String(userProduct._id).startsWith('v1-');
}

/**
 * Helper: Obter source do UserProduct V1
 */
export function getV1Source(userProduct: any): string | null {
  if (!isV1Converted(userProduct)) return null;
  return userProduct._v1Source || null;
}

