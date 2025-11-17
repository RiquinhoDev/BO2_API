// src/routes/hotmart.routes.ts - VERSÃO SIMPLES
import { Router } from "express"
import {
  syncHotmartUsers,
  findHotmartUser,
  syncProgressOnly
} from "../controllers/hotmart.controller"

const router = Router()

// 🔄 SINCRONIZAÇÃO PRINCIPAL
router.get("/syncHotmartUsers", syncHotmartUsers)

// 🔍 BUSCAR UTILIZADOR ESPECÍFICO
router.get("/users", findHotmartUser)


router.post('/syncProgressOnly', syncProgressOnly)
export default router