// src/routes/sync.routes.ts
import { Router } from "express"
import {
  getSyncHistory,
  getSyncStats,
  cleanOldHistory,
  retrySyncOperation,
  createSyncRecord
} from "../controllers/sync.controller"

const router = Router()

// 📋 HISTÓRICO DE SINCRONIZAÇÕES
router.get("/history", getSyncHistory)

// 📊 ESTATÍSTICAS DE SINCRONIZAÇÃO  
router.get("/stats", getSyncStats)

// 🗑️ LIMPAR HISTÓRICO ANTIGO
router.delete("/history/cleanup", cleanOldHistory)

// 🔄 RETRY SINCRONIZAÇÃO FALHADA
router.post("/retry/:syncId", retrySyncOperation)

// 📝 CRIAR REGISTO DE SINCRONIZAÇÃO
router.post("/record", createSyncRecord)

export default router