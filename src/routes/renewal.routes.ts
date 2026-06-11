// src/routes/renewal.routes.ts
import { Router } from 'express'
import { listOffers, updateOffer, runSync } from '../controllers/renewal.controller'

const router = Router()

// GET  /api/renewal/offers       → lista ofertas (filtros: isActive, isRenewal)
router.get('/offers', listOffers)

// PATCH /api/renewal/offers/:id  → editar oferta (nome/turma/período/link/estado)
router.patch('/offers/:id', updateOffer)

// POST /api/renewal/sync         → sincronizar ofertas a partir da Hotmart
router.post('/sync', runSync)

export default router
