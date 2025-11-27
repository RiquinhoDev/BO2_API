// src/controllers/usersV2.controller.ts
// 🎯 SPRINT 5.2 - Controllers V2 com Arquitetura Escalável

import { Request, Response } from 'express';
import User from '../models/user';
import UserProduct from '../models/UserProduct';
import { 
  getUserWithProducts,
  getUsersByProduct,
  getUserCountsByPlatform,
  getUserCountsByProduct
} from '../services/userProductService';

/**
 * GET /api/users/v2
 * Lista todos os users com seus produtos (V2)
 * 🎯 FASE 4: Suporte para novos filtros (progressLevel, engagementLevel, enrolledAfter, search)
 */
export const getUsers = async (req: Request, res: Response) => {
  try {
    // Query params para filtros
    const { 
      platform, 
      productId, 
      status,
      search,           // Nome ou email
      progressLevel,    // MUITO_BAIXO, BAIXO, MEDIO, ALTO, MUITO_ALTO
      engagementLevel,  // MUITO_BAIXO,BAIXO (pode ser múltiplos)
      enrolledAfter,    // ISO date string
      page = '1',
      limit = '50'
    } = req.query;
    
    let query: any = {};
    
    // Filtro: Pesquisa por nome ou email
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex }
      ];
    }
    
    // Filtro: Data de inscrição
    if (enrolledAfter) {
      query.createdAt = { $gte: new Date(enrolledAfter as string) };
    }
    
    // Se filtrar por produto específico
    if (productId) {
      const usersWithProduct = await getUsersByProduct(productId as string);
      return res.json({ 
        success: true, 
        data: usersWithProduct,
        count: usersWithProduct.length,
        _v2Enabled: true,
        filters: { productId }
      });
    }
    
    // Buscar todos os users
    const users = await User.find(query).select('name email createdAt').lean();
    
    // Enriquecer cada user com seus produtos V2
    let usersWithProducts = await Promise.all(
      users.map(async (user) => {
        const enrichedUser = await getUserWithProducts(user._id.toString());
        
        // Aplicar filtros se necessário
        if (platform) {
          enrichedUser.products = enrichedUser.products.filter(
            (p: any) => p.product.platform === platform
          );
        }
        
        if (status) {
          enrichedUser.products = enrichedUser.products.filter(
            (p: any) => p.status === status
          );
        }
        
        // Filtro: Progresso por nível
        if (progressLevel) {
          const progressRanges: any = {
            'MUITO_BAIXO': { min: 0, max: 25 },
            'BAIXO': { min: 25, max: 40 },
            'MEDIO': { min: 40, max: 60 },
            'ALTO': { min: 60, max: 80 },
            'MUITO_ALTO': { min: 80, max: 100 }
          };
          
          const range = progressRanges[progressLevel as string];
          if (range) {
            enrichedUser.products = enrichedUser.products.filter((p: any) => {
              const progress = p.progress?.progressPercentage || 0;
              return progress >= range.min && progress < range.max;
            });
          }
        }
        
        // Filtro: Engagement por nível (pode ser múltiplos separados por vírgula)
        if (engagementLevel) {
          const levels = (engagementLevel as string).split(',');
          enrichedUser.products = enrichedUser.products.filter((p: any) => {
            const level = p.engagement?.engagementLevel || '';
            return levels.includes(level);
          });
        }
        
        return enrichedUser;
      })
    );
    
    // Filtrar users que não têm produtos após filtros
    const hasFilters = platform || status || progressLevel || engagementLevel;
    let filteredUsers = hasFilters 
      ? usersWithProducts.filter(u => u.products.length > 0)
      : usersWithProducts;
    
    // Paginação
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const total = filteredUsers.length;
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
    
    res.json({ 
      success: true, 
      data: paginatedUsers,
      pagination: {
        total,
        totalPages: Math.ceil(total / limitNum),
        currentPage: pageNum,
        pageSize: limitNum,
        hasMore: endIndex < total
      },
      _v2Enabled: true,
      filters: { platform, status, search, progressLevel, engagementLevel, enrolledAfter }
    });
  } catch (error: any) {
    console.error('Error in getUsers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/users/v2/:id
 * Busca user específico com todos os seus produtos
 */
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Usar serviço V2 que já enriquece com produtos
    const user = await getUserWithProducts(id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: user,
      _v2Enabled: true 
    });
  } catch (error: any) {
    console.error('Error in getUserById:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/users/v2/by-product/:productId
 * Lista users de um produto específico
 */
export const getUsersByProduct = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { status } = req.query;
    
    let users = await getUsersByProduct(productId);
    
    // Filtrar por status se fornecido
    if (status) {
      users = users.filter(u => 
        u.products.some((p: any) => 
          p.product._id.toString() === productId && p.status === status
        )
      );
    }
    
    res.json({ 
      success: true, 
      data: users,
      count: users.length,
      productId,
      _v2Enabled: true 
    });
  } catch (error: any) {
    console.error('Error in getUsersByProduct:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/users/v2/by-email/:email
 * Busca user por email com todos os produtos
 */
export const getUserByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    
    const user = await User.findOne({ email }).lean();
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const enrichedUser = await getUserWithProducts(user._id.toString());
    
    res.json({ 
      success: true, 
      data: enrichedUser,
      _v2Enabled: true 
    });
  } catch (error: any) {
    console.error('Error in getUserByEmail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/users/v2
 * Cria novo user (básico, sem produtos ainda)
 */
export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;
    
    // Verificar se já existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User already exists' 
      });
    }
    
    // Criar user básico
    const user = await User.create({ email, name });
    
    // Retornar com estrutura V2 (products vazio)
    const enrichedUser = await getUserWithProducts(user._id.toString());
    
    res.status(201).json({ 
      success: true, 
      data: enrichedUser,
      _v2Enabled: true 
    });
  } catch (error: any) {
    console.error('Error in createUser:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/users/v2/stats/overview
 * Estatísticas gerais de users e produtos
 */
export const getUsersStats = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    
    // Contar users por plataforma (usando agregação V2)
    const usersByPlatform = await getUserCountsByPlatform();
    
    // Contar users por produto
    const usersByProduct = await getUserCountsByProduct();
    
    res.json({ 
      success: true, 
      data: {
        totalUsers,
        byPlatform: usersByPlatform,
        byProduct: usersByProduct
      },
      _v2Enabled: true 
    });
  } catch (error: any) {
    console.error('Error in getUsersStats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v2/users/:userId/products
 * Busca todos os produtos de um user específico
 */
export const getUserProducts = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Verificar se user existe
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Buscar todos os UserProducts do user
    const userProducts = await UserProduct.find({ userId })
      .populate('productId', 'name code platform')
      .lean();
    
    res.json({
      success: true,
      data: userProducts,
      count: userProducts.length
    });
  } catch (error: any) {
    console.error('Error in getUserProducts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

