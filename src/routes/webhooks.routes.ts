import { Router } from 'express'
import { emailOpened, linkClicked } from '../controllers/webhooks.controller'

const router = Router()

router.post('/ac/email-opened', emailOpened)
router.post('/ac/link-clicked', linkClicked)

export default router