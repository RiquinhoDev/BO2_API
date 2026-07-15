// =====================================================
// 📁 src/routes/webhooks.routes.ts
// Rotas para webhooks do Active Campaign
// =====================================================

import { Router } from 'express'
import { emailOpened, linkClicked, testWebhook } from '../controllers/webhooks.controller'
import { localDebugOnly } from '../security/debugRoutes'

const router = Router()

// Webhooks Active Campaign
router.post('/ac/email-opened', emailOpened)
router.post('/ac/link-clicked', linkClicked)
router.post('/ac/test', localDebugOnly, testWebhook)

export default router
