/**
 * 🎮 DISCOVERY CONTROLLER
 */

import { NextFunction, Request, Response } from 'express';
import { successResponse } from '../contracts/responseContract';

import hotmartDiscoveryService from '../services/discovery/hotmartDiscovery.service';
import intelligentDefaultsService from '../services/discovery/intelligentDefaults.service';
import { configureDiscoveredProduct } from '../services/discovery/configureDiscoveredProduct.service';
import { validateConfigurationData } from '../types/discovery.types';
import { internalError } from '../security/errorHandling';

/**
 * POST /api/discovery/run
 * Executar discovery completo
 */
export const runDiscovery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    res.json(successResponse(result, {
      message: `Discovery completo: ${totalFound} produtos encontrados`
    }));

  } catch (error: unknown) {
    next(internalError('Erro ao executar discovery', 'DISCOVERY_RUN_FAILED', error));
  }
};

/**
 * POST /api/discovery/generate-config
 * Gerar configuração inteligente
 */
export const generateConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    res.json(successResponse({ configuration }, { message: 'Configuração gerada com sucesso' }));

  } catch (error: unknown) {
    next(internalError('Erro ao gerar configuracao', 'DISCOVERY_CONFIG_GENERATION_FAILED', error));
  }
};

/**
 * POST /api/discovery/configure
 * Configurar produto descoberto
 */
export const configureProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const configData = req.body;

    if (!validateConfigurationData(configData)) {
      res.status(400).json({
        success: false,
        error: 'Dados de configuração inválidos'
      });
      return;
    }

    // Criação atómica: verificação + course + Product + ProductProfile numa transação.
    const result = await configureDiscoveredProduct(configData);

    if (result.status === 'duplicate_code') {
      res.status(409).json({
        success: false,
        error: `Produto com código "${result.code}" já existe`
      });
      return;
    }

    if (result.status === 'no_active_course') {
      res.status(404).json({
        success: false,
        error: 'Nenhum course ativo encontrado'
      });
      return;
    }

    console.log(`✅ Produto "${result.product.name}" configurado com sucesso`);

    res.status(201).json(successResponse(
      { product: result.product, productProfile: result.productProfile },
      { message: `Produto "${result.product.name}" configurado com sucesso` },
    ));

  } catch (error: unknown) {
    next(internalError('Erro ao configurar produto', 'DISCOVERY_PRODUCT_CONFIGURATION_FAILED', error));
  }
};
