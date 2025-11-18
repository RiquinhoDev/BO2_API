// src/controllers/activecampaignV2.controller.ts
// 🎯 SPRINT 5.2 - Active Campaign Controller V2 (Tags por Produto)

import { Request, Response } from 'express';
import { UserProduct } from '../models/UserProduct';
import { Product } from '../models/Product';
import User from '../models/user';
import { activeCampaignService } from '../services/activeCampaignService';

/**
 * POST /api/activecampaign/v2/tag/apply
 * Aplica tag a um user em um produto específico
 * 
 * Body: {
 *   userId: string,
 *   productId: string,
 *   tagName: string
 * }
 */
export const applyTagToUserProduct = async (req: Request, res: Response) => {
  try {
    const { userId, productId, tagName } = req.body;
    
    if (!userId || !productId || !tagName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: userId, productId, tagName' 
      });
    }
    
    // Verificar se user e product existem
    const user = await User.findById(userId);
    const product = await Product.findById(productId);
    
    if (!user || !product) {
      return res.status(404).json({ 
        success: false, 
        message: 'User ou Product não encontrado' 
      });
    }
    
    // Buscar ou criar UserProduct
    let userProduct = await UserProduct.findOne({ userId, productId });
    
    if (!userProduct) {
      userProduct = await UserProduct.create({
        userId,
        productId,
        status: 'active',
        progress: { progressPercentage: 0 }
      });
    }
    
    // Aplicar tag no Active Campaign
    const acContact = await activeCampaignService.findOrCreateContact(user.email);
    await activeCampaignService.addTag(acContact.id, tagName);
    
    // Registar tag no UserProduct
    if (!userProduct.activeCampaignData) {
      userProduct.activeCampaignData = {
        contactId: acContact.id,
        tags: []
      };
    }
    
    if (!userProduct.activeCampaignData.tags.includes(tagName)) {
      userProduct.activeCampaignData.tags.push(tagName);
    }
    
    userProduct.activeCampaignData.lastSyncAt = new Date();
    await userProduct.save();
    
    res.json({ 
      success: true, 
      data: {
        userId: user._id,
        productId: product._id,
        productName: product.name,
        tagApplied: tagName,
        acContactId: acContact.id
      },
      _v2Enabled: true 
    });
    
  } catch (error: any) {
    console.error('[AC TAG APPLY ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/activecampaign/v2/tag/remove
 * Remove tag de um user em um produto específico
 */
export const removeTagFromUserProduct = async (req: Request, res: Response) => {
  try {
    const { userId, productId, tagName } = req.body;
    
    if (!userId || !productId || !tagName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: userId, productId, tagName' 
      });
    }
    
    const userProduct = await UserProduct.findOne({ userId, productId });
    
    if (!userProduct || !userProduct.activeCampaignData) {
      return res.status(404).json({ 
        success: false, 
        message: 'UserProduct ou AC data não encontrado' 
      });
    }
    
    // Remover tag no Active Campaign
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User não encontrado' });
    }
    
    const acContact = await activeCampaignService.findOrCreateContact(user.email);
    await activeCampaignService.removeTag(acContact.id, tagName);
    
    // Remover tag do array no UserProduct
    userProduct.activeCampaignData.tags = userProduct.activeCampaignData.tags.filter(
      t => t !== tagName
    );
    userProduct.activeCampaignData.lastSyncAt = new Date();
    await userProduct.save();
    
    res.json({ 
      success: true, 
      data: {
        userId,
        productId,
        tagRemoved: tagName
      },
      _v2Enabled: true 
    });
    
  } catch (error: any) {
    console.error('[AC TAG REMOVE ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/activecampaign/v2/products/:productId/tagged
 * Lista users com tags específicas em um produto
 */
export const getUsersWithTagsInProduct = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { tag } = req.query;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product não encontrado' });
    }
    
    // Buscar UserProducts deste produto
    const query: any = { productId };
    
    if (tag) {
      query['activeCampaignData.tags'] = tag;
    }
    
    const userProducts = await UserProduct.find(query)
      .populate('userId', 'name email')
      .populate('productId', 'name code platform')
      .lean();
    
    const enrichedData = userProducts.map(up => ({
      user: up.userId,
      product: up.productId,
      tags: up.activeCampaignData?.tags || [],
      lastSync: up.activeCampaignData?.lastSyncAt,
      progress: up.progress?.progressPercentage || 0
    }));
    
    res.json({ 
      success: true, 
      data: enrichedData,
      count: enrichedData.length,
      filters: { productId, tag },
      _v2Enabled: true 
    });
    
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/activecampaign/v2/stats
 * Estatísticas gerais do Active Campaign por produto
 */
export const getACStats = async (req: Request, res: Response) => {
  try {
    const products = await Product.find().lean();
    
    const stats = await Promise.all(
      products.map(async (product) => {
        const userProducts = await UserProduct.find({ 
          productId: product._id,
          'activeCampaignData.tags': { $exists: true, $ne: [] }
        }).lean();
        
        // Contar tags únicas
        const allTags = userProducts.flatMap(up => up.activeCampaignData?.tags || []);
        const uniqueTags = [...new Set(allTags)];
        
        return {
          productId: product._id,
          productName: product.name,
          platform: product.platform,
          totalUsersWithTags: userProducts.length,
          uniqueTags: uniqueTags.length,
          tagList: uniqueTags
        };
      })
    );
    
    res.json({ 
      success: true, 
      data: stats,
      summary: {
        totalProducts: products.length,
        totalUsersWithTags: stats.reduce((sum, s) => sum + s.totalUsersWithTags, 0),
        totalUniqueTags: [...new Set(stats.flatMap(s => s.tagList))].length
      },
      _v2Enabled: true 
    });
    
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/activecampaign/v2/sync/:productId
 * Sincroniza tags do AC para um produto específico
 */
export const syncProductTags = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product não encontrado' });
    }
    
    // Buscar todos os UserProducts deste produto
    const userProducts = await UserProduct.find({ productId })
      .populate('userId', 'email')
      .lean();
    
    const results = {
      synced: 0,
      failed: 0,
      errors: [] as any[]
    };
    
    for (const up of userProducts) {
      try {
        const user = up.userId as any;
        const acContact = await activeCampaignService.findOrCreateContact(user.email);
        
        // Atualizar contactId no UserProduct se necessário
        await UserProduct.findByIdAndUpdate(up._id, {
          'activeCampaignData.contactId': acContact.id,
          'activeCampaignData.lastSyncAt': new Date()
        });
        
        results.synced++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          userProductId: up._id,
          error: error.message
        });
      }
    }
    
    res.json({ 
      success: true, 
      data: results,
      productId,
      productName: product.name,
      _v2Enabled: true 
    });
    
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

