import { Router } from 'express'
import { asyncRoute } from '../../security/asyncRoute'
import {
  clearACCache,
  getBatchContactTags,
  getContactTags,
  syncContactTags,
  batchSyncContacts
} from '../../controllers/acTags/acReader.controller'
const router = Router()

// CONTACTOS
router.get('/contact/:email/tags', asyncRoute(getContactTags))
router.post('/contact/:email/sync', asyncRoute(syncContactTags))

router.post('/contacts/batch-tags', asyncRoute(getBatchContactTags))
router.post('/contacts/batch-sync', asyncRoute(batchSyncContacts))

router.delete('/cache/clear', asyncRoute(clearACCache))

export default router
