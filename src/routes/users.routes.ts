// src/routes/users.routes.ts - ROTAS ATUALIZADAS PARA COMPATIBILIDADE
import { Router } from "express"
import multer from "multer"
import {
  // Funções existentes (mantidas para compatibilidade)
  listUsers,
  getIdsDiferentes,
  syncDiscordAndHotmart,
  mergeDiscordId,
  getUnmatchedUsers,
  deleteUnmatchedUser,
  deleteIdsDiferentes,
  getUserStats,
  listUsersSimple,
  bulkMergeIds,
  bulkDeleteIds,
  bulkDeleteUnmatchedUsers,
  manualMatch,
  
  // ✅ NOVAS FUNÇÕES DA FASE 1
  getAllUsersUnified,
  getDashboardStats,
  
  // 🆕 NOVAS FUNÇÕES PARA EDITOR DE ALUNOS
  searchStudent,
  editStudent,
  getStudentStats,
  getStudentHistory,
  syncSpecificStudent,
  deleteStudent,
  getUsersInfinite,
  getUsersInfiniteStats,
  getProductStats,
  getUserAllClasses,
} from "../controllers/users.controller"

const router = Router()
const upload = multer({ dest: "uploads/" })

// ✅ ROTAS EXISTENTES (mantidas para compatibilidade)
router.get("/listUsers", listUsers)
router.get("/idsDiferentes", getIdsDiferentes)
router.post("/syncDiscordAndHotmart", upload.single("file"), syncDiscordAndHotmart)
router.post("/mergeDiscordId", mergeDiscordId)
router.get("/unmatchedUsers", getUnmatchedUsers)
router.delete("/unmatchedUsers/:id", deleteUnmatchedUser)
router.delete("/idsDiferentes/:id", deleteIdsDiferentes)
router.get("/getUserStats", getUserStats)
// Alias para compatibilidade com o frontend novo
router.get('/stats', getUserStats)
router.get("/listUsersSimple", listUsersSimple)

// ✅ ADICIONAR: Nova rota para listar todos os users unificados
router.get('/unified', getAllUsersUnified)

// ✅ ADICIONAR: Nova rota para dashboard stats com Curseduca
router.get('/dashboard-stats', getDashboardStats)

// 🔄 AÇÕES EM LOTE
router.post("/bulkMerge", bulkMergeIds)
router.post("/bulkDelete", bulkDeleteIds)
router.post("/bulkDeleteUnmatched", bulkDeleteUnmatchedUsers)
router.post("/manualMatch", manualMatch)

// 🎓 ROTAS ESPECÍFICAS PARA EDITOR DE ALUNOS E COMPATIBILIDADE COM FRONTEND

// 🔍 Pesquisar alunos - Compatível com ambos os formatos
router.get("/search", searchStudent) // Rota nova padrão
router.get("/searchStudent", searchStudent) // Compatibilidade com API antiga

// ✏️ Editar aluno - Compatível com ambos os formatos
router.put("/:id", editStudent) // Rota nova padrão RESTful
router.put("/editStudent/:id", editStudent) // Compatibilidade com API antiga

// 📊 Estatísticas detalhadas do aluno
router.get("/:id/stats", getStudentStats)
router.get("/student/:id/stats", getStudentStats) // Alias alternativo

// 📋 Histórico de alterações do aluno
router.get("/:id/history", getStudentHistory)
router.get("/student/:id/history", getStudentHistory) // Alias alternativo

// 🔄 Sincronizar aluno específico com Hotmart
router.post("/:id/sync", syncSpecificStudent)
router.post("/student/:id/sync", syncSpecificStudent) // Alias alternativo

// 🗑️ Eliminar aluno
router.delete("/:id", deleteStudent)
router.delete("/student/:id", deleteStudent) // Alias alternativo


router.get('/infinite', getUsersInfinite)
router.get('/infiniteStats', getUsersInfiniteStats)
router.get('/getProductStats', getProductStats)

// 🆕 ROTA: Obter todas as turmas de um utilizador (Hotmart + Curseduca)
router.get('/:userId/all-classes', getUserAllClasses)

router.get('/users/listUsers', listUsers)
export default router