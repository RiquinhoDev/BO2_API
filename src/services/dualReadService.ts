// BO2_API/src/services/dualReadService.ts
// 🔄 DUAL READ SERVICE - CORRIGIDO PARA ESTRUTURA REAL
// Data: 27 Novembro 2025

import User from '../models/user';
import UserProduct from '../models/UserProduct';
import Product from '../models/Product';

/**
 * 🔄 DUAL READ: Combina dados V1 (User) + V2 (UserProduct)
 * 
 * ✅ CORRIGIDO: Usa estrutura REAL do User:
 * - user.hotmartUserId (campo direto)
 * - user.curseducaUserId (campo direto)
 * - user.hotmart.engagement.engagementScore (nested)
 * - user.curseduca.progress.estimatedProgress (nested)
 */
export async function getAllUsersUnified() {
  console.log('🔄 [DUAL READ] Iniciando...');
  const startTime = Date.now();

  // ========================================================================
  // 1. BUSCAR TODOS OS USERS
  // ========================================================================
  const users = await User.find({ isDeleted: { $ne: true } }).lean();
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
  // 3. MAPEAR USERPRODUCTS V2 POR USERID
  // ========================================================================
  const userProductsByUserId = new Map<string, any[]>();
  const validUserProducts: any[] = [];
  
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
    validUserProducts.push(up);
  });
  console.log(`   ✅ ${validUserProducts.length} UserProducts V2 válidos`);

  // ========================================================================
  // 4. BUSCAR PRODUTOS PARA CONVERSÃO V1→V2
  // ========================================================================
  const products = await Product.find().lean();
  const productsByCode = new Map(products.map(p => [p.code.toUpperCase(), p]));
  
  console.log(`   ✅ ${products.length} produtos disponíveis`);

  // ========================================================================
  // 5. CONVERTER DADOS V1 PARA FORMATO V2
  // ========================================================================
  const unifiedUserProducts: any[] = [];

  for (const user of users) {
    const userId = user._id.toString();

    // Se user tem UserProducts V2, usa esses
    if (userProductsByUserId.has(userId)) {
      const ups = userProductsByUserId.get(userId)!;
      unifiedUserProducts.push(...ups);
      continue;
    }

    // SENÃO, converter dados V1 para formato V2

    // ─────────────────────────────────────────────────────────────
    // HOTMART
    // ─────────────────────────────────────────────────────────────
    if ((user as any).hotmart?.email) {
      const hotmartProduct = productsByCode.get('OGI') || 
                            productsByCode.get('GRANDE_INVESTIMENTO') ||
                            products.find(p => p.platform === 'hotmart');
      
      if (hotmartProduct) {
        const hotmartData = (user as any).hotmart;
        
        unifiedUserProducts.push({
          _id: `v1-hotmart-${userId}`,
          userId: user._id,
          productId: hotmartProduct,
          platform: 'hotmart',
          status: hotmartData.memberStatus === 'active' ? 'ACTIVE' : 'INACTIVE',
          progress: {
            percentage: hotmartData.progress?.completedPercentage || 0,
          },
          engagement: {
            engagementScore: hotmartData.engagement?.engagementScore || 0,
          },
          enrolledAt: hotmartData.joinedDate || user.createdAt,
          source: 'MIGRATION',
          _isV1: true,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // CURSEDUCA
    // ─────────────────────────────────────────────────────────────
    if ((user as any).curseduca?.curseducaUserId) {
      const curseducaProduct = productsByCode.get('CLAREZA') || 
                              productsByCode.get('RELATORIOS_CLAREZA') ||
                              products.find(p => p.platform === 'curseduca');
      
      if (curseducaProduct) {
        const curseducaData = (user as any).curseduca;
        
        unifiedUserProducts.push({
          _id: `v1-curseduca-${userId}`,
          userId: user._id,
          productId: curseducaProduct,
          platform: 'curseduca',
          status: curseducaData.memberStatus === 'active' ? 'ACTIVE' : 'INACTIVE',
          progress: {
            percentage: curseducaData.progress?.completedPercentage || 0,
          },
          engagement: {
            engagementScore: curseducaData.engagement?.engagementScore || 0,
          },
          enrolledAt: curseducaData.joinedDate || user.createdAt,
          source: 'MIGRATION',
          _isV1: true,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // DISCORD
    // ─────────────────────────────────────────────────────────────
    if ((user as any).discord?.discordId) {
      const discordProduct = productsByCode.get('DISCORD') || 
                            productsByCode.get('COMUNIDADE') ||
                            products.find(p => p.platform === 'discord');
      
      if (discordProduct) {
        const discordData = (user as any).discord;
        
        unifiedUserProducts.push({
          _id: `v1-discord-${userId}`,
          userId: user._id,
          productId: discordProduct,
          platform: 'discord',
          status: 'ACTIVE', // Discord sempre ativo se tem ID
          progress: {
            percentage: 0, // Discord não tem progresso
          },
          engagement: {
            engagementScore: discordData.engagement?.engagementScore || 0,
          },
          enrolledAt: discordData.joinedDate || user.createdAt,
          source: 'MIGRATION',
          _isV1: true,
        });
      }
    }
  }

  // ========================================================================
  // 6. STATS FINAIS
  // ========================================================================
  const duration = Date.now() - startTime;
  const v1Count = unifiedUserProducts.filter((up: any) => up._isV1).length;
  const v2Count = unifiedUserProducts.filter((up: any) => !up._isV1).length;

  console.log(`   ✅ ${unifiedUserProducts.length} UserProducts unificados (${duration}ms)`);
  console.log(`   📊 V1: ${v1Count} | V2: ${v2Count}`);

  // ✅ RETURN CORRETO!
  return unifiedUserProducts;
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

