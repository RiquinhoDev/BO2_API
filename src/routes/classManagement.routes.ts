// src/routes/classManagement.routes.ts
import { Router } from "express"
import {
  checkAndUpdateClassHistory,
  getStudentHistoryByEmail,
  getClassHistory,
  createInactivationList,
  getInactivationLists,
  revertInactivationList,
  executeInactivationList
} from "../controllers/classManagement.controller"

const router = Router()

// POST: Verificar e atualizar histórico de turmas
router.post("/checkAndUpdateClassHistory", checkAndUpdateClassHistory)

// GET: Histórico por email do aluno
router.get("/studentHistoryByEmail/:email", getStudentHistoryByEmail)

// GET: Histórico geral de turmas
router.get("/history", getClassHistory)

// POST: Criar lista de inativação por turmas
router.post("/inactivationLists/create", createInactivationList)

// GET: Listar listas de inativação
router.get("/inactivationLists", getInactivationLists)

// POST: Executar lista de inativação
router.post("/inactivationLists/execute/:id", executeInactivationList)

// POST: Reverter lista de inativação
router.post("/inactivationLists/revert/:id", revertInactivationList)

export default router