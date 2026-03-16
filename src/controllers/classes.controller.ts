// src/controllers/classes.controller.ts - CORRIGIDO para evitar erros TypeScript
import { Request, Response } from 'express'
import { classesService, studentService } from '../services/syncUtilizadoresServices/hotmartServices/classesService'
import SyncHistory from '../models/SyncHistory'

import axios from 'axios'
import { Class } from '../models/Class'
import StudentClassHistory from '../models/StudentClassHistory'
import { User, UserProduct } from '../models'
import UserHistory from '../models/UserHistory'


interface ClassSyncResult {
  totalProcessed: number
  newClassesCreated: number
  existingClassesUpdated: number
  classesInactivated: number
  studentsUpdated: number
  errors: string[]
}

async function getHotmartAccessToken() {
  try {
    const HOTMART_CLIENT_ID = process.env.HOTMART_CLIENT_ID;
    const HOTMART_CLIENT_SECRET = process.env.HOTMART_CLIENT_SECRET;

    if (!HOTMART_CLIENT_ID || !HOTMART_CLIENT_SECRET) {
      throw new Error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET são obrigatórios');
    }

    const basicAuth = Buffer.from(`${HOTMART_CLIENT_ID}:${HOTMART_CLIENT_SECRET}`).toString('base64');

    const response = await axios.post(
      'https://api-sec-vlc.hotmart.com/security/oauth/token',
      new URLSearchParams({
        grant_type: 'client_credentials'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`
        },
      }
    );

    if (!response.data.access_token) {
      throw new Error('Access token not found');
    }

    return response.data.access_token;
  } catch (error: any) {
    console.error('Error getting Hotmart access token:', error.response ? error.response.data : error.message);
    throw new Error('Failed to get access token');
  }
}

class ClassesController {
  // ===== GESTÃO DE TURMAS =====

  // 🆕 MÉTODO SIMPLES PARA FRONTEND - GET /api/classes
   // 🆕 MÉTODO SIMPLES PARA FRONTEND - GET /api/classes ✅ CORRIGIDO
  listClassesSimple = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('📋 Buscando todas as turmas para o frontend...')

      const result = await classesService.listClasses({
        limit: 1000,
        offset: 0,
        sortBy: 'name',
        sortOrder: 'asc'
      })

      console.log(`📊 Turmas encontradas: ${result.classes.length} (ativas e inativas)`)

      // ✅ CORRIGIDO: Acesso correto às propriedades
      const simplifiedClasses = result.classes.map((cls: any) => ({
        classId: cls.classId || cls._id,
        name: cls.name || cls.classId || 'Turma sem nome',
        isActive: cls.isActive ?? true,
        estado: cls.estado || (cls.isActive ? 'ativo' : 'inativo'),
        studentCount: cls.studentCount || 0,
        description: cls.description || ''
      }))

      res.json(simplifiedClasses)
    } catch (error) {
      console.error('❌ Erro ao listar turmas simples:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao listar turmas',
        error: (error as Error).message
      })
    }
  }
  // ✅ MÉTODO ORIGINAL CORRIGIDO - GET /api/classes/listClasses
  listClasses = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        search,
        isActive,
        source,
        limit = 100,
        offset = 0,
        sortBy = 'name',
        sortOrder = 'asc'
      } = req.query
  
      const filters = {
        search: search as string,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        source: source as string,
        limit: Number(limit),
        offset: Number(offset),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      }
  
      console.log('🔍 Filtros aplicados:', filters)
  
      const result = await classesService.listClasses(filters)
  
      console.log(`📊 Turmas encontradas: ${result.total} no banco, retornando ${result.classes.length}`)
  
      res.json({
        success: true,
        data: result.classes, // ✅ CORRIGIDO: Frontend espera "data"
        classes: result.classes, // Manter por compatibilidade
        total: result.total,
        filters,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao listar turmas:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao listar turmas',
        error: (error as Error).message
      })
    }
  }

  addOrEditClass = async (req: Request, res: Response): Promise<void> => {
    try {
      const { classId, name, description, isActive = true, estado, source = 'manual' } = req.body

      if (!classId || !name) {
        res.status(400).json({
          success: false,
          message: 'classId e name são obrigatórios'
        })
        return
      }

      let finalEstado = estado
      let finalIsActive = isActive
      
      if (estado) {
        finalIsActive = estado === 'ativo'
      } else {
        finalEstado = isActive ? 'ativo' : 'inativo'
      }

      const classData = {
        classId: classId.trim(),
        name: name.trim(),
        description: description?.trim(),
        isActive: finalIsActive,
        estado: finalEstado,
        source
      }

      const result = await classesService.addOrEditClass(classData)

      res.json({
        success: true,
        message: result.isNew ? 'Turma criada com sucesso' : 'Turma atualizada com sucesso',
        class: result.class,
        isNew: result.isNew,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao adicionar/editar turma:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao processar turma',
        error: (error as Error).message
      })
    }
  }

 syncHotmartClasses = async (req: Request, res: Response): Promise<void> => {
    let syncRecord: any = null;

    try {
      // ✅ CORRIGIDO: Usar tipo correto no enum
      syncRecord = await SyncHistory.create({
        type: 'hotmart', // ✅ CORRETO: conforme enum do SyncHistory
        status: 'running',
        startedAt: new Date(),
        stats: {
          total: 0,
          added: 0,
          updated: 0,
          conflicts: 0,
          errors: 0
        },
        metadata: {
          syncType: 'classes_sync_with_student_update',
          includeStudentCount: true,
          detectInactiveClasses: true
        }
      });

      console.log(`🎓 [${syncRecord._id}] Iniciando sincronização de turmas Hotmart...`);

      const accessToken = await getHotmartAccessToken();
      console.log(`✅ [${syncRecord._id}] Token de acesso obtido`);

      const uniqueClassIds = new Set<string>();
      const classStudentCount: { [classId: string]: number } = {};
      
      let nextPageToken: string | null = null;
      let pageCount = 0;

      do {
        pageCount++;
        
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          'metadata.currentStep': `Buscando turmas - Página ${pageCount}`,
          'metadata.progress': (pageCount * 10)
        });

        const subdomain = process.env.subdomain || 'ograndeinvestimento-bomrmk';
        let requestUrl = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`;
        if (nextPageToken) {
          requestUrl += `&page_token=${encodeURIComponent(nextPageToken)}`;
        }

        const response = await axios.get(requestUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        const users = response.data.users || response.data.items || response.data.data || [];
        const pageInfo = response.data.page_info || response.data.pageInfo || {};

        users.forEach((user: any) => {
          if (user.class_id && user.class_id.trim()) {
            const classId = user.class_id.trim();
            uniqueClassIds.add(classId);
            classStudentCount[classId] = (classStudentCount[classId] || 0) + 1;
          }
        });

        nextPageToken = pageInfo.next_page_token || null;
        await new Promise(resolve => setTimeout(resolve, 200));

      } while (nextPageToken);

      console.log(`🎓 [${syncRecord._id}] Encontradas ${uniqueClassIds.size} turmas únicas na Hotmart`);

      let totalProcessed = 0;
      let newClassesCreated = 0;
      let existingClassesUpdated = 0;
      let classesInactivated = 0;
      let studentsUpdated = 0;
      const errors: string[] = [];

      // Processar turmas encontradas na Hotmart
      for (const classId of uniqueClassIds) {
  try {
    const studentCount = classStudentCount[classId] || 0;
    const existingClass = await Class.findOne({ classId });

    if (existingClass) {
      // 🎯 TURMA EXISTENTE: Apenas atualizar dados, NÃO alterar estado
      const classUpdates: any = {
        lastSyncAt: new Date(),
        source: 'hotmart_sync'
      };

      let needsUpdate = false;

      // Atualizar apenas contagem de estudantes
      if (existingClass.studentCount !== studentCount) {
        classUpdates.studentCount = studentCount;
        classUpdates.lastStudentCountUpdate = new Date();
        needsUpdate = true;
        console.log(`📊 [${syncRecord._id}] Turma ${classId}: ${existingClass.studentCount} → ${studentCount} estudantes`);
      }

      // 🚫 REMOVIDO: NÃO reativar turmas automaticamente
      // Deixar o estado como está na BD
      
      if (needsUpdate) {
        await Class.findByIdAndUpdate(existingClass._id, classUpdates);
        existingClassesUpdated++;
        console.log(`✅ [${syncRecord._id}] Turma ${classId} atualizada (estado preservado: ${existingClass.estado})`);
      }

    } else {
      // 🆕 TURMA NOVA: Criar sempre ATIVA por defeito
      await Class.create({
        classId,
        name: `Turma ${classId}`,
        description: `Turma sincronizada da Hotmart em ${new Date().toLocaleDateString('pt-PT')}`,
        source: 'hotmart_sync',
        isActive: true,        // ← SEMPRE ativo para turmas novas
        estado: 'ativo',       // ← SEMPRE ativo para turmas novas
        studentCount,
        lastSyncAt: new Date(),
        createdAt: new Date()
      });
      newClassesCreated++;
      console.log(`🆕 [${syncRecord._id}] Nova turma criada ATIVA: ${classId} (${studentCount} estudantes)`);
    }

    totalProcessed++;

  } catch (classError: any) {
    const errorMsg = `Erro ao processar turma ${classId}: ${classError.message}`;
    errors.push(errorMsg);
    console.error(`❌ [${syncRecord._id}] ${errorMsg}`);
  }
}

      // Identificar e inativar turmas que não existem mais na Hotmart
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': 'Verificando turmas inativas...',
        'metadata.progress': 85
      });

      // Atualizar contadores das turmas existentes
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': 'Atualizando contadores finais...',
        'metadata.progress': 95
      });

      for (const classId of uniqueClassIds) {
        try {
          const activeStudents = await User.countDocuments({
            classId,
            estado: 'ativo'
          });

          await Class.findOneAndUpdate(
            { classId },
            { 
              studentCount: activeStudents,
              lastStudentCountUpdate: new Date()
            }
          );
        } catch (countError: any) {
          console.warn(`⚠️ [${syncRecord._id}] Erro ao atualizar contador da turma ${classId}:`, countError.message);
        }
      }

      // ✅ CORRIGIDO: Usar interface ClassSyncResult
      const finalStats: ClassSyncResult = {
        totalProcessed,
        newClassesCreated,
        existingClassesUpdated,
        classesInactivated,
        studentsUpdated,
        errors
      };

      // ✅ CORRIGIDO: Estrutura stats correta para SyncHistory
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'completed',
        completedAt: new Date(),
        'metadata.currentStep': 'Sincronização de turmas concluída',
        'metadata.progress': 100,
        stats: {
          total: totalProcessed,
          added: newClassesCreated,
          updated: existingClassesUpdated,
          conflicts: classesInactivated,
          errors: errors.length
        },
        errorDetails: errors.length > 0 ? errors : undefined
      });

      console.log(`✅ [${syncRecord._id}] SINCRONIZAÇÃO DE TURMAS CONCLUÍDA!`);

      res.status(200).json({
        message: 'Sincronização de turmas Hotmart concluída!',
        success: true,
        stats: finalStats,
        classIds: Array.from(uniqueClassIds),
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error(`💥 [${syncRecord?._id}] ERRO NA SINCRONIZAÇÃO DE TURMAS:`, error);

      if (syncRecord) {
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          status: 'failed',
          completedAt: new Date(),
          'metadata.currentStep': 'Erro na sincronização de turmas',
          stats: {
            total: 0,
            added: 0,
            updated: 0,
            conflicts: 0,
            errors: 1
          },
          errorDetails: [error.message]
        });
      }

      res.status(500).json({
        message: 'Erro na sincronização de turmas',
        success: false,
        error: error.message,
        details: error.stack
      });
    }
  };
// 📋 FUNÇÃO MELHORADA: Verificar e atualizar histórico de mudanças de turma (compatível com versão antiga)
// ✅ FUNÇÃO CORRIGIDA: checkAndUpdateClassHistory
checkAndUpdateClassHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const subdomain = process.env.subdomain || 'ograndeinvestimento-bomrmk';
    
    if (!subdomain) {
      res.status(400).json({ message: 'Subdomain é obrigatório' });
      return;
    }

    console.log(`📋 Iniciando verificação de mudanças de turma...`);

    const accessToken = await getHotmartAccessToken();
    let url = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`;
    let nextPageToken: string | null = null;

    const localUsers = await User.find({}, '_id email classId');
    console.log(`📊 Verificando ${localUsers.length} utilizadores locais...`);

    let changesDetected = 0;
    let usersProcessed = 0;
    let pagesProcessed = 0;
    const errors: string[] = [];

    do {
      pagesProcessed++;
      console.log(`📄 Processando página ${pagesProcessed}...`);

      try {
        // ✅ CORRIGIDO: Tipagem explícita da resposta
        const response: any = await axios.get(
          url + (nextPageToken ? `&page_token=${encodeURIComponent(nextPageToken)}` : ''),
          {
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // ✅ CORRIGIDO: Desestruturação com tipagem explícita
        const items: any[] = response.data.items || [];
        const page_info: any = response.data.page_info || {};
        
        console.log(`   • ${items.length} utilizadores nesta página`);

        // ✅ CORRIGIDO: Verificação de array válido
        if (Array.isArray(items) && items.length > 0) {
          for (const hotmartUser of items) {
            try {
              usersProcessed++;

              // ✅ Verificação de email válido
              if (!hotmartUser.email || typeof hotmartUser.email !== 'string') {
                continue;
              }

              const localUser = localUsers.find((user) => 
                user.email && 
                user.email.toLowerCase() === hotmartUser.email.toLowerCase()
              );

              if (localUser) {
                // ✅ CORRIGIDO: classId não existe diretamente no documento, está em combined
                const currentClassId = (localUser as any).combined?.classId || (localUser as any).classId || null;
                const newClassId = hotmartUser.class_id || null;

                if (currentClassId !== newClassId) {
                  changesDetected++;
                  console.log(`🔄 Turma alterada para ${localUser.email}: ${currentClassId} → ${newClassId}`);

                  // Atualizar utilizador
                  await User.findByIdAndUpdate(localUser._id, {
                    classId: newClassId,
                    lastEditedAt: new Date(),
                    lastEditedBy: 'class_history_check'
                  });

                  // Buscar nome da turma
                  let className = 'Nome não disponível';
                  if (newClassId) {
                    try {
                      const classData = await Class.findOne({ classId: newClassId });
                      className = classData?.name || `Turma ${newClassId}`;
                    } catch (classError) {
                      console.warn(`⚠️ Erro ao buscar nome da turma ${newClassId}:`, classError);
                    }
                  }

                  // Registar no histórico
                  try {
                    await StudentClassHistory.create({
                      studentId: localUser._id,
                      classId: newClassId,
                      className,
                      dateMoved: new Date(),
                      reason: 'Mudança detectada via sincronização Hotmart',
                      movedBy: 'checkAndUpdateClassHistory'
                    });

                    console.log(`   ✅ Histórico registado para ${localUser.email}`);
                  } catch (historyError: any) {
                    console.error(`   ❌ Erro ao registar histórico para ${localUser.email}:`, historyError.message);
                    errors.push(`Erro no histórico de ${localUser.email}: ${historyError.message}`);
                  }
                }
              } else {
                // Log apenas ocasional para não spam
                if (usersProcessed % 100 === 0) {
                  console.warn(`⚠️ Utilizador ${hotmartUser.email} não encontrado no sistema local`);
                }
              }

            } catch (userError: any) {
              const errorMsg = `Erro ao processar utilizador ${hotmartUser.email || 'desconhecido'}: ${userError.message}`;
              errors.push(errorMsg);
              console.error(`❌ ${errorMsg}`);
            }
          }
        }

        // ✅ CORRIGIDO: Acesso seguro ao next_page_token
        nextPageToken = page_info.next_page_token || null;

        // Rate limiting
        if (nextPageToken) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (pageError: any) {
        const errorMsg = `Erro ao processar página ${pagesProcessed}: ${pageError.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
        // Para evitar loop infinito
        nextPageToken = null;
      }

    } while (nextPageToken);

    // Resultados finais
    console.log(`✅ Verificação concluída!`);
    console.log(`   • Páginas processadas: ${pagesProcessed}`);
    console.log(`   • Utilizadores verificados: ${usersProcessed}`);
    console.log(`   • Mudanças de turma detectadas: ${changesDetected}`);
    console.log(`   • Erros: ${errors.length}`);

    res.json({ 
      message: 'Check-up de turmas concluído e histórico atualizado com sucesso!',
      success: true,
      stats: {
        pagesProcessed,
        usersProcessed,
        changesDetected,
        localUsersTotal: localUsers.length,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    });

  } catch (error: any) {
    console.error('❌ Erro geral ao verificar e atualizar turmas:', error.response?.data || error.message);
    
    res.status(500).json({ 
      message: 'Erro ao verificar e atualizar turmas.', 
      success: false,
      error: error.message,
      details: error.response?.data || error.stack
    });
  }
};



  fetchClassData = async (req: Request, res: Response): Promise<void> => {
    try {
      const { classIds, includeStudents = 'false', includeStats = 'true' } = req.query

      const options = {
        includeStudents: includeStudents === 'true',
        includeStats: includeStats === 'true'
      }

      let result
      if (classIds) {
        const ids = (classIds as string).split(',').map(id => id.trim())
        result = await classesService.fetchMultipleClassData(ids, options)
      } else {
        result = await classesService.fetchAllClassData(options)
      }

      res.json({
        success: true,
        classes: result,
        count: result.length,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao buscar dados das turmas:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar dados das turmas',
        error: (error as Error).message
      })
    }
  }

  // 🆕 POST version - Aceita classIds no body (para InactivationWizard)
  fetchClassDataPost = async (req: Request, res: Response): Promise<void> => {
    try {
      const { classIds } = req.body

      if (!classIds || !Array.isArray(classIds)) {
        res.status(400).json({
          success: false,
          message: 'classIds é obrigatório e deve ser um array'
        })
        return
      }

      const result = await classesService.fetchMultipleClassData(classIds, {
        includeStudents: true,
        includeStats: false
      })

      // Transformar para o formato esperado pelo Frontend:
      // [{ className: string, students: [...] }]
      const formattedResult = result.map((classData: any) => ({
        className: classData.name || classData.classId,
        students: (classData.students || []).map((student: any) => ({
          name: student.name || '',
          email: student.email || '',
          discordIds: student.discordIds || student.discord?.discordIds || []
        }))
      }))

      res.json(formattedResult) // Array direto com formato específico
    } catch (error) {
      console.error('❌ Erro ao buscar dados das turmas (POST):', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar dados das turmas',
        error: (error as Error).message
      })
    }
  }

  getClassStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { dateFrom, dateTo, classIds } = req.query

      const filters = {
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        classIds: classIds ? (classIds as string).split(',') : undefined
      }

      const stats = await classesService.getClassStats(filters)

      // Buscar estatísticas de inativação (Frontend espera este campo)
      const { InactivationList } = await import('../models/Class')
      const [pendingLists, completedLists] = await Promise.all([
        InactivationList.countDocuments({ status: { $in: ['PENDING', 'EXECUTING'] } }),
        InactivationList.countDocuments({ status: 'COMPLETED' })
      ])

      res.json({
        success: true,
        ...stats,
        inactivationStats: {
          pendingLists,
          completedLists
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar estatísticas',
        error: (error as Error).message
      })
    }
  }

  deleteClass = async (req: Request, res: Response): Promise<void> => {
    try {
      const { classId } = req.params

      const classData = await classesService.getClassById(classId)
      if (!classData) {
        res.status(404).json({
          success: false,
          message: 'Turma não encontrada'
        })
        return
      }

      if (classData.studentCount > 0) {
        res.status(400).json({
          success: false,
          message: `Não é possível remover turma com ${classData.studentCount} estudante(s). Mova os estudantes primeiro.`
        })
        return
      }

      await classesService.deleteClass(classId)

      res.json({
        success: true,
        message: 'Turma removida com sucesso',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao remover turma:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao remover turma',
        error: (error as Error).message
      })
    }
  }

  getClassDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const { classId } = req.params
      const { includeStudents = 'false', includeHistory = 'false' } = req.query

      const options = {
        includeStudents: includeStudents === 'true',
        includeHistory: includeHistory === 'true'
      }

      const details = await classesService.getClassDetails(classId, options)

      if (!details) {
        res.status(404).json({
          success: false,
          message: 'Turma não encontrada'
        })
        return
      }

      res.json({
        success: true,
        ...details,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao buscar detalhes da turma:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar detalhes da turma',
        error: (error as Error).message
      })
    }
  }
  // ===== MOVIMENTAÇÃO DE ESTUDANTES =====

  moveStudent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { studentId, fromClassId, toClassId, reason } = req.body

      if (!studentId || !toClassId) {
        res.status(400).json({
          success: false,
          message: 'studentId e toClassId são obrigatórios'
        })
        return
      }

      const result = await studentService.moveStudent({
        studentId,
        fromClassId,
        toClassId,
        reason: reason || 'Movimentação via API'
      })

      res.json({
        success: true,
        message: 'Estudante movido com sucesso',
        movement: result,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao mover estudante:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao mover estudante',
        error: (error as Error).message
      })
    }
  }

  moveMultipleStudents = async (req: Request, res: Response): Promise<void> => {
    try {
      const { studentIds, toClassId, reason } = req.body

      if (!studentIds || !Array.isArray(studentIds) || !toClassId) {
        res.status(400).json({
          success: false,
          message: 'studentIds (array) e toClassId são obrigatórios'
        })
        return
      }

      const results = await studentService.moveMultipleStudents({
        studentIds,
        toClassId,
        reason: reason || 'Movimentação múltipla via API'
      })

      res.json({
        success: true,
        message: `Movimentação concluída: ${results.success.length} sucessos, ${results.errors.length} erros`,
        results,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao mover múltiplos estudantes:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao mover estudantes',
        error: (error as Error).message
      })
    }
  }

  // ===== HISTÓRICO =====

  // ✅ NOVO: Endpoint completo de histórico da turma
  getClassCompleteHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { classId } = req.params
      const { limit = 50, offset = 0, type } = req.query

      if (!classId) {
        res.status(400).json({
          success: false,
          message: 'classId é obrigatório'
        })
        return
      }

      const limitNum = Number(limit)
      const offsetNum = Number(offset)
      
      // Buscar turma para pegar informações adicionais
      const classData = await classesService.getClassById(classId)
      if (!classData) {
        res.status(404).json({
          success: false,
          message: 'Turma não encontrada'
        })
        return
      }

      const history: any[] = []

      // 1. Buscar movimentações de alunos (StudentClassHistory)
      if (!type || type === 'movements') {
        try {
          const StudentClassHistory = (await import('../models/StudentClassHistory')).default
          const movements = await StudentClassHistory.find({
            $or: [
              { classId },
              { previousClassId: classId }
            ]
          })
            .populate('studentId', 'name email')
            .sort({ dateMoved: -1 })
            .limit(limitNum)
            .skip(offsetNum)
            .lean()

          movements.forEach((mov: any) => {
            history.push({
              type: 'STUDENT_MOVEMENT',
              date: mov.dateMoved,
              student: {
                name: mov.studentId?.name || 'Aluno desconhecido',
                email: mov.studentId?.email
              },
              action: mov.previousClassId ? 'MOVED' : 'ENROLLED',
              from: mov.previousClassName,
              to: mov.className,
              reason: mov.reason,
              performedBy: mov.movedBy
            })
          })
        } catch (error) {
          console.error('❌ Erro ao buscar movimentações:', error)
          // Continuar mesmo se houver erro
        }
      }

      // 2. Buscar mudanças de dados dos alunos da turma (UserHistory)
      if (!type || type === 'changes') {
        try {
          // ✅ CORRIGIDO: Import correto do modelo default
          const UserHistoryModule = await import('../models/UserHistory')
          const UserHistoryModel = UserHistoryModule.default

          // Buscar alunos da turma (suportar Hotmart e CursEduca)
          const classDataTyped = classData as any
          let students: any[] = []

          if (classDataTyped.source === 'curseduca_sync' && classDataTyped.curseducaUuid) {
            students = await User.find({ 'curseduca.groupCurseducaUuid': classDataTyped.curseducaUuid })
              .select('_id email')
              .lean()
          } else {
            students = await User.find({ classId })
              .select('_id email')
              .lean()
          }

          const studentIds = students.map(s => s._id)

          if (studentIds.length > 0) {
            // ✅ CORRIGIDO: Usar o modelo correto
            const userChanges = await UserHistoryModel.find({
              userId: { $in: studentIds },
              changeType: { $in: ['EMAIL_CHANGE', 'PLATFORM_UPDATE', 'STATUS_CHANGE', 'INACTIVATION'] }
            })
              .sort({ changeDate: -1 })
              .limit(limitNum)
              .skip(offsetNum)
              .lean()

            userChanges.forEach((change: any) => {
              history.push({
                type: 'USER_CHANGE',
                date: change.changeDate,
                changeType: change.changeType,
                userEmail: change.userEmail,
                field: change.field,
                previousValue: change.previousValue,
                newValue: change.newValue,
                platform: change.platform,
                source: change.source,
                reason: change.reason,
                performedBy: change.changedBy
              })
            })
          }
        } catch (error) {
          console.error('❌ Erro ao buscar mudanças de usuários:', error)
          // Continuar mesmo se houver erro - não quebrar todo o histórico
        }
      }

      // 3. Buscar sincronizações que afetaram esta turma
      if (!type || type === 'syncs') {
        try {
          const SyncHistory = await import('../models/SyncHistory')
          const syncs = await SyncHistory.default.find({
            type: { $in: ['hotmart', 'curseduca'] },
            status: 'completed',
            'metadata.classIds': classId
          })
            .sort({ startedAt: -1 })
            .limit(10)
            .lean()

          syncs.forEach((sync: any) => {
            history.push({
              type: 'SYNC',
              date: sync.startedAt,
              syncType: sync.type,
              status: sync.status,
              stats: sync.stats,
              metadata: sync.metadata
            })
          })
        } catch (error) {
          console.error('❌ Erro ao buscar sincronizações:', error)
          // Continuar mesmo se houver erro
        }
      }

      // Ordenar tudo por data
      history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      // Paginar resultado final
      const paginatedHistory = history.slice(offsetNum, offsetNum + limitNum)

      res.json({
        success: true,
        classId,
        className: (classData as any).name,
        history: paginatedHistory,
        total: history.length,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < history.length
        },
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ Erro ao buscar histórico completo:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar histórico da turma',
        error: (error as Error).message
      })
    }
  }

  // ✅ CORRIGIDO: Implementação direta sem historyService
  getClassHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        classId,
        studentId,
        dateFrom,
        dateTo,
        limit = 50,
        offset = 0
      } = req.query

      const filters = {
        classId: classId as string,
        studentId: studentId as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        limit: Number(limit),
        offset: Number(offset)
      }

      // ✅ Buscar histórico diretamente do StudentClassHistory
      const query: any = {}

      if (classId) {
        query.$or = [
          { classId: classId },
          { previousClassId: classId }
        ]
      }

      if (studentId) {
        query.studentId = studentId
      }

      if (dateFrom || dateTo) {
        query.dateMoved = {}
        if (dateFrom) query.dateMoved.$gte = new Date(dateFrom as string)
        if (dateTo) query.dateMoved.$lte = new Date(dateTo as string)
      }

      const total = await StudentClassHistory.countDocuments(query)
      const history = await StudentClassHistory.find(query)
        .populate('studentId', 'name email')
        .sort({ dateMoved: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .lean()

      res.json({
        success: true,
        history,
        total,
        filters,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao buscar histórico:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar histórico',
        error: (error as Error).message
      })
    }
  }

  // ✅ CORRIGIDO: Implementação direta sem historyService
  getStudentHistoryByDiscord = async (req: Request, res: Response): Promise<void> => {
    try {
      const { discordId } = req.params
      const { limit = 50, offset = 0 } = req.query

      // Buscar usuário pelo Discord ID
      const user = await User.findOne({ 'discord.discordIds': discordId }).lean()

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'Usuário não encontrado com esse Discord ID'
        })
        return
      }

      // Buscar histórico do estudante
      const total = await StudentClassHistory.countDocuments({ studentId: user._id })
      const history = await StudentClassHistory.find({ studentId: user._id })
        .sort({ dateMoved: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .lean()

      res.json({
        success: true,
        student: {
          _id: user._id,
          name: user.name,
          email: user.email
        },
        history,
        total,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao buscar histórico por Discord:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar histórico do estudante',
        error: (error as Error).message
      })
    }
  }

  // ✅ CORRIGIDO: Implementação direta sem historyService
  getStudentHistoryByEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.params
      const { limit = 50, offset = 0 } = req.query

      // Buscar usuário pelo email
      const user = await User.findOne({ email: email.toLowerCase() }).lean()

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'Usuário não encontrado com esse email'
        })
        return
      }

      // Buscar histórico do estudante
      const total = await StudentClassHistory.countDocuments({ studentId: user._id })
      const history = await StudentClassHistory.find({ studentId: user._id })
        .sort({ dateMoved: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .lean()

      res.json({
        success: true,
        student: {
          _id: user._id,
          name: user.name,
          email: user.email
        },
        history,
        total,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao buscar histórico por email:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar histórico do estudante',
        error: (error as Error).message
      })
    }
  }

  // ===== LISTAS DE INATIVAÇÃO =====

  // ✅ Criar lista de inativação por turmas + Discord + Histórico
  createInactivationList = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, classIds, description, userId, platforms = ['all'] } = req.body

      if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'classIds (array) é obrigatório'
        })
        return
      }

      console.log(`\n🚀 Iniciando inativação de ${classIds.length} turma(s)...`)

      const results: any[] = []
      let totalInactivated = 0
      let totalDiscordUpdates = 0

      for (const classId of classIds) {
        // 1. Buscar turma
        const classData = await (Class as any).findOne({ classId }).lean()
        if (!classData) {
          console.warn(`⚠️ Turma ${classId} não encontrada`)
          results.push({ classId, success: false, error: 'Turma não encontrada' })
          continue
        }

        console.log(`\n📚 Processando turma: ${classData.name}`)

        // 2. Buscar alunos da turma (suportar Hotmart e CursEduca)
        let students: any[] = []
        const classDataTyped = classData as any

        if (classDataTyped.source === 'curseduca_sync' && classDataTyped.curseducaUuid) {
          students = await User.find({
            'curseduca.groupCurseducaUuid': classDataTyped.curseducaUuid,
            'combined.status': { $ne: 'INACTIVE' }
          }).lean()
        } else {
          students = await User.find({
            classId,
            estado: { $ne: 'inativo' }
          }).lean()
        }

        console.log(`   👥 Encontrados ${students.length} alunos ativos`)

        // 3. Inativar cada aluno
        for (const student of students) {
          try {
            // 3.1. Atualizar status no BD
            const updates: any = {
              'combined.status': 'INACTIVE',
              status: 'INACTIVE',
              estado: 'inativo',
              'inactivation.isManuallyInactivated': true,
              'inactivation.inactivatedAt': new Date(),
              'inactivation.inactivatedBy': userId || 'Sistema',
              'inactivation.reason': description || `Inativação por turma: ${classData.name}`,
              'inactivation.platforms': platforms,
              'inactivation.classId': classId,
              updatedAt: new Date(),
              lastEditedAt: new Date(),
              lastEditedBy: `class_deactivation_${userId || 'system'}`
            }

            if (platforms.includes('hotmart') || platforms.includes('all')) {
              updates['hotmart.status'] = 'INACTIVE'
            }
            if (platforms.includes('curseduca') || platforms.includes('all')) {
              updates['curseduca.memberStatus'] = 'INACTIVE'
            }
            if (platforms.includes('discord') || platforms.includes('all')) {
              updates['discord.isActive'] = false
            }

            await User.findByIdAndUpdate(student._id, { $set: updates })

            // 3.1.1 Atualizar UserProduct status
            await UserProduct.updateMany(
              { userId: student._id },
              { $set: { status: 'INACTIVE' } }
            )

            // 3.2. Registrar no histórico
            try {
              await (UserHistory as any).createInactivationHistory(
                student._id,
                student.email || 'Email desconhecido',
                platforms,
                description || `Inativação por turma: ${classData.name}`,
                userId || 'Sistema'
              )
            } catch (historyError: any) {
              console.warn(`   ⚠️ Erro ao registrar histórico para ${student.email}:`, historyError.message)
            }

            totalInactivated++
            results.push({
              studentId: student._id,
              email: student.email,
              name: student.name,
              status: 'success',
              classId: classId,
              className: classData.name
            })

          } catch (studentError: any) {
            console.error(`   ❌ Erro ao inativar ${student.email}:`, studentError.message)
            results.push({
              studentId: student._id,
              email: student.email,
              name: student.name,
              status: 'error',
              error: studentError.message,
              classId: classId
            })
          }
        }
      }

      // 4. Delegar remoção de Discord roles para API antiga (tem discord.js integrado)
      const oldApiUrl = process.env.OLD_API_URL || 'https://api.serriquinho.com'
      try {
        console.log(`\n🎮 Delegando remoção de Discord roles para API antiga...`)
        const discordResponse = await axios.post(
          `${oldApiUrl}/classes/inactivationLists/create`,
          { classIds, platforms: ['discord'] },
          { timeout: 120000, headers: { 'Content-Type': 'application/json' } }
        )
        totalDiscordUpdates = discordResponse.data?.list?.totalDiscordUpdates || discordResponse.data?.discordUpdates || 0
        console.log(`✅ Discord: API antiga processou - ${totalDiscordUpdates} roles removidos`)
      } catch (discordError: any) {
        console.warn(`⚠️ Discord: Erro ao delegar para API antiga:`, discordError.response?.data?.message || discordError.message)
      }

      console.log(`\n✅ Inativação concluída:`)
      console.log(`   📊 Total de alunos inativados: ${totalInactivated}`)
      console.log(`   💬 Discord roles atualizados: ${totalDiscordUpdates}`)

      const inactivationList = {
        _id: new Date().getTime().toString(),
        name: name || `Inativação ${new Date().toLocaleDateString('pt-PT')}`,
        classIds,
        totalInactivated,
        totalDiscordUpdates,
        students: results,
        createdAt: new Date()
      }

      // Marcar turmas como inativas
      const classUpdatePromises = classIds.map(async (cId: string) => {
        try {
          const existingClass = await (Class as any).findOne({ classId: cId }).lean()
          if (!existingClass) {
            return { classId: cId, success: false, error: 'Turma não encontrada' }
          }

          const result = await classesService.addOrEditClass({
            classId: cId,
            name: existingClass.name || cId,
            description: existingClass.description || '',
            isActive: false,
            estado: 'inativo',
            source: (existingClass as any).source || 'manual'
          })

          console.log(`✅ Turma ${cId} marcada como inativa`)
          return { classId: cId, success: true, result }
        } catch (error) {
          console.error(`❌ Erro ao inativar turma ${cId}:`, error)
          return { classId: cId, success: false, error: (error as Error).message }
        }
      })

      const classUpdateResults = await Promise.allSettled(classUpdatePromises)
      const successfulUpdates = classUpdateResults.filter(
        (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value.success
      )

      console.log(`📊 Turmas inativadas: ${successfulUpdates.length}/${classIds.length}`)

      res.json({
        success: true,
        message: 'Lista de inativação criada e turmas atualizadas',
        list: inactivationList,
        classUpdates: {
          successful: successfulUpdates.length,
          failed: classIds.length - successfulUpdates.length,
          total: classIds.length
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao criar lista de inativação:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao criar lista de inativação',
        error: (error as Error).message
      })
    }
  }

  getInactivationLists = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, limit = 50, offset = 0 } = req.query

      const limitNum = Number(limit)
      const offsetNum = Number(offset)

      // Query no UserHistory para inativações
      const query: any = { changeType: 'INACTIVATION' }
      if (status) {
        query['metadata.status'] = status
      }

      const total = await UserHistory.countDocuments(query)
      
      const inactivations = await UserHistory.find(query)
        .sort({ changeDate: -1 })
        .limit(limitNum)
        .skip(offsetNum)
        .lean()

      // Agrupar por turma se possível
      const lists: any[] = []
      
      for (const inact of inactivations) {
        // Buscar user para pegar classId
        const user = await User.findById(inact.userId).select('classId').lean()

        if (user) {
          const classData = await Class.findOne({ classId: (user as any).classId }).lean() as any

          lists.push({
            _id: inact._id,
            name: `Inativação ${new Date(inact.changeDate).toLocaleDateString('pt-PT')}`,
            classNames: classData ? [classData.name] : [],
            createdAt: inact.changeDate,
            status: 'COMPLETED',
            studentCount: 1,
            executedDate: inact.changeDate,
            performedBy: inact.changedBy,
            platforms: inact.metadata?.platforms || []
          })
        }
      }

      res.json({
        success: true,
        lists,
        total,
        filters: { status, limit: limitNum, offset: offsetNum },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao buscar listas de inativação:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar listas de inativação',
        error: (error as Error).message
      })
    }
  }

  // 🛠️ CORRIGIDO: Usar método correto do service
  revertInactivation = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const { reason, userId } = req.body

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'ID da lista de inativação é obrigatório'
        })
        return
      }

      // ✅ CORRIGIDO: Implementação direta de reversão
      // Buscar o registro de inativação
      const inactivation = await UserHistory.findById(id)
      if (!inactivation) {
        res.status(404).json({
          success: false,
          message: 'Registro de inativação não encontrado'
        })
        return
      }

      // Reativar o usuário
      const updates: any = {
        'combined.status': 'ACTIVE',
        status: 'ACTIVE'
      }

      const platforms = inactivation.metadata?.platforms || []
      if (platforms.includes('hotmart') || platforms.includes('all')) {
        updates['hotmart.status'] = 'ACTIVE'
      }
      if (platforms.includes('curseduca') || platforms.includes('all')) {
        updates['curseduca.memberStatus'] = 'ACTIVE'
      }
      if (platforms.includes('discord') || platforms.includes('all')) {
        updates['discord.isActive'] = true
      }

      await User.findByIdAndUpdate(inactivation.userId, { $set: updates })

      // Reativar UserProduct (fonte única de verdade)
      await UserProduct.updateMany(
        { userId: inactivation.userId },
        { $set: { status: 'ACTIVE' } }
      )

      // Criar histórico de reativação
      await UserHistory.create({
        userId: inactivation.userId,
        userEmail: inactivation.userEmail,
        changeType: 'STATUS_CHANGE',
        previousValue: { status: 'INACTIVE' },
        newValue: { status: 'ACTIVE' },
        source: 'MANUAL',
        changedBy: userId || 'Sistema',
        reason: reason || 'Reversão de inativação'
      })

      // 🎮 NOVO: Restaurar papéis no Discord Bot
      if (platforms.includes('discord') || platforms.includes('all')) {
        try {
          const user = await User.findById(inactivation.userId).lean()
          const discordIds = user?.discord?.discordIds || []

          if (discordIds.length > 0 && process.env.DISCORD_BOT_URL) {
            // Chamar API Riquinho (Discord Bot) para cada Discord ID
            const discordPromises = discordIds.map(async (discordId: string) => {
              try {
                const response = await fetch(`${process.env.DISCORD_BOT_URL}/add-roles`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: discordId,
                    reason: reason || 'Reversão manual de inativação'
                  })
                })

                if (!response.ok) {
                  console.warn(`⚠️ Discord: Falha ao restaurar roles para ${discordId}`)
                } else {
                  console.log(`✅ Discord: Papéis restaurados para ${user?.email || discordId}`)
                }
              } catch (discordError) {
                console.warn(`⚠️ Discord: Erro ao processar ${discordId}:`, (discordError as Error).message)
              }
            })

            // Aguardar todas as chamadas ao Discord (mas não bloquear response se falhar)
            await Promise.allSettled(discordPromises)
          } else if (discordIds.length === 0) {
            console.log(`ℹ️ Discord: Usuário ${inactivation.userEmail} não possui Discord IDs`)
          }
        } catch (discordError) {
          // Não bloquear a reversão se Discord falhar
          console.warn('⚠️ Discord: Erro ao restaurar papéis:', (discordError as Error).message)
        }
      }

      const result = { success: true }

      res.json({
        success: true,
        message: 'Inativação revertida com sucesso',
        result,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao reverter inativação:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao reverter inativação',
        error: (error as Error).message
      })
    }
  }

  // ===== MÉTODO AUXILIAR PARA ATUALIZAR ESTADO DAS TURMAS =====

  updateClassStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { classId, isActive, reason, userId } = req.body

      if (!classId || typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'classId e isActive (boolean) são obrigatórios'
        })
        return
      }

      // ✅ CORRIGIDO: Buscar turma diretamente do modelo
      const existingClass = await Class.findOne({ classId }).lean();
      
      if (!existingClass) {
        res.status(404).json({
          success: false,
          message: 'Turma não encontrada'
        })
        return
      }

      // Funcionalidade: Se desativando a turma, inativar todos os estudantes
      let affectedStudents = 0
      let discordUpdates = 0
      const existingClassTyped = existingClass as any
      if (!isActive) {
        console.log(`🔄 Desativando turma ${classId} - Inativando estudantes...`)

        // Buscar alunos que ainda não estão inativos (primeira inativação)
        const activeStudents = await User.find({
          classId: classId,
          estado: { $ne: 'inativo' }
        })

        if (activeStudents.length > 0) {
          const updateResult = await User.updateMany(
            { classId: classId, estado: { $ne: 'inativo' } },
            {
              estado: 'inativo',
              status: 'INACTIVE',
              updatedAt: new Date(),
              lastEditedAt: new Date(),
              lastEditedBy: `class_deactivation_${userId || 'system'}`
            }
          )

          affectedStudents = updateResult.modifiedCount
          console.log(`✅ ${affectedStudents} estudantes marcados como inativos na turma ${classId}`)

          // Atualizar UserProduct status (apenas hotmart - CursEduca é gerido pelo Guru)
          const studentIds = activeStudents.map(s => s._id)
          await UserProduct.updateMany(
            { userId: { $in: studentIds }, platform: 'hotmart' },
            { $set: { status: 'INACTIVE' } }
          )

          const historyEntries = activeStudents.map(student => ({
            studentId: student._id,
            classId: classId,
            className: existingClassTyped.name || classId,
            previousClassId: classId,
            previousClassName: existingClassTyped.name || classId,
            dateMoved: new Date(),
            reason: reason || 'Turma desativada',
            movedBy: userId || 'system'
          }))

          if (historyEntries.length > 0) {
            await StudentClassHistory.insertMany(historyEntries)
            console.log(`📝 Histórico registrado para ${historyEntries.length} estudantes`)
          }
        }

        // Delegar remoção de Discord roles para API antiga (tem discord.js integrado)
        const oldApiUrl = process.env.OLD_API_URL || 'https://api.serriquinho.com'
        try {
          console.log(`🎮 Delegando remoção de Discord roles para API antiga...`)
          const discordResponse = await axios.post(
            `${oldApiUrl}/classes/inactivationLists/create`,
            { classIds: [classId], platforms: ['discord'] },
            { timeout: 120000, headers: { 'Content-Type': 'application/json' } }
          )
          discordUpdates = discordResponse.data?.list?.totalDiscordUpdates || discordResponse.data?.discordUpdates || 0
          console.log(`✅ Discord: API antiga processou - ${discordUpdates} roles removidos`)
        } catch (discordError: any) {
          console.warn(`⚠️ Discord: Erro ao delegar para API antiga:`, discordError.response?.data?.message || discordError.message)
        }
      }

      // Funcionalidade: Se reativando a turma, reativar estudantes
      let reactivatedStudents = 0
      if (isActive && !existingClassTyped.isActive) {
        console.log(`🔄 Reativando turma ${classId} - Reativando estudantes...`)

        const studentsToReactivate = await User.find({
          classId: classId,
          estado: 'inativo',
          lastEditedBy: { $regex: /^class_deactivation/ }
        })

        if (studentsToReactivate.length > 0) {
          const updateResult = await User.updateMany(
            {
              classId: classId,
              estado: 'inativo',
              lastEditedBy: { $regex: /^class_deactivation/ }
            },
            {
              estado: 'ativo',
              status: 'ACTIVE',
              updatedAt: new Date(),
              lastEditedAt: new Date(),
              lastEditedBy: `class_reactivation_${userId || 'system'}`
            }
          )

          reactivatedStudents = updateResult.modifiedCount
          console.log(`✅ ${reactivatedStudents} estudantes reativados na turma ${classId}`)

          // Reativar UserProducts hotmart dos estudantes reativados
          const reactivateIds = studentsToReactivate.map(s => s._id)
          await UserProduct.updateMany(
            { userId: { $in: reactivateIds }, platform: 'hotmart', status: 'INACTIVE' },
            { $set: { status: 'ACTIVE' } }
          )

          const historyEntries = studentsToReactivate.map(student => ({
            studentId: student._id,
            classId: classId,
            className: existingClassTyped.name || classId,
            previousClassId: classId,
            previousClassName: existingClassTyped.name || classId,
            dateMoved: new Date(),
            reason: reason || 'Turma reativada',
            movedBy: userId || 'system'
          }))

          if (historyEntries.length > 0) {
            await StudentClassHistory.insertMany(historyEntries)
            console.log(`📝 Histórico de reativação registrado para ${historyEntries.length} estudantes`)
          }
        }
      }

      const result = await classesService.addOrEditClass({
        classId,
        name: existingClass.name || classId,
        description: existingClass.description || '',
        isActive,
        estado: isActive ? 'ativo' : 'inativo',
        source: (existingClass as any).source || 'manual'
      })

      const responseMessage = isActive 
        ? `Turma ativada com sucesso${reactivatedStudents > 0 ? ` (${reactivatedStudents} estudantes reativados)` : ''}`
        : `Turma inativada com sucesso${affectedStudents > 0 ? ` (${affectedStudents} estudantes inativados)` : ''}`

      res.json({
        success: true,
        message: responseMessage,
        class: result.class,
        studentsAffected: isActive ? reactivatedStudents : affectedStudents,
        action: isActive ? 'reactivated' : 'deactivated',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao atualizar status da turma:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar status da turma',
        error: (error as Error).message
      })
    }
  }

  // ===== ESTUDANTES POR TURMA =====

  getStudentsByClass = async (req: Request, res: Response): Promise<void> => {
    try {
      const { classId } = req.params
      const { 
        includeInactive = 'false',
        limit = 100, 
        offset = 0,
        sortBy = 'name',
        sortOrder = 'asc'
      } = req.query

      if (!classId) {
        res.status(400).json({
          success: false,
          message: 'classId é obrigatório'
        })
        return
      }

      // Verificar se a turma existe
      const classData = await classesService.getClassById(classId)
      if (!classData) {
        res.status(404).json({
          success: false,
          message: 'Turma não encontrada'
        })
        return
      }

      // ✅ CORRIGIDO: Suportar turmas CursEduca e Hotmart
      const classDataTyped = classData as any
      let filter: any

      if (classDataTyped.source === 'curseduca_sync') {
        // ✅ USAR enrolledClasses array (fonte correta de dados)
        // Buscar users que têm esta turma no array enrolledClasses
        filter = {
          'curseduca.enrolledClasses': {
            $elemMatch: {
              curseducaId: { $in: [classId, String(classId), Number(classId)] },
              isActive: true
            }
          }
        }

        // Por padrão, só mostrar estudantes ativos
        if (includeInactive !== 'true') {
          filter['curseduca.memberStatus'] = 'ACTIVE'
        }

        // 🔄 FALLBACK: Se não há enrolledClasses, tentar por groupId (dados antigos)
        // Isso será removido depois que todos os users tiverem enrolledClasses populado
      } else {
        // Para turmas Hotmart e outras, buscar por classId
        filter = {
          classId,
          'inactivation.isManuallyInactivated': { $ne: true }
        }

        // Por padrão, só mostrar estudantes ativos
        if (includeInactive !== 'true') {
          filter.estado = { $ne: 'inativo' }
        }
      }

      // Construir ordenação
      const sortObj: any = {}
      sortObj[sortBy as string] = sortOrder === 'desc' ? -1 : 1

      // Buscar estudantes
      const students = await User.find(filter)
        .sort(sortObj)
        .limit(Number(limit))
        .skip(Number(offset))
        .lean()

      // Contar total
      const totalStudents = await User.countDocuments(filter)

      // Formatar dados dos estudantes
      const formattedStudents = students.map(student => {
        const s = student as any
        
        // ✅ CORRIGIDO: Suportar dados de ambas as plataformas
        let joinedDate = s.joinedAt || s.createdAt
        let lastActivityDate = s.lastActivity || s.updatedAt
        let studentStatus = s.status
        
        // Para CursEduca, usar campos específicos
        if (classDataTyped.source === 'curseduca_sync') {
          joinedDate = s.curseduca?.joinedDate || joinedDate
          lastActivityDate = s.curseduca?.lastAccessDate || lastActivityDate
          studentStatus = s.combined?.status || s.curseduca?.memberStatus || studentStatus
        }
        
        return {
          _id: s._id,
          name: s.name || s.displayName || 'Nome não disponível',
          email: s.email,
          discordId: s.discordId || s.discord?.discordIds?.[0],
          status: studentStatus,
          estado: s.estado,
          joinedAt: joinedDate,
          lastActivity: lastActivityDate,
          avatar: s.avatar,
          roles: s.roles,
          // 🆕 Adicionar informações de plataforma
          platform: classDataTyped.source === 'curseduca_sync' ? 'curseduca' : 'hotmart'
        }
      })

      res.json({
        success: true,
        classId,
        className: classDataTyped.name,
        students: formattedStudents,
        pagination: {
          total: totalStudents,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: (Number(offset) + formattedStudents.length) < totalStudents
        },
        filters: {
          includeInactive: includeInactive === 'true',
          sortBy,
          sortOrder
        },
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ Erro ao buscar estudantes da turma:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar estudantes da turma',
        error: (error as Error).message
      })
    }
  }

  // ===== PESQUISA DE ESTUDANTES =====

  searchStudents = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        email,
        name,
        discordId,
        classId,
        status,
        limit = 50,
        offset = 0
      } = req.query

      if (!email && !name && !discordId && !classId) {
        res.status(400).json({
          success: false,
          message: 'Pelo menos um critério de pesquisa é obrigatório'
        })
        return
      }

      const searchCriteria = {
        email: email as string,
        name: name as string,
        discordId: discordId as string,
        classId: classId as string,
        status: status as string,
        limit: Number(limit),
        offset: Number(offset)
      }

      const result = await studentService.searchStudents(searchCriteria)

      // Verificar se encontrou múltiplos ou único resultado
      const multiple = result.students.length > 1
      const response = multiple ? result : result.students[0]

      res.json({
        success: true,
        multiple,
        message: multiple 
          ? `Encontrados ${result.students.length} estudantes`
          : 'Estudante encontrado',
        ...(multiple ? result : response),
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao pesquisar estudantes:', error)
      
      if ((error as any).status === 404) {
        res.status(404).json({
          success: false,
          message: 'Nenhum estudante encontrado com os critérios fornecidos'
        })
        return
      }

      res.status(500).json({
        success: false,
        message: 'Erro ao pesquisar estudantes',
        error: (error as Error).message
      })
    }
  }

    syncComplete = async (req: Request, res: Response): Promise<void> => {
    let syncRecord: any = null;
    
    try {
      const subdomain = process.env.subdomain;
      if (!subdomain) {
        res.status(400).json({ 
          success: false,
          message: 'Subdomain é obrigatório' 
        });
        return;
      }

      // 1. Criar registo de sincronização
    syncRecord = await SyncHistory.create({
      type: 'hotmart', // ✅ CORRETO: usar 'hotmart' em vez de 'complete_classes_sync'
      status: 'running',
      startedAt: new Date(),
      stats: {
        total: 0,
        added: 0,
        updated: 0,
        conflicts: 0,
        errors: 0
      },
      metadata: {
        currentStep: 'Iniciando sincronização completa...',
        progress: 0,
        totalPages: 0,
        processedUsers: 0,
        apiVersion: 'v1',
        requestId: `sync_${Date.now()}`
      }
    });

      console.log(`🔄 [${syncRecord._id}] Iniciando sincronização completa de turmas e histórico...`);

      // 2. Obter token de acesso da Hotmart
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': 'Obtendo token de acesso...',
        'metadata.progress': 5
      });

      const accessToken = await getHotmartAccessToken();
      let url = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`;
      let nextPageToken: string | null = null;

      // 3. Carregar utilizadores locais para comparação
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': 'Carregando utilizadores locais...',
        'metadata.progress': 10
      });

      const localUsers = await User.find({}, '_id email classId hotmartUserId status');
      const localUserMap = new Map();
      localUsers.forEach(user => {
        localUserMap.set(user.email, user);
      });

      console.log(`📊 [${syncRecord._id}] ${localUsers.length} utilizadores locais carregados`);

      // 4. Variáveis de controlo
      let totalProcessed = 0;
      let pagesProcessed = 0;
      let classChangesDetected = 0;
      let newUsersFound = 0;
      let existingUsersUpdated = 0;
      const uniqueClassIds = new Set<string>();
      const classStudentCount: Record<string, number> = {};
      const errors: string[] = [];

      // 5. Processar todas as páginas da Hotmart
      do {
        pagesProcessed++;
        
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          'metadata.currentStep': `Processando página ${pagesProcessed}...`,
          'metadata.progress': 15 + (pagesProcessed * 2) // Incremento gradual
        });

        try {
          const response: any = await axios.get(
            url + (nextPageToken ? `&page_token=${encodeURIComponent(nextPageToken)}` : ''),
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          const items: any[] = response.data.items || [];
          const page_info: any = response.data.page_info || {};
          
          // Processar cada utilizador da página
          for (const hotmartUser of items) {
            if (!hotmartUser.email) continue;
            
            totalProcessed++;
            
            // Contar estudantes por turma
            if (hotmartUser.class_id) {
              uniqueClassIds.add(hotmartUser.class_id);
              classStudentCount[hotmartUser.class_id] = (classStudentCount[hotmartUser.class_id] || 0) + 1;
            }

            const localUser = localUserMap.get(hotmartUser.email);

            if (localUser) {
              // ✨ VERIFICAR MUDANÇAS NO UTILIZADOR EXISTENTE
              let userNeedsUpdate = false;
              const userUpdates: any = {};

              // ✅ CORRIGIDO: Acessar classId corretamente (está em combined ou pode estar em nível raiz)
              const currentClassId = (localUser as any).combined?.classId || (localUser as any).classId || null;

              // Verificar mudança de turma
              if (currentClassId !== hotmartUser.class_id) {
                console.log(`🔄 [${syncRecord._id}] Mudança de turma detectada: ${localUser.email}`);
                console.log(`   Anterior: ${currentClassId || 'Nenhuma'} → Nova: ${hotmartUser.class_id || 'Nenhuma'}`);

                // Atualizar no lugar correto (combined)
                userUpdates['combined.classId'] = hotmartUser.class_id;
                userNeedsUpdate = true;
                classChangesDetected++;

                // Registar no histórico de mudança de turma
                try {
                  // Buscar nome da turma nova
                  const newClassData = await Class.findOne({ classId: hotmartUser.class_id });
                  const newClassName = newClassData?.name || `Turma ${hotmartUser.class_id || 'Indefinida'}`;

                  // Buscar nome da turma anterior
                  const oldClassData = currentClassId ? await Class.findOne({ classId: currentClassId }) : null;
                  const oldClassName = oldClassData?.name || `Turma ${currentClassId || 'Indefinida'}`;

                  await StudentClassHistory.create({
                    studentId: localUser._id,
                    classId: hotmartUser.class_id,
                    className: newClassName,
                    previousClassId: currentClassId,
                    previousClassName: oldClassName,
                    dateMoved: new Date(),
                    reason: 'Mudança detectada via sincronização completa Hotmart',
                    movedBy: 'complete_sync'
                  });
                } catch (historyError: any) {
                  errors.push(`Erro ao criar histórico para ${hotmartUser.email}: ${historyError.message}`);
                  console.error(`❌ [${syncRecord._id}] Erro no histórico:`, historyError.message);
                }
              }

              // ✅ CORRIGIDO: Acessar campos de Hotmart corretamente
              const currentHotmartId = (localUser as any).hotmart?.hotmartUserId;
              const currentStatus = (localUser as any).status || (localUser as any).combined?.status;

              if (currentHotmartId !== hotmartUser.user_id) {
                userUpdates['hotmart.hotmartUserId'] = hotmartUser.user_id;
                userNeedsUpdate = true;
              }

              if (currentStatus !== (hotmartUser.status || 'INACTIVE')) {
                userUpdates['status'] = hotmartUser.status || 'INACTIVE';
                userUpdates['combined.status'] = hotmartUser.status || 'INACTIVE';
                userNeedsUpdate = true;
              }

              // Data de compra
              const currentPurchaseDate = (localUser as any).hotmart?.purchaseDate;
              const purchaseDate = hotmartUser.purchase_date ? new Date(hotmartUser.purchase_date * 1000) : null;
              if (currentPurchaseDate?.getTime() !== purchaseDate?.getTime()) {
                userUpdates['hotmart.purchaseDate'] = purchaseDate;
                userNeedsUpdate = true;
              }

              // Atualizar utilizador se necessário
              if (userNeedsUpdate) {
                try {
                  await User.findByIdAndUpdate(localUser._id, {
                    ...userUpdates,
                    lastSyncAt: new Date()
                  });
                  existingUsersUpdated++;
                } catch (updateError: any) {
                  const errorMsg = `Erro ao atualizar utilizador ${hotmartUser.email}: ${updateError.message}`;
                  errors.push(errorMsg);
                  console.error(`❌ [${syncRecord._id}] ${errorMsg}`);
                }
              }

            } else {
              // ✨ UTILIZADOR NOVO - apenas contar, não criar
              newUsersFound++;
              console.log(`🆕 [${syncRecord._id}] Novo utilizador encontrado: ${hotmartUser.email} (não será criado automaticamente)`);
            }
          }

          nextPageToken = page_info?.next_page_token || null;
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (pageError: any) {
          const errorMsg = `Erro na página ${pagesProcessed}: ${pageError.message}`;
          errors.push(errorMsg);
          console.error(`❌ [${syncRecord._id}] ${errorMsg}`);
          break; // Para evitar loop infinito
        }
        
      } while (nextPageToken && pagesProcessed < 1000); // Limite de segurança

      // 6. Sincronizar/Atualizar turmas
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': 'Sincronizando turmas...',
        'metadata.progress': 80
      });

      let newClassesCreated = 0;
      let existingClassesUpdated = 0;
      let classesReactivated = 0;

      for (const classId of uniqueClassIds) {
        try {
          const studentCount = classStudentCount[classId] || 0;
          const existingClass = await Class.findOne({ classId });

          if (existingClass) {
            // Verificar se precisa de atualização
            const classUpdates: any = {
              lastSyncAt: new Date(),
              source: 'hotmart_sync'
            };

            let needsUpdate = false;

            // Atualizar contagem de estudantes
            if (existingClass.studentCount !== studentCount) {
              classUpdates.studentCount = studentCount;
              classUpdates.lastStudentCountUpdate = new Date();
              needsUpdate = true;
            }

            if (needsUpdate) {
              await Class.findByIdAndUpdate(existingClass._id, classUpdates);
              existingClassesUpdated++;
            }

          } else {
            // Criar nova turma
            await Class.create({
              classId,
              name: `Turma ${classId}`,
              description: `Turma sincronizada da Hotmart via sincronização completa em ${new Date().toLocaleDateString('pt-PT')}`,
              source: 'hotmart_sync',
              isActive: true,
              estado: 'ativo',
              studentCount,
              lastSyncAt: new Date(),
              createdAt: new Date(),
              metadata: {
                autoCreated: true,
                initialStudentCount: studentCount,
                syncSource: 'complete_sync'
              }
            });
            newClassesCreated++;
            console.log(`🆕 [${syncRecord._id}] Nova turma criada: ${classId} (${studentCount} estudantes)`);
          }

        } catch (classError: any) {
          const errorMsg = `Erro ao processar turma ${classId}: ${classError.message}`;
          errors.push(errorMsg);
          console.error(`❌ [${syncRecord._id}] ${errorMsg}`);
        }
      }

      // 7. Finalizar sincronização
      const finalStats = {
        total: totalProcessed,
        added: newClassesCreated,
        updated: existingClassesUpdated,
        conflicts: classChangesDetected,
        errors: errors.length
      };

      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'completed',
        completedAt: new Date(),
        stats: finalStats,
        'metadata.currentStep': 'Sincronização completa finalizada!',
        'metadata.progress': 100,
        errorDetails: errors.length > 0 ? errors : undefined
      });

      console.log(`✅ [${syncRecord._id}] Sincronização completa finalizada:`, finalStats);

      res.json({
        success: true,
        message: 'Sincronização completa de turmas e histórico realizada com sucesso',
        stats: finalStats,
        syncId: syncRecord._id,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error(`💥 [${syncRecord?._id}] ERRO NA SINCRONIZAÇÃO COMPLETA:`, error);

      if (syncRecord) {
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          status: 'failed',
          completedAt: new Date(),
          'metadata.currentStep': 'Erro na sincronização completa',
          'metadata.progress': 0,
          stats: {
            total: 0,
            added: 0,
            updated: 0,
            conflicts: 0,
            errors: 1
          },
          errorDetails: [error.message]
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erro na sincronização completa',
        error: error.message
      });
    }
  }
}

export const classesController = new ClassesController()

// ✅ NOVO: Endpoint para inativar alunos em todas as plataformas
export const bulkInactivateStudents = async (req: Request, res: Response) => {
  try {
    const { studentIds, platforms } = req.body

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lista de IDs de alunos inválida'
      })
    }

    const updates: any = {
      'combined.status': 'INACTIVE',
      status: 'INACTIVE'
    }

    // Inativar em plataformas específicas
    if (platforms && platforms.includes('hotmart')) {
      updates['hotmart.status'] = 'INACTIVE'
    }
    if (platforms && platforms.includes('curseduca')) {
      updates['curseduca.memberStatus'] = 'INACTIVE'
    }
    if (platforms && platforms.includes('discord')) {
      updates['discord.isActive'] = false
    }

    const result = await User.updateMany(
      { _id: { $in: studentIds } },
      { $set: updates }
    )

    // ✅ MELHORADO: Criar entradas de histórico de inativação
    const students = await User.find({ _id: { $in: studentIds } }).select('email').lean()
    
    for (const student of students) {
      try {
        const { UserHistory } = await import('../models/UserHistory')
        await (UserHistory as any).createInactivationHistory(
          student._id,
          student.email || 'Email desconhecido',
          platforms || ['all'],
          'Inativação em massa via painel administrativo',
          (req as any).user?.email || (req as any).user?.id || 'Sistema'
        )
      } catch (historyError) {
        console.warn(`⚠️ Erro ao criar histórico de inativação para ${student.email}:`, historyError)
      }
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} alunos inativados`,
      modified: result.modifiedCount
    })

  } catch (error: any) {
    console.error('❌ Erro ao inativar alunos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao inativar alunos',
      error: error.message
    })
  }
}