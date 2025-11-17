// src/routes/curseduca.routes.ts - VERSÃO CORRIGIDA SEGUINDO PADRÃO HOTMART
import { Router } from 'express'
import {
  // FUNÇÕES PRINCIPAIS (seguindo padrão hotmart)
  testConnection,
  syncCurseducaUsers,
  syncProgressOnly,
  getDashboardStats,
  
  // FUNÇÕES AUXILIARES (compatibilidade - podem retornar 501 por enquanto)
  getGroups,
  getMembers,
  getMemberByEmail,
  getAccessReports,
  getCurseducaUsers,
  debugCurseducaAPI,
  
  // FUTURAS FUNCIONALIDADES (501 por enquanto)
  syncCurseducaUsersIntelligent,
  getSyncReport,
  getUserByEmail,
  cleanupDuplicates,
  getUsersWithClasses,
  updateUserClasses
} from '../controllers/curseduca.controller'

const router = Router()

// 🧪 DIAGNÓSTICOS E TESTES (igual ao Hotmart)
router.get('/test', testConnection)                                 // Igual ao /hotmart/test

// 🔄 SINCRONIZAÇÃO PRINCIPAL (seguindo padrão Hotmart)
router.get('/syncCurseducaUsers', syncCurseducaUsers)              // Igual ao /hotmart/syncHotmartUsers
router.post('/syncProgressOnly', syncProgressOnly)                 // Igual ao /hotmart/syncProgressOnly

// 📊 ESTATÍSTICAS E DASHBOARD
router.get('/dashboard', getDashboardStats)                        // Dados específicos CursEduca
router.get('/stats', getDashboardStats)                            // Alias para dashboard

// 📚 API CURSEDUCA (endpoints de consulta - podem ser implementados gradualmente)
router.get('/groups', getGroups)                                   // Listar grupos/turmas
router.get('/members', getMembers)                                 // Listar membros
router.get('/members/by', getMemberByEmail)                        // Buscar membro por email
router.get('/reports/access', getAccessReports)                    // Relatórios de acesso
router.get('/users', getCurseducaUsers)                            // Users locais com curseducaUserId

// 🔧 DIAGNÓSTICOS AVANÇADOS
router.get('/debug', debugCurseducaAPI)                            // Debug da API CursEduca

// 🚀 FUNCIONALIDADES FUTURAS (endpoints preparados para expansão)
router.post('/syncIntelligent', syncCurseducaUsersIntelligent)     // Sync inteligente (futuro)
router.get('/report', getSyncReport)                               // Relatório detalhado (futuro)
router.get('/user', getUserByEmail)                                // Busca específica (futuro)
router.post('/cleanup', cleanupDuplicates)                         // Limpeza duplicados (futuro)
// Adicionar estas rotas
router.get('/users-with-classes', getUsersWithClasses)
router.put('/user/:userId/classes', updateUserClasses)
export default router