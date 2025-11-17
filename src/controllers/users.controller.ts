// src/controllers/users.controller.ts - PARTE 1/3
import { Request, Response } from "express"
import fs from "fs"
import path from "path"
import XLSX from "xlsx"
import User from "../models/user"
import IdsDiferentes from "../models/IdsDiferentes"
import UnmatchedUser from "../models/UnmatchedUser"
import { ImportedUserRecord } from "../types/ImportedUserRecord"
import mongoose from "mongoose"
import SyncHistory from "../models/SyncHistory"

import StudentClassHistory from "../models/StudentClassHistory"
import { Class } from "../models/Class"
import { cacheService } from "../services/cache.service"

type PipelineStage = mongoose.PipelineStage
interface SyncHistoryResult {
  completedAt: Date
}
// 📋 LISTAGEM DE UTILIZADORES
// ✅ SUBSTITUIR A FUNÇÃO listUsers em src/controllers/users.controller.ts
interface CachedUsersData {
  success: boolean
  users: any[]
  hasMore: boolean
  nextCursor: string | null
  totalCount?: number
  meta: {
    limit: number
    returned: number
    preCalculated: boolean
    performance: {
      totalTime: number
      queryTime: number
      fromCache: boolean
    }
  }
  cachedAt: number
}
export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const { 
    page = 1, 
    limit = 50, 
    search = "", 
    status = "", 
    hasDiscord = "", 
    hasHotmart = "" 
  } = req.query;
  
  const skip = (+page - 1) * +limit;

  try {
    const matchStage: Record<string, any> = {};
    
    if (search && typeof search === "string") {
      matchStage.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } }
      ];
    }
    
    if (status && typeof status === "string") {
      matchStage.status = status;
    }
    
    if (hasDiscord === "true") {
      matchStage.discordIds = { $exists: true, $not: { $size: 0 } };
    } else if (hasDiscord === "false") {
      matchStage.$or = [
        { discordIds: { $exists: false } },
        { discordIds: { $size: 0 } }
      ];
    }
    
    if (hasHotmart === "true") {
      matchStage.$or = [
        { 
          $and: [
            { classId: { $exists: true } },
            { classId: { $ne: null } },
            { classId: { $ne: "" } }
          ]
        },
        { 
          $and: [
            { hotmartUserId: { $exists: true } },
            { hotmartUserId: { $ne: null } },
            { hotmartUserId: { $ne: "" } }
          ]
        }
      ];
    } else if (hasHotmart === "false") {
      matchStage.$and = [
        {
          $or: [
            { classId: { $exists: false } },
            { classId: null },
            { classId: "" }
          ]
        },
        {
          $or: [
            { hotmartUserId: { $exists: false } },
            { hotmartUserId: null },
            { hotmartUserId: "" }
          ]
        }
      ];
    }

    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: "classes",
          localField: "classId",
          foreignField: "classId",
          as: "classInfo"
        }
      },
      { $unwind: { path: "$classInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          discordIds: 1,
          username: 1,
          email: 1,
          name: 1,
          classId: 1,
          className: "$classInfo.name",
          status: 1,
          purchaseDate: 1,
          role: 1,
          engagement: 1,
          type: 1,
          lastAccessDate: 1,
          hotmartUserId: 1,
          // ✅ INCLUIR PROGRESSO COMPLETO DA BD
          progress: 1,
          // Campos calculados
          hasDiscordIds: { 
            $gt: [{ $size: { $ifNull: ["$discordIds", []] } }, 0] 
          },
          hasHotmartConnection: {
            $or: [
              { $and: [{ $ne: ["$classId", null] }, { $ne: ["$classId", ""] }] },
              { $and: [{ $ne: ["$hotmartUserId", null] }, { $ne: ["$hotmartUserId", ""] }] }
            ]
          },
          hasProgress: {
            $gt: [{ $ifNull: ["$progress.completedPercentage", 0] }, 0]
          }
        }
      },
      { $sort: { name: 1 } },
      { $skip: skip },
      { $limit: +limit }
    ];

    // Pipeline para contagem total
    const countPipeline: PipelineStage[] = [
      { $match: matchStage },
      { $count: "total" }
    ];

    const [users, countResult] = await Promise.all([
      User.aggregate(pipeline),
      User.aggregate(countPipeline)
    ]);

    const count = countResult[0]?.total || 0;

    res.status(200).json({
      users,
      count,
      page: +page,
      limit: +limit,
      totalPages: Math.ceil(count / +limit),
      hasProgress: true, // Indicar que inclui progresso
      // Filtros aplicados
      filters: {
        search: search || null,
        status: status || null,
        hasDiscord: hasDiscord || null,
        hasHotmart: hasHotmart || null
      }
    });

  } catch (error: any) {
    console.error("❌ Erro ao buscar utilizadores:", error);
    res.status(500).json({ 
      message: "Erro ao buscar utilizadores", 
      details: error.message 
    });
  }
}

// 📋 LISTAGEM SIMPLES DE UTILIZADORES
// src/controllers/users.controller.ts - listUsersSimple OTIMIZADO PARA CARREGAR TODOS
export const listUsersSimple = async (req: Request, res: Response): Promise<void> => {
  const { page = 1, limit = 50 } = req.query;
  
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNumRaw = parseInt(limit as string);
  const limitNum = Number.isFinite(limitNumRaw) ? limitNumRaw : 50;
  
  // ✅ PERMITIR LIMITS GRANDES MAS COM OTIMIZAÇÕES
  const actualLimit = limitNum > 10000 ? 0 : limitNum; // 0 = sem limite no MongoDB
  const isLoadAll = actualLimit === 0 || limitNum <= 0 || limitNum > 5000;
  const skip = actualLimit === 0 ? 0 : (pageNum - 1) * actualLimit;

  console.log(`📊 listUsersSimple - page: ${pageNum}, limit: ${limitNum}, actualLimit: ${actualLimit}, skip: ${skip}`);

  // ✅ Status filtering (active | inactive)
  const statusParam = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : undefined

  const baseFilter: any = {
    $or: [
      { isDeleted: { $exists: false } },
      { isDeleted: false }
    ]
  }

  let statusFilter: any = {}
  if (statusParam === 'active') {
    statusFilter = { $or: [
      { status: 'ACTIVE' },
      { estado: { $regex: /^(ativo|active)$/i } }
    ] }
  } else if (statusParam === 'inactive') {
    // Inactive = NOT active (neither ACTIVE nor estado matches 'ativo'/'active')
    statusFilter = { $nor: [
      { status: 'ACTIVE' },
      { estado: { $regex: /^(ativo|active)$/i } }
    ] }
  }

  const combinedFilter = Object.keys(statusFilter).length ? { $and: [baseFilter, statusFilter] } : baseFilter

  try {
    // ✅ ESTRATÉGIA: Se limit muito alto, usar query simples sem agregação pesada
    if (isLoadAll) {
      console.log('🚀 Usando estratégia de carregamento TOTAL otimizada...');
      
      // Query simples e rápida para grandes volumes
      const users = await User.find(
        combinedFilter,
        {
          // ✅ CAMPOS BÁSICOS
          _id: 1,
          name: 1,
          email: 1,
          username: 1,
          classId: 1,
          status: 1,
          estado: 1,
          role: 1,
          type: 1,
          purchaseDate: 1,
          lastAccessDate: 1,
          acceptedTerms: 1,
          plusAccess: 1,
          
          // ✅ IDs DE PLATAFORMAS (Compatibilidade)
          hotmartUserId: 1,
          curseducaUserId: 1,
          discordIds: 1,
          
          // ✅ CAMPOS ANTIGOS (Retrocompatibilidade - podem estar vazios)
          engagement: 1,
          accessCount: 1,
          progress: 1,
          
          // ✅ NOVA ESTRUTURA SEGREGADA (Onde os dados realmente estão)
          'hotmart.hotmartUserId': 1,
          'hotmart.engagement.engagementLevel': 1,
          'hotmart.engagement.accessCount': 1,
          'hotmart.engagement.engagementScore': 1,
          'hotmart.progress.completedLessons': 1,
          'hotmart.progress.lessonsData': 1,
          'hotmart.progress.totalTimeMinutes': 1,
          
          'curseduca.curseducaUserId': 1,
          'curseduca.engagement.engagementLevel': 1,
          'curseduca.engagement.accessCount': 1,
          'curseduca.engagement.alternativeEngagement': 1,
          'curseduca.progress.completedPercentage': 1,
          'curseduca.progress.estimatedProgress': 1,
          
          // ✅ COMBINED (Dados agregados)
          'combined.engagement': 1,
          'combined.combinedEngagement': 1,
          'combined.totalProgress': 1
        }
      )
      .lean() // ✅ USAR LEAN() para melhor performance
      .maxTimeMS(120000); // 2 minutos timeout

      // ✅ LOOKUP SEPARADO E OTIMIZADO para className (opcional)
const classIds = [...new Set(
  users
    .map(u => (u as any).classId)
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
)];

let classMap: Record<string, string> = {};

if (classIds.length > 0 && classIds.length < 1000) {
  try {
    const db = mongoose.connection.db
    if (db) {
      const classes = await db.collection('classes')
        .find({ classId: { $in: classIds } })
        .project({ classId: 1, name: 1 })
        .toArray();

      classMap = classes.reduce((map: Record<string, string>, cls: any) => {
        map[cls.classId] = cls.name;
        return map;
      }, {});
    }
  } catch (classError) {
    console.warn('⚠️ Erro ao carregar classes, continuando sem nomes...');
  }
}

// ✅ MAPEAR PARA ESTRUTURA COMPATÍVEL
const usersWithClassName = users.map(user => {
  const u = user as any; // Type assertion para acesso às propriedades
  
  // 🐛 DEBUG TEMPORÁRIO
  if (u.email === 'joaobarroshtc@gmail.com') {
    console.log('🐛 DEBUG joaobarroshtc@gmail.com:')
    console.log('  u.hotmart:', u.hotmart ? 'EXISTS' : 'UNDEFINED')
    console.log('  u.hotmart?.engagement:', u.hotmart?.engagement)
    console.log('  u.hotmart?.progress:', u.hotmart?.progress ? `Has ${u.hotmart.progress.lessonsData?.length} lessons` : 'UNDEFINED')
  }
  
  // Extrair dados da Hotmart
  const hotmartEngagement = u.hotmart?.engagement?.engagementLevel
  const hotmartAccessCount = u.hotmart?.engagement?.accessCount
  const hotmartEngagementScore = u.hotmart?.engagement?.engagementScore
  const hotmartCompletedLessons = u.hotmart?.progress?.completedLessons || 0
  const hotmartTotalLessons = u.hotmart?.progress?.lessonsData?.length || 0
  
  // Calcular progresso da Hotmart
  const hotmartProgress = hotmartTotalLessons > 0
    ? Math.round((hotmartCompletedLessons / hotmartTotalLessons) * 100)
    : 0
  
  // Extrair dados da Curseduca
  const curseducaEngagement = u.curseduca?.engagement?.engagementLevel
  const curseducaAccessCount = u.curseduca?.engagement?.accessCount
  const curseducaProgress = u.curseduca?.progress?.completedPercentage || 0
  
  // Usar Combined se disponível, senão usar da plataforma principal
  const finalEngagement = u.combined?.engagement?.level || 
                         hotmartEngagement || 
                         curseducaEngagement || 
                         u.engagement || 
                         'NONE'
                         
  const finalAccessCount = hotmartAccessCount || 
                          curseducaAccessCount || 
                          u.accessCount || 
                          0
                          
  const finalProgress = u.combined?.totalProgress || 
                       hotmartProgress || 
                       curseducaProgress || 
                       u.progress?.completedPercentage || 
                       0
  
  return {
    _id: u._id,
    username: u.username || "",
    email: u.email || "",
    name: u.name || "",
    hotmartUserId: u.hotmartUserId || u.hotmart?.hotmartUserId || "",
    curseducaUserId: u.curseducaUserId || u.curseduca?.curseducaUserId || "",
    discordIds: u.discordIds || [],
    classId: u.classId,
    className: classMap[u.classId] || null,
    status: u.status,
    estado: u.estado,
    role: u.role || "",
    type: u.type || "",
    purchaseDate: u.purchaseDate,
    lastAccessDate: u.lastAccessDate,
    acceptedTerms: u.acceptedTerms ?? false,
    plusAccess: u.plusAccess ?? false,
    
    // ✅ CAMPOS MAPEADOS DA ESTRUTURA SEGREGADA
    engagement: finalEngagement,
    accessCount: finalAccessCount,
    progress: {
      completedPercentage: finalProgress,
      completed: hotmartCompletedLessons,
      total: hotmartTotalLessons
    }
  };
});

      const count = await User.countDocuments(combinedFilter);

      // ✅ DEBUG: Verificar distribuição por produtos
      const withHotmart = usersWithClassName.filter(u => u.hotmartUserId && u.hotmartUserId.trim() !== '').length;
      const withCurseduca = usersWithClassName.filter(u => u.curseducaUserId && u.curseducaUserId.trim() !== '').length;
      
      // ✅ DEBUG: Verificar engagement mapeado
      const withEngagement = usersWithClassName.filter(u => u.engagement && u.engagement !== 'NONE').length;
      const withAccessCount = usersWithClassName.filter(u => u.accessCount > 0).length;
      const withProgress = usersWithClassName.filter(u => u.progress && u.progress.completedPercentage > 0).length;
      
      console.log(`📊 TOTAL carregado: ${count} utilizadores`);
      console.log(`📊 Com hotmartUserId: ${withHotmart}`);
      console.log(`📊 Com curseducaUserId: ${withCurseduca}`);
      console.log(`📊 Com engagement (não NONE): ${withEngagement}`);
      console.log(`📊 Com accessCount > 0: ${withAccessCount}`);
      console.log(`📊 Com progresso > 0: ${withProgress}`);

      res.json({ 
        users: usersWithClassName, 
        count,
        page: pageNum,
        limit: limitNum,
        totalPages: 1, // Todos numa página
        loadedAll: true,
        debug: {
          usersWithHotmart: withHotmart,
          usersWithCurseduca: withCurseduca,
          totalReturned: count,
          strategy: "optimized_full_load"
        }
      });
      
      return;
    }

    // ✅ ESTRATÉGIA NORMAL: Para limits pequenos, usar agregação otimizada
    console.log('📋 Usando estratégia de paginação normal...');
    
    const pipeline: PipelineStage[] = [
      // 1️⃣ Match para filtrar documentos válidos (com status)
      { $match: combinedFilter },
      
      // 2️⃣ Skip e Limit ANTES do lookup para reduzir dados
      { $skip: skip },
      // Só limitar quando actualLimit > 0
      ...((actualLimit > 0) ? [{ $limit: actualLimit }] : [] as any),
      
      // 3️⃣ Lookup para classes
      {
        $lookup: {
          from: "classes",
          localField: "classId",
          foreignField: "classId",
          as: "classInfo"
        }
      },
      
      // 4️⃣ Unwind opcional
      { 
        $unwind: { 
          path: "$classInfo", 
          preserveNullAndEmptyArrays: true 
        } 
      },
      
      // 5️⃣ Projeção com MAPEAMENTO CORRETO dos campos segregados
      {
        $project: {
          _id: 1,
          username: { $ifNull: ["$username", ""] },
          email: { $ifNull: ["$email", ""] },
          name: { $ifNull: ["$name", ""] },
          hotmartUserId: { $ifNull: ["$hotmartUserId", ""] },
          curseducaUserId: { $ifNull: ["$curseducaUserId", ""] },
          discordIds: { $ifNull: ["$discordIds", []] },
          classId: { $ifNull: ["$classId", ""] },
          className: { $ifNull: ["$classInfo.name", ""] },
          status: "$status",
          estado: "$estado",
          role: { $ifNull: ["$role", ""] },
          type: { $ifNull: ["$type", ""] },
          purchaseDate: { $ifNull: ["$purchaseDate", null] },
          lastAccessDate: { $ifNull: ["$lastAccessDate", null] },
          acceptedTerms: { $ifNull: ["$acceptedTerms", false] },
          plusAccess: { $ifNull: ["$plusAccess", false] },
          
          // ✅ ENGAGEMENT MAPEADO (prioridade: combined > hotmart > curseduca > antigo)
          engagement: {
            $cond: {
              if: { $ne: ["$combined.engagement.level", null] },
              then: "$combined.engagement.level",
              else: {
                $cond: {
                  if: { $ne: ["$hotmart.engagement.engagementLevel", null] },
                  then: "$hotmart.engagement.engagementLevel",
                  else: {
                    $cond: {
                      if: { $ne: ["$curseduca.engagement.engagementLevel", null] },
                      then: "$curseduca.engagement.engagementLevel",
                      else: { $ifNull: ["$engagement", "NONE"] }
                    }
                  }
                }
              }
            }
          },
          
          // ✅ ACCESS COUNT MAPEADO
          accessCount: {
            $cond: {
              if: { $gt: ["$hotmart.engagement.accessCount", 0] },
              then: "$hotmart.engagement.accessCount",
              else: {
                $cond: {
                  if: { $gt: ["$curseduca.engagement.accessCount", 0] },
                  then: "$curseduca.engagement.accessCount",
                  else: { $ifNull: ["$accessCount", 0] }
                }
              }
            }
          },
          
          // ✅ PROGRESS MAPEADO
          progress: {
            $cond: {
              if: { $gt: ["$combined.totalProgress", 0] },
              then: {
                completedPercentage: "$combined.totalProgress",
                completed: { $ifNull: ["$hotmart.progress.completedLessons", 0] },
                total: { $size: { $ifNull: ["$hotmart.progress.lessonsData", []] } }
              },
              else: {
                $cond: {
                  if: { $gt: [{ $size: { $ifNull: ["$hotmart.progress.lessonsData", []] } }, 0] },
                  then: {
                    completedPercentage: {
                      $multiply: [
                        { $divide: [
                          { $ifNull: ["$hotmart.progress.completedLessons", 0] },
                          { $size: { $ifNull: ["$hotmart.progress.lessonsData", []] } }
                        ]},
                        100
                      ]
                    },
                    completed: { $ifNull: ["$hotmart.progress.completedLessons", 0] },
                    total: { $size: { $ifNull: ["$hotmart.progress.lessonsData", []] } }
                  },
                  else: {
                    $cond: {
                      if: { $gt: ["$curseduca.progress.completedPercentage", 0] },
                      then: {
                        completedPercentage: "$curseduca.progress.completedPercentage",
                        completed: 0,
                        total: 0
                      },
                      else: {
                        completedPercentage: { $ifNull: ["$progress.completedPercentage", 0] },
                        completed: 0,
                        total: 0
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ];

    const users = await User.aggregate(pipeline)
      .allowDiskUse(true);

    // Contar total
      const count = await User.countDocuments(combinedFilter);

    const withHotmart = users.filter(u => u.hotmartUserId && u.hotmartUserId.trim() !== '').length;
    const withCurseduca = users.filter(u => u.curseducaUserId && u.curseducaUserId.trim() !== '').length;
    
    console.log(`📊 Página ${pageNum}: ${users.length} utilizadores`);
    console.log(`📊 Com hotmartUserId: ${withHotmart}`);
    console.log(`📊 Com curseducaUserId: ${withCurseduca}`);

    res.json({ 
      users, 
      count,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(count / actualLimit),
      debug: {
        usersWithHotmart: withHotmart,
        usersWithCurseduca: withCurseduca,
        totalReturned: users.length,
        strategy: "paginated"
      }
    });

  } catch (error: any) {
    console.error(" Erro em listUsersSimple:", {
      message: error.message,
      stack: error.stack?.slice(0, 500),
      params: { page: pageNum, limit: limitNum }
    });

    res.status(500).json({ 
      message: "Erro ao buscar utilizadores", 
      details: error.message,
      params: { page: pageNum, limit: limitNum },
      timestamp: new Date().toISOString()
    });
  }
}
// ✅ ADICIONAR: Função para listar TODOS os utilizadores
export const getAllUsersUnified = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 1000, 
      status, 
      platform,
      search 
    } = req.query

    // Query base: todos os users não deletados
    const query: any = {
      isDeleted: { $ne: true }
    }

    // Filtro por status (suporta ambas as estruturas)
    if (status === 'active') {
      query.$or = [
        { 'combined.status': 'ACTIVE' },
        { status: 'ACTIVE' },
        { status: 'ativo' }
      ]
    } else if (status === 'inactive') {
      query.$or = [
        { 'combined.status': 'INACTIVE' },
        { status: 'INACTIVE' },
        { status: 'inativo' }
      ]
    }

    // Filtro por plataforma (usando $nin em vez de múltiplos $ne)
    if (platform) {
      switch (platform) {
        case 'hotmart':
          query.$or = [
            { 'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] } },
            { hotmartUserId: { $exists: true, $nin: [null, ''] } }
          ]
          break
        case 'curseduca':
          query.$or = [
            { 'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] } },
            { curseducaUserId: { $exists: true, $nin: [null, ''] } }
          ]
          break
        case 'discord':
          query.$or = [
            { 'discord.discordIds.0': { $exists: true } },
            { 'discordIds.0': { $exists: true } }
          ]
          break
      }
    }

    // Pesquisa por texto
    if (search) {
      const searchRegex = new RegExp(search as string, 'i')
      // ⚠️ ATENÇÃO: Isto vai sobrescrever $or anterior se houver status ou platform
      // Para manter ambos os filtros, precisa de usar $and
      if (query.$or) {
        // Se já existe $or (de status ou platform), combinar com $and
        const previousOr = query.$or
        delete query.$or
        query.$and = [
          { $or: previousOr },
          { 
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { username: searchRegex }
            ]
          }
        ]
      } else {
        // Se não há $or anterior, usar direto
        query.$or = [
          { name: searchRegex },
          { email: searchRegex },
          { username: searchRegex }
        ]
      }
    }

    // Executar query com paginação
    const skip = (Number(page) - 1) * Number(limit)
    const users = await User.find(query)
      .select('name email username status combined hotmart curseduca discord discordIds hotmartUserId curseducaUserId')
      .skip(skip)
      .limit(Number(limit))
      .lean()

    const total = await User.countDocuments(query)

    res.json({
      success: true,
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar utilizadores:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar utilizadores',
      error: error.message
    })
  }
}

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    console.log('📊 [DASHBOARD] Calculando estatísticas...')
    
    const baseQuery = { isDeleted: { $ne: true } }

    // Total de utilizadores
    const totalUsers = await User.countDocuments(baseQuery)
    console.log(`   📈 Total users: ${totalUsers}`)

    // Utilizadores ativos
    const activeUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'combined.status': 'ACTIVE' },
        { status: 'ACTIVE' },
        { status: 'ativo' }
      ]
    })
    console.log(`   ✅ Active users: ${activeUsers}`)

    // ✅ CONTAGEM POR PLATAFORMA usando countDocuments (MESMA LÓGICA DO getUserStats)
    
    // Hotmart
    const hotmartUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 
          $and: [
            { hotmartUserId: { $exists: true } },
            { hotmartUserId: { $ne: null } },
            { hotmartUserId: { $ne: "" } }
          ]
        },
        {
          $and: [
            { 'hotmart.hotmartUserId': { $exists: true } },
            { 'hotmart.hotmartUserId': { $ne: null } },
            { 'hotmart.hotmartUserId': { $ne: "" } }
          ]
        }
      ]
    })

    // CursEduca ✅ CORRIGIDO
    const curseducaUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        {
          $and: [
            { curseducaUserId: { $exists: true } },
            { curseducaUserId: { $ne: null } },
            { curseducaUserId: { $ne: "" } }
          ]
        },
        {
          $and: [
            { 'curseduca.curseducaUserId': { $exists: true } },
            { 'curseduca.curseducaUserId': { $ne: null } },
            { 'curseduca.curseducaUserId': { $ne: "" } }
          ]
        }
      ]
    })

    // Discord (Opção B: Transição - ambas estruturas)
    const discordUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'discord.discordIds.0': { $exists: true } },  // ✅ Nova estrutura
        { 'discordIds.0': { $exists: true } }           // ⚠️ Antiga (temporário)
      ]
    })

    // 🔍 DEBUG: Análise Discord (estrutura vs IDs)
    const discordWithStructure = await User.countDocuments({
      ...baseQuery,
      'discord': { $exists: true }
    })
    
    const discordWithIds = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'discord.discordIds.0': { $exists: true } },
        { 'discordIds.0': { $exists: true } }
      ]
    })
    
    const discordStructureButEmpty = discordWithStructure - discordWithIds

    console.log('\n   🔍 Discord Detalhado:')
    console.log(`      Total com IDs (atual): ${discordUsers}`)
    console.log(`      Com estrutura 'discord': ${discordWithStructure}`)
    console.log(`      Com Discord IDs não vazio: ${discordWithIds}`)
    console.log(`      Estrutura mas SEM IDs: ${discordStructureButEmpty}`)
    if (discordStructureButEmpty > 0) {
      const percentage = Math.round((discordStructureButEmpty / discordWithStructure) * 100)
      console.log(`      ⚠️  ${discordStructureButEmpty} (${percentage}%) têm estrutura mas array vazio`)
    }

    // ✅ DISTRIBUIÇÃO EXCLUSIVA - QUERIES ESPECÍFICAS PARA PRECISÃO
    
    // Ambos Hotmart E CursEduca
    const bothHotmartAndCurseduca = await User.countDocuments({
      ...baseQuery,
      $and: [
        // Tem Hotmart
        {
          $or: [
            { hotmartUserId: { $exists: true, $ne: null, $ne: "" } },
            { 'hotmart.hotmartUserId': { $exists: true, $ne: null, $ne: "" } }
          ]
        },
        // E tem CursEduca
        {
          $or: [
            { curseducaUserId: { $exists: true, $ne: null, $ne: "" } },
            { 'curseduca.curseducaUserId': { $exists: true, $ne: null, $ne: "" } }
          ]
        }
      ]
    })
    
    // Apenas Hotmart (tem Hotmart MAS NÃO tem CursEduca)
    const hotmartOnly = await User.countDocuments({
      ...baseQuery,
      $and: [
        // Tem Hotmart
        {
          $or: [
            { hotmartUserId: { $exists: true, $ne: null, $ne: "" } },
            { 'hotmart.hotmartUserId': { $exists: true, $ne: null, $ne: "" } }
          ]
        },
        // MAS NÃO tem CursEduca
        {
          $and: [
            {
              $or: [
                { curseducaUserId: { $exists: false } },
                { curseducaUserId: null },
                { curseducaUserId: "" }
              ]
            },
            {
              $or: [
                { 'curseduca.curseducaUserId': { $exists: false } },
                { 'curseduca.curseducaUserId': null },
                { 'curseduca.curseducaUserId': "" }
              ]
            }
          ]
        }
      ]
    })
    
    // Apenas CursEduca (tem CursEduca MAS NÃO tem Hotmart)
    const curseducaOnly = await User.countDocuments({
      ...baseQuery,
      $and: [
        // Tem CursEduca
        {
          $or: [
            { curseducaUserId: { $exists: true, $ne: null, $ne: "" } },
            { 'curseduca.curseducaUserId': { $exists: true, $ne: null, $ne: "" } }
          ]
        },
        // MAS NÃO tem Hotmart
        {
          $and: [
            {
              $or: [
                { hotmartUserId: { $exists: false } },
                { hotmartUserId: null },
                { hotmartUserId: "" }
              ]
            },
            {
              $or: [
                { 'hotmart.hotmartUserId': { $exists: false } },
                { 'hotmart.hotmartUserId': null },
                { 'hotmart.hotmartUserId': "" }
              ]
            }
          ]
        }
      ]
    })
    
    // Nenhuma plataforma (nem Hotmart nem CursEduca)
    const noPlatform = await User.countDocuments({
      ...baseQuery,
      $and: [
        // NÃO tem Hotmart
        {
          $and: [
            {
              $or: [
                { hotmartUserId: { $exists: false } },
                { hotmartUserId: null },
                { hotmartUserId: "" }
              ]
            },
            {
              $or: [
                { 'hotmart.hotmartUserId': { $exists: false } },
                { 'hotmart.hotmartUserId': null },
                { 'hotmart.hotmartUserId': "" }
              ]
            }
          ]
        },
        // NÃO tem CursEduca
        {
          $and: [
            {
              $or: [
                { curseducaUserId: { $exists: false } },
                { curseducaUserId: null },
                { curseducaUserId: "" }
              ]
            },
            {
              $or: [
                { 'curseduca.curseducaUserId': { $exists: false } },
                { 'curseduca.curseducaUserId': null },
                { 'curseduca.curseducaUserId': "" }
              ]
            }
          ]
        }
      ]
    })
    
    // Multi-Plataforma (simplificado: baseado na soma)
    const multiPlatformUsers = Math.max(0, 
      (hotmartUsers + curseducaUsers + discordUsers) - totalUsers
    )
    
    // bothPlatforms para compatibilidade (Hotmart E CursEduca)
    const bothPlatforms = bothHotmartAndCurseduca

    // ✅ LOG DETALHADO PARA DEBUG
    console.log('   📊 Contagem por plataforma:')
    console.log(`      🛒 Hotmart: ${hotmartUsers}`)
    console.log(`      🎓 CursEduca: ${curseducaUsers}`)
    console.log(`      💬 Discord: ${discordUsers}`)
    console.log(`      🔗 Multi (2+): ${multiPlatformUsers}`)

    console.log('\n   📈 Distribuição exclusiva:')
    console.log(`      🟠 Apenas Hotmart: ${hotmartOnly}`)
    console.log(`      🔵 Apenas CursEduca: ${curseducaOnly}`)
    console.log(`      🟣 Ambas (Hotmart + CursEduca): ${bothPlatforms}`)
    console.log(`      ⚪ Nenhuma plataforma: ${noPlatform}`)
    
    const totalCheck = hotmartOnly + curseducaOnly + bothPlatforms + noPlatform
    console.log(`      ✓ Verificação: ${totalCheck} === ${totalUsers} ${totalCheck === totalUsers ? '✅' : '❌'}`)

    // ✅ ENGAGEMENT USANDO AGREGAÇÃO (MUITO MAIS RÁPIDO!)
    const engagementAgg = await User.aggregate([
      { $match: baseQuery },
      {
        $project: {
          score: {
            $ifNull: [
              '$combined.engagement.score',
              {
                $ifNull: [
                  '$combined.combinedEngagement',
                  {
                    $ifNull: [
                      '$hotmart.engagement.engagementScore',
                      {
                        $ifNull: ['$curseduca.engagement.alternativeEngagement', 0]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
          topPerformers: { $sum: { $cond: [{ $gte: ['$score', 50] }, 1, 0] } },
          needsAttention: {
            $sum: { $cond: [{ $and: [{ $lt: ['$score', 30] }, { $gt: ['$score', 0] }] }, 1, 0] }
          },
          withEngagement: { $sum: { $cond: [{ $gt: ['$score', 0] }, 1, 0] } }
        }
      }
    ])

    const engStats = engagementAgg[0] || {
      avgScore: 0,
      topPerformers: 0,
      needsAttention: 0,
      withEngagement: 0
    }

    const averageEngagement = engStats.avgScore || 0
    const topPerformersCount = engStats.topPerformers || 0
    const needsAttentionCount = engStats.needsAttention || 0
    const withEngagement = engStats.withEngagement || 0

    console.log(`\n   📈 Engagement médio: ${averageEngagement.toFixed(2)}`)
    console.log(`   🌟 Top performers (≥50): ${topPerformersCount}`)
    console.log(`   ⚠️  Needs attention (<30): ${needsAttentionCount}`)
    console.log(`   📊 Com engagement (>0): ${withEngagement}`)

    // 🔍 DEBUG: Estatísticas de plataforma
    console.log('\n   🌐 Platform Stats DEBUG:')
    console.log(`      Hotmart: ${hotmartUsers}`)
    console.log(`      CursEduca: ${curseducaUsers}`)
    console.log(`      Discord: ${discordUsers}`)
    console.log(`      Multi-Platform: ${multiPlatformUsers}`)

    // ✅ BUSCAR DATAS DAS ÚLTIMAS SINCRONIZAÇÕES
    const lastHotmartSync = await SyncHistory.findOne({ 
      type: 'hotmart', 
      status: 'completed' 
    })
      .sort({ completedAt: -1 })
      .select('completedAt')
      .lean() as SyncHistoryResult | null

    const lastCurseducaSync = await SyncHistory.findOne({ 
      type: 'curseduca', 
      status: 'completed' 
    })
      .sort({ completedAt: -1 })
      .select('completedAt')
      .lean() as SyncHistoryResult | null

    if (lastHotmartSync || lastCurseducaSync) {
      console.log('\n   🕒 Últimas sincronizações:')
      if (lastHotmartSync) {
        console.log(`      Hotmart: ${new Date(lastHotmartSync.completedAt).toLocaleString('pt-PT')}`)
      }
      if (lastCurseducaSync) {
        console.log(`      CursEduca: ${new Date(lastCurseducaSync.completedAt).toLocaleString('pt-PT')}`)
      }
    }

    // ✅ RESPOSTA FINAL
    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        withProgress: withEngagement, // ✅ Agora calculado via agregação
        withEngagement,
        averageEngagement: Math.round(averageEngagement * 100) / 100,
        topPerformersCount,
        needsAttentionCount,
        
        // Estatísticas por plataforma (totais)
        platformStats: {
          hotmartUsers,
          curseducaUsers,
          discordUsers,
          multiPlatformUsers
        },
        
        // ✅ Distribuição exclusiva
        platformDistribution: {
          hotmartOnly,
          curseducaOnly,
          bothPlatforms,
          noPlatform
        },
        
        // ✅ Datas das últimas sincronizações
        lastHotmartSync: lastHotmartSync?.completedAt || null,
        lastCurseducaSync: lastCurseducaSync?.completedAt || null
      }
    })

    console.log('\n✅ [DASHBOARD] Estatísticas calculadas com sucesso!\n')

  } catch (error: any) {
    console.error('❌ [DASHBOARD] Erro ao buscar stats:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas',
      error: error.message
    })
  }
}


// 📊 ESTATÍSTICAS DE UTILIZADORES
export const getUserStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalUsers = await User.countDocuments();

    // Discord (Opção B: Transição - ambas estruturas)
    const discordUsers = await User.countDocuments({ 
      $or: [
        { 'discord.discordIds.0': { $exists: true } },  // ✅ Nova estrutura
        { 'discordIds.0': { $exists: true } }           // ⚠️ Antiga (temporário)
      ]
    });

    const hotmartUsers = await User.countDocuments({
      $or: [
        { 
          $and: [
            { classId: { $exists: true } },
            { classId: { $ne: null } },
            { classId: { $ne: "" } }
          ]
        },
        { 
          $and: [
            { hotmartUserId: { $exists: true } },
            { hotmartUserId: { $ne: null } },
            { hotmartUserId: { $ne: "" } }
          ]
        }
      ]
    });

    // ✅ ADICIONAR: Contagem de utilizadores CursEduca (suporta ambas as estruturas)
    const curseducaUsers = await User.countDocuments({
      $or: [
        {
          $and: [
            { curseducaUserId: { $exists: true } },
            { curseducaUserId: { $ne: null } },
            { curseducaUserId: { $ne: "" } }
          ]
        },
        {
          $and: [
            { 'curseduca.curseducaUserId': { $exists: true } },
            { 'curseduca.curseducaUserId': { $ne: null } },
            { 'curseduca.curseducaUserId': { $ne: "" } }
          ]
        }
      ]
    });

    // ✅ MULTI-PLATAFORMA: Utilizadores com Hotmart E CursEduca (ambas)
    const multiPlatformUsers = await User.countDocuments({
      $and: [
        // TEM Hotmart
        {
          $or: [
            { 
              $and: [
                { hotmartUserId: { $exists: true } },
                { hotmartUserId: { $ne: null } },
                { hotmartUserId: { $ne: "" } }
              ]
            },
            {
              $and: [
                { 'hotmart.hotmartUserId': { $exists: true } },
                { 'hotmart.hotmartUserId': { $ne: null } },
                { 'hotmart.hotmartUserId': { $ne: "" } }
              ]
            }
          ]
        },
        // E TEM CursEduca
        {
          $or: [
            {
              $and: [
                { curseducaUserId: { $exists: true } },
                { curseducaUserId: { $ne: null } },
                { curseducaUserId: { $ne: "" } }
              ]
            },
            {
              $and: [
                { 'curseduca.curseducaUserId': { $exists: true } },
                { 'curseduca.curseducaUserId': { $ne: null } },
                { 'curseduca.curseducaUserId': { $ne: "" } }
              ]
            }
          ]
        }
      ]
    });

    // ✅ MANTER: Discord + Hotmart (para compatibilidade se necessário)
    const bothPlatforms = await User.countDocuments({
      $and: [
        { discordIds: { $exists: true, $not: { $size: 0 } } },
        {
          $or: [
            { 
              $and: [
                { classId: { $exists: true } },
                { classId: { $ne: null } },
                { classId: { $ne: "" } }
              ]
            },
            { 
              $and: [
                { hotmartUserId: { $exists: true } },
                { hotmartUserId: { $ne: null } },
                { hotmartUserId: { $ne: "" } }
              ]
            }
          ]
        }
      ]
    });

    // Alinhar contagens com a mesma definição usada em listUsersSimple
    const activeUsers = await User.countDocuments({
      $or: [
        { status: 'ACTIVE' },
        { estado: { $in: ['ativo', 'active'] } }
      ]
    })

    const inactiveUsers = await User.countDocuments({
      $nor: [
        { status: 'ACTIVE' },
        { estado: { $in: ['ativo', 'active'] } }
      ]
    })

    // Usar a mesma lógica do engagement.controller.ts para calcular engagement scores
    const engagementPipeline = await User.aggregate([
      {
        $project: {
          engagementScore: {
            $let: {
              vars: {
                accessScore: {
                  $cond: [
                    { $gte: [{ $ifNull: ["$accessCount", 0] }, 50] }, 100,
                    {
                      $cond: [
                        { $gte: [{ $ifNull: ["$accessCount", 0] }, 20] }, 80,
                        {
                          $cond: [
                            { $gte: [{ $ifNull: ["$accessCount", 0] }, 10] }, 60,
                            {
                              $cond: [
                                { $gte: [{ $ifNull: ["$accessCount", 0] }, 5] }, 40,
                                {
                                  $cond: [
                                    { $gte: [{ $ifNull: ["$accessCount", 0] }, 1] }, 20,
                                    0
                                  ]
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                progressScore: {
                  $cond: [
                    { $gte: [{ $ifNull: ["$progress.completedPercentage", 0] }, 90] }, 100,
                    {
                      $cond: [
                        { $gte: [{ $ifNull: ["$progress.completedPercentage", 0] }, 70] }, 80,
                        {
                          $cond: [
                            { $gte: [{ $ifNull: ["$progress.completedPercentage", 0] }, 50] }, 60,
                            {
                              $cond: [
                                { $gte: [{ $ifNull: ["$progress.completedPercentage", 0] }, 30] }, 40,
                                {
                                  $cond: [
                                    { $gt: [{ $ifNull: ["$progress.completedPercentage", 0] }, 0] }, 20,
                                    0
                                  ]
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                engagementScore: {
                  $switch: {
                    branches: [
                      { case: { $in: ["$engagement", ["MUITO_ALTO", "ALTO"]] }, then: 100 },
                      { case: { $in: ["$engagement", ["MEDIO"]] }, then: 60 },
                      { case: { $in: ["$engagement", ["BAIXO"]] }, then: 40 },
                      { case: { $in: ["$engagement", ["MUITO_BAIXO"]] }, then: 20 }
                    ],
                    default: 0
                  }
                }
              },
              in: {
                $round: [
                  {
                    $add: [
                      { $multiply: ["$$accessScore", 0.4] },
                      { $multiply: ["$$progressScore", 0.4] },
                      { $multiply: ["$$engagementScore", 0.2] }
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          averageScore: { $avg: "$engagementScore" },
          topPerformers: {
            $sum: {
              $cond: [{ $gte: ["$engagementScore", 60] }, 1, 0]
            }
          },
          needsAttention: {
            $sum: {
              $cond: [{ $lte: ["$engagementScore", 39] }, 1, 0]
            }
          }
        }
      }
    ])

    const engagementResults = engagementPipeline[0] || {
      totalUsers: totalUsers,
      averageScore: 0,
      topPerformers: 0,
      needsAttention: 0
    }

    // Calcular estatísticas com engagement
    const usersWithEngagement = await User.countDocuments({
      $or: [
        { engagement: { $exists: true, $ne: null } },
        { accessCount: { $exists: true, $gt: 0 } },
        { "progress.completedPercentage": { $exists: true, $gt: 0 } }
      ]
    })

    res.json({ 
      totalUsers, 
      activeUsers, 
      inactiveUsers,
      bothPlatforms, // Mantido para compatibilidade (Discord + Hotmart)
      // ✅ PLATAFORMAS organizadas em platformStats
      platformStats: {
        hotmartUsers,
        discordUsers,
        curseducaUsers,
        multiPlatformUsers // ✅ Hotmart E CursEduca (ambas)
      },
      // Estatísticas de engagement
      withEngagement: usersWithEngagement,
      averageEngagement: Math.round(engagementResults.averageScore * 100) / 100,
      topPerformersCount: engagementResults.topPerformers,
      needsAttentionCount: engagementResults.needsAttention
    });
  } catch (error: any) {
    console.error("Erro ao obter estatísticas:", error);
    res.status(500).json({ 
      message: "Erro ao obter estatísticas", 
      details: error.message 
    });
  }
}
// 🔍 PESQUISAR ALUNO - CORRIGIDO PARA NOVA ESTRUTURA SEGREGADA
export const searchStudent = async (req: Request, res: Response): Promise<void> => {
  const { email, name, discordId, hotmartUserId, curseducaUserId } = req.query

  if (!email && !name && !discordId && !hotmartUserId && !curseducaUserId) {
    res.status(400).json({
      message: "Pelo menos um critério de pesquisa é necessário (email, name, discordId, hotmartUserId, ou curseducaUserId)."
    })
    return
  }

  try {
    const matchConditions: any = {}
    
    if (email && typeof email === "string") {
      matchConditions.email = { $regex: new RegExp(email, "i") }
    }
    
    if (name && typeof name === "string") {
      matchConditions.name = { $regex: new RegExp(name, "i") }
    }
    
    if (discordId && typeof discordId === "string") {
      // Buscar em discord.discordIds (nova estrutura) OU discordIds (compatibilidade)
      matchConditions.$or = [
        { "discord.discordIds": { $in: [discordId] } },
        { "discordIds": { $in: [discordId] } }
      ]
    }

    if (hotmartUserId && typeof hotmartUserId === "string") {
      // Buscar em hotmart.hotmartUserId (nova estrutura) OU hotmartUserId (compatibilidade)
      matchConditions.$or = matchConditions.$or || []
      matchConditions.$or.push(
        { "hotmart.hotmartUserId": hotmartUserId },
        { "hotmartUserId": hotmartUserId }
      )
    }

    if (curseducaUserId && typeof curseducaUserId === "string") {
      // Buscar em curseduca.curseducaUserId (nova estrutura) OU curseducaUserId (compatibilidade)
      matchConditions.$or = matchConditions.$or || []
      matchConditions.$or.push(
        { "curseduca.curseducaUserId": curseducaUserId },
        { "curseducaUserId": curseducaUserId }
      )
    }

    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: "classes",
          localField: "classId",
          foreignField: "classId",
          as: "classInfo"
        }
      },
      { $unwind: { path: "$classInfo", preserveNullAndEmptyArrays: true } },
      { $match: matchConditions },
      {
        $project: {
          // ✅ CAMPOS BÁSICOS
          email: 1,
          name: 1,
          
          // ✅ ESTRUTURA SEGREGADA POR PLATAFORMA (se existir)
          discord: 1,
          hotmart: 1,
          curseduca: 1,
          combined: 1,
          metadata: 1,
          
          // ✅ CAMPOS DERIVADOS/CALCULADOS
          displayProgress: { $ifNull: ["$combined.totalProgress", "$progress.completedPercentage", 0] },
          displayEngagement: { $ifNull: ["$combined.combinedEngagement", "$engagementScore", 0] },
          primarySource: { $ifNull: ["$combined.bestEngagementSource", "legacy"] },
          
          // ✅ INFORMAÇÕES DA TURMA
          classId: { $ifNull: ["$combined.classId", "$classId"] },
          className: { $ifNull: ["$classInfo.name", "$combined.className"] },
          
          // ✅ STATUS GERAL
          status: { $ifNull: ["$combined.status", "$status", "INACTIVE"] },
          
          // ✅ CAMPOS COMPATIBILIDADE (para frontend antigo)
          hotmartUserId: { $ifNull: ["$hotmart.hotmartUserId", "$hotmartUserId"] },
          curseducaUserId: { $ifNull: ["$curseduca.curseducaUserId", "$curseducaUserId"] },
          discordIds: { $ifNull: ["$discord.discordIds", "$discordIds", []] },
          
          // ✅ DATAS IMPORTANTES
          createdAt: { $ifNull: ["$metadata.createdAt", "$createdAt"] },
          updatedAt: { $ifNull: ["$metadata.updatedAt", "$updatedAt"] },
          
          // ✅ ENGAGEMENT E PROGRESSO (compatibilidade)
          engagement: {
            $cond: {
              if: { $ne: ["$hotmart.engagement.engagementLevel", null] },
              then: "$hotmart.engagement.engagementLevel",
              else: { $ifNull: ["$curseduca.engagement.engagementLevel", "$engagement", "NONE"] }
            }
          },
          engagementScore: {
            $cond: {
              if: { $ne: ["$hotmart.engagement.engagementScore", null] },
              then: "$hotmart.engagement.engagementScore",
              else: { $ifNull: ["$curseduca.engagement.alternativeEngagement", "$engagementScore", 0] }
            }
          },
          engagementLevel: {
            $cond: {
              if: { $ne: ["$hotmart.engagement.engagementLevel", null] },
              then: "$hotmart.engagement.engagementLevel",
              else: { $ifNull: ["$curseduca.engagement.engagementLevel", "$engagementLevel", "NONE"] }
            }
          },
          accessCount: {
            $cond: {
              if: { $ne: ["$hotmart.engagement.accessCount", null] },
              then: "$hotmart.engagement.accessCount",
              else: { $ifNull: ["$accessCount", 0] }
            }
          },
          
          // ✅ PROGRESSO (compatibilidade)
          progress: {
            $cond: {
              if: { $ne: ["$hotmart.progress", null] },
              then: {
                completedPercentage: { $ifNull: ["$hotmart.progress.completedPercentage", 0] },
                total: { $ifNull: ["$hotmart.progress.totalLessons", 0] },
                completed: { $ifNull: ["$hotmart.progress.completedLessons", 0] },
                totalTimeMinutes: { $ifNull: ["$hotmart.progress.totalTimeMinutes", 0] }
              },
              else: {
                $cond: {
                  if: { $ne: ["$curseduca.progress", null] },
                  then: {
                    completedPercentage: { $ifNull: ["$curseduca.progress.estimatedProgress", 0] },
                    total: 1,
                    completed: 0,
                    totalTimeMinutes: 0
                  },
                  else: { $ifNull: ["$progress", { completedPercentage: 0, total: 0, completed: 0 }] }
                }
              }
            }
          },
          
          // ✅ CAMPOS LEGADOS (compatibilidade)
          role: 1,
          purchaseDate: { $ifNull: ["$hotmart.purchaseDate", "$purchaseDate"] },
          lastAccessDate: { $ifNull: ["$hotmart.progress.lastAccessDate", "$lastAccessDate"] },
          signupDate: { $ifNull: ["$hotmart.signupDate", "$signupDate"] },
          firstAccessDate: { $ifNull: ["$hotmart.firstAccessDate", "$firstAccessDate"] },
          locale: 1,
          plusAccess: { $ifNull: ["$hotmart.plusAccess", "$plusAccess"] },
          type: 1,
          acceptedTerms: 1,
          estado: 1,
          timer: 1,
          
          // ✅ DADOS ESPECÍFICOS DAS PLATAFORMAS
          platformProgress: {
            hotmart: "$hotmart.progress",
            curseduca: "$curseduca.progress"
          },
          platformMetrics: {
            hotmart: "$hotmart.engagement",
            curseduca: "$curseduca.engagement"
          }
        }
      }
    ]

    const students = await User.aggregate(pipeline)

    if (!students.length) {
      res.status(404).json({ message: "Nenhum aluno encontrado com os critérios fornecidos." })
      return
    }

    if (students.length > 1) {
      res.status(200).json({
        message: `Encontrados ${students.length} alunos`,
        students,
        multiple: true
      })
      return
    }

    res.status(200).json(students[0])
  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro ao buscar aluno.", 
      details: error.message 
    })
  }
}


// ✏️ EDITAR ALUNO - CORRIGIDO PARA NOVA ESTRUTURA SEGREGADA
export const editStudent = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const updateData = req.body

  try {
    // Buscar estudante atual
    const currentStudent = await User.findById(id)
    if (!currentStudent) {
      res.status(404).json({ message: "Aluno não encontrado." })
      return
    }

    // Validação de email
    if (updateData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(updateData.email)) {
        res.status(400).json({ message: "Email inválido." })
        return
      }

      // Verificar se email já existe em outro usuário
      const existingUser = await User.findOne({ 
        email: updateData.email, 
        _id: { $ne: id } 
      })
      if (existingUser) {
        res.status(409).json({ message: "Este email já está a ser usado por outro aluno." })
        return
      }
    }

    // Preparar dados de atualização para nova estrutura
    const updateFields: any = {}

    // ✅ CAMPOS BÁSICOS
    if (updateData.email) updateFields.email = updateData.email
    if (updateData.name) updateFields.name = updateData.name

    // ✅ DISCORD - Atualizar na estrutura segregada
    if (updateData.discordIds && Array.isArray(updateData.discordIds)) {
      const discordIdRegex = /^\d{17,19}$/
      for (const discordId of updateData.discordIds) {
        if (!discordIdRegex.test(discordId)) {
          res.status(400).json({ 
            message: `Discord ID inválido: ${discordId}. Deve ter entre 17-19 dígitos.` 
          })
          return
        }
      }
      
      // Remover duplicados
      const uniqueDiscordIds = [...new Set(updateData.discordIds)]
      
      // Atualizar estrutura Discord (nova) E campo legado (compatibilidade)
      updateFields["discord.discordIds"] = uniqueDiscordIds
      updateFields["discord.lastEditedAt"] = new Date()
      updateFields["discord.lastEditedBy"] = "admin_edit"
      updateFields["discordIds"] = uniqueDiscordIds // Compatibilidade
    }

    // ✅ VALIDAÇÃO E ATUALIZAÇÃO DE TURMA
    if (updateData.classId !== undefined) {
      if (updateData.classId && updateData.classId.trim() !== '') {
        const classExists = await Class.findOne({ classId: updateData.classId })
        if (!classExists) {
          res.status(400).json({ message: "Turma não encontrada." })
          return
        }
      }

      const s = currentStudent as any;
      const currentClassId = s.combined?.classId || s.classId
      if (updateData.classId !== currentClassId) {
        // Registrar mudança no histórico
      const historyEntry = new StudentClassHistory({
          studentId: currentStudent._id,
          classId: currentClassId || "sem-turma",
          className: currentClassId ? 
            (await Class.findOne({ classId: currentClassId }))?.name || 'Turma Anterior' :
            'Sem Turma',
          dateMoved: new Date(),
          reason: 'Alteração via editor de estudantes'
        })
        await historyEntry.save()

        // Atualizar na estrutura combinada E campo legado
        updateFields["combined.classId"] = updateData.classId
        updateFields["combined.className"] = updateData.classId ? 
          (await Class.findOne({ classId: updateData.classId }))?.name || `Turma ${updateData.classId}` :
          null
        updateFields["classId"] = updateData.classId // Compatibilidade
      }
    }

    // ✅ ATUALIZAR METADADOS
    updateFields["metadata.updatedAt"] = new Date()
    if (!currentStudent.metadata) {
      updateFields["metadata.createdAt"] = new Date()
    }

    // ✅ HISTÓRICO DE MUDANÇAS
    const historyEntries = []

    // Verificar mudança de email
    if (updateData.email && currentStudent.email !== updateData.email) {
      try {
        // Tentar importar UserHistory se existir
        const UserHistory = require('../models/UserHistory').UserHistory
        historyEntries.push(UserHistory.create({
          userId: currentStudent._id,
          userEmail: updateData.email, // Novo email
          changeType: 'EMAIL_CHANGE',
          previousValue: { email: currentStudent.email },
          newValue: { email: updateData.email },
          source: 'MANUAL',
          changedBy: 'admin',
          reason: 'Alteração manual via editor de estudantes'
        }))
      } catch (historyError) {
        console.warn('⚠️ UserHistory model não encontrado, continuando sem histórico...')
      }
    }

    // ✅ CAMPOS LEGADOS (compatibilidade com frontend antigo)
    if (updateData.status) updateFields.status = updateData.status
    if (updateData.role) updateFields.role = updateData.role
    if (updateData.type) updateFields.type = updateData.type
    if (updateData.estado) updateFields.estado = updateData.estado

    // Atualizar timestamp legado
    updateFields.updatedAt = new Date()

    // Atualizar estudante
    const updatedStudent = await User.findByIdAndUpdate(
      id, 
      updateFields, 
      { new: true, runValidators: true }
    )

    if (!updatedStudent) {
      res.status(404).json({ message: "Aluno não encontrado." })
      return
    }

    // Salvar histórico se houver mudanças
    if (historyEntries.length > 0) {
      try {
        await Promise.all(historyEntries)
      } catch (historyError) {
        console.warn('⚠️ Erro ao salvar histórico:', historyError)
      }
    }

    // ✅ RECALCULAR DADOS COMBINADOS (se necessário)
    if (updateData.discordIds || updateData.classId !== undefined) {
      try {
        await recalculateCombinedData(id)
      } catch (recalcError) {
        console.warn('⚠️ Erro ao recalcular dados combinados:', recalcError)
      }
    }

    // ✅ RETORNAR DADOS COMPLETOS COM NOVA ESTRUTURA
    const pipeline: PipelineStage[] = [
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: "classes",
          localField: "classId",
          foreignField: "classId",
          as: "classInfo"
        }
      },
      { $unwind: { path: "$classInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          // ✅ ESTRUTURA COMPLETA SEGREGADA
          email: 1,
          name: 1,
          discord: 1,
          hotmart: 1,
          curseduca: 1,
          combined: 1,
          metadata: 1,
          
          // ✅ CAMPOS DERIVADOS
          className: { $ifNull: ["$classInfo.name", "$combined.className"] },
          
          // ✅ COMPATIBILIDADE COM FRONTEND ANTIGO
          discordIds: { $ifNull: ["$discord.discordIds", "$discordIds", []] },
          hotmartUserId: { $ifNull: ["$hotmart.hotmartUserId", "$hotmartUserId"] },
          curseducaUserId: { $ifNull: ["$curseduca.curseducaUserId", "$curseducaUserId"] },
          classId: { $ifNull: ["$combined.classId", "$classId"] },
          status: { $ifNull: ["$combined.status", "$status", "INACTIVE"] },
          engagement: {
            $cond: {
              if: { $ne: ["$hotmart.engagement.engagementLevel", null] },
              then: "$hotmart.engagement.engagementLevel",
              else: { $ifNull: ["$curseduca.engagement.engagementLevel", "$engagement", "NONE"] }
            }
          },
          engagementScore: {
            $cond: {
              if: { $ne: ["$hotmart.engagement.engagementScore", null] },
              then: "$hotmart.engagement.engagementScore",
              else: { $ifNull: ["$curseduca.engagement.alternativeEngagement", "$engagementScore", 0] }
            }
          },
          
          // ✅ CAMPOS LEGADOS
          role: 1,
          purchaseDate: { $ifNull: ["$hotmart.purchaseDate", "$purchaseDate"] },
          lastAccessDate: { $ifNull: ["$hotmart.progress.lastAccessDate", "$lastAccessDate"] },
          signupDate: { $ifNull: ["$hotmart.signupDate", "$signupDate"] },
          firstAccessDate: { $ifNull: ["$hotmart.firstAccessDate", "$firstAccessDate"] },
          locale: 1,
          plusAccess: { $ifNull: ["$hotmart.plusAccess", "$plusAccess"] },
          accessCount: {
            $cond: {
              if: { $ne: ["$hotmart.engagement.accessCount", null] },
              then: "$hotmart.engagement.accessCount",
              else: { $ifNull: ["$accessCount", 0] }
            }
          },
          type: 1,
          acceptedTerms: 1,
          estado: 1,
          timer: 1,
          createdAt: { $ifNull: ["$metadata.createdAt", "$createdAt"] },
          updatedAt: { $ifNull: ["$metadata.updatedAt", "$updatedAt"] },
          
          // ✅ PROGRESSO ESTRUTURADO
          progress: {
            $cond: {
              if: { $ne: ["$hotmart.progress", null] },
              then: {
                completedPercentage: { $ifNull: ["$hotmart.progress.completedPercentage", 0] },
                total: { $ifNull: ["$hotmart.progress.totalLessons", 0] },
                completed: { $ifNull: ["$hotmart.progress.completedLessons", 0] },
                totalTimeMinutes: { $ifNull: ["$hotmart.progress.totalTimeMinutes", 0] }
              },
              else: {
                $cond: {
                  if: { $ne: ["$curseduca.progress", null] },
                  then: {
                    completedPercentage: { $ifNull: ["$curseduca.progress.estimatedProgress", 0] },
                    total: 1,
                    completed: 0,
                    totalTimeMinutes: 0
                  },
                  else: { $ifNull: ["$progress", { completedPercentage: 0, total: 0, completed: 0 }] }
                }
              }
            }
          },
          
          // ✅ DADOS ESPECÍFICOS DAS PLATAFORMAS (para frontend novo)
          platformProgress: {
            hotmart: "$hotmart.progress",
            curseduca: "$curseduca.progress"
          },
          platformMetrics: {
            hotmart: "$hotmart.engagement",
            curseduca: "$curseduca.engagement"
          }
        }
      }
    ]

    const studentWithDetails = await User.aggregate(pipeline)
    res.status(200).json(studentWithDetails[0] || updatedStudent)

  } catch (error: any) {
    if (error.name === 'ValidationError') {
      res.status(400).json({ 
        message: "Dados inválidos.", 
        details: Object.values(error.errors).map((err: any) => err.message) 
      })
      return
    }
    
    res.status(500).json({ 
      message: "Erro ao atualizar aluno.", 
      details: error.message 
    })
  }
}
// 📊 ESTATÍSTICAS DO ALUNO
export const getStudentStats = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  try {
    const student = await User.findById(id)
    
    if (!student) {
      res.status(404).json({ message: "Aluno não encontrado." })
      return
    }

const stats = {
  hasEmail: !!(student as any).email,
  hasName: !!(student as any).name,
  hasDiscordIds: ((student as any).discordIds?.length || 0) > 0,
  totalDiscordIds: (student as any).discordIds?.length || 0,
  isActive: (student as any).status === 'ACTIVE',
  hasProgress: !!(student as any).progress?.completedPercentage,
  progressPercentage: (student as any).progress?.completedPercentage || 0,
  hasPurchaseDate: !!(student as any).purchaseDate,
  hasLastAccess: !!(student as any).lastAccessDate,
  daysSincePurchase: (student as any).purchaseDate 
    ? Math.floor((Date.now() - new Date((student as any).purchaseDate).getTime()) / (1000 * 60 * 60 * 24))
    : null,
  daysSinceLastAccess: (student as any).lastAccessDate
    ? Math.floor((Date.now() - new Date((student as any).lastAccessDate).getTime()) / (1000 * 60 * 60 * 24))
    : null,
  hasClass: !!(student as any).classId,
  classId: (student as any).classId,
  validationStatus: {
    email: !!(student as any).email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((student as any).email),
    discordIds: ((student as any).discordIds || []).every((discordId: string) => /^\d{17,19}$/.test(discordId)),
    name: !!(student as any).name && (student as any).name.trim().length > 0
  }
}

    res.status(200).json(stats)
  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro ao calcular estatísticas do aluno.", 
      details: error.message 
    })
  }
}


// 📋 HISTÓRICO DO ALUNO - CORRIGIDO PARA NOVA ESTRUTURA
export const getStudentHistory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const limit = parseInt(req.query.limit as string) || 50

  try {
    const student = await User.findById(id)
    if (!student) {
      res.status(404).json({ message: "Aluno não encontrado." })
      return
    }

    // Type assertion para aceder às propriedades
    const s = student as any;

    // ✅ BUSCAR HISTÓRICO USANDO EMAIL E ID (nova estrutura)
    let userHistory: any[] = []
    try {
      const UserHistory = require('../models/UserHistory').UserHistory
      
      userHistory = await UserHistory.find({
        $or: [
          { userId: new mongoose.Types.ObjectId(id) },
          { userEmail: s.email }
        ]
      })
      .sort({ changeDate: -1 })
      .limit(limit)
      .populate('syncId', 'startTime endTime status totalUsers source')
      .lean()
    } catch (userHistoryError) {
      console.warn('⚠️ UserHistory model não encontrado, continuando sem histórico de utilizador...')
    }

    // ✅ BUSCAR HISTÓRICO DE MUDANÇAS DE TURMA
    let classHistory: any[] = []
    try {
      classHistory = await StudentClassHistory.find({
        studentId: student._id
      })
      .sort({ dateMoved: -1 })
      .limit(20)
      .lean()
    } catch (classHistoryError) {
      console.warn('⚠️ Erro ao buscar histórico de turmas:', classHistoryError)
    }

    // ✅ BUSCAR HISTÓRICO DE SINCRONIZAÇÕES
    let syncHistory: any[] = []
    try {
      syncHistory = await SyncHistory.find({
        $or: [
          { "metadata.affectedEmails": s.email },
          { user: s.email }
        ]
      })
      .sort({ startedAt: -1 })
      .limit(10)
      .select('type startedAt completedAt status stats source')
      .lean()
    } catch (syncHistoryError) {
      console.warn('⚠️ Erro ao buscar histórico de sincronizações:', syncHistoryError)
    }

    // ✅ COMBINAR E ORGANIZAR HISTÓRICO
    const combinedHistory = [
      ...userHistory.map(h => ({
        ...h,
        type: 'user_change',
        date: h.changeDate,
        source: h.source || 'MANUAL'
      })),
      ...classHistory.map(h => ({
        ...h,
        type: 'class_change',
        date: h.dateMoved,
        source: 'MANUAL'
      })),
      ...syncHistory.map(h => ({
        ...h,
        type: 'sync',
        date: h.startedAt,
        source: h.source || h.type
      }))
    ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit)

    // ✅ ESTATÍSTICAS DO HISTÓRICO
    const historyStats = {
      totalItems: combinedHistory.length,
      userChanges: userHistory.length,
      classChanges: classHistory.length,
      syncEvents: syncHistory.length,
      lastActivity: combinedHistory.length > 0 ? combinedHistory[0].date : null
    }

    res.status(200).json({
      student: {
        id: student._id,
        email: s.email,
        name: s.name,
        // ✅ INCLUIR DADOS DAS PLATAFORMAS
        platforms: {
          discord: !!(s.discord?.discordIds?.length || s.discordIds?.length),
          hotmart: !!(s.hotmart?.hotmartUserId || s.hotmartUserId),
          curseduca: !!(s.curseduca?.curseducaUserId || s.curseducaUserId)
        }
      },
      history: combinedHistory,
      stats: historyStats,
      // ✅ HISTÓRICO SEPARADO POR TIPO (compatibilidade)
      userHistory,
      classHistory,
      syncHistory,
      total: combinedHistory.length
    })

  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro ao buscar histórico do aluno.", 
      details: error.message 
    })
  }
}


// 🔄 SINCRONIZAR ALUNO ESPECÍFICO
export const syncSpecificStudent = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  try {
    const student = await User.findById(id)
    
    if (!student) {
      res.status(404).json({ message: "Aluno não encontrado." })
      return
    }
    
    // Aqui implementaria a lógica de sincronização específica com Hotmart
    // Por agora, apenas confirma que o aluno existe
    
    res.status(200).json({ 
      message: "Sincronização específica iniciada para o aluno.",
      email: student.email 
    })
  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro ao sincronizar aluno.", 
      details: error.message 
    })
  }
}


// 🗑️ ELIMINAR ALUNO
export const deleteStudent = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { permanent = false } = req.query

  try {
    if (permanent === 'true') {
      // Eliminação permanente
      const deleted = await User.findByIdAndDelete(id)
      if (!deleted) {
        res.status(404).json({ message: "Aluno não encontrado." })
        return
      }

      // Remover histórico relacionado
      await StudentClassHistory.deleteMany({ studentId: id })

      res.status(200).json({ message: "Aluno eliminado permanentemente." })
    } else {
      // Soft delete - marcar como inativo
      const updated = await User.findByIdAndUpdate(
        id,
        { 
          status: 'BLOCKED',
          estado: 'inativo',
          updatedAt: new Date()
        },
        { new: true }
      )

      if (!updated) {
        res.status(404).json({ message: "Aluno não encontrado." })
        return
      }

      res.status(200).json({ 
        message: "Aluno marcado como inativo.",
        student: updated
      })
    }
  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro ao eliminar aluno.", 
      details: error.message 
    })
  }
}

// 🔧 GESTÃO DE IDS DIFERENTES
export const getIdsDiferentes = async (req: Request, res: Response): Promise<void> => {
  try {
    const idsDiferentes = await IdsDiferentes.find({}).sort({ detectedAt: -1 })
    res.json({ idsDiferentes })
  } catch (error: any) {
    res.status(500).json({ message: "Erro ao buscar IDs diferentes", details: error.message })
  }
}

export const mergeDiscordId = async (req: Request, res: Response): Promise<void> => {
  const { id, email, newDiscordId } = req.body;
  
  if (!email || !newDiscordId) {
    res.status(400).json({ message: "Dados incompletos." });
    return
  }

  try {
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, "i") } 
    });

    if (!user) {
      res.status(404).json({ message: "Utilizador não encontrado." });
      return
    }

    // Type assertion para aceder às propriedades
    const u = user as any;

    const discordIds = Array.isArray(u.discordIds) ? u.discordIds : [];
    const validIds = discordIds.filter((discordId: string) => discordId && discordId.trim() !== "");

    if (!validIds.includes(newDiscordId)) {
      u.discordIds = [...new Set([...validIds, newDiscordId])];
      await user.save();
    }

    if (id) {
      await IdsDiferentes.findByIdAndDelete(id);
    }

    res.status(200).json({ 
      message: "Merge concluído com sucesso.",
      user: {
        email: u.email,
        discordIds: u.discordIds
      }
    });

  } catch (error: any) {
    console.error("Erro no merge:", error);
    res.status(500).json({ 
      message: "Erro interno no merge", 
      details: error.message 
    });
  }
}

export const deleteIdsDiferentes = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const deleted = await IdsDiferentes.findByIdAndDelete(id)

    if (!deleted) {
      res.status(404).json({ message: "Registo não encontrado." })
      return
    }

    res.status(200).json({ message: "Registo removido com sucesso." })
  } catch (error: any) {
    res.status(500).json({ message: "Erro ao apagar registo.", details: error.message })
  }
}

// 🔧 GESTÃO DE UTILIZADORES NÃO CORRESPONDIDOS
export const getUnmatchedUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const unmatchedUsers = await UnmatchedUser.find({})
    res.status(200).json({ unmatchedUsers })
  } catch (error: any) {
    res.status(500).json({ message: "Erro ao buscar utilizadores não correspondidos", details: error.message })
  }
}

export const deleteUnmatchedUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const result = await UnmatchedUser.findByIdAndDelete(id)
    if (!result) {
      res.status(404).json({ message: "Utilizador não encontrado." })
      return
    }
    res.status(200).json({ message: "Utilizador apagado com sucesso." })
  } catch (error: any) {
    res.status(500).json({ message: "Erro ao apagar utilizador.", details: error.message })
  }
}

export const manualMatch = async (req: Request, res: Response): Promise<void> => {
  const { discordId, email } = req.body;
  
  if (!discordId || !email) {
    res.status(400).json({ message: "Discord ID e email são obrigatórios." });
    return
  }

  try {
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, "i") } 
    });

    if (!user) {
      res.status(404).json({ message: "Utilizador não encontrado no Hotmart." });
      return
    }

    // Type assertion para aceder às propriedades
    const u = user as any;

    const discordIds = Array.isArray(u.discordIds) ? u.discordIds : [];
    
    if (!discordIds.includes(discordId)) {
      u.discordIds = [...discordIds, discordId];
      await user.save();
    }

    await UnmatchedUser.deleteOne({ discordId, email });

    res.json({ 
      message: "Correspondência manual criada com sucesso.",
      user: {
        email: u.email,
        discordIds: u.discordIds,
        name: u.name
      }
    });

  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro na correspondência manual", 
      details: error.message 
    });
  }
}
// 🔧 OPERAÇÕES EM LOTE
export const bulkMergeIds = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "Lista de IDs é obrigatória." });
    return
  }

  try {
    let mergedCount = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const idDiferente = await IdsDiferentes.findById(id as string);
        if (!idDiferente) continue;

        const user = await User.findOne({ 
          email: { $regex: new RegExp(`^${idDiferente.email}$`, "i") } 
        });

        if (user) {
          // Type assertion para aceder às propriedades
          const u = user as any;
          
          const discordIds = Array.isArray(u.discordIds) ? u.discordIds : [];
          const validIds = discordIds.filter((discordId: string) => discordId && discordId.trim() !== "");

          if (validIds.length === 0) {
            u.discordIds = [idDiferente.newDiscordId];
            await user.save();
            await IdsDiferentes.findByIdAndDelete(id as string);
            mergedCount++;
          }
        }
      } catch (error: any) {
        errors.push(`Erro no ID ${id}: ${error.message}`);
      }
    }

    res.json({ 
      message: `${mergedCount} merges concluídos com sucesso.`,
      mergedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro no merge em lote", 
      details: error.message 
    });
  }
}

export const bulkDeleteIds = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "Lista de IDs é obrigatória." });
    return
  }

  try {
    const result = await IdsDiferentes.deleteMany({ _id: { $in: ids } });
    
    res.json({ 
      message: `${result.deletedCount} registos eliminados com sucesso.`,
      deletedCount: result.deletedCount
    });

  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro na eliminação em lote", 
      details: error.message 
    });
  }
}

export const bulkDeleteUnmatchedUsers = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "Lista de IDs é obrigatória." });
    return
  }

  try {
    const result = await UnmatchedUser.deleteMany({ _id: { $in: ids } });
    
    res.json({ 
      message: `${result.deletedCount} utilizadores não correspondidos eliminados.`,
      deletedCount: result.deletedCount
    });

  } catch (error: any) {
    res.status(500).json({ 
      message: "Erro na eliminação em lote", 
      details: error.message 
    });
  }
}
// src/controllers/users.controller.ts - PARTE 3/3 (final)

// 📂 SINCRONIZAÇÃO CSV
export const syncDiscordAndHotmart = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ message: "Nenhum ficheiro foi carregado." })
    return
  }

  const syncRecord = new SyncHistory({
    type: "csv",
    user: req.body.user || "system",
    metadata: {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      requestId: `csv-${Date.now()}`
    },
    status: "running"
  })

  await syncRecord.save()
  const filePath = path.resolve(req.file.path)

  try {
    console.log(`📦 [${syncRecord._id}] Vai usar estrutura SEGREGADA (discord.discordIds)`)
    
    // ✅ ETAPA 0: MIGRAÇÃO AUTOMÁTICA (discordIds root → discord.discordIds)
    console.log(`🔄 [${syncRecord._id}] Migrando estrutura antiga → nova...`)
    let migratedCount = 0
    
    try {
      const usersToMigrate = await User.find({
        discordIds: { $exists: true, $not: { $size: 0 } },
        $or: [
          { 'discord.discordIds': { $exists: false } },
          { 'discord.discordIds': { $size: 0 } }
        ]
      }).limit(5000) // Limitar para não sobrecarregar

      for (const user of usersToMigrate) {
        const u = user as any
        const oldIds = Array.isArray(u.discordIds) ? u.discordIds : []
        
        if (oldIds.length > 0) {
          await User.updateOne(
            { _id: user._id },
            { 
              $set: { 
                'discord.discordIds': oldIds,
                'discord.updatedAt': new Date()
              }
            }
          )
          migratedCount++
        }
      }
      
      console.log(`✅ [${syncRecord._id}] ${migratedCount} IDs migrados para nova estrutura`)
    } catch (migrationError: any) {
      console.warn(`⚠️ [${syncRecord._id}] Aviso na migração (continuando): ${migrationError.message}`)
    }

    // ✅ ETAPA 1: PROCESSAR CSV
    const workbook = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const data = XLSX.utils.sheet_to_json<ImportedUserRecord>(workbook.Sheets[sheetName], {
      raw: false,
      defval: ""
    })

    let added = 0, unmatched = 0, idsDiferentesCount = 0, errors = 0, updated = 0
    const errorDetails: string[] = []

    console.log(`🚀 [${syncRecord._id}] Processando ${data.length} registos do CSV...`)

    for (let i = 0; i < data.length; i++) {
      const record = data[i]
      
      try {
        const discordId = String(record["User ID"] || record["UserID"] || "").trim()
        const email = String(record["Qual o e-mail com que te inscreveste no curso?"] || record["Email"] || "").trim().toLowerCase()
        const username = String(record["Username"] || "").trim()
        const name = String(record["Qual o nome com que te inscreveste no curso?"] || "").trim()

        if (!email || !discordId) {
          unmatched++
          continue
        }

        const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })

        if (!user) {
          unmatched++
          await UnmatchedUser.create({ discordId, username, email, name })
          continue
        }

        // ✅ USAR ESTRUTURA NOVA (discord.discordIds)
        const u = user as any
        const currentIds = u.discord?.discordIds || []
        const uniqueIds = [...new Set(currentIds)]

        if (!uniqueIds.includes(discordId)) {
          // Detectar conflitos
          if (uniqueIds.length >= 1) {
            const already = await IdsDiferentes.findOne({ email, newDiscordId: discordId })
            if (!already) {
              await IdsDiferentes.create({ email, previousDiscordIds: uniqueIds, newDiscordId: discordId })
              idsDiferentesCount++
            }
          }

          // ✅ ATUALIZAR ESTRUTURA NOVA
          await User.updateOne(
            { _id: user._id },
            { 
              $set: {
                'discord.discordIds': [...new Set([...uniqueIds, discordId])],
                'discord.username': username || u.discord?.username,
                'discord.updatedAt': new Date(),
                email: email
              }
            }
          )
          
          if (uniqueIds.length === 0) {
            added++
          } else {
            updated++
          }
        }

        if (i % 50 === 0) {
          await SyncHistory.findByIdAndUpdate(syncRecord._id, {
            stats: {
              total: data.length,
              added,
              updated,
              conflicts: idsDiferentesCount,
              errors
            }
          })
        }

      } catch (recordError: any) {
        errors++
        errorDetails.push(`Registo ${i + 1}: ${recordError.message}`)
        console.error(`❌ [${syncRecord._id}] Erro no registo ${i + 1}:`, recordError.message)
      }
    }

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: "completed",
      completedAt: new Date(),
      stats: {
        total: data.length,
        added,
        updated,
        conflicts: idsDiferentesCount,
        errors,
        migrated: migratedCount
      },
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined
    })

    fs.unlinkSync(filePath)

    console.log(`✅ [${syncRecord._id}] Sincronização CSV concluída!`)
    console.log(`📊 Resultados: ${added} novos | ${updated} atualizados | ${migratedCount} migrados | ${unmatched} não correspondidos | ${idsDiferentesCount} conflitos | ${errors} erros`)

    res.json({ 
      message: "Sincronização concluída",
      syncId: syncRecord._id,
      stats: {
        addedDiscordIds: added,
        updatedDiscordIds: updated,
        migratedIds: migratedCount,
        unmatched, 
        idsDiferentes: idsDiferentesCount,
        errors
      }
    })

  } catch (error: any) {
    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: "failed",
      completedAt: new Date(),
      errorDetails: [error.message]
    })

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    console.error(`❌ [${syncRecord._id}] Erro na sincronização CSV:`, error.message)
    res.status(500).json({ 
      message: "Erro na sincronização CSV", 
      syncId: syncRecord._id,
      details: error.message 
    })
  }
}
    
/**
 * ✅ ENDPOINT OTIMIZADO: Infinite Loading de Utilizadores
 * Cursor-based pagination para performance máxima
 */
export const getUsersInfinite = async (req: Request, res: Response): Promise<any> => {
  try {
    const startTime = Date.now()
    
    // ✅ PARÂMETROS com validação e sanitização
    const cursor = req.query.cursor as string
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 50))
    const search = req.query.search?.toString().trim()
    const status = req.query.status as string
    const engagementLevel = req.query.engagementLevel as string
    const source = req.query.source as string
    const includePreCalculated = req.query.includePreCalculated === 'true'
    const forceRefresh = req.query.forceRefresh === 'true'

    // ✅ GERAR CACHE KEY única
    const cacheKey = cacheService.getCacheKey('users:infinite', {
      cursor,
      limit,
      search,
      status,
      engagementLevel,
      source,
      includePreCalculated
    })

    // ✅ VERIFICAR CACHE (se não for force refresh)
    if (!forceRefresh) {
      const cached: any = await cacheService.get(cacheKey)
      if (cached) {
        console.log(`📦 Cache hit: ${cacheKey.substring(0, 50)}...`)
        return res.status(200).json({
          ...cached,
          fromCache: true,
          cacheAge: Date.now() - ((cached && cached.cachedAt) || Date.now()),
          timestamp: new Date().toISOString()
        })
      }
    }

    console.log(`🔍 Infinite Users Query:`, {
      cursor: cursor ? `${cursor.slice(0, 8)}...` : 'none',
      limit,
      search: search || 'none',
      status: status || 'all',
      engagementLevel: engagementLevel || 'all',
      includePreCalculated,
      forceRefresh
    })

    // ✅ CAMPOS otimizados com seleção dinâmica
    const baseFields = {
      _id: 1,
      name: 1,
      email: 1,
      status: 1,
      estado: 1,
      className: 1  // Adicionado para o frontend
    }

    const conditionalFields = includePreCalculated ? {
      'preComputed.engagementScore': 1,
      'preComputed.activityLevel': 1,
      'preComputed.lastCalculated': 1
    } : {
      accessCount: 1,
      discordIds: 1,
      purchaseDate: 1,
      classId: 1,
      hotmartUserId: 1,
      curseducaUserId: 1,
      lastAccessDate: 1,
      engagement: 1,
      'progress.completedPercentage': 1,
      'progress.completed': 1,
      'progress.total': 1
    }

    const fields = { ...baseFields, ...conditionalFields }

    // ✅ CONSTRUIR PIPELINE de agregação (mais eficiente para queries complexas)
    const pipeline: any[] = []

    // Stage 1: Match básico com índices otimizados
    const matchStage: any = {
      $match: {
        $or: [
          { isDeleted: { $exists: false } },
          { isDeleted: false }
        ]
      }
    }

    // Cursor-based pagination
    if (cursor) {
      matchStage.$match._id = { $lt: cursor }
    }

    // Filtro de status (usar índice)
    if (status && status !== 'all') {
      if (status === 'active') {
        matchStage.$match.$and = matchStage.$match.$and || []
        matchStage.$match.$and.push({
          $or: [
            { status: 'ACTIVE' },
            { estado: { $in: ['ativo', 'active'] } }
          ]
        })
      } else if (status === 'inactive') {
        matchStage.$match.$and = matchStage.$match.$and || []
        matchStage.$match.$and.push({
          $and: [
            { status: { $ne: 'ACTIVE' } },
            { estado: { $nin: ['ativo', 'active'] } }
          ]
        })
      }
    }

    // Filtro de engagement (usar índice pre-computado)
    if (engagementLevel && engagementLevel !== 'all' && includePreCalculated) {
      matchStage.$match['preComputed.activityLevel'] = engagementLevel
    }

    // Filtro de source
    if (source && source !== 'all') {
      matchStage.$match.source = source
    }

    pipeline.push(matchStage)

    // Stage 2: Text search (se houver)
    if (search) {
      // Usar índice de texto se disponível
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { $text: { $search: search } }  // Usar índice de texto se existir
          ]
        }
      })
    }

    // Stage 3: Sort (usar índice)
    pipeline.push({ $sort: { _id: -1 } })

    // Stage 4: Limit
    pipeline.push({ $limit: limit + 1 })

    // Stage 5: Project (reduzir transferência de dados)
    pipeline.push({ $project: fields })

    // Stage 6: AddFields para campos calculados
    if (includePreCalculated) {
      pipeline.push({
        $addFields: {
          engagementScore: { $ifNull: ['$preComputed.engagementScore', 0] },
          activityLevel: { $ifNull: ['$preComputed.activityLevel', 'unknown'] },
          isPreComputed: { $ne: ['$preComputed.lastCalculated', null] }
        }
      })
    } else {
      pipeline.push({
        $addFields: {
          hasDiscord: {
            $and: [
              { $isArray: '$discordIds' },
              { $gt: [{ $size: '$discordIds' }, 0] }
            ]
          },
          hasHotmart: {
            $and: [
              { $ne: ['$hotmartUserId', null] },
              { $ne: ['$hotmartUserId', ''] }
            ]
          },
          hasCurseduca: {
            $and: [
              { $ne: ['$curseducaUserId', null] },
              { $ne: ['$curseducaUserId', ''] }
            ]
          }
        }
      })
    }

    // ✅ EXECUTAR AGREGAÇÃO com timeout
    const queryStartTime = Date.now()
    
    const users = await User.aggregate(pipeline)
      .allowDiskUse(true)  // Para queries grandes
      .option({ maxTimeMS: 30000 })  // Timeout 30s
      .exec()

    const queryTime = Date.now() - queryStartTime

    // ✅ VERIFICAR próxima página
    const hasMore = users.length > limit
    if (hasMore) {
      users.pop()
    }

    // ✅ OBTER CONTAGEM TOTAL (otimizada)
    let totalCount: number | undefined
    
    if (!cursor) {
      // Usar contagem estimada para melhor performance
      const countStartTime = Date.now()
      
      try {
        // Tentar usar contagem estimada primeiro (muito mais rápido)
      const collectionAny: any = User.collection as any
      const stats = typeof collectionAny.stats === 'function' ? await collectionAny.stats() : undefined
      const estimatedCount = stats?.count
        
        // Se a query tem filtros, fazer contagem exata
        if (search || (status && status !== 'all') || (engagementLevel && engagementLevel !== 'all')) {
          const countPipeline = [matchStage]
          if (search) {
            countPipeline.push({
              $match: {
                $or: [
                  { name: { $regex: search, $options: 'i' } },
                  { email: { $regex: search, $options: 'i' } }
                ]
              }
            })
          }
          countPipeline.push({ $count: 'total' })
          
          const countResult = await User.aggregate(countPipeline)
            .option({ maxTimeMS: 5000 })  // Timeout mais curto para contagem
            .exec()
          
          totalCount = countResult[0]?.total || 0
        } else {
          // Usar estimativa para queries sem filtros
          totalCount = estimatedCount
        }
      } catch (countError) {
        console.warn('⚠️ Falha na contagem, usando estimativa')
        totalCount = undefined  // Não incluir se falhar
      }
      
      const countTime = Date.now() - countStartTime
      console.log(`📊 Contagem: ${totalCount || 'skipped'} (${countTime}ms)`)
    }

    // ✅ PROCESSAR RESULTADOS
    const processedUsers = users.map((user: any) => ({
      _id: user._id,
      name: user.name || '',
      email: user.email || '',
      status: user.status || user.estado || 'unknown',
      estado: user.estado,
      className: user.className || '',
      
      // Campos condicionais
      ...(includePreCalculated ? {
        engagementScore: user.engagementScore || user.preComputed?.engagementScore || 0,
        activityLevel: user.activityLevel || user.preComputed?.activityLevel || 'unknown',
        isPreComputed: user.isPreComputed || false
      } : {
        accessCount: user.accessCount || 0,
        discordIds: user.discordIds || [],
        progress: user.progress || { completedPercentage: 0 },
        hasDiscord: user.hasDiscord || false,
        hasHotmart: user.hasHotmart || false,
        hasCurseduca: user.hasCurseduca || false,
        purchaseDate: user.purchaseDate,
        lastAccessDate: user.lastAccessDate
      })
    }))

    const totalTime = Date.now() - startTime

    // ✅ PREPARAR RESPOSTA
    const responseData = {
      success: true,
      users: processedUsers,
      hasMore,
      nextCursor: processedUsers.length > 0 ? processedUsers[processedUsers.length - 1]._id : null,
      ...(totalCount !== undefined && { totalCount }),
      meta: {
        limit,
        returned: processedUsers.length,
        preCalculated: includePreCalculated,
        performance: {
          totalTime,
          queryTime,
          fromCache: false
        }
      },
      cachedAt: Date.now()
    }

    // ✅ GUARDAR NO CACHE (assíncrono, não esperar)
    const cacheTTL = search ? 30 : 60  // TTL menor para pesquisas
    cacheService.set(cacheKey, responseData, cacheTTL).catch(err => {
      console.warn('⚠️ Falha ao guardar cache:', err.message)
    })

    // ✅ LOGS de performance
    console.log(`✅ Infinite query concluída:`, {
      returned: processedUsers.length,
      hasMore,
      totalCount: totalCount || 'not calculated',
      totalTime: `${totalTime}ms`,
      queryTime: `${queryTime}ms`,
      cached: false
    })

    // ✅ ENVIAR RESPOSTA
    res.status(200).json({
      ...responseData,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Erro no infinite loading:', error)
    
    // Log detalhado para debugging
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
      console.error('MongoDB Error Details:', {
        code: error.code,
        codeName: error.codeName,
        errmsg: error.errmsg
      })
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar utilizadores',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    })
  }
}


/**
 * ✅ ENDPOINT AUXILIAR: Limpar cache de utilizadores
 */
export const clearUsersCache = async (req: Request, res: Response): Promise<void> => {
  try {
    await cacheService.invalidatePattern('users:*')
    
    console.log('🧹 Cache de utilizadores limpo')
    
    res.status(200).json({
      success: true,
      message: 'Cache de utilizadores limpo com sucesso'
    })
  } catch (error: any) {
    console.error('❌ Erro ao limpar cache:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao limpar cache',
      error: error.message
    })
  }
}

/**
 * ✅ ENDPOINT AUXILIAR: Pré-aquecer cache
 */
export const warmupUsersCache = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔥 Iniciando warmup do cache...')
    
    // Queries comuns para pré-aquecer
    const commonQueries = [
      { limit: '50' },
      { limit: '50', status: 'active' },
      { limit: '50', includePreCalculated: 'true' }
    ]
    
    const warmupResults = []
    
    for (const queryParams of commonQueries) {
      try {
        // Gerar cache key
        const cacheKey = cacheService.getCacheKey('users:infinite', queryParams)
        
        // Verificar se já está em cache
        const existing = await cacheService.get(cacheKey)
        if (existing) {
          warmupResults.push({ query: queryParams, status: 'already_cached' })
          continue
        }
        
        // Construir query para MongoDB
        const limit = parseInt(queryParams.limit || '50')
        const matchQuery: any = {
          $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: false }
          ]
        }
        
        if (queryParams.status === 'active') {
          matchQuery.$and = [
            {
              $or: [
                { status: 'ACTIVE' },
                { estado: { $in: ['ativo', 'active'] } }
              ]
            }
          ]
        }
        
        // Buscar dados
        const users = await User.find(matchQuery)
          .limit(limit + 1)
          .sort({ _id: -1 })
          .lean()
        
        const hasMore = users.length > limit
        if (hasMore) users.pop()
        
        // Preparar dados para cache
        const cacheData = {
          success: true,
          users: users.slice(0, limit),
          hasMore,
          nextCursor: users.length > 0 ? users[users.length - 1]._id : null,
          meta: {
            limit,
            returned: users.length,
            preCalculated: queryParams.includePreCalculated === 'true'
          },
          cachedAt: Date.now()
        }
        
        // Guardar no cache
        await cacheService.set(cacheKey, cacheData, 60)
        warmupResults.push({ query: queryParams, status: 'cached' })
        
      } catch (err) {
        console.error(`⚠️ Erro ao aquecer query:`, queryParams, err)
        warmupResults.push({ query: queryParams, status: 'error' })
      }
    }
    
    console.log('✅ Cache warmup concluído:', warmupResults)
    
    res.status(200).json({
      success: true,
      message: 'Cache aquecido com sucesso',
      results: warmupResults,
      totalWarmed: warmupResults.filter(r => r.status === 'cached').length
    })
  } catch (error: any) {
    console.error('❌ Erro no warmup:', error)
    res.status(500).json({
      success: false,
      message: 'Erro no warmup do cache',
      error: error.message
    })
  }
}
/**
 * ✅ ENDPOINT AUXILIAR: Estatísticas rápidas para infinite loading
 */
export const getUsersInfiniteStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Calculando estatísticas para infinite loading...')
    
    // Agregação otimizada para estatísticas básicas
    const stats = await User.aggregate([
      {
        $match: {
          $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: false }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$status', 'ACTIVE'] },
                    { $in: ['$estado', ['ativo', 'active']] }
                  ]
                },
                1,
                0
              ]
            }
          },
          withEngagement: {
            $sum: {
              $cond: [
                { $ne: ['$engagementScore', null] },
                1,
                0
              ]
            }
          },
          withProgress: {
            $sum: {
              $cond: [
                { $gt: ['$progress.completedPercentage', 0] },
                1,
                0
              ]
            }
          }
        }
      }
    ])

    const result = stats[0] || {
      totalUsers: 0,
      activeUsers: 0,
      withEngagement: 0,
      withProgress: 0
    }

    res.status(200).json({
      success: true,
      stats: result,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Erro ao calcular estatísticas:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// Adicionar esta função ao users.controller.ts

export const getProductStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Calculando estatísticas de produtos...')
    
    // Buscar todos os utilizadores com campos necessários
    const users = await User.find(
      {
        $or: [
          { isDeleted: { $exists: false } },
          { isDeleted: false }
        ]
      },
      {
        _id: 1,
        className: 1,
        hotmartUserId: 1,
        curseducaUserId: 1,
        status: 1,
        estado: 1
      }
    ).lean()

    // Calcular estatísticas
    const stats = {
      total: users.length,
      grandeInvestimento: 0,
      relatoriosClareza: 0,
      ambos: 0,
      semProdutos: 0,
      hotmart: 0,
      curseduca: 0
    }

    users.forEach(user => {
      // Type assertion para aceder às propriedades
      const u = user as any;
      
      // Contar por produto
      const hasGrande = u.className?.toLowerCase().includes('grande investimento') || 
                        u.className?.toLowerCase().includes('grande_investimento')
      const hasRelatorios = u.className?.toLowerCase().includes('relatórios clareza') || 
                           u.className?.toLowerCase().includes('relatorios clareza')
      
      if (hasGrande) stats.grandeInvestimento++
      if (hasRelatorios) stats.relatoriosClareza++
      if (hasGrande && hasRelatorios) stats.ambos++
      if (!hasGrande && !hasRelatorios) stats.semProdutos++
      
      // Contar plataformas
      if (u.hotmartUserId && u.hotmartUserId.trim()) stats.hotmart++
      if (u.curseducaUserId && u.curseducaUserId.trim()) stats.curseduca++
    })

    console.log('✅ Estatísticas de produtos calculadas:', stats)

    res.status(200).json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Erro ao calcular estatísticas de produtos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas',
      error: error.message
    })
  }
}

// ===== MIDDLEWARE: Recalcular Dados Combinados =====

/**
 * ✅ FUNÇÃO HELPER: Recalcular dados combinados após update
 * Combina dados de todas as plataformas (Discord, Hotmart, CursEduca) numa estrutura unificada
 */
const recalculateCombinedData = async (userId: string): Promise<void> => {
  try {
    const user = await User.findById(userId)
    if (!user) {
      console.warn(`⚠️ Utilizador ${userId} não encontrado para recálculo`)
      return
    }

    // Type assertion para aceder às propriedades
    const u = user as any;

    // ✅ IDENTIFICAR FONTES DISPONÍVEIS
    const sourcesAvailable = []
    if (u.discord?.discordIds?.length || u.discordIds?.length) sourcesAvailable.push('discord')
    if (u.hotmart?.hotmartUserId || u.hotmartUserId) sourcesAvailable.push('hotmart')
    if (u.curseduca?.curseducaUserId || u.curseducaUserId) sourcesAvailable.push('curseduca')

    // ✅ STATUS COMBINADO (prioridade: Discord > Hotmart > CursEduca)
    let status = 'ACTIVE'
    if (u.discord?.isDeleted) {
      status = 'INACTIVE'
    } else if (u.curseduca?.memberStatus === 'INACTIVE') {
      status = 'INACTIVE'
    } else if (u.status === 'BLOCKED' || u.estado === 'inativo') {
      status = 'INACTIVE'
    }

    // ✅ PROGRESSO COMBINADO
    let totalProgress = 0
    let totalTimeMinutes = 0
    let totalLessons = 0
    let combinedEngagement = 0
    let bestEngagementSource = 'estimated'

    // Prioridade: Hotmart (dados reais) > CursEduca (estimados)
    if (u.hotmart?.progress) {
      totalTimeMinutes = u.hotmart.progress.totalTimeMinutes || 0
      totalLessons = u.hotmart.progress.completedLessons || 0
      // Calcular progresso baseado no tempo (assumindo 20h = 100%)
      totalProgress = Math.min((totalTimeMinutes / (20 * 60)) * 100, 100)
      combinedEngagement = u.hotmart.engagement?.engagementScore || 0
      bestEngagementSource = 'hotmart'
    } else if (u.curseduca?.progress) {
      totalProgress = u.curseduca.progress.estimatedProgress || 0
      combinedEngagement = u.curseduca.engagement?.alternativeEngagement || 0
      bestEngagementSource = 'curseduca'
    } else if (u.progress?.completedPercentage) {
      // Fallback para dados legados
      totalProgress = u.progress.completedPercentage
      totalLessons = u.progress.completed || 0
      combinedEngagement = u.engagementScore || 0
      bestEngagementSource = 'legacy'
    }

    // ✅ TURMA (prioridade: CursEduca > Hotmart > Legacy)
    let classId = null
    let className = null
    if (u.curseduca?.groupId) {
      classId = u.curseduca.groupId
      className = u.curseduca.groupName
    } else if (u.combined?.classId) {
      classId = u.combined.classId
      className = u.combined.className
    } else if (u.classId) {
      // Compatibilidade com estrutura legada
      classId = u.classId
      className = 'Turma Hotmart'
    }

    // ✅ QUALIDADE DOS DADOS
    let dataQuality = 'LIMITED'
    if (sourcesAvailable.length >= 2) {
      dataQuality = 'COMPLETE'
    } else if (sourcesAvailable.length === 1) {
      dataQuality = 'PARTIAL'
    }

    // ✅ ÚLTIMA ATIVIDADE
    const lastActivityDates = [
      u.hotmart?.progress?.lastAccessDate,
      u.lastAccessDate,
      u.metadata?.updatedAt,
      u.updatedAt
    ].filter(Boolean)

    const lastActivity = lastActivityDates.length > 0 
      ? new Date(Math.max(...lastActivityDates.map(d => new Date(d).getTime())))
      : new Date()

    // ✅ DADOS COMBINADOS FINAIS
    const combinedData = {
      status,
      totalProgress: Math.round(totalProgress * 100) / 100, // Arredondar para 2 casas decimais
      totalTimeMinutes,
      totalLessons,
      combinedEngagement: Math.round(combinedEngagement * 100) / 100,
      bestEngagementSource,
      classId,
      className,
      sourcesAvailable,
      dataQuality,
      lastActivity,
      calculatedAt: new Date()
    }

    // ✅ ATUALIZAR UTILIZADOR
    await User.findByIdAndUpdate(userId, { 
      combined: combinedData,
      "metadata.updatedAt": new Date()
    })

    console.log(`✅ Dados combinados recalculados para utilizador ${userId}:`, {
      sources: sourcesAvailable,
      status,
      progress: `${totalProgress.toFixed(1)}%`,
      engagement: `${combinedEngagement.toFixed(1)}`,
      bestSource: bestEngagementSource,
      dataQuality
    })

  } catch (error: any) {
    console.error(`❌ Erro ao recalcular dados combinados para ${userId}:`, error.message)
    throw error
  }
}

// 🆕 ENDPOINT: Obter todas as turmas de um utilizador (Hotmart + Curseduca)
export const getUserAllClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'ID de utilizador é obrigatório'
      })
      return
    }

    // Buscar utilizador
    const user = await User.findById(userId).lean()

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      })
      return
    }

    // ✅ Agregar turmas de todas as plataformas
    const allClasses: any[] = []

    // Turmas da Hotmart
    if (user.hotmart?.enrolledClasses && Array.isArray(user.hotmart.enrolledClasses)) {
      user.hotmart.enrolledClasses.forEach(cls => {
        allClasses.push({
          classId: cls.classId,
          className: cls.className,
          source: 'hotmart',
          isActive: cls.isActive,
          enrolledAt: cls.enrolledAt,
          role: 'student'
        })
      })
    }

    // Turmas da Curseduca
    if (user.curseduca?.enrolledClasses && Array.isArray(user.curseduca.enrolledClasses)) {
      user.curseduca.enrolledClasses.forEach(cls => {
        allClasses.push({
          classId: cls.classId,
          className: cls.className,
          source: 'curseduca',
          isActive: cls.isActive,
          enrolledAt: cls.enteredAt,
          expiresAt: cls.expiresAt,
          role: cls.role,
          curseducaId: cls.curseducaId,
          curseducaUuid: cls.curseducaUuid
        })
      })
    }

    // Turma primária (para compatibilidade)
    const primaryClass = user.combined?.primaryClass || null

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        email: user.email,
        name: user.name,
        allClasses,
        primaryClass,
        stats: {
          totalClasses: allClasses.length,
          activeClasses: allClasses.filter(c => c.isActive).length,
          hotmartClasses: allClasses.filter(c => c.source === 'hotmart').length,
          curseducaClasses: allClasses.filter(c => c.source === 'curseduca').length
        }
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar turmas do utilizador:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar turmas do utilizador',
      error: error.message
    })
  }
}