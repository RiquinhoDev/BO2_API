import { Router } from 'express'
import { checkAndUpdateClassHistory, syncComplete, syncHotmartClasses } from '../services/classes/hotmartClassSync.runtime'
import { getClassCompleteHistory, getClassHistory, getStudentHistoryByDiscord, getStudentHistoryByEmail } from '../services/classes/classHistory.runtime'
import { getStudentsByClass, searchStudents } from '../services/classes/classRoster.runtime'
import { listClasses, listClassesSimple } from '../services/classes/classDirectory.runtime'
import { fetchClassData, fetchClassDataPost, getClassDetails, getClassStats } from '../services/classes/classDetails.runtime'
import { addOrEditClass, deleteClass } from '../services/classes/classMutations.runtime'
import { moveMultipleStudents, moveStudent } from '../services/classes/studentMovement.runtime'
import { createInactivationList, deleteInactivationList, getInactivationListStudents, getInactivationLists, revertInactivation, updateClassStatus } from '../services/classes/classInactivation.runtime'
import { classesDeleteInput } from '../security/classesDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'
const router = Router()
router.get('/', listClassesSimple) // ⚠️ DEVE estar ANTES de todas as outras rotas específicas

// GET /api/classes/listClasses - Lista todas as turmas (rota original)
router.get('/listClasses', listClasses)

// POST /api/classes/addOrEditClass - Adiciona ou edita uma turma
router.post('/addOrEditClass', addOrEditClass)

// POST /api/classes/syncHotmartClasses - Sincroniza turmas da Hotmart
router.post('/syncHotmartClasses', syncHotmartClasses)

// GET /api/classes/fetchClassData - Busca dados das turmas
router.get('/fetchClassData', fetchClassData)

// POST /api/classes/fetchClassData - Busca dados das turmas (body com classIds array)
router.post('/fetchClassData', fetchClassDataPost)

// GET /api/classes/stats - Estatísticas das turmas
router.get('/stats', getClassStats)

// PUT /api/classes/updateStatus - Atualiza status da turma (ativa/inativa) 
router.put('/updateStatus', updateClassStatus)

// GET /api/classes/:classId/students - Lista estudantes de uma turma específica
router.get('/:classId/students', getStudentsByClass)

// GET /api/classes/:classId/details - Detalhes de uma turma específica
router.get('/:classId/details', getClassDetails)

// DELETE /api/classes/:classId - Remove uma turma
router.delete(
  '/:classId',
  withValidatedInput(classesDeleteInput, (input, _req, res, next) =>
    deleteClass(input, res, next)),
)

// ===== MOVIMENTAÇÃO DE ESTUDANTES =====

// POST /api/classes/moveStudent - Move um estudante entre turmas
router.post('/moveStudent', moveStudent)

// POST /api/classes/moveMultipleStudents - Move múltiplos estudantes
router.post('/moveMultipleStudents', moveMultipleStudents)

// ===== HISTÓRICO E TRACKING =====

// GET /api/classes/:classId/complete-history - Histórico completo da turma (NOVO)
router.get('/:classId/complete-history', getClassCompleteHistory)

// GET /api/classes/history - Histórico geral de turmas
router.get('/history', getClassHistory)

// POST /api/classes/checkAndUpdateClassHistory - Verifica e atualiza histórico
router.post('/checkAndUpdateClassHistory', checkAndUpdateClassHistory)

// GET /api/classes/studentHistory/:discordId - Histórico de um aluno por Discord ID
router.get('/studentHistory/:discordId', getStudentHistoryByDiscord)

// GET /api/classes/studentHistoryByEmail/:email - Histórico por email
router.get('/studentHistoryByEmail/:email', getStudentHistoryByEmail)

// ===== LISTAS DE INATIVAÇÃO =====

// POST /api/classes/inactivationLists/create - Cria lista de inativação por turmas
router.post('/inactivationLists/create', createInactivationList)

// GET /api/classes/inactivationLists - Lista as listas de inativação
router.get('/inactivationLists', getInactivationLists)

// POST /api/classes/inactivationLists/revert/:id - Reverte inativação
router.post('/inactivationLists/revert/:id', revertInactivation)

// GET /api/classes/inactivationLists/:id/students - Alunos da lista, paginados
router.get('/inactivationLists/:id/students', getInactivationListStudents)

// DELETE /api/classes/inactivationLists/:id - Apaga só o registo do histórico.
// Não mexe em nenhum aluno; para devolver acesso é a rota de revert.
router.delete('/inactivationLists/:id', deleteInactivationList)



// ===== PESQUISA DE ESTUDANTES =====

// GET /api/classes/users/search - Pesquisa estudantes por critérios
router.get('/users/search', searchStudents)

router.post('/syncComplete', syncComplete)

export default router
