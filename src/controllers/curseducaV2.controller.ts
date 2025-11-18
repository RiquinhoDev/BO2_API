// src/controllers/curseducaV2.controller.ts
// 🎯 SPRINT 5.2 - CursEduca Controller V2

import { Request, Response } from 'express';
import { Product } from '../models/Product';
import { 
  getUsersByProduct,
  getUserCountForProduct
} from '../services/userProductService';

/**
 * GET /api/curseduca/v2/products
 * Lista todos os produtos CursEduca
 */
export const getCurseducaProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'curseduca' })
      .select('name code platformData isActive')
      .lean();
    
    res.json({ 
      success: true, 
      data: products,
      count: products.length,
      _v2Enabled: true 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/curseduca/v2/products/:groupId
 * Busca produto CursEduca específico por groupId
 */
export const getCurseducaProductByGroupId = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    
    const product = await Product.findOne({ 
      platform: 'curseduca',
      'platformData.groupId': groupId 
    }).lean();
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: `Produto CursEduca não encontrado para groupId: ${groupId}` 
      });
    }
    
    // Contar users neste produto
    const userCount = await getUserCountForProduct(product._id.toString());
    
    res.json({ 
      success: true, 
      data: {
        ...product,
        userCount
      },
      _v2Enabled: true 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/curseduca/v2/products/:groupId/users
 * Lista users de um produto CursEduca específico
 */
export const getCurseducaProductUsers = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { minProgress } = req.query;
    
    // Buscar produto
    const product = await Product.findOne({ 
      platform: 'curseduca',
      'platformData.groupId': groupId 
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: `Produto CursEduca não encontrado para groupId: ${groupId}` 
      });
    }
    
    // Buscar users
    let users = await getUsersByProduct(product._id.toString());
    
    // Filtrar por progresso mínimo se fornecido
    if (minProgress) {
      const minProg = parseInt(minProgress as string);
      users = users.filter(u => 
        u.products.some((p: any) => 
          p.product._id.toString() === product._id.toString() && 
          (p.progress?.progressPercentage || 0) >= minProg
        )
      );
    }
    
    res.json({ 
      success: true, 
      data: users,
      count: users.length,
      filters: { minProgress },
      _v2Enabled: true 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/curseduca/v2/stats
 * Estatísticas gerais dos produtos CursEduca
 */
export const getCurseducaStats = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'curseduca' }).lean();
    
    const stats = await Promise.all(
      products.map(async (product) => {
        const users = await getUsersByProduct(product._id.toString());
        
        const avgProgress = users.length > 0
          ? users.reduce((sum, u) => {
              const productData = u.products.find((p: any) => 
                p.product._id.toString() === product._id.toString()
              );
              return sum + (productData?.progress?.progressPercentage || 0);
            }, 0) / users.length
          : 0;
        
        return {
          productId: product._id,
          productName: product.name,
          groupId: product.platformData.groupId,
          totalUsers: users.length,
          averageProgress: Math.round(avgProgress)
        };
      })
    );
    
    res.json({ 
      success: true, 
      data: stats,
      summary: {
        totalProducts: products.length,
        totalUsers: stats.reduce((sum, s) => sum + s.totalUsers, 0),
        overallAvgProgress: Math.round(
          stats.reduce((sum, s) => sum + s.averageProgress, 0) / (stats.length || 1)
        )
      },
      _v2Enabled: true 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

