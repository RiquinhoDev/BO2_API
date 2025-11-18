// src/routes/curseducaV2.routes.ts
// 🎯 SPRINT 5.2 - CursEduca V2 Routes

import { Router } from 'express';
import {
  getCurseducaProducts,
  getCurseducaProductByGroupId,
  getCurseducaProductUsers,
  getCurseducaStats
} from '../controllers/curseducaV2.controller';

const router = Router();

// Stats (antes de params)
router.get('/stats', getCurseducaStats);

// Products
router.get('/products', getCurseducaProducts);
router.get('/products/:groupId', getCurseducaProductByGroupId);
router.get('/products/:groupId/users', getCurseducaProductUsers);

export default router;

