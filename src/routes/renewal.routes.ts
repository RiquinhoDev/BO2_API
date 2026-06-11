// src/routes/renewal.routes.ts
import { Router } from 'express'
import { listOffers, updateOffer, listTurmas, runSync } from '../controllers/renewal.controller'

const router = Router()

// GET  /api/renewal/offers       → lista ofertas (filtros: isActive, isRenewal)
router.get('/offers', listOffers)

// GET  /api/renewal/turmas       → turmas + nº de alunos + cobertura (multi-select/alerta)
router.get('/turmas', listTurmas)

// PATCH /api/renewal/offers/:id  → editar oferta (nome/turma/período/link/estado)
router.patch('/offers/:id', updateOffer)

// POST /api/renewal/sync         → sincronizar ofertas a partir da Hotmart
router.post('/sync', runSync)

export default router
