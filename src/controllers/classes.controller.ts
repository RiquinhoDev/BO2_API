// src/controllers/classes.controller.ts - CORRIGIDO para evitar erros TypeScript
import { Request, Response } from 'express'
import type { UpdateQuery } from 'mongoose'
import SyncHistory from '../models/SyncHistory'

import axios, { type AxiosResponse } from 'axios'
import { Class, type IClass } from '../models/Class'
import StudentClassHistory from '../models/StudentClassHistory'
import { User } from '../models'
import type { IUser } from '../models/user'
import type { ISyncHistory } from '../models/SyncHistory'

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

function axiosErrorData(error: unknown): unknown {
  return axios.isAxiosError(error) ? error.response?.data : undefined
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
