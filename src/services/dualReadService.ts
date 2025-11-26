// ═══════════════════════════════════════════════════════════════════════════
// 📁 BO2_API/src/services/dualReadService.ts
// 🔄 DUAL READ SERVICE - CORRIGIDO PARA ESTRUTURA REAL DO USER
// ═══════════════════════════════════════════════════════════════════════════
// Data: 27 Novembro 2025
// Autor: Correção baseada em estrutura real do BD
// 
// PROBLEMA RESOLVIDO:
// - Código antigo procurava user.hotmart?.email (não existe)
// - Código novo usa user.hotmartUserId (campo real)
// - Converte engagement e progresso corretamente
// ═══════════════════════════════════════════════════════════════════════════

import User from '../models/user';
import UserProduct from '../models/UserProduct';
import Product from '../models/Product';

/**
 * 🔄 DUAL READ: Combina dados V1 (User) + V2 (UserProduct)
 * 
 * FLUXO:
 * 1. Busca TODOS os users da BD
 * 2. Busca TODOS os UserProducts V2 (se existirem)
 * 3. Para cada user:
 *    - Se tem UserProduct V2 → usa V2
 *    - Se NÃO tem V2 → converte dados V1 para formato V2
 * 
 * ESTRUTURA REAL DO USER V1:
 * - user.hotmartUserId (campo direto)
 * - user.curseducaUserId (campo direto)
 * - user.hotmart.engagement.engagementScore (nested)
 * - user.hotmart.progress.completedLessons (nested)
 * - user.curseduca.engagement.engagementScore (nested)
 * - user.curseduca.progress.estimatedProgress (nested)
 */
export async function getAllUsersUnified() {
  console.log('\n🔄 [DUAL READ] Iniciando conversão V1→V2...');
  const startTime = Date.now();

  // ========================================================================
  // 1. BUSCAR TODOS OS USERS (V1)
  // ========================================================================
  const users = await User.find({ 
    isDeleted: { $ne: true } 
  }).lean() as any[];  // ✅ Cast para any[] para evitar erros de tipagem com lean()
  
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
    // Validar populate
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
  // 4. BUSCAR PRODUTOS DA BD
  // ========================================================================
  const products = await Product.find().lean() as any[];  // ✅ Cast para any[]
  
  // Mapear produtos por código E por platform
  const productsByCode = new Map(
    products.map(p => [p.code.toUpperCase(), p])
  );
  
  const productsByPlatform = {
    hotmart: products.find(p => p.platform === 'hotmart'),
    curseduca: products.find(p => p.platform === 'curseduca'),
    discord: products.find(p => p.platform === 'discord')
  };
  
  console.log(`   ✅ ${products.length} produtos disponíveis:`);
  console.log(`      🔥 Hotmart: ${productsByPlatform.hotmart?.name || 'N/A'}`);
  console.log(`      📚 CursEduca: ${productsByPlatform.curseduca?.name || 'N/A'}`);
  console.log(`      💬 Discord: ${productsByPlatform.discord?.name || 'N/A'}`);

  // ========================================================================
  // 5. CONVERTER DADOS V1 → V2
  // ========================================================================
  const unifiedUserProducts: any[] = [];
  let hotmartConverted = 0;
  let curseducaConverted = 0;
  let discordConverted = 0;
  let v2Used = 0;

  for (const user of users) {
    const userId = user._id.toString();

    // ─────────────────────────────────────────────────────────────
    // SE USER JÁ TEM USERPRODUCTS V2 → USA ESSES!
    // ─────────────────────────────────────────────────────────────
    if (userProductsByUserId.has(userId)) {
      const ups = userProductsByUserId.get(userId)!;
      unifiedUserProducts.push(...ups);
      v2Used += ups.length;
      continue; // Não precisa converter V1
    }

    // ─────────────────────────────────────────────────────────────
    // SENÃO, CONVERTER V1 → V2
    // ─────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────
    // HOTMART
    // ─────────────────────────────────────────────────────────────
    if ((user as any).hotmartUserId) {  // ✅ Campo direto
      const hotmartProduct = productsByPlatform.hotmart;
      
      if (hotmartProduct) {
        const hotmartData = (user as any).hotmart || {};
        const engagement = hotmartData.engagement || {};
        const progress = hotmartData.progress || {};
        
        // Calcular progresso baseado em lições completadas
        let progressPercentage = 0;
        if (progress.lessonsData && progress.lessonsData.length > 0) {
          const completedLessons = progress.lessonsData.filter((l: any) => l.completed).length;
          progressPercentage = Math.round((completedLessons / progress.lessonsData.length) * 100);
        } else if (progress.completedLessons) {
          // Fallback: usar completedLessons direto
          progressPercentage = Math.min(progress.completedLessons, 100);
        }
        
        // Calcular status baseado em lastAccessDate
        let status = 'ACTIVE';
        const lastAccessDate = progress.lastAccessDate;
        if (lastAccessDate) {
          const daysSince = (Date.now() - new Date(lastAccessDate).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince > 30) {
            status = 'INACTIVE';
          }
        }
        
        unifiedUserProducts.push({
          _id: `v1-hotmart-${userId}`,
          userId: {
            _id: user._id,
            name: (user as any).name,
            email: (user as any).email
          },
          productId: hotmartProduct,
          platform: 'hotmart',
          platformUserId: (user as any).hotmartUserId,
          status,
          progress: {
            percentage: progressPercentage,
            currentModule: 0,
            modulesCompleted: [],
            lessonsCompleted: progress.lessonsData?.filter((l: any) => l.completed).map((l: any) => l.lessonId) || [],
            lastActivity: progress.lastAccessDate || null
          },
          engagement: {
            engagementScore: engagement.engagementScore || 0,
            engagementLevel: engagement.engagementLevel || 'NONE',
            lastLogin: progress.lastAccessDate || null,
            daysSinceLastLogin: lastAccessDate 
              ? Math.floor((Date.now() - new Date(lastAccessDate).getTime()) / (1000 * 60 * 60 * 24))
              : null,
            totalLogins: engagement.accessCount || 0
          },
          enrolledAt: hotmartData.signupDate || hotmartData.purchaseDate || (user as any).createdAt || new Date(),
          source: 'MIGRATION',
          _isV1: true,
          _platform: 'hotmart'
        });
        
        hotmartConverted++;
      } else {
        console.warn(`   ⚠️ User ${userId} tem hotmartUserId mas produto Hotmart não existe na BD`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // CURSEDUCA
    // ─────────────────────────────────────────────────────────────
    if ((user as any).curseducaUserId) {  // ✅ Campo direto
      const curseducaProduct = productsByPlatform.curseduca;
      
      if (curseducaProduct) {
        const curseducaData = (user as any).curseduca || {};
        const engagement = curseducaData.engagement || {};
        const progress = curseducaData.progress || {};
        
        // Status baseado em expiração
        let status = 'ACTIVE';
        const expiresAt = curseducaData.enrolledClasses?.[0]?.expiresAt;
        if (expiresAt && new Date(expiresAt) < new Date()) {
          status = 'INACTIVE';
        }
        
        // Progresso estimado
        const progressPercentage = progress.estimatedProgress || 0;
        
        unifiedUserProducts.push({
          _id: `v1-curseduca-${userId}`,
          userId: {
            _id: user._id,
            name: (user as any).name,
            email: (user as any).email
          },
          productId: curseducaProduct,
          platform: 'curseduca',
          platformUserId: (user as any).curseducaUserId,
          platformUserUuid: curseducaData.curseducaUuid,
          status,
          progress: {
            percentage: progressPercentage,
            lastActivity: progress.lastAccessDate || null
          },
          engagement: {
            engagementScore: engagement.engagementScore || 0,
            engagementLevel: engagement.engagementLevel || 'NONE',
            lastAction: progress.lastAccessDate || null,
            totalActions: engagement.accessCount || 0
          },
          enrolledAt: curseducaData.enrolledClasses?.[0]?.enteredAt || (user as any).createdAt || new Date(),
          source: 'MIGRATION',
          _isV1: true,
          _platform: 'curseduca'
        });
        
        curseducaConverted++;
      } else {
        console.warn(`   ⚠️ User ${userId} tem curseducaUserId mas produto CursEduca não existe na BD`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // DISCORD
    // ─────────────────────────────────────────────────────────────
    const discordData = (user as any).discord;
    const discordIds = discordData?.discordIds || (user as any).discordIds;
    
    if (discordIds && discordIds.length > 0) {
      const discordProduct = productsByPlatform.discord;
      
      if (discordProduct) {
        unifiedUserProducts.push({
          _id: `v1-discord-${userId}`,
          userId: {
            _id: user._id,
            name: (user as any).name,
            email: (user as any).email
          },
          productId: discordProduct,
          platform: 'discord',
          platformUserId: discordIds[0], // Primeiro Discord ID
          status: discordData?.isDeleted ? 'INACTIVE' : 'ACTIVE',
          progress: {
            percentage: 0  // Discord não tem progresso mensurável
          },
          engagement: {
            engagementScore: 0,  // Discord engagement é diferente
            engagementLevel: 'NONE'
          },
          enrolledAt: discordData?.createdAt || (user as any).createdAt || new Date(),
          source: 'MIGRATION',
          _isV1: true,
          _platform: 'discord'
        });
        
        discordConverted++;
      }
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
  console.log(`      🔥 Hotmart: ${hotmartConverted}`);
  console.log(`      📚 CursEduca: ${curseducaConverted}`);
  console.log(`      💬 Discord: ${discordConverted}`);
  console.log(`   ════════════════════════════════════════\n`);

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