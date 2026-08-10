import { Router } from 'express'
import { emailOpened, linkClicked } from '../controllers/webhooks.controller'
import { asyncRoute } from '../security/asyncRoute'

const router = Router()

router.post('/ac/email-opened', asyncRoute(emailOpened))
router.post('/ac/link-clicked', asyncRoute(linkClicked))

export default router