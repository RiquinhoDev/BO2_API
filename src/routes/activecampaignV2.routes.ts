// src/routes/activecampaignV2.routes.ts
// 🎯 SPRINT 5.2 - Active Campaign V2 Routes (Tags por Produto)

import { Router } from 'express';
import {
  applyTagToUserProduct,
  removeTagFromUserProduct,
  getUsersWithTagsInProduct,
  getACStats,
  syncProductTags
} from '../controllers/activecampaignV2.controller';

const router = Router();

// Stats (antes de params)
router.get('/stats', getACStats);

// Tags por produto
router.post('/tag/apply', applyTagToUserProduct);
router.post('/tag/remove', removeTagFromUserProduct);

// Lista users com tags em produto
router.get('/products/:productId/tagged', getUsersWithTagsInProduct);

// Sync
router.post('/sync/:productId', syncProductTags);

export default router;

