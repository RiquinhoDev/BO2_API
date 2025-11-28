// src/controllers/syncV2.controller.ts
// 🎯 SPRINT 5.2 - Sync Universal Escalável (CORE)

import { Request, Response } from 'express';
import User from '../models/user';
import { Product } from '../models/Product';
import { UserProduct } from '../models/UserProduct';
import { 
  getUserWithProducts,
  dualWriteUserData
} from '../services/userProductService';
import { clearUnifiedCache } from '../services/dualReadService';

/**
 * GENERIC SYNC ENDPOINT - ESCALA PARA QUALQUER PLATAFORMA/PRODUTO
 * POST /api/sync/v2/generic
 * 
 * Body esperado:
 * {
 *   platform: string (ex: 'hotmart', 'curseduca', 'discord', 'udemy', 'shopify', etc)
 *   identifier: { key: value } (ex: { subdomain: 'ogi' } ou { groupId: '123' })
 *   userData: { email, name?, ... }
 *   productData: { status?, progress?, lastAccess?, classes?, ... }
 * }
 */
export const syncGeneric = async (req: Request, res: Response) => {
  try {
    const { platform, identifier, userData, productData } = req.body;
    
    // Validação básica
    if (!platform || !identifier || !userData?.email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: platform, identifier, userData.email' 
      });
    }
    
    // 1️⃣ IDENTIFICAR PRODUTO DINAMICAMENTE
    // Construir query baseado no identifier fornecido
    const productQuery: any = { platform };
    
    // Adicionar condições de identificação do platformData
    for (const [key, value] of Object.entries(identifier)) {
      productQuery[`platformData.${key}`] = value;
    }
    
    const product = await Product.findOne(productQuery);
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: `Produto não encontrado para platform="${platform}" com identifier=${JSON.stringify(identifier)}`,
        hint: 'Verifique se o produto foi criado na coleção Products'
      });
    }
    
    // 2️⃣ BUSCAR OU CRIAR USER
    let user = await User.findOne({ email: userData.email });
    
    if (!user) {
      console.log(`[SYNC V2] Criando novo user: ${userData.email}`);
      user = await User.create({ 
        email: userData.email, 
        name: userData.name || 'Unnamed User' 
      });
    }
    
    // 3️⃣ DUAL WRITE (V1 + V2)
    await dualWriteUserData(
      user._id.toString(),
      product._id.toString(),
      platform,
      productData
    );
    
    // 4️⃣ RETORNAR USER ENRIQUECIDO COM TODOS OS PRODUTOS
    const enrichedUser = await getUserWithProducts(user._id.toString());
    
    // 🗑️ Limpar cache (inicia warm-up em background)
    clearUnifiedCache();

    res.json({ 
      success: true, 
      data: enrichedUser,
      syncedProduct: {
        id: product._id,
        name: product.name,
        platform: product.platform
      },
      _v2Enabled: true 
    });
    
  } catch (error: any) {
    console.error('[SYNC V2 ERROR]', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * HOTMART SYNC - Wrapper para backward compatibility
 * POST /api/sync/v2/hotmart
 */
export const syncHotmart = async (req: Request, res: Response) => {
  try {
    const { email, subdomain, name, status, progress, lastAccess, classes } = req.body;
    
    // Validação
    if (!email || !subdomain) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: email, subdomain' 
      });
    }
    
    // Redirecionar para sync genérico
    req.body = {
      platform: 'hotmart',
      identifier: { subdomain },
      userData: { email, name },
      productData: { 
        status, 
        progressPercentage: progress,
        lastActivityAt: lastAccess ? new Date(lastAccess) : new Date(),
        classes: classes || []
      }
    };
    
    return syncGeneric(req, res);
    
  } catch (error: any) {
    console.error('[HOTMART SYNC ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * CURSEDUCA SYNC - Wrapper para backward compatibility
 * POST /api/sync/v2/curseduca
 */
export const syncCurseduca = async (req: Request, res: Response) => {
  try {
    const { email, groupId, name, progress, enrollmentDate, lastAccess } = req.body;
    
    // Validação
    if (!email || !groupId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: email, groupId' 
      });
    }
    
    // Redirecionar para sync genérico
    req.body = {
      platform: 'curseduca',
      identifier: { groupId },
      userData: { email, name },
      productData: { 
        progressPercentage: progress,
        enrollmentDate: enrollmentDate ? new Date(enrollmentDate) : undefined,
        lastActivityAt: lastAccess ? new Date(lastAccess) : new Date()
      }
    };
    
    return syncGeneric(req, res);
    
  } catch (error: any) {
    console.error('[CURSEDUCA SYNC ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DISCORD SYNC - Wrapper para backward compatibility
 * POST /api/sync/v2/discord
 */
export const syncDiscord = async (req: Request, res: Response) => {
  try {
    const { email, discordId, username, serverId, roles, lastSeen } = req.body;
    
    // Validação
    if (!email || !discordId || !serverId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: email, discordId, serverId' 
      });
    }
    
    // Redirecionar para sync genérico
    req.body = {
      platform: 'discord',
      identifier: { serverId },
      userData: { email, name: username },
      productData: { 
        discordUserId: discordId,
        discordUsername: username,
        roles: roles || [],
        lastActivityAt: lastSeen ? new Date(lastSeen) : new Date()
      }
    };
    
    return syncGeneric(req, res);
    
  } catch (error: any) {
    console.error('[DISCORD SYNC ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * BATCH SYNC - Sincronizar múltiplos users de uma vez
 * POST /api/sync/v2/batch
 * 
 * Body: {
 *   platform: string,
 *   identifier: object,
 *   users: [{ userData, productData }, ...]
 * }
 */
export const syncBatch = async (req: Request, res: Response) => {
  try {
    const { platform, identifier, users } = req.body;
    
    if (!platform || !identifier || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields or empty users array' 
      });
    }
    
    // Processar cada user
    const results = {
      success: [] as any[],
      failed: [] as any[]
    };
    
    for (const userData of users) {
      try {
        // Simular request individual
        const mockReq = {
          body: {
            platform,
            identifier,
            userData: userData.userData,
            productData: userData.productData
          }
        } as Request;
        
        const mockRes = {
          json: (data: any) => {
            if (data.success) {
              results.success.push({
                email: userData.userData.email,
                userId: data.data._id
              });
            } else {
              results.failed.push({
                email: userData.userData.email,
                error: data.message
              });
            }
          },
          status: () => mockRes
        } as unknown as Response;
        
        await syncGeneric(mockReq, mockRes);
        
      } catch (error: any) {
        results.failed.push({
          email: userData.userData.email,
          error: error.message
        });
      }
    }
    
    // 🗑️ Limpar cache após batch sync (inicia warm-up em background)
    clearUnifiedCache();

    res.json({ 
      success: true, 
      data: results,
      summary: {
        total: users.length,
        successful: results.success.length,
        failed: results.failed.length
      },
      _v2Enabled: true 
    });
    
  } catch (error: any) {
    console.error('[BATCH SYNC ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/sync/v2/status
 * Verificar status do sistema de sync
 */
export const getSyncStatus = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalUserProducts = await UserProduct.countDocuments();
    
    // Contar por plataforma
    const productsByPlatform = await Product.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } }
    ]);
    
    const userProductsByPlatform = await UserProduct.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      { $group: { _id: '$product.platform', count: { $sum: 1 } } }
    ]);
    
    res.json({ 
      success: true, 
      data: {
        users: totalUsers,
        products: totalProducts,
        userProducts: totalUserProducts,
        productsByPlatform,
        userProductsByPlatform
      },
      _v2Enabled: true 
    });
    
  } catch (error: any) {
    console.error('[SYNC STATUS ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

