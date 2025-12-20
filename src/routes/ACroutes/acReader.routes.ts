import { Router } from 'express'
import {
  clearACCache,
  getACOverview,
  getBatchContactTags,
  getContactTags,
  getInconsistencies,
  getProductACAnalytics,
  refreshOldSyncs,
  syncContactTags,
  batchSyncContacts
} from '../../controllers/acTags/acReader.controller'

const router = Router()

// CONTACTOS
router.get('/contact/:email/tags', getContactTags)
router.post('/contact/:email/sync', syncContactTags)

router.post('/contacts/batch-tags', getBatchContactTags)
router.post('/contacts/batch-sync', batchSyncContacts)

// ANALYTICS
router.get('/analytics/overview', getACOverview)
router.get('/analytics/product/:code', getProductACAnalytics)
router.get('/inconsistencies', getInconsistencies)

// MANUTENÇÃO
router.post('/maintenance/refresh-old', refreshOldSyncs)
router.delete('/cache/clear', clearACCache)

export default router
