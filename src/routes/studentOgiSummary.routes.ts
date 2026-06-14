import { Router } from 'express'
import { getOgiAccess, getOgiSummary } from '../controllers/studentOgiSummary.controller'

const router = Router()

router.get('/summary', getOgiSummary)
router.get('/access', getOgiAccess)

export default router
