// ════════════════════════════════════════════════════════════
// 📁 src/routes/ACroutes/tagRuleEstimate.routes.ts
// Routes: Endpoints auxiliares para estimativa de Tag Rules
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import {
  estimateAffectedUsers,
  previewAffectedUsers,
  getAvailableFields
} from '../../controllers/acTags/tagRuleEstimate.controller'

const router = Router()

// ─────────────────────────────────────────────────────────────
// ENDPOINTS DE ESTIMATIVA
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/tag-rules/estimate
 * @desc    Estimar quantos alunos serão afetados pela regra
 * @body    { conditions: IConditions, courseId?: string }
 * @access  Admin
 * 
 * @example
 * POST /api/tag-rules/estimate
 * {
 *   "conditions": {
 *     "source": "USERPRODUCT",
 *     "logic": "AND",
 *     "rules": [
 *       {
 *         "field": "engagement.daysSinceLastLogin",
 *         "operator": "greaterThan",
 *         "value": 14
 *       },
 *       {
 *         "field": "status",
 *         "operator": "equals",
 *         "value": "ACTIVE"
 *       }
 *     ]
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "estimatedCount": 280,
 *     "breakdown": {
 *       "ACTIVE": 280
 *     }
 *   }
 * }
 */
router.post('/estimate', estimateAffectedUsers)

/**
 * @route   POST /api/tag-rules/preview
 * @desc    Preview de alunos específicos que serão afetados
 * @body    { conditions: IConditions, courseId?: string, limit?: number }
 * @access  Admin
 * 
 * @example
 * POST /api/tag-rules/preview
 * {
 *   "conditions": {
 *     "source": "COMBINED",
 *     "groups": [
 *       {
 *         "source": "PRODUCT",
 *         "logic": "AND",
 *         "rules": [
 *           {
 *             "field": "code",
 *             "operator": "equals",
 *             "value": "OGI_V1"
 *           }
 *         ]
 *       },
 *       {
 *         "source": "USERPRODUCT",
 *         "logic": "AND",
 *         "rules": [
 *           {
 *             "field": "engagement.daysSinceLastLogin",
 *             "operator": "greaterThan",
 *             "value": 14
 *           }
 *         ]
 *       }
 *     ]
 *   },
 *   "limit": 10
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "users": [
 *       {
 *         "userId": "...",
 *         "userName": "João Silva",
 *         "userEmail": "joao@mail.com",
 *         "productCode": "OGI_V1",
 *         "daysSinceLastLogin": 18
 *       }
 *     ],
 *     "total": 280,
 *     "showing": 10
 *   }
 * }
 */
router.post('/preview', previewAffectedUsers)

/**
 * @route   GET /api/tag-rules/fields
 * @desc    Listar campos disponíveis por source
 * @access  Admin
 * 
 * @example
 * GET /api/tag-rules/fields
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "USERPRODUCT": {
 *       "temporal": [...],
 *       "progress": [...],
 *       "engagement": [...]
 *     },
 *     "PRODUCT": {
 *       "identification": [...],
 *       "status": [...]
 *     },
 *     "COURSE": {
 *       "identification": [...],
 *       "thresholds": [...]
 *     }
 *   }
 * }
 */
router.get('/fields', getAvailableFields)

export default router