// ✅ SPRINT 5 - Task 3: Contact Tag Reader Routes
// Objetivo: Rotas para leitura e sync de tags do AC
import { Router } from 'express';
import {
  getContactTags,
  syncUserTags,
  syncAllTags,
  getSyncStatus,
} from '../controllers/contactTagReader.controller';

const router = Router();

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

/**
 * GET /api/ac/contact/:email/tags
 * Buscar tags de um contacto
 * TODO: Adicionar middleware isAuthenticated quando disponível
 */
router.get('/contact/:email/tags', getContactTags);

/**
 * POST /api/ac/sync-user-tags/:userId
 * Sincronizar tags de um user
 * TODO: Adicionar middleware isAuthenticated quando disponível
 */
router.post('/sync-user-tags/:userId', syncUserTags);

/**
 * POST /api/ac/sync-all-tags
 * Sincronizar todos os users (ADMIN ONLY)
 * TODO: Adicionar middleware isAuthenticated + isAdmin quando disponível
 * Query params: ?limit=100
 */
router.post('/sync-all-tags', syncAllTags);

/**
 * GET /api/ac/sync-status
 * Verificar status do sistema de sync
 * TODO: Adicionar middleware isAuthenticated quando disponível
 */
router.get('/sync-status', getSyncStatus);

export default router;

