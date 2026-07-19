/**
 * 🎮 DISCOVERY CONTROLLER
 */

import { Request, Response } from 'express';
import Product from '../models/product/Product';
import ProductProfile from '../models/product/ProductProfile';
import Course from '../models/Course';

import hotmartDiscoveryService from '../services/discovery/hotmartDiscovery.service';
import intelligentDefaultsService from '../services/discovery/intelligentDefaults.service';
import { validateConfigurationData } from '../types/discovery.types';

/**
 * POST /api/discovery/run
 * Executar discovery completo
 */
export const runDiscovery = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Executando discovery completo...');

    const hotmartProducts = await hotmartDiscoveryService.discoverNewProducts();
    
    const executionTime = Date.now() - startTime;
    const totalFound = hotmartProducts.length;
    const highConfidenceItems = hotmartProducts.filter(p => p.confidence.level === 'high').length;

    const result = {
      hotmartProducts,
      totalFound,
      executionTime,
      lastRun: new Date(),
      summary: {
        highConfidenceItems,
        readyToConfigureItems: highConfidenceItems
      }
    };

    res.json({
      success: true,
      data: result,
      message: `Discovery completo: ${totalFound} produtos encontrados`
    });

  } catch (error: any) {
    console.error('❌ Erro no discovery:', error);
    res.status(500).json({
      success: false,
      error: 'Erro no discovery',
      details: error.message
    });
  }
};

/**
 * POST /api/discovery/generate-config
 * Gerar configuração inteligente
 */
export const generateConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { discoveredProduct } = req.body;

    if (!discoveredProduct) {
      res.status(400).json({
        success: false,
        error: 'Produto descoberto é obrigatório'
      });
      return;
    }

    const configuration = intelligentDefaultsService.generateConfiguration(discoveredProduct);

    res.json({
      success: true,
      data: { configuration },
      message: 'Configuração gerada com sucesso'
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar configuração:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar configuração',
      details: error.message
    });
  }
};

/**
 * POST /api/discovery/configure
 * Configurar produto descoberto
 */
export const configureProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const configData = req.body;

    if (!validateConfigurationData(configData)) {
      res.status(400).json({
        success: false,
        error: 'Dados de configuração inválidos'
      });
      return;
    }

    // Verificar se código já existe
    const existingProduct = await Product.findOne({ 
      code: configData.productData.code.toUpperCase() 
    });
    
    if (existingProduct) {
      res.status(409).json({
        success: false,
        error: `Produto com código "${configData.productData.code}" já existe`
      });
      return;
    }

    // Buscar course padrão
    const course = await Course.findOne({ isActive: true });
    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Nenhum course ativo encontrado'
      });
      return;
    }

    // Criar Product
    const product = await Product.create({
      ...configData.productData,
      code: configData.productData.code.toUpperCase(),
      courseId: course._id,
      activeCampaignConfig: {
        ...configData.activeCampaignConfig,
        tagPrefix: configData.activeCampaignConfig?.tagPrefix
          || configData.productData.code.toUpperCase(),
        listId: configData.activeCampaignConfig?.listId
          || course.activeCampaignConfig?.listId
          || '1'
      },
      launchDate: new Date()
    });

    // Criar ProductProfile
    const productProfile = await ProductProfile.create({
      ...configData.profileData,
      createdAt: new Date(),
      lastModified: new Date()
    });

    console.log(`✅ Produto "${product.name}" configurado com sucesso`);

    res.status(201).json({
      success: true,
      message: `Produto "${product.name}" configurado com sucesso`,
      data: { product, productProfile }
    });

  } catch (error: any) {
    console.error('❌ Erro ao configurar produto:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao configurar produto',
      details: error.message
    });
  }
};
