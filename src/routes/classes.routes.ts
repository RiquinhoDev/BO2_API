// src/routes/classes.routes.ts - SIMPLIFICADO sem validação
import { Router } from 'express'
import { classesController, bulkInactivateStudents } from '../controllers/classes.controller'

const router = Router()

// ===== GESTÃO DE TURMAS =====

// 🆕 NOVA ROTA SIMPLES - GET /api/classes - Lista todas as turmas (para o frontend StudentEditor)
// ⚠️ IMPORTANTE: Esta rota DEVE estar ANTES de todas as outras rotas específicas
router.get('/', classesController.listClassesSimple)

// GET /api/classes/listClasses - Lista todas as turmas (rota original)
router.get('/listClasses', classesController.listClasses)

// POST /api/classes/addOrEditClass - Adiciona ou edita uma turma
router.post('/addOrEditClass', classesController.addOrEditClass)

// POST /api/classes/syncHotmartClasses - Sincroniza turmas da Hotmart
router.post('/syncHotmartClasses', classesController.syncHotmartClasses)

// GET /api/classes/fetchClassData - Busca dados das turmas
router.get('/fetchClassData', classesController.fetchClassData)

// GET /api/classes/stats - Estatísticas das turmas
router.get('/stats', classesController.getClassStats)

// PUT /api/classes/updateStatus - Atualiza status da turma (ativa/inativa) 
router.put('/updateStatus', classesController.updateClassStatus)

// GET /api/classes/:classId/students - Lista estudantes de uma turma específica
router.get('/:classId/students', classesController.getStudentsByClass)

// GET /api/classes/:classId/details - Detalhes de uma turma específica
router.get('/:classId/details', classesController.getClassDetails)

// DELETE /api/classes/:classId - Remove uma turma
router.delete('/:classId', classesController.deleteClass)

// ===== MOVIMENTAÇÃO DE ESTUDANTES =====

// POST /api/classes/moveStudent - Move um estudante entre turmas
router.post('/moveStudent', classesController.moveStudent)

// POST /api/classes/moveMultipleStudents - Move múltiplos estudantes
router.post('/moveMultipleStudents', classesController.moveMultipleStudents)

// ===== HISTÓRICO E TRACKING =====

// GET /api/classes/:classId/complete-history - Histórico completo da turma (NOVO)
router.get('/:classId/complete-history', classesController.getClassCompleteHistory)

// GET /api/classes/history - Histórico geral de turmas
router.get('/history', classesController.getClassHistory)

// POST /api/classes/checkAndUpdateClassHistory - Verifica e atualiza histórico
router.post('/checkAndUpdateClassHistory', classesController.checkAndUpdateClassHistory)

// GET /api/classes/studentHistory/:discordId - Histórico de um aluno por Discord ID
router.get('/studentHistory/:discordId', classesController.getStudentHistoryByDiscord)

// GET /api/classes/studentHistoryByEmail/:email - Histórico por email
router.get('/studentHistoryByEmail/:email', classesController.getStudentHistoryByEmail)

// ===== LISTAS DE INATIVAÇÃO =====

// POST /api/classes/inactivationLists/create - Cria lista de inativação por turmas
router.post('/inactivationLists/create', classesController.createInactivationList)

// GET /api/classes/inactivationLists - Lista as listas de inativação
router.get('/inactivationLists', classesController.getInactivationLists)

// POST /api/classes/inactivationLists/revert/:id - Reverte inativação
router.post('/inactivationLists/revert/:id', classesController.revertInactivation)

// ✅ NOVO: POST /api/classes/bulk-inactivate - Inativa alunos em massa em todas as plataformas
router.post('/bulk-inactivate', bulkInactivateStudents)

// ===== PESQUISA DE ESTUDANTES =====

// GET /api/classes/users/search - Pesquisa estudantes por critérios
router.get('/users/search', classesController.searchStudents)

router.post('/syncComplete', classesController.syncComplete)

export default router