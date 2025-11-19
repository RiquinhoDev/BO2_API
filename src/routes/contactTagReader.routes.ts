// ✅ SPRINT 5 - Task 3: Contact Tag Reader Routes
// Objetivo: Rotas para leitura e sync de tags do AC
import { Router } from 'express';
import {
  getContactTags,
  syncUserTags,
  syncAllTags,
  getSyncStatus,
} from '../controllers/contactTagReader.controller';
import { isAuthenticated, isAdmin } from '../middleware/auth';

const router = Router();

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

/**
 * GET /api/ac/contact/:email/tags
 * Buscar tags de um contacto
 * Middleware: isAuthenticated
 */
router.get('/contact/:email/tags', isAuthenticated, getContactTags);

/**
 * POST /api/ac/sync-user-tags/:userId
 * Sincronizar tags de um user
 * Middleware: isAuthenticated
 */
router.post('/sync-user-tags/:userId', isAuthenticated, syncUserTags);

/**
 * POST /api/ac/sync-all-tags
 * Sincronizar todos os users (ADMIN ONLY)
 * Middleware: isAuthenticated + isAdmin
 * Query params: ?limit=100
 */
router.post('/sync-all-tags', isAuthenticated, isAdmin, syncAllTags);

/**
 * GET /api/ac/sync-status
 * Verificar status do sistema de sync
 * Middleware: isAuthenticated
 */
router.get('/sync-status', isAuthenticated, getSyncStatus);

export default router;

