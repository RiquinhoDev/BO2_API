// src/controllers/classes.controller.ts - CORRIGIDO para evitar erros TypeScript
import { Request, Response } from 'express'
import type { FilterQuery, UpdateQuery } from 'mongoose'
import type { ClassesDeleteInput } from '../security/classesDestructiveInput'
import { classesService, studentService } from '../services/syncUtilizadoresServices/hotmartServices/classesService'
import SyncHistory from '../models/SyncHistory'

import axios from 'axios'
import mongoose from 'mongoose'
import { signOldApiToken } from '../security/jwt'
import { Class, type IClass } from '../models/Class'
import StudentClassHistory from '../models/StudentClassHistory'
import { User, UserProduct } from '../models'
import type { IUser } from '../models/user'
import UserHistory, { type IUserHistory } from '../models/UserHistory'
import type { ISyncHistory } from '../models/SyncHistory'

type ClassIdParams = {
  classId: string
}

type HotmartStatus = 'ACTIVE' | 'INACTIVE'

interface HotmartClubUser {
  email?: string
  class_id?: string
  user_id?: string
  status?: HotmartStatus
  purchase_date?: number
}

interface HotmartPageInfo {
  next_page_token?: string
}

interface HotmartUsersResponse {
  users?: HotmartClubUser[]
  items?: HotmartClubUser[]
  data?: HotmartClubUser[]
  page_info?: HotmartPageInfo
  pageInfo?: HotmartPageInfo
}

interface HotmartTokenResponse {
  access_token?: string
}

interface DiscordInactivationResponse {
  list?: { totalDiscordUpdates?: number }
  discordUpdates?: number
}

interface InactivationResult {
  classId: string
  success?: false
  error?: string
  studentId?: IUser['_id']
  email?: string
  name?: string
  status?: 'success' | 'error'
  className?: string
}

interface InactivationListView {
  _id: IUser['_id']
  name: string
  classNames: string[]
  createdAt: Date
  status: 'COMPLETED'
  studentCount: number
  executedDate: Date
  performedBy?: string
  platforms: string[]
}

interface FetchedClassStudent {
  name?: string
  email?: string
  discordIds?: string[]
  discord?: { discordIds?: string[] }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

function axiosErrorData(error: unknown): unknown {
  return axios.isAxiosError(error) ? error.response?.data : undefined
}

function axiosErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return errorMessage(error)
  const data = error.response?.data
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    return data.message
  }
  return error.message
}

export function buildClassUserStatusUpdate(
  isActive: boolean,
): Record<'combined.status' | 'hotmart.status', HotmartStatus> {
  const status: HotmartStatus = isActive ? 'ACTIVE' : 'INACTIVE'
  return {
    'combined.status': status,
    'hotmart.status': status,
  }
}

// Headers autenticados para delegar à API antiga.
// Desde o commit 87e3457 ("security: proteger rotas admin"), a rota
// /classes/inactivationLists/create da API antiga exige authenticateAdmin.
// Esta delegação é máquina-a-máquina, por isso assinamos um JWT admin curto.
// O segredo TEM de bater com o JWT_SECRET da API antiga em produção;
// usa a autoridade OLD_API_JWT_SECRET, obrigatoriamente distinta desta API.
function buildOldApiHeaders(scope: string) {
  const token = signOldApiToken(
    { role: 'admin', service: 'BO2_API', scope },
    { expiresIn: '5m' }
  )
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}


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

    const response = await axios.post<HotmartTokenResponse>(
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
  } catch (error: unknown) {
    console.error('Error getting Hotmart access token:', axiosErrorData(error) ?? errorMessage(error));
    throw new Error('Failed to get access token');
  }
}

class ClassesController {
  // ===== GESTÃO DE TURMAS =====

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
    let syncRecord: ISyncHistory | null = null;

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

        const response = await axios.get<HotmartUsersResponse>(requestUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        const users = response.data.users || response.data.items || response.data.data || [];
        const pageInfo = response.data.page_info || response.data.pageInfo || {};

        users.forEach((user) => {
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
      const classUpdates: UpdateQuery<IClass> = {
        lastSyncAt: new Date(),
        source: 'hotmart_sync'
      };

      let needsUpdate = false;

      // Atualizar apenas contagem de estudantes
      if (existingClass.studentCount !== studentCount) {
        classUpdates.studentCount = studentCount;
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

  } catch (classError: unknown) {
    const errorMsg = `Erro ao processar turma ${classId}: ${errorMessage(classError)}`;
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
            'combined.status': 'ACTIVE',
            'inactivation.isManuallyInactivated': { $ne: true },
          });

          await Class.findOneAndUpdate(
            { classId },
            { 
              studentCount: activeStudents,
              lastSyncAt: new Date()
            }
          );
        } catch (countError: unknown) {
          console.warn(`⚠️ [${syncRecord._id}] Erro ao atualizar contador da turma ${classId}:`, errorMessage(countError));
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

    } catch (error: unknown) {
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
          errorDetails: [errorMessage(error)]
        });
      }

      res.status(500).json({
        message: 'Erro na sincronização de turmas',
        success: false,
        error: errorMessage(error),
        details: errorStack(error)
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
        const response: AxiosResponse<HotmartUsersResponse> = await axios.get<HotmartUsersResponse>(
          url + (nextPageToken ? `&page_token=${encodeURIComponent(nextPageToken)}` : ''),
          {
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // ✅ CORRIGIDO: Desestruturação com tipagem explícita
        const items = response.data.items || [];
        const page_info: HotmartPageInfo = response.data.page_info || {};
        
        console.log(`   • ${items.length} utilizadores nesta página`);

        // ✅ CORRIGIDO: Verificação de array válido
        if (Array.isArray(items) && items.length > 0) {
          for (const hotmartUser of items) {
            try {
              usersProcessed++;

              // ✅ Verificação de email válido
              const hotmartEmail = hotmartUser.email
              if (!hotmartEmail) {
                continue;
              }

              const localUser = localUsers.find((user) => 
                user.email && 
                user.email.toLowerCase() === hotmartEmail.toLowerCase()
              );

              if (localUser) {
                // ✅ CORRIGIDO: classId não existe diretamente no documento, está em combined
                const currentClassId = localUser.combined?.classId || localUser.classId || null;
                const newClassId = hotmartUser.class_id || null;

                if (currentClassId !== newClassId) {
                  changesDetected++;
                  console.log(`🔄 Turma alterada para ${localUser.email}: ${currentClassId} → ${newClassId}`);

                  // Atualizar utilizador
                  await User.findByIdAndUpdate(localUser._id, {
                    classId: newClassId,
                    'metadata.updatedAt': new Date()
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
                  } catch (historyError: unknown) {
                    console.error(`   ❌ Erro ao registar histórico para ${localUser.email}:`, errorMessage(historyError));
                    errors.push(`Erro no histórico de ${localUser.email}: ${errorMessage(historyError)}`);
                  }
                }
              } else {
                // Log apenas ocasional para não spam
                if (usersProcessed % 100 === 0) {
                  console.warn(`⚠️ Utilizador ${hotmartUser.email} não encontrado no sistema local`);
                }
              }

            } catch (userError: unknown) {
              const errorMsg = `Erro ao processar utilizador ${hotmartUser.email || 'desconhecido'}: ${errorMessage(userError)}`;
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

      } catch (pageError: unknown) {
        const errorMsg = `Erro ao processar página ${pagesProcessed}: ${errorMessage(pageError)}`;
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

  } catch (error: unknown) {
    console.error('❌ Erro geral ao verificar e atualizar turmas:', axiosErrorData(error) ?? errorMessage(error));
    
    res.status(500).json({ 
      message: 'Erro ao verificar e atualizar turmas.', 
      success: false,
      error: errorMessage(error),
      details: axiosErrorData(error) ?? errorStack(error)
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
      const formattedResult = result.map((classData) => ({
        className: classData.name || classData.classId,
        students: (classData.students || []).map((student: FetchedClassStudent) => ({
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

      // Estatísticas de inativação. Havia dois modelos registados com o nome
      // 'InactivationList': o de models/Class.ts apontava para a colecção
      // 'inactivation_lists', que está vazia, e era esse que estava aqui — daí
      // o "0 concluídas · 0 pendentes" no Backoffice. Quem grava é o de
      // models/InactivationList.ts, na colecção 'inactivationlists'.
      const { default: InactivationList } = await import('../models/InactivationList')
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

  deleteClass = async (input: ClassesDeleteInput, res: Response): Promise<void> => {
    try {
      const { classId } = input.params

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

  getClassDetails = async (
    req: Request<ClassIdParams>,
    res: Response,
  ): Promise<void> => {
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

  // ===== LISTAS DE INATIVAÇÃO =====

  // ✅ Criar lista de inativação por turmas + Discord + Histórico
  createInactivationList = async (req: Request, res: Response): Promise<void> => {
    try {
      // Default = OGI apenas (Hotmart + Discord). NÃO inclui 'curseduca':
      // o Clareza vem do CursEduca, é um produto à parte com o seu próprio
      // ciclo de subscrição e tem sistema de inactivação próprio. Com o
      // default anterior ('all') a inactivação de uma turma OGI cortava
      // também o Clareza — o wizard do Front não envia `platforms`, por isso
      // ninguém escolhia isso conscientemente.
      const { name, classIds, description, userId, platforms = ['hotmart', 'discord'] } = req.body

      if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'classIds (array) é obrigatório'
        })
        return
      }

      console.log(`\n🚀 Iniciando inativação de ${classIds.length} turma(s)...`)

      const results: InactivationResult[] = []
      let totalInactivated = 0
      let totalDiscordUpdates = 0

      for (const classId of classIds) {
        // 1. Buscar turma
        const classData = await Class.findOne({ classId }).lean()
        if (!classData) {
          console.warn(`⚠️ Turma ${classId} não encontrada`)
          results.push({ classId, success: false, error: 'Turma não encontrada' })
          continue
        }

        console.log(`\n📚 Processando turma: ${classData.name}`)

        // 2. Buscar alunos da turma (suportar Hotmart e CursEduca)
        let students: Array<Pick<IUser, '_id' | 'email' | 'name'>> = []

        if (classData.source === 'curseduca_sync' && classData.curseducaUuid) {
          students = await User.find({
            'curseduca.groupCurseducaUuid': classData.curseducaUuid,
            'combined.status': { $ne: 'INACTIVE' }
          }).lean()
        } else {
          students = await User.find({
            classId,
            'combined.status': { $ne: 'INACTIVE' }
          }).lean()
        }

        console.log(`   👥 Encontrados ${students.length} alunos ativos`)

        // 3. Inativar cada aluno
        for (const student of students) {
          try {
            // 3.1. Atualizar status no BD
            const updates: UpdateQuery<IUser> = {
              'combined.status': 'INACTIVE',
              'inactivation.isManuallyInactivated': true,
              'inactivation.inactivatedAt': new Date(),
              'inactivation.inactivatedBy': userId || 'Sistema',
              'inactivation.reason': description || `Inativação por turma: ${classData.name}`,
              'inactivation.platforms': platforms,
              'inactivation.classId': classId,
              'metadata.updatedAt': new Date()
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
              await UserHistory.createInactivationHistory(
                student._id,
                student.email || 'Email desconhecido',
                platforms,
                description || `Inativação por turma: ${classData.name}`,
                userId || 'Sistema'
              )
            } catch (historyError: unknown) {
              console.warn(`   ⚠️ Erro ao registrar histórico para ${student.email}:`, errorMessage(historyError))
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

          } catch (studentError: unknown) {
            console.error(`   ❌ Erro ao inativar ${student.email}:`, errorMessage(studentError))
            results.push({
              studentId: student._id,
              email: student.email,
              name: student.name,
              status: 'error',
              error: errorMessage(studentError),
              classId: classId
            })
          }
        }
      }

      // 4. Delegar remoção de Discord roles para API antiga (tem discord.js integrado)
      const oldApiUrl = process.env.OLD_API_URL || 'https://api.serriquinho.com'
      try {
        console.log(`\n🎮 Delegando remoção de Discord roles para API antiga...`)
        const discordResponse = await axios.post<DiscordInactivationResponse>(
          `${oldApiUrl}/classes/inactivationLists/create`,
          { classIds, platforms: ['discord'] },
          { timeout: 120000, headers: buildOldApiHeaders('discord-inactivation-bulk') }
        )
        totalDiscordUpdates = discordResponse.data?.list?.totalDiscordUpdates || discordResponse.data?.discordUpdates || 0
        console.log(`✅ Discord: API antiga processou - ${totalDiscordUpdates} roles removidos`)
      } catch (discordError: unknown) {
        console.warn(`⚠️ Discord: Erro ao delegar para API antiga:`, axiosErrorMessage(discordError))
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
          const existingClass = await Class.findOne({ classId: cId }).lean()
          if (!existingClass) {
            return { classId: cId, success: false, error: 'Turma não encontrada' }
          }

          const result = await classesService.addOrEditClass({
            classId: cId,
            name: existingClass.name || cId,
            description: existingClass.description || '',
            isActive: false,
            estado: 'inativo',
            source: existingClass.source || 'manual'
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
        (r) => r.status === 'fulfilled' && r.value.success
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

  // Histórico de inativações.
  //
  // Antes isto lia o UserHistory (changeType 'INACTIVATION') — um registo por
  // ALUNO, 3.385 deles — e fabricava uma pseudo-lista para cada, com o status
  // e a contagem escritos à mão:
  //     status: 'COMPLETED', studentCount: 1
  // Daí as linhas repetidas no Backoffice (os 7 alunos inactivados a 12/06
  // apareciam como 7 "listas" iguais) e o "Alunos 1" em todas elas. As listas
  // REVERSED e PENDING nunca podiam aparecer, porque o status era constante.
  //
  // Passa a ler as listas a sério, da colecção 'inactivationlists'.
  //
  // Tradução de vocabulário: o Front foi escrito contra o schema antigo de
  // models/Class.ts, que dizia 'REVERTED' e 'studentsAffected'. Quem grava é
  // models/InactivationList.ts, que diz 'REVERSED' e 'students[]'. Traduz-se
  // aqui, na fronteira, para não mexer no Front — os valores continuam a ser
  // os da BD, só com o nome que o Front sabe pintar.
  getInactivationLists = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, limit = 50, offset = 0 } = req.query

      const limitNum = Number(limit)
      const offsetNum = Number(offset)

      const { default: InactivationList } = await import('../models/InactivationList')

      // O Front filtra por 'REVERTED'; na BD isso é 'REVERSED'.
      const paraBd: Record<string, string[]> = {
        REVERTED: ['REVERSED'],
        PENDING: ['PENDING', 'EXECUTING'],
        COMPLETED: ['COMPLETED'],
        FAILED: ['FAILED', 'CANCELLED']
      }
      const query: any = {}
      if (status) {
        query.status = { $in: paraBd[String(status)] ?? [String(status)] }
      }

      const [total, docs] = await Promise.all([
        InactivationList.countDocuments(query),
        // Conta-se os alunos no servidor e deixa-se o array de fora: a listagem
        // só precisa do número, e o array leva os emails de toda a gente — não
        // há razão para os mandar para o browser.
        (InactivationList as any).aggregate([
          { $match: query },
          { $sort: { createdAt: -1 } },
          { $skip: offsetNum },
          { $limit: limitNum },
          { $addFields: { studentCount: { $size: { $ifNull: ['$students', []] } } } },
          { $project: { students: 0 } }
        ])
      ])

      // Nomes das turmas: a lista já os costuma trazer, mas quando só tem os
      // ids vamos buscá-los — numa só query para todas as listas da página.
      const idsEmFalta = [
        ...new Set(
          docs.flatMap((d: any) =>
            (d.classNames?.length ? [] : (d.classIds ?? []))
          )
        )
      ]
      const nomePorId = new Map<string, string>()
      if (idsEmFalta.length) {
        const turmas = await (Class as any)
          .find({ classId: { $in: idsEmFalta } })
          .select('classId name')
          .lean()
        for (const t of turmas as any[]) nomePorId.set(String(t.classId), t.name)
      }

      const paraFront: Record<string, string> = {
        REVERSED: 'REVERTED',
        EXECUTING: 'PENDING',
        CANCELLED: 'FAILED'
      }

      const lists = docs.map((d: any) => ({
        _id: d._id,
        name: d.name,
        classNames: d.classNames?.length
          ? d.classNames
          : (d.classIds ?? []).map((id: string) => nomePorId.get(String(id)) ?? id),
        createdAt: d.createdAt,
        status: paraFront[d.status] ?? d.status,
        // quantos alunos a lista abrange, a sério
        studentCount: d.studentCount ?? d.execution?.totalProcessed ?? 0,
        executedDate: d.execution?.completedAt ?? d.execution?.startedAt,
        revertedAt: d.reversal?.reversedAt,
        performedBy: d.execution?.executedBy,
        // Só se manda 'results' quando o bloco 'execution' existe mesmo. A
        // maioria das listas antigas não o tem, e mandar zeros faria a tabela
        // pintar "(0✓ 0✗)" numa lista de 1642 alunos — o Front esconde a
        // coluna quando o campo vem indefinido, que é o correcto aqui.
        results: d.execution
          ? {
              success: d.execution.successCount ?? 0,
              errors: d.execution.errorCount ?? 0,
              details: d.execution.errors ?? []
            }
          : undefined
      }))

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

  // Reverter uma inativação.
  //
  // Antes recebia o _id de um registo do UserHistory e reactivava UMA pessoa —
  // coerente com a tabela falsa que o getInactivationLists produzia, mas quer
  // dizer que o botão "reverter" do Backoffice nunca reverteu uma inactivação
  // inteira. Agora recebe o _id de uma lista e reverte a lista toda.
  //
  // Continua a aceitar um id do UserHistory: as linhas antigas do Backoffice
  // (e qualquer link guardado) mandavam esse id, e não vale a pena parti-las.
  //
  // Duas diferenças de comportamento, ambas deliberadas:
  //   - só reactiva quem estava 'ativo' antes da inactivação. Quem já estava
  //     inactivo fica como estava — reverter é desfazer, não é dar acesso.
  //   - os UserProduct passam a ser filtrados por plataforma. O updateMany sem
  //     filtro reactivava também o Clareza, que é um produto à parte com o seu
  //     próprio ciclo (mesma razão do default 'platforms' em createInactivationList).
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

      const PLATAFORMAS_OGI = ['hotmart', 'discord']

      // Repõe uma pessoa ao estado anterior à inactivação.
      const reactivar = async (studentId: any, email?: string) => {
        await User.findByIdAndUpdate(studentId, {
          $set: {
            'combined.status': 'ACTIVE',
            'hotmart.status': 'ACTIVE',
            'discord.isActive': true
          }
        })
        await UserProduct.updateMany(
          { userId: studentId, platform: { $in: PLATAFORMAS_OGI } },
          { $set: { status: 'ACTIVE' } }
        )
        await UserHistory.create({
          userId: studentId,
          userEmail: email,
          changeType: 'STATUS_CHANGE',
          previousValue: { status: 'INACTIVE' },
          newValue: { status: 'ACTIVE' },
          source: 'MANUAL',
          changedBy: userId || 'Sistema',
          reason: reason || 'Reversão de inativação'
        })
      }

      const { default: InactivationList } = await import('../models/InactivationList')
      const lista: any = await InactivationList.findById(id)

      if (lista) {
        if (lista.status === 'REVERSED') {
          res.status(400).json({
            success: false,
            message: 'Esta lista já tinha sido revertida'
          })
          return
        }

        const alunos = lista.students ?? []
        // quem já estava inactivo antes não é para reactivar
        const aRepor = alunos.filter((a: any) => a.previousState === 'ativo')
        let revertidos = 0
        const erros: any[] = []

        for (const aluno of aRepor) {
          try {
            await reactivar(aluno.studentId, aluno.email)
            revertidos++
          } catch (e) {
            erros.push({ studentId: aluno.studentId, error: (e as Error).message })
          }
        }

        lista.status = 'REVERSED'
        lista.reversal = {
          reversedAt: new Date(),
          reversedBy: userId || 'Sistema',
          reason: reason || 'Reversão manual pelo Backoffice'
        }
        await lista.save()

        // Nota (2026-07-11): não há chamada ao Discord aqui. O endpoint legacy
        // `${DISCORD_BOT_URL}/add-roles` nunca existiu neste repo e falhava em
        // silêncio. Os cargos são reconciliados de noite pelo DiscordRolesSync.
        res.json({
          success: true,
          message: `Lista revertida: ${revertidos} de ${alunos.length} alunos reactivados`,
          result: {
            success: true,
            listName: lista.name,
            totalNaLista: alunos.length,
            reactivados: revertidos,
            jaEstavamInactivos: alunos.length - aRepor.length,
            erros
          },
          timestamp: new Date().toISOString()
        })
        return
      }

      // Compatibilidade: id de um registo individual do UserHistory.
      const inactivation = await UserHistory.findById(id)
      if (!inactivation) {
        res.status(404).json({
          success: false,
          message: 'Lista ou registo de inativação não encontrado'
        })
        return
      }

      await reactivar(inactivation.userId, inactivation.userEmail)

      res.json({
        success: true,
        message: 'Inativação revertida com sucesso',
        result: { success: true, reactivados: 1 },
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

  // Alunos de uma lista de inativação, paginados.
  //
  // O array students[] vive dentro do documento da lista e há listas com mais
  // de 1600 entradas, por isso não vai na listagem — vem por aqui, à página.
  // As entradas guardam pouco (studentId, classId, previousState) e nem sempre
  // o email, por isso o nome e o email são buscados ao utilizador.
  getInactivationListStudents = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const { limit = 25, offset = 0, search } = req.query

      const limitNum = Math.min(Number(limit) || 25, 200)
      const offsetNum = Number(offset) || 0

      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        res.status(400).json({ success: false, message: 'ID inválido' })
        return
      }

      const { default: InactivationList } = await import('../models/InactivationList')
      const lista: any = await (InactivationList as any).findById(id).select('name status classIds').lean()
      if (!lista) {
        res.status(404).json({ success: false, message: 'Lista não encontrada' })
        return
      }

      const termo = String(search ?? '').trim()
      const filtroBusca = termo
        ? [{
            $match: {
              $or: [
                { email: { $regex: termo, $options: 'i' } },
                { nome: { $regex: termo, $options: 'i' } },
                { turma: { $regex: termo, $options: 'i' } }
              ]
            }
          }]
        : []

      const resultado = await (InactivationList as any).aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(String(id)) } },
        { $unwind: '$students' },
        {
          $lookup: {
            from: 'users',
            localField: 'students.studentId',
            foreignField: '_id',
            as: 'utilizador'
          }
        },
        {
          $lookup: {
            from: 'classes',
            localField: 'students.classId',
            foreignField: 'classId',
            as: 'turmaDoc'
          }
        },
        {
          $project: {
            _id: 0,
            studentId: '$students.studentId',
            email: { $ifNull: ['$students.email', { $first: '$utilizador.email' }] },
            nome: { $first: '$utilizador.name' },
            classId: '$students.classId',
            turma: { $ifNull: [{ $first: '$turmaDoc.name' }, '$students.classId'] },
            estadoAnterior: '$students.previousState',
            processado: { $ifNull: ['$students.processed', null] },
            erro: { $ifNull: ['$students.error', null] },
            // estado actual do aluno, para se ver se a inactivação pegou
            estadoActual: { $first: '$utilizador.combined.status' }
          }
        },
        ...filtroBusca,
        {
          $facet: {
            total: [{ $count: 'n' }],
            linhas: [
              { $sort: { nome: 1, email: 1 } },
              { $skip: offsetNum },
              { $limit: limitNum }
            ]
          }
        }
      ])

      const total = resultado?.[0]?.total?.[0]?.n ?? 0
      const students = resultado?.[0]?.linhas ?? []

      res.json({
        success: true,
        list: { _id: lista._id, name: lista.name, status: lista.status },
        students,
        pagination: { total, limit: limitNum, offset: offsetNum },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao buscar alunos da lista:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar alunos da lista',
        error: (error as Error).message
      })
    }
  }

  // Apagar uma lista do histórico.
  //
  // Apaga SÓ o registo. Não mexe em nenhum aluno: quem foi inactivado continua
  // inactivo. Se a intenção for devolver o acesso, é o reverter, não isto.
  //
  // Consequência a ter em conta: o registo é o único sítio onde ficam guardados
  // os alunos abrangidos e o estado que cada um tinha antes, portanto apagá-lo
  // torna a inactivação irreversível. Por isso devolve-se o que se apagou.
  deleteInactivationList = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params

      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        res.status(400).json({ success: false, message: 'ID inválido' })
        return
      }

      const { default: InactivationList } = await import('../models/InactivationList')
      const lista: any = await (InactivationList as any).findById(id).lean()
      if (!lista) {
        res.status(404).json({ success: false, message: 'Lista não encontrada' })
        return
      }

      const abrangidos = lista.students?.length ?? 0
      await (InactivationList as any).findByIdAndDelete(id)

      console.log(`🗑️  [InactivationList] Registo apagado: "${lista.name}" (${abrangidos} alunos abrangidos, estado ${lista.status}). Nenhum aluno foi alterado.`)

      res.json({
        success: true,
        message: 'Registo removido do histórico. Nenhum aluno foi alterado.',
        removed: {
          _id: lista._id,
          name: lista.name,
          status: lista.status,
          studentsAbrangidos: abrangidos
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ Erro ao apagar lista de inativação:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao apagar lista de inativação',
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
      if (!isActive) {
        console.log(`🔄 Desativando turma ${classId} - Inativando estudantes...`)

        // Buscar alunos que ainda não estão inativos (primeira inativação)
        const activeStudents = await User.find({
          classId,
          'combined.status': { $ne: 'INACTIVE' },
        })

        if (activeStudents.length > 0) {
          const updateResult = await User.updateMany(
            { classId, 'combined.status': { $ne: 'INACTIVE' } },
            {
              $set: buildClassUserStatusUpdate(false),
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
            className: existingClass.name || classId,
            previousClassId: classId,
            previousClassName: existingClass.name || classId,
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
          const discordResponse = await axios.post<DiscordInactivationResponse>(
            `${oldApiUrl}/classes/inactivationLists/create`,
            { classIds: [classId], platforms: ['discord'] },
            { timeout: 120000, headers: buildOldApiHeaders('discord-inactivation-single') }
          )
          discordUpdates = discordResponse.data?.list?.totalDiscordUpdates || discordResponse.data?.discordUpdates || 0
          console.log(`✅ Discord: API antiga processou - ${discordUpdates} roles removidos`)
        } catch (discordError: unknown) {
          console.warn(`⚠️ Discord: Erro ao delegar para API antiga:`, axiosErrorMessage(discordError))
        }
      }

      // Funcionalidade: Se reativando a turma, reativar estudantes
      let reactivatedStudents = 0
      if (isActive && !existingClass.isActive) {
        console.log(`🔄 Reativando turma ${classId} - Reativando estudantes...`)

        const studentsToReactivate = await User.find({
          classId,
          'combined.status': 'INACTIVE',
          'inactivation.isManuallyInactivated': true,
          'inactivation.classId': classId,
        })

        if (studentsToReactivate.length > 0) {
          const updateResult = await User.updateMany(
            {
              classId,
              'combined.status': 'INACTIVE',
              'inactivation.isManuallyInactivated': true,
              'inactivation.classId': classId,
            },
            {
              $set: {
                ...buildClassUserStatusUpdate(true),
                'inactivation.isManuallyInactivated': false,
                'inactivation.reactivatedAt': new Date(),
                'inactivation.reactivatedBy': userId || 'system',
                'inactivation.reactivationReason': 'manual',
              },
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
            className: existingClass.name || classId,
            previousClassId: classId,
            previousClassName: existingClass.name || classId,
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
        source: existingClass.source || 'manual'
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

    syncComplete = async (req: Request, res: Response): Promise<void> => {
    let syncRecord: ISyncHistory | null = null;
    
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
      const localUserMap = new Map<string, (typeof localUsers)[number]>();
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
          const response: AxiosResponse<HotmartUsersResponse> = await axios.get<HotmartUsersResponse>(
            url + (nextPageToken ? `&page_token=${encodeURIComponent(nextPageToken)}` : ''),
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          const items = response.data.items || [];
          const page_info: HotmartPageInfo = response.data.page_info || {};
          
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
              const userUpdates: UpdateQuery<IUser> = {};

              // ✅ CORRIGIDO: Acessar classId corretamente (está em combined ou pode estar em nível raiz)
              const currentClassId = localUser.combined?.classId || localUser.classId || null;

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
                } catch (historyError: unknown) {
                  errors.push(`Erro ao criar histórico para ${hotmartUser.email}: ${errorMessage(historyError)}`);
                  console.error(`❌ [${syncRecord._id}] Erro no histórico:`, errorMessage(historyError));
                }
              }

              // ✅ CORRIGIDO: Acessar campos de Hotmart corretamente
              const currentHotmartId = localUser.hotmart?.hotmartUserId;
              const currentStatus = localUser.combined?.status || localUser.hotmart?.status;

              if (currentHotmartId !== hotmartUser.user_id) {
                userUpdates['hotmart.hotmartUserId'] = hotmartUser.user_id;
                userNeedsUpdate = true;
              }

              if (currentStatus !== (hotmartUser.status || 'INACTIVE')) {
                userUpdates['combined.status'] = hotmartUser.status || 'INACTIVE';
                userNeedsUpdate = true;
              }

              // Data de compra
              const currentPurchaseDate = localUser.hotmart?.purchaseDate;
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
                } catch (updateError: unknown) {
                  const errorMsg = `Erro ao atualizar utilizador ${hotmartUser.email}: ${errorMessage(updateError)}`;
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
          
        } catch (pageError: unknown) {
          const errorMsg = `Erro na página ${pagesProcessed}: ${errorMessage(pageError)}`;
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
            const classUpdates: UpdateQuery<IClass> = {
              lastSyncAt: new Date(),
              source: 'hotmart_sync'
            };

            let needsUpdate = false;

            // Atualizar contagem de estudantes
            if (existingClass.studentCount !== studentCount) {
              classUpdates.studentCount = studentCount;
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

        } catch (classError: unknown) {
          const errorMsg = `Erro ao processar turma ${classId}: ${errorMessage(classError)}`;
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

    } catch (error: unknown) {
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
          errorDetails: [errorMessage(error)]
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erro na sincronização completa',
        error: errorMessage(error)
      });
    }
  }
}

export const classesController = new ClassesController()
