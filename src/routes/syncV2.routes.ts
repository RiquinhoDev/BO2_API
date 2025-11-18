// src/routes/syncV2.routes.ts
// 🎯 SPRINT 5.2 - Sync V2 Routes (Escalável)

import { Router } from 'express';
import {
  syncGeneric,
  syncHotmart,
  syncCurseduca,
  syncDiscord,
  syncBatch,
  getSyncStatus
} from '../controllers/syncV2.controller';

const router = Router();

// Status (deve vir antes de rotas com params)
router.get('/status', getSyncStatus);

// Generic sync (ESCALÁVEL - aceita qualquer plataforma)
router.post('/generic', syncGeneric);

// Platform-specific (backward compatibility)
router.post('/hotmart', syncHotmart);
router.post('/curseduca', syncCurseduca);
router.post('/discord', syncDiscord);

// Batch sync
router.post('/batch', syncBatch);

export default router;

