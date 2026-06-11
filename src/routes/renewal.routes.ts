// src/routes/renewal.routes.ts
import { Router } from 'express'
import { listOffers, createOffer, updateOffer, listTurmas, performance, runSync } from '../controllers/renewal.controller'

const router = Router()

// GET  /api/renewal/offers       → lista ofertas (filtros: isActive, isRenewal)
router.get('/offers', listOffers)

// POST /api/renewal/offers       → adicionar oferta à mão (códigos sem vendas)
router.post('/offers', createOffer)

// GET  /api/renewal/turmas       → turmas + nº de alunos + cobertura (multi-select/alerta)
router.get('/turmas', listTurmas)

// GET  /api/renewal/performance  → taxa de renovação por turma vs meta 20%
router.get('/performance', performance)

// PATCH /api/renewal/offers/:id  → editar oferta (nome/turma/período/link/estado)
router.patch('/offers/:id', updateOffer)

// POST /api/renewal/sync         → sincronizar ofertas a partir da Hotmart
router.post('/sync', runSync)

export default router
