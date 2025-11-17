/**
 * 🛤️ DISCOVERY ROUTES
 */

import { Router } from 'express';
import { runDiscovery, generateConfig, configureProduct } from '../controllers/discovery.controller';

const router = Router();

/**
 * @route   POST /api/discovery/run
 * @desc    Executar discovery completo (detectar produtos novos)
 * @access  Private (Admin)
 */
router.post('/run', runDiscovery);

/**
 * @route   POST /api/discovery/generate-config
 * @desc    Gerar configuração inteligente para produto descoberto
 * @body    { discoveredProduct: DiscoveredProduct }
 * @access  Private (Admin)
 */
router.post('/generate-config', generateConfig);

/**
 * @route   POST /api/discovery/configure
 * @desc    Configurar produto descoberto (criar Product + ProductProfile)
 * @body    { ProductConfigurationData }
 * @access  Private (Admin)
 */
router.post('/configure', configureProduct);

export default router;

