// src/controllers/hotmart.controller.ts - VERSÃO COMPLETAMENTE CORRIGIDA
import { Request, Response } from 'express'
import axios, { AxiosResponse } from 'axios'
import User from '../../models/user'
import SyncHistory from '../../models/SyncHistory'
import { Class } from '../../models/Class'
import user from '../../models/user'
import { UserHistory, ensureUserHistoryModel } from '../../models/UserHistory'
import { engagementPreCalc } from '../../services/engagementPreCalculation'
import { calculateCombinedEngagement } from '../../utils/engagementCalculator'

// Interface para lições da Hotmart (baseada na documentação real)
interface HotmartLesson {
  page_id: string
  page_name: string
  module_name: string
  is_module_extra: boolean
  is_completed: boolean
  completed_date?: number
}

interface ProcessingResult {
  totalProcessed: number;
  totalWithProgress: number;
  totalWithClasses: number;
  totalInserted: number;
  totalUpdated: number;
  totalErrors: number;
  errors: string[];
  uniqueClassIds: Set<string>;
}
interface ProgressData {
  completedPercentage: number;
  total: number;
  completed: number;
  lessons: {
    pageId: string;
    pageName: string;
    moduleName: string;
    isModuleExtra: boolean;
    isCompleted: boolean;
    completedDate?: Date;
  }[];
  lastUpdated: Date;
}
// Interface para progresso interno (calculado a partir das lições)
interface LessonProgress {
  pageId: string
  pageName: string
  moduleName: string
  isModuleExtra: boolean
  isCompleted: boolean
  completedDate?: Date
}

// Remover interface UserProgress - não existe endpoint /progress
// A API só tem /lessons que retorna { lessons: HotmartLesson[] }

// Interface para a resposta da API da Hotmart
interface HotmartApiResponse {
  items: any[]
  page_info?: {
    next_page_token?: string
  }
}

// Interface para resposta do token
interface TokenResponse {
  access_token: string
  expires_in?: number
}
interface ValidationResult {
  isValid: boolean;
  error?: string;
  data?: {
    cleanEmail: string;
    cleanName: string;
    hotmartId: string;
  };
}

interface BatchResult {
  inserted: number;
  updated: number;
  errors: string[];
}

interface ClassResult {
  newClassesCreated: number;
  errors: string[];
}
// ✅ FUNÇÃO CORRIGIDA PARA OBTER TOKEN HOTMART
async function getHotmartAccessToken(): Promise<string> {
  try {
    const clientId = process.env.HOTMART_CLIENT_ID;
    const clientSecret = process.env.HOTMART_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET são obrigatórios');
    }

    // ✅ MÉTODO CORRETO: Basic Auth
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    console.log(`🔐 Gerando token com Basic Auth para client_id: ${clientId.substring(0, 10)}...`);

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
      throw new Error('Access token não encontrado na resposta');
    }

    console.log(`✅ Token obtido com sucesso - Expira em: ${response.data.expires_in} segundos`);
    return response.data.access_token;

  } catch (error: any) {
    console.error('❌ Erro detalhado ao obter token Hotmart:');
    console.error('📊 Status:', error.response?.status);
    console.error('📄 Resposta:', error.response?.data);
    console.error('🔗 URL:', error.config?.url);
    throw new Error(`Falha ao obter token de acesso da Hotmart: ${error.response?.data?.error_description || error.message}`);
  }
}

// Função para buscar lições de um utilizador (único endpoint que existe)
const fetchUserLessons = async (userId: string, accessToken: string): Promise<HotmartLesson[]> => {
  try {
    const subdomain = process.env.subdomain || 'ograndeinvestimento-bomrmk';
    console.log(`🔍 Buscando lições do utilizador ${userId}`)
    
    const response = await axios.get(
      `https://developers.hotmart.com/club/api/v1/users/${userId}/lessons?subdomain=${subdomain}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )
    
    console.log(`📚 Resposta da API:`, {
      hasLessons: 'lessons' in response.data,
      lessonsCount: response.data.lessons?.length || 0
    })
    
    return response.data.lessons || []
  } catch (error: any) {
    console.error(`❌ Erro ao buscar lições do utilizador ${userId}:`, error.response?.data || error.message)
    return []
  }
}

// Função para calcular progresso baseado nas lições
const calculateProgress = (lessons: HotmartLesson[]) => {
  if (lessons.length === 0) {
    return {
      completedPercentage: 0,
      total: 0,
      completed: 0,
      lessons: []
    }
  }

  const completed = lessons.filter(lesson => lesson.is_completed).length
  const total = lessons.length
  const completedPercentage = Math.round((completed / total) * 100)

  return {
    completedPercentage,
    total,
    completed,
    lessons: lessons.map(lesson => ({
      pageId: lesson.page_id,
      pageName: lesson.page_name,
      moduleName: lesson.module_name,
      isModuleExtra: lesson.is_module_extra,
      isCompleted: lesson.is_completed,
      completedDate: lesson.completed_date ? new Date(lesson.completed_date) : undefined
    }))
  }
}
function convertUnixTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;
  
  // Verificar se já é uma string de data ISO inválida (como +055089-01-28T01:30:00.000Z)
  if (typeof timestamp === 'string' && timestamp.includes('T') && timestamp.includes('Z')) {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      if (year < 2000 || year > 2030) {
        console.warn(`Data ISO inválida detectada: ${timestamp} (ano: ${year}). Retornando null.`);
        return null;
      }
      return date;
    }
    return null;
  }
  
  // Se é string numérica, converter para número
  const numTimestamp = typeof timestamp === 'string' 
    ? parseInt(timestamp, 10) 
    : timestamp;
    
  if (isNaN(numTimestamp) || numTimestamp <= 0) return null;
  
  // Verificar se é timestamp em segundos ou milissegundos
  // Timestamps antes de 2001 provavelmente estão em segundos
  const timestampMs = numTimestamp < 1e12 
    ? numTimestamp * 1000  // Segundos -> Milissegundos
    : numTimestamp;        // Já em milissegundos
    
  const date = new Date(timestampMs);
  
  // Validar se a data é razoável (entre 2000 e 2030)
  const year = date.getFullYear();
  if (year < 2000 || year > 2030) {
    console.warn(`Data suspeita detectada: ${date.toISOString()} (timestamp: ${timestamp}). Retornando null para evitar dados inválidos.`);
    return null;
  }
  
  return date;
}
// ✅ FUNÇÃO PRINCIPAL PARA SINCRONIZAÇÃO COMPLETA - CORRIGIDA
export const syncHotmartUsers = async (req: Request, res: Response): Promise<void> => {
  let syncRecord: any = null

  try {
    // Criar registo de sincronização
    syncRecord = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: new Date(),
      metadata: {
        includeProgress: true,
        includeLessons: true,
        includeEngagement: true,
        syncType: 'complete_with_progress_classes_engagement'
      }
    })

    console.log(`🚀 [${syncRecord._id}] Iniciando sincronização Hotmart com pré-cálculo de engagement...`)

    // ✅ 1. Obter token de acesso
    const accessToken = await getHotmartAccessToken()

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      'metadata.currentStep': 'Token de acesso obtido',
      'metadata.progress': 10
    })

    console.log(`✅ [${syncRecord._id}] Token de acesso obtido`)

    // ✅ 2. Buscar utilizadores da Hotmart
    let allUsers: any[] = []
    let nextPageToken: string | null = null
    let pageCount = 0
    const batchSize = 50

    do {
      pageCount++
      
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': `Buscando utilizadores - Página ${pageCount}`,
        'metadata.progress': 10 + (pageCount * 2)
      })

      const subdomain = process.env.subdomain || 'ograndeinvestimento-bomrmk'
      let requestUrl = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`
      if (nextPageToken) {
        requestUrl += `&page_token=${encodeURIComponent(nextPageToken)}`
      }

      console.log(`🔗 [${syncRecord._id}] Requisição: ${requestUrl}`)
      
      const response = await axios.get(requestUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      // ✅ Verificar estrutura real da resposta
      console.log(`📋 [${syncRecord._id}] Estrutura da resposta:`, Object.keys(response.data))
      
      const users = response.data.users || response.data.items || response.data.data || []
      const pageInfo = response.data.page_info || response.data.pageInfo || response.data.pagination || {}
      
      if (!Array.isArray(users)) {
        throw new Error(`Resposta inválida da API: esperado array, recebido ${typeof users}`)
      }

      allUsers = allUsers.concat(users)
      nextPageToken = pageInfo.next_page_token || pageInfo.nextPageToken || null

      console.log(`📄 [${syncRecord._id}] Página ${pageCount}: ${users.length} utilizadores`)

      await new Promise(resolve => setTimeout(resolve, 200))

    } while (nextPageToken)

    console.log(`📊 [${syncRecord._id}] Total encontrados: ${allUsers.length}`)

    if (allUsers.length === 0) {
      throw new Error('Nenhum utilizador encontrado na API da Hotmart')
    }

    // ✅ 3. Processar utilizadores com pré-cálculo de engagement
    let totalProcessed = 0
    let totalWithProgress = 0
    let totalWithClasses = 0
    let totalWithEngagement = 0
    let totalInserted = 0
    let totalUpdated = 0
    let totalErrors = 0
    let errors: string[] = []

    const uniqueClassIds = new Set<string>()

    for (let i = 0; i < allUsers.length; i += batchSize) {
      const batch = allUsers.slice(i, i + batchSize)
      const bulkOperations: any[] = []

      const progressPercentage = 50 + ((i / allUsers.length) * 45)
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': `Processando utilizadores ${i + 1}-${Math.min(i + batchSize, allUsers.length)}`,
        'metadata.progress': progressPercentage,
        'metadata.processed': totalProcessed,
        'metadata.withProgress': totalWithProgress,
        'metadata.withClasses': totalWithClasses,
        'metadata.withEngagement': totalWithEngagement
      })

      for (const user of batch) {
        try {
          // ✅ VALIDAÇÃO OBRIGATÓRIA
          if (!user.email || !user.email.trim()) {
            console.warn(`❌ [${syncRecord._id}] Utilizador sem email válido:`, user)
            totalErrors++
            errors.push(`Utilizador sem email válido: ${JSON.stringify(user)}`)
            continue
          }

          if (!user.name || !user.name.trim()) {
            console.warn(`❌ [${syncRecord._id}] Utilizador sem nome válido: ${user.email}`)
            totalErrors++
            errors.push(`Utilizador sem nome válido: ${user.email}`)
            continue
          }

          const hotmartId = user.id || user.user_id || user.uid || user.code
          if (!hotmartId) {
            console.warn(`❌ [${syncRecord._id}] Utilizador sem ID Hotmart: ${user.email}`)
            totalErrors++
            errors.push(`Utilizador sem ID Hotmart: ${user.email}`)
            continue
          }

          // ✅ NOVA VERIFICAÇÃO: Verificar se utilizador já existe
          const existingUser = await User.findOne({
            email: user.email.toLowerCase().trim()
          })
          
          console.log(`🔍 [${syncRecord._id}] Verificando utilizador: ${user.email}`)
          console.log(`   • Utilizador existente: ${!!existingUser}`)
          if (existingUser) {
            console.log(`   • Tem CursEduca: ${!!existingUser.curseducaUserId}`)
            console.log(`   • Tem Hotmart: ${!!existingUser.hotmartUserId}`)
          }

          // Processar class_id se existir
          const userClassId = user.class_id || null
          if (userClassId) {
            uniqueClassIds.add(userClassId)
            totalWithClasses++
            console.log(`🎓 [${syncRecord._id}] Turma encontrada: ${user.email} → ${userClassId}`)
          }

          // ✅ Buscar progresso (lições)
          let progressData: {
            completedPercentage: number;
            total: number;
            completed: number;
            lessons: {
              pageId: string;
              pageName: string;
              moduleName: string;
              isModuleExtra: boolean;
              isCompleted: boolean;
              completedDate?: Date;
            }[];
            lastUpdated: Date;
          } = {
            completedPercentage: 0,
            total: 0,
            completed: 0,
            lessons: [],
            lastUpdated: new Date()
          }

          try {
            const userLessons = await fetchUserLessons(hotmartId, accessToken)
            if (userLessons.length > 0) {
              const calculatedProgress = calculateProgress(userLessons)
              progressData = {
                completedPercentage: calculatedProgress.completedPercentage,
                total: calculatedProgress.total,
                completed: calculatedProgress.completed,
                lessons: calculatedProgress.lessons,
                lastUpdated: new Date()
              }
              totalWithProgress++
              console.log(`📈 [${syncRecord._id}] Progresso: ${user.email} → ${progressData.completed}/${progressData.total}`)
            }
          } catch (progressError) {
            console.warn(`⚠️ [${syncRecord._id}] Erro ao buscar progresso de ${user.email}:`, progressError)
          }

          // ✅ NORMALIZAR EMAIL
          const normalizedEmail = user.email.trim().toLowerCase()
          
          // ✅ OPERAÇÃO UPSERT COM SEGREGAÇÃO POR PLATAFORMA
          bulkOperations.push({
            updateOne: {
              filter: { email: normalizedEmail },
              update: {
                $set: {
                  // Campos comuns
                  email: normalizedEmail,
                  name: user.name.trim(),
                  
                  // ✅ APENAS CAMPOS HOTMART (não toca em curseduca.* nem discord.*)
                  'hotmart.hotmartUserId': hotmartId,
                  'hotmart.purchaseDate': convertUnixTimestamp(user.purchase_date),
                  'hotmart.signupDate': convertUnixTimestamp(user.signup_date) || new Date(),
                  'hotmart.plusAccess': user.plus_access || 'WITHOUT_PLUS_ACCESS',
                  'hotmart.firstAccessDate': convertUnixTimestamp(user.first_access_date),
                  
                  // 🆕 TURMAS DA HOTMART
                  'hotmart.enrolledClasses': userClassId ? [{
                    classId: userClassId,
                    className: `Turma ${userClassId}`,
                    source: 'hotmart',
                    isActive: true,
                    enrolledAt: convertUnixTimestamp(user.purchase_date) || new Date()
                  }] : [],
                  
                  // Progresso Hotmart
                  'hotmart.progress': {
                    totalTimeMinutes: 0,
                    completedLessons: progressData.completed,
                    lessonsData: progressData.lessons.map(l => ({
                      lessonId: l.pageId,
                      title: l.pageName,
                      completed: l.isCompleted,
                      completedAt: l.completedDate,
                      timeSpent: 0
                    })),
                    lastAccessDate: convertUnixTimestamp(user.last_access_date)
                  },
                  
                  // Engagement Hotmart
                  'hotmart.engagement': {
                    accessCount: Number(user.access_count) || 0,
                    engagementLevel: user.engagement || 'NONE',  // ✅ Da API Hotmart
                    engagementScore: 0,  // Será calculado no pós-processamento
                    calculatedAt: new Date()
                  },
                  
                  // Metadados Hotmart
                  'hotmart.lastSyncAt': new Date(),
                  'hotmart.syncVersion': '2.0',
                  
                  // Metadados gerais
                  'metadata.updatedAt': new Date(),
                  'metadata.sources.hotmart.lastSync': new Date(),
                  'metadata.sources.hotmart.version': '2.0'
                  
                  // ⚠️ NÃO ATUALIZA:
                  // - curseduca.* (preservado)
                  // - discord.* (preservado)
                  // - combined.* (calculado automaticamente pelo middleware)
                }
              },
              upsert: true
            }
          })

          totalProcessed++

        } catch (userError: any) {
          totalErrors++
          const errorMsg = `Erro ao processar ${user.email || 'email_desconhecido'}: ${userError.message}`
          errors.push(errorMsg)
          console.error(`❌ [${syncRecord._id}] ${errorMsg}`)
        }

        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // ✅ EXECUTAR OPERAÇÕES EM LOTE
      try {
        if (bulkOperations.length > 0) {
          console.log(`💾 [${syncRecord._id}] === INÍCIO DA GRAVAÇÃO NA BD ===`)
          console.log(`📊 [${syncRecord._id}] Operações preparadas: ${bulkOperations.length}`)
          
          // ✅ DETECTAR MUDANÇAS PARA HISTÓRICO
          const UserHistoryModel = ensureUserHistoryModel()
          
          // Buscar usuários existentes para comparar mudanças
          const emails = bulkOperations.map(op => 
            op.updateOne?.filter?.email
          ).filter(Boolean)
          
          const existingUsers = await User.find({ 
            email: { $in: emails } 
          }).select('email classId className').lean()
          
          const existingUsersMap = new Map(
            existingUsers.map(user => [user.email, user])
          )
          
          // Preparar histórico de mudanças
          const historyOperations: any[] = []
          
          for (const operation of bulkOperations) {
            const email = operation.updateOne?.filter?.email
            const newData = operation.updateOne?.update?.[0]?.$set
            
            if (email && newData) {
              const existingUser = existingUsersMap.get(email)
              
              if (existingUser) {
                // Verificar mudança de turma
                if (existingUser.classId !== newData.classId) {
                  historyOperations.push({
                    insertOne: {
                      document: {
                        userId: existingUser._id,
                        userEmail: email,
                        changeType: 'CLASS_CHANGE',
                        previousValue: {
                          classId: existingUser.classId,
                          className: existingUser.className
                        },
                        newValue: {
                          classId: newData.classId,
                          className: newData.className
                        },
                        changeDate: new Date(),
                        source: 'HOTMART_SYNC',
                        syncId: syncRecord._id,
                        reason: 'Mudança de turma detectada na sincronização da Hotmart'
                      }
                    }
                  })
                  console.log(`📝 [${syncRecord._id}] Mudança de turma: ${email} -> ${existingUser.classId} para ${newData.classId}`)
                }
              }
            }
          }
          
          // Executar operações de histórico se houver mudanças
          if (historyOperations.length > 0) {
            try {
              await UserHistoryModel.bulkWrite(historyOperations, { ordered: false })
              console.log(`📚 [${syncRecord._id}] ${historyOperations.length} registros de histórico criados`)
            } catch (historyError) {
              console.error(`❌ [${syncRecord._id}] Erro ao criar histórico:`, historyError)
            }
          }

          // Executar bulkWrite
          console.log(`⏳ [${syncRecord._id}] Executando User.bulkWrite()...`)
          const startTime = Date.now()
          
          const result = await User.bulkWrite(bulkOperations, {
            ordered: false
          })
          
          const executionTime = Date.now() - startTime
          console.log(`⚡ [${syncRecord._id}] BulkWrite executado em ${executionTime}ms`)
          
          // Log detalhado dos resultados
          console.log(`📋 [${syncRecord._id}] Resultado do bulkWrite:`)
          console.log(`   • Novos utilizadores: ${result.upsertedCount}`)
          console.log(`   • Utilizadores atualizados: ${result.modifiedCount}`)
          
          totalInserted += result.upsertedCount || 0
          totalUpdated += result.modifiedCount || 0
          
          // ✅ PRÉ-CALCULAR ENGAGEMENT para utilizadores processados neste lote
          console.log(`⚡ [${syncRecord._id}] === PRÉ-CALCULANDO ENGAGEMENT ===`)
          
          const batchEmails = bulkOperations.map(op => op.updateOne.filter.email)
          console.log(`🔍 [${syncRecord._id}] Emails do lote: ${batchEmails.length}`)

          let successfulEngagement = 0
          const engagementErrors: string[] = []

          try {
            const batchUsers = await User.find(
              { email: { $in: batchEmails } },
              { 
                _id: 1, 
                email: 1, 
                'hotmart.engagement': 1,  // ✅ Novo caminho segregado
                'hotmart.progress': 1      // ✅ Novo caminho segregado
              }
            ).lean() as any[]

            console.log(`🔍 [${syncRecord._id}] Encontrados ${batchUsers.length} utilizadores para engagement`)

            // Processar cada utilizador
            for (const user of batchUsers) {
              try {
                if (!user || !user._id || !user.email) {
                  console.warn(`⚠️ [${syncRecord._id}] Utilizador inválido:`, user)
                  continue
                }

                // ✅ Buscar dados segregados
                const hotmartEngagement = user.hotmart?.engagement?.engagementLevel || 'NONE'
                const hotmartAccessCount = user.hotmart?.engagement?.accessCount || 0
                const hotmartProgress = user.hotmart?.progress || { completedPercentage: 0 }

                // Calcular score baseado no progresso e acessos
                const engagementResult = calculateCombinedEngagement({
                  engagement: hotmartEngagement,
                  accessCount: hotmartAccessCount,
                  progress: hotmartProgress
                })

                // ✅ Gravar no caminho segregado
                await User.findByIdAndUpdate(user._id, {
                  'hotmart.engagement.engagementScore': engagementResult.score,
                  'hotmart.engagement.engagementLevel': engagementResult.level,
                  'hotmart.engagement.calculatedAt': new Date()
                })

                console.log(`✅ [${syncRecord._id}] Engagement: ${user.email} = ${engagementResult.score}/100 (${engagementResult.level})`)
                successfulEngagement++

              } catch (engagementError: any) {
                const errorMsg = `Erro engagement ${user.email || 'unknown'}: ${engagementError.message}`
                console.error(`❌ [${syncRecord._id}] ${errorMsg}`)
                engagementErrors.push(errorMsg)
              }

              await new Promise(resolve => setTimeout(resolve, 10))
            }

          } catch (batchEngagementError: any) {
            console.error(`💥 [${syncRecord._id}] Erro geral no engagement:`, batchEngagementError.message)
            engagementErrors.push(`Erro geral: ${batchEngagementError.message}`)
          }

          totalWithEngagement += successfulEngagement
          console.log(`✅ [${syncRecord._id}] Engagement calculado para ${successfulEngagement}/${batchEmails.length} utilizadores`)

          if (engagementErrors.length > 0) {
            console.error(`❌ [${syncRecord._id}] ${engagementErrors.length} erros de engagement`)
            errors.push(...engagementErrors.slice(0, 5))
          }
          
        } else {
          console.error(`❌ [${syncRecord._id}] PROBLEMA: Nenhuma operação para executar!`)
        }
        
      } catch (batchError: any) {
        totalErrors++
        const errorMsg = `Erro no lote ${i}-${i + batchSize}: ${batchError.message}`
        console.error(`💥 [${syncRecord._id}] ERRO CRÍTICO NO BULKWRITE:`, batchError.message)
        errors.push(errorMsg)
      }

      console.log(`📊 [${syncRecord._id}] === STATUS ATUAL ===`)
      console.log(`📊 [${syncRecord._id}] Total processados: ${totalProcessed}`)
      console.log(`📊 [${syncRecord._id}] Total inseridos: ${totalInserted}`)
      console.log(`📊 [${syncRecord._id}] Total atualizados: ${totalUpdated}`)
      console.log(`📊 [${syncRecord._id}] Total com engagement: ${totalWithEngagement}`)
      console.log(`📊 [${syncRecord._id}] Total erros: ${totalErrors}`)

      // Pausa entre lotes
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // ✅ 4. Criar turmas se necessário
    console.log(`🎓 [${syncRecord._id}] Processando ${uniqueClassIds.size} turmas únicas...`)
    
    let newClassesCreated = 0
    for (const classId of uniqueClassIds) {
      try {
        const existingClass = await Class.findOne({ classId })
        
        if (!existingClass) {
          await Class.create({
            classId,
            name: `Turma ${classId}`,
            description: `Turma sincronizada da Hotmart em ${new Date().toLocaleDateString('pt-PT')}`,
            source: 'hotmart_sync',
            isActive: true,
            studentCount: 0,
            lastSyncAt: new Date()
          })
          
          newClassesCreated++
          console.log(`🆕 [${syncRecord._id}] Nova turma criada: ${classId}`)
        }
      } catch (classError: any) {
        console.error(`❌ [${syncRecord._id}] Erro ao criar turma ${classId}:`, classError.message)
        errors.push(`Erro ao criar turma ${classId}: ${classError.message}`)
      }
    }

    // ✅ 5. Verificação final na BD
    try {
      const hotmartUsersInDb = await User.countDocuments({ source: 'HOTMART' })
      const recentlyUpdated = await User.countDocuments({ 
        source: 'HOTMART',
        lastEditedAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
      })
      const withEngagementCalculated = await User.countDocuments({
        source: 'HOTMART',
        engagementCalculatedAt: { $ne: null }
      })
      
      console.log(`🔍 [${syncRecord._id}] === VERIFICAÇÃO FINAL NA BD ===`)
      console.log(`   • Total utilizadores Hotmart na BD: ${hotmartUsersInDb}`)
      console.log(`   • Atualizados nos últimos 5 min: ${recentlyUpdated}`)
      console.log(`   • Com engagement calculado: ${withEngagementCalculated}`)
      
    } catch (verificationError) {
      console.error(`❌ [${syncRecord._id}] Erro na verificação final:`, verificationError)
    }

    // ✅ 6. Finalizar com estatísticas detalhadas
    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: "completed",
      completedAt: new Date(),
      'metadata.currentStep': 'Sincronização concluída com engagement',
      'metadata.progress': 100,
      stats: {
        total: totalProcessed,
        added: totalInserted,
        updated: totalUpdated,
        withProgress: totalWithProgress,
        withClasses: totalWithClasses,
        withEngagement: totalWithEngagement,
        newClassesCreated,
        uniqueClasses: uniqueClassIds.size,
        conflicts: 0,
        errors: totalErrors
      },
      errorDetails: errors.length > 0 ? errors.slice(0, 50) : undefined
    })

    console.log(`✅ [${syncRecord._id}] SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO!`)
    console.log(`📊 ESTATÍSTICAS FINAIS:`)
    console.log(`   • Total processados: ${totalProcessed}`)
    console.log(`   • Novos utilizadores: ${totalInserted}`)
    console.log(`   • Utilizadores atualizados: ${totalUpdated}`)
    console.log(`   • Com progresso: ${totalWithProgress}`)
    console.log(`   • Com engagement calculado: ${totalWithEngagement}`)
    console.log(`   • Com turmas: ${totalWithClasses}`)
    console.log(`   • Turmas únicas: ${uniqueClassIds.size}`)
    console.log(`   • Novas turmas criadas: ${newClassesCreated}`)
    console.log(`   • Erros: ${totalErrors}`)

    res.status(200).json({
      message: 'Sincronização Hotmart concluída com pré-cálculo de engagement!',
      stats: {
        total: totalProcessed,
        added: totalInserted,
        updated: totalUpdated,
        withProgress: totalWithProgress,
        withEngagement: totalWithEngagement,
        withClasses: totalWithClasses,
        newClassesCreated,
        uniqueClasses: uniqueClassIds.size,
        classIds: Array.from(uniqueClassIds),
        errors: totalErrors
      }
    })

  } catch (error: any) {
    console.error(`💥 [${syncRecord?._id}] ERRO CRÍTICO NA SINCRONIZAÇÃO:`, error)

    if (syncRecord) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: "failed",
        completedAt: new Date(),
        'metadata.currentStep': 'Erro na sincronização',
        errorDetails: [error.message]
      })
    }

    res.status(500).json({
      message: 'Erro crítico na sincronização com Hotmart',
      error: error.message,
      details: error.stack
    })
  }
}


// ✅ FUNÇÃO CORRIGIDA: Sincronizar apenas o progresso
export const syncProgressOnly = async (req: Request, res: Response): Promise<void> => {
  let syncRecord: any = null

  try {
    syncRecord = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: new Date(),
      metadata: {
        includeProgress: true,
        includeLessons: true,
        syncType: 'progress_only'
      }
    })

    console.log(`🚀 [${syncRecord._id}] Iniciando sincronização apenas de progresso...`)

    // ✅ Obter token de acesso usando método corrigido
    const accessToken = await getHotmartAccessToken()
    console.log(`✅ [${syncRecord._id}] Token de acesso obtido`)

    // Buscar utilizadores existentes com hotmartUserId
    const existingUsers = await User.find({
      hotmartUserId: { $exists: true, $ne: null, $ne: "" }
    }).select('_id email hotmartUserId name')

    console.log(`📊 [${syncRecord._id}] Encontrados ${existingUsers.length} utilizadores com Hotmart ID para atualização`)

    if (existingUsers.length === 0) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: "completed",
        completedAt: new Date(),
        'metadata.currentStep': 'Nenhum utilizador com Hotmart ID encontrado',
        'metadata.progress': 100,
        stats: {
          total: 0,
          withProgress: 0,
          errors: 0
        }
      })

      res.status(200).json({
        message: 'Nenhum utilizador com Hotmart ID encontrado para sincronização de progresso',
        stats: {
          total: 0,
          withProgress: 0,
          errors: 0
        }
      })
      return
    }

    let totalProcessed = 0
    let totalWithProgress = 0
    let totalErrors = 0
    let errors: string[] = []

    for (const user of existingUsers) {
      try {
        // Atualizar progresso na UI
        const progressPercentage = (totalProcessed / existingUsers.length) * 100
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          'metadata.currentStep': `Atualizando progresso: ${user.email}`,
          'metadata.progress': progressPercentage,
          'metadata.processed': totalProcessed,
          'metadata.withProgress': totalWithProgress
        })

        // ✅ Buscar lições do utilizador
        const userLessons = await fetchUserLessons(user.hotmartUserId!, accessToken)
        
        if (userLessons.length > 0) {
          totalWithProgress++
          
          // ✅ Calcular progresso baseado nas lições
          const progressData = calculateProgress(userLessons)

          // Atualizar na base de dados
        await User.findByIdAndUpdate(user._id, {
          'platformProgress.hotmart.completedPercentage': progressData.completedPercentage,
          'platformProgress.hotmart.total': progressData.total,
          'platformProgress.hotmart.completed': progressData.completed,
          'platformProgress.hotmart.lessons': progressData.lessons,
          'platformProgress.hotmart.lastUpdated': new Date(),
          'platformMetrics.hotmart.lastAccessDate': new Date()
        })

          console.log(`✅ [${syncRecord._id}] Progresso atualizado para ${user.email}: ${progressData.completed}/${progressData.total} (${progressData.completedPercentage}%)`)
        } else {
          console.log(`⚠️ [${syncRecord._id}] Sem lições encontradas para ${user.email} (ID: ${user.hotmartUserId})`)
        }

        totalProcessed++

      } catch (userError: any) {
        totalErrors++
        const errorMsg = `Erro ao atualizar progresso de ${user.email}: ${userError.message}`
        errors.push(errorMsg)
        console.error(`❌ [${syncRecord._id}] ${errorMsg}`)
      }

      // Pequena pausa entre requests para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 150))
    }

    // Finalizar com sucesso
    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: "completed",
      completedAt: new Date(),
      'metadata.progress': 100,
      'metadata.currentStep': 'Sincronização de progresso concluída',
      stats: {
        total: totalProcessed,
        withProgress: totalWithProgress,
        errors: totalErrors
      },
      errorDetails: errors.length > 0 ? errors : undefined
    })

    console.log(`✅ [${syncRecord._id}] Sincronização de progresso concluída!`)
    console.log(`📊 Total processados: ${totalProcessed} | Com progresso: ${totalWithProgress} | Erros: ${totalErrors}`)

    res.status(200).json({
      message: 'Sincronização de progresso concluída!',
      stats: {
        total: totalProcessed,
        withProgress: totalWithProgress,
        errors: totalErrors
      }
    })

  } catch (error: any) {
    console.error(`💥 [${syncRecord?._id}] Erro na sincronização de progresso:`, error)

    if (syncRecord) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: "failed",
        completedAt: new Date(),
        'metadata.currentStep': 'Erro na sincronização',
        errorDetails: [error.message]
      })
    }

    res.status(500).json({
      message: 'Erro na sincronização de progresso',
      error: error.message
    })
  }
}

// ✅ Função simples para buscar utilizador da Hotmart (compatibilidade)
export const findHotmartUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.query

    if (!email) {
      res.status(400).json({ message: 'Email é obrigatório' })
      return
    }

    // Buscar utilizador na base de dados local
    const foundUser = await User.findOne({ email: email as string })

    if (!foundUser) {
      res.status(404).json({ message: 'Utilizador não encontrado' })
      return
    }

    res.status(200).json({
      message: 'Utilizador encontrado',
      user: {
        id: foundUser._id,
        email: foundUser.email,
        name: foundUser.name,
        hotmartUserId: foundUser.hotmartUserId,
        status: foundUser.status,
        progress: foundUser.progress
      }
    })

  } catch (error: any) {
    console.error('Erro ao buscar utilizador:', error)
    res.status(500).json({
      message: 'Erro ao buscar utilizador',
      error: error.message
    })
  }
}
// ✅ FUNÇÃO DE TESTE DA BD (adicionar às rotas)
export const testDatabaseConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🧪 Testando conexão com a base de dados...')
    
    // ✅ MÉTODO MAIS SEGURO sem usar admin().ping()
    const userCount = await User.countDocuments()
    console.log('✅ Contagem de utilizadores:', userCount)
    
    // Teste de criação
    const testUser = await User.create({
      email: 'test-connection@example.com',
      name: 'Test Connection User',
      source: 'TEST'
    })
    console.log('✅ Utilizador teste criado:', testUser._id)
    
    // Teste de atualização
    const updatedUser = await User.findByIdAndUpdate(
      testUser._id,
      { name: 'Test Updated' },
      { new: true }
    )
    console.log('✅ Utilizador teste atualizado:', updatedUser?.name)
    
    // Teste de eliminação
    await User.findByIdAndDelete(testUser._id)
    console.log('✅ Utilizador teste eliminado')
    
    res.json({
      success: true,
      message: 'Todos os testes da BD passaram com sucesso',
      userCount,
      testPassed: true,
      connectionStatus: 'OK'
    })
    
  } catch (error: any) {
    console.error('❌ Erro no teste da BD:', error)
    res.status(500).json({
      success: false,
      message: 'Erro no teste da BD',
      error: error.message,
      connectionStatus: 'FAILED'
    })
  }
}