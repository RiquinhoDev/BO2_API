// src/controllers/hotmartV2.controller.ts
// 🎯 SPRINT 5.2 - Hotmart Controller V2

import { Request, Response } from 'express';
import { Product } from '../models/Product';
import { 
  getUsersByProduct,
  getUserCountForProduct
} from '../services/userProductService';

/**
 * GET /api/hotmart/v2/products
 * Lista todos os produtos Hotmart
 */
export const getHotmartProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'hotmart' })
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
 * GET /api/hotmart/v2/products/:subdomain
 * Busca produto Hotmart específico por subdomain
 */
export const getHotmartProductBySubdomain = async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    
    const product = await Product.findOne({ 
      platform: 'hotmart',
      'platformData.subdomain': subdomain 
    }).lean();
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: `Produto Hotmart não encontrado para subdomain: ${subdomain}` 
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
 * GET /api/hotmart/v2/products/:subdomain/users
 * Lista users de um produto Hotmart específico
 */
export const getHotmartProductUsers = async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    const { status, minProgress } = req.query;
    
    // Buscar produto
    const product = await Product.findOne({ 
      platform: 'hotmart',
      'platformData.subdomain': subdomain 
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: `Produto Hotmart não encontrado para subdomain: ${subdomain}` 
      });
    }
    
    // Buscar users
    let users = await getUsersByProduct(product._id.toString());
    
    // Filtrar por status se fornecido
    if (status) {
      users = users.filter(u => 
        u.products.some((p: any) => 
          p.product._id.toString() === product._id.toString() && 
          p.platformSpecificData?.hotmart?.status === status
        )
      );
    }
    
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
      filters: { status, minProgress },
      _v2Enabled: true 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/hotmart/v2/stats
 * Estatísticas gerais dos produtos Hotmart
 */
export const getHotmartStats = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'hotmart' }).lean();
    
    const stats = await Promise.all(
      products.map(async (product) => {
        const users = await getUsersByProduct(product._id.toString());
        
        return {
          productId: product._id,
          productName: product.name,
          subdomain: product.platformData.subdomain,
          totalUsers: users.length,
          activeUsers: users.filter(u => 
            u.products.some((p: any) => 
              p.product._id.toString() === product._id.toString() && 
              p.platformSpecificData?.hotmart?.status === 'active'
            )
          ).length
        };
      })
    );
    
    res.json({ 
      success: true, 
      data: stats,
      summary: {
        totalProducts: products.length,
        totalUsers: stats.reduce((sum, s) => sum + s.totalUsers, 0),
        totalActiveUsers: stats.reduce((sum, s) => sum + s.activeUsers, 0)
      },
      _v2Enabled: true 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

