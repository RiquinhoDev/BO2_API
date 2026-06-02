import { Router } from 'express'
import { getOgiSummary } from '../controllers/studentOgiSummary.controller'

const router = Router()

router.get('/summary', getOgiSummary)

export default router
