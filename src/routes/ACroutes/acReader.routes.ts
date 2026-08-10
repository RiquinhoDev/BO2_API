import { Router } from 'express'
import {
  clearACCache,
  getBatchContactTags,
  getContactTags,
  syncContactTags,
  batchSyncContacts
} from '../../controllers/acTags/acReader.controller'

const router = Router()

// CONTACTOS
router.get('/contact/:email/tags', getContactTags)
router.post('/contact/:email/sync', syncContactTags)

router.post('/contacts/batch-tags', getBatchContactTags)
router.post('/contacts/batch-sync', batchSyncContacts)

router.delete('/cache/clear', clearACCache)

export default router
