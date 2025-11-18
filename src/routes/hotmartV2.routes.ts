// src/routes/hotmartV2.routes.ts
// 🎯 SPRINT 5.2 - Hotmart V2 Routes

import { Router } from 'express';
import {
  getHotmartProducts,
  getHotmartProductBySubdomain,
  getHotmartProductUsers,
  getHotmartStats
} from '../controllers/hotmartV2.controller';

const router = Router();

// Stats (antes de params)
router.get('/stats', getHotmartStats);

// Products
router.get('/products', getHotmartProducts);
router.get('/products/:subdomain', getHotmartProductBySubdomain);
router.get('/products/:subdomain/users', getHotmartProductUsers);

export default router;

