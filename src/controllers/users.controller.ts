// src/controllers/users.controller.ts - PARTE 1/3
import { Request, Response } from "express"
import User, { type IUser } from "../models/user"
import mongoose from "mongoose"
import SyncHistory, { type ISyncHistory } from "../models/SyncHistory"
import UserHistory, { type IUserHistory } from "../models/UserHistory"

import StudentClassHistory, { type IStudentClassHistory } from "../models/StudentClassHistory"
import { Class } from "../models/Class"
import { getRuntimeConfig } from "../config/runtimeConfig"
import { cacheService } from "../services/cache.service"
import { getUserCountsByPlatform, getUserCountsByProduct, getUserWithProducts } from "../services/userProducts/userProductService"
import { UserProduct } from "../models"
import type { IProduct } from "../models/product/Product"
import type { IUserProduct } from "../models/UserProduct"
import type {
  UsersDeleteStudentInput,
} from "../security/usersDestructiveInput"

type PipelineStage = mongoose.PipelineStage
type UserIdParams = { id: string }
type MongoFilter = Record<string, unknown>

interface UserListRecord {
  _id: mongoose.Types.ObjectId
  email?: string
  name?: string
  username?: string
  classId?: string
  className?: string
  status?: string
  estado?: string
  role?: string
  type?: string
  purchaseDate?: Date
  lastAccessDate?: Date
  acceptedTerms?: boolean
  plusAccess?: boolean
  hotmartUserId?: string
  curseducaUserId?: string
  discordIds?: string[]
  engagement?: string
  accessCount?: number
  progress?: { completedPercentage?: number }
  hotmart?: IUser['hotmart']
  curseduca?: IUser['curseduca']
  combined?: IUser['combined']
  preComputed?: {
    engagementScore?: number
    activityLevel?: string
  }
  engagementScore?: number
  activityLevel?: string
  isPreComputed?: boolean
  hasDiscord?: boolean
  hasHotmart?: boolean
  hasCurseduca?: boolean
}


type ProductSummary = Pick<IProduct, '_id' | 'name' | 'code' | 'platform'>

interface UserProductRecord {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  productId: mongoose.Types.ObjectId
  platform: IUserProduct['platform']
  status: IUserProduct['status']
  enrolledAt: Date
  isPrimary: boolean
  progress?: IUserProduct['progress']
  engagement?: IUserProduct['engagement']
  activeCampaignData?: IUserProduct['activeCampaignData']
}

interface PopulatedUserProductRecord extends Omit<UserProductRecord, 'productId'> {
  productId: ProductSummary
}

type UserTransformSource = Pick<
  IUser,
  | '_id'
  | 'email'
  | 'name'
  | 'discord'
  | 'hotmart'
  | 'curseduca'
  | 'combined'
  | 'metadata'
  | 'communicationByCourse'
> & {
  username?: string
  deletedAt?: Date
  deletedBy?: string
  tags?: string[]
  notes?: string
  source?: string
  type?: string
}

interface FrontendClass {
  classId: string
  className: string
  source: IUserProduct['platform']
  isActive: boolean
  enrolledAt?: Date
  role?: string
}

interface ActiveCampaignTagsView {
  productCode: string
  productName: string
  tags: string[]
  lastSyncAt?: Date
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

interface SyncHistoryResult {
  completedAt: Date
}
// 📋 LISTAGEM DE UTILIZADORES
// ✅ SUBSTITUIR A FUNÇÃO listUsers em src/controllers/users.controller.ts
interface CachedUsersData {
  success: boolean
  users: UserListRecord[]
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
    const matchStage: MongoFilter = {};
    
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

  } catch (error: unknown) {
    console.error("❌ Erro ao buscar utilizadores:", error);
    res.status(500).json({ 
      message: "Erro ao buscar utilizadores", 
      details: errorMessage(error)
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
    const query: MongoFilter = {
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

  } catch (error: unknown) {
    console.error('❌ Erro ao buscar utilizadores:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar utilizadores',
      error: errorMessage(error)
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
        { hotmartUserId: { $exists: true, $nin: [null, ""] } },
        { "hotmart.hotmartUserId": { $exists: true, $nin: [null, ""] } },
      ],
    },
    // E tem CursEduca
    {
      $or: [
        { curseducaUserId: { $exists: true, $nin: [null, ""] } },
        { "curseduca.curseducaUserId": { $exists: true, $nin: [null, ""] } },
      ],
    },
  ],
})
    
    // Apenas Hotmart (tem Hotmart MAS NÃO tem CursEduca)
const hotmartOnly = await User.countDocuments({
  ...baseQuery,
  $and: [
    // Tem Hotmart
    {
      $or: [
        { hotmartUserId: { $exists: true, $nin: [null, ""] } },
        { "hotmart.hotmartUserId": { $exists: true, $nin: [null, ""] } },
      ],
    },

    // MAS NÃO tem CursEduca
    {
      $and: [
        {
          $or: [
            { curseducaUserId: { $exists: false } },
            { curseducaUserId: null },
            { curseducaUserId: "" },
          ],
        },
        {
          $or: [
            { "curseduca.curseducaUserId": { $exists: false } },
            { "curseduca.curseducaUserId": null },
            { "curseduca.curseducaUserId": "" },
          ],
        },
      ],
    },
  ],
})
    // Apenas CursEduca (tem CursEduca MAS NÃO tem Hotmart)
const curseducaOnly = await User.countDocuments({
  ...baseQuery,
  $and: [
    // Tem CursEduca
    {
      $or: [
        { curseducaUserId: { $exists: true, $nin: [null, ""] } },
        { "curseduca.curseducaUserId": { $exists: true, $nin: [null, ""] } },
      ],
    },

    // MAS NÃO tem Hotmart
    {
      $and: [
        {
          $or: [
            { hotmartUserId: { $exists: false } },
            { hotmartUserId: null },
            { hotmartUserId: "" },
          ],
        },
        {
          $or: [
            { "hotmart.hotmartUserId": { $exists: false } },
            { "hotmart.hotmartUserId": null },
            { "hotmart.hotmartUserId": "" },
          ],
        },
      ],
    },
  ],
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

  } catch (error: unknown) {
    console.error('❌ [DASHBOARD] Erro ao buscar stats:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas',
      error: errorMessage(error)
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
  } catch (error: unknown) {
    console.error("Erro ao obter estatísticas:", error);
    res.status(500).json({ 
      message: "Erro ao obter estatísticas", 
      details: errorMessage(error)
    });
  }
}



/**
 * PUT /api/users/:id
 * Editar aluno (mantido)
 */
export const editStudent = async (req: Request<UserIdParams>, res: Response): Promise<void> => {
  const { id } = req.params
  const updateData = req.body

  try {
    const currentStudent = await User.findById(id)
    if (!currentStudent) {
      res.status(404).json({ message: "Aluno não encontrado" })
      return
    }

    const updateFields: mongoose.UpdateQuery<IUser> = {}

    if (updateData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(updateData.email)) {
        res.status(400).json({ message: "Email inválido" })
        return
      }
      updateFields.email = updateData.email
    }

    if (updateData.name) updateFields.name = updateData.name

    if (updateData.discordIds && Array.isArray(updateData.discordIds)) {
      const uniqueIds = [...new Set(updateData.discordIds)]
      updateFields["discord.discordIds"] = uniqueIds
      updateFields["discordIds"] = uniqueIds
    }

    updateFields["metadata.updatedAt"] = new Date()

    const updatedStudent = await User.findByIdAndUpdate(
      id, 
      updateFields, 
      { new: true, runValidators: true }
    )

    if (updateData.discordIds) {
      await recalculateCombinedData(id)
    }

    res.status(200).json(updatedStudent)

  } catch (error: unknown) {
    res.status(500).json({ message: "Erro ao atualizar aluno", details: errorMessage(error) })
  }
}
// 📊 ESTATÍSTICAS DO ALUNO
// 📋 HISTÓRICO DO ALUNO - CORRIGIDO PARA NOVA ESTRUTURA
export const getStudentHistory = async (req: Request<UserIdParams>, res: Response): Promise<void> => {
  const { id } = req.params
  const limit = parseInt(req.query.limit as string) || 50

  try {
    const student = await User.findById(id)
    if (!student) {
      res.status(404).json({ message: "Aluno não encontrado." })
      return
    }

    const legacyDiscordIds: unknown = student.get("discordIds")
    const legacyHotmartUserId: unknown = student.get("hotmartUserId")
    const legacyCurseducaUserId: unknown = student.get("curseducaUserId")

    // ✅ BUSCAR HISTÓRICO USANDO EMAIL E ID (nova estrutura)
    let userHistory: IUserHistory[] = []
    try {
      userHistory = await UserHistory.find({
        $or: [
          { userId: new mongoose.Types.ObjectId(id) },
          { userEmail: student.email }
        ]
      })
      .sort({ changeDate: -1 })
      .limit(limit)
      .populate('syncId', 'startTime endTime status totalUsers source')
      .lean<IUserHistory[]>()
    } catch (userHistoryError) {
      console.warn('⚠️ Erro ao buscar histórico do utilizador:', userHistoryError)
    }

    // ✅ BUSCAR HISTÓRICO DE MUDANÇAS DE TURMA
    let classHistory: IStudentClassHistory[] = []
    try {
      classHistory = await StudentClassHistory.find({
        studentId: student._id
      })
      .sort({ dateMoved: -1 })
      .limit(20)
      .lean<IStudentClassHistory[]>()
    } catch (classHistoryError) {
      console.warn('⚠️ Erro ao buscar histórico de turmas:', classHistoryError)
    }

    // ✅ BUSCAR HISTÓRICO DE SINCRONIZAÇÕES
    let syncHistory: ISyncHistory[] = []
    try {
      syncHistory = await SyncHistory.find({
        $or: [
          { "metadata.affectedEmails": student.email },
          { user: student.email }
        ]
      })
      .sort({ startedAt: -1 })
      .limit(10)
      .select('type startedAt completedAt status stats source')
      .lean<ISyncHistory[]>()
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
        source: h.type
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
        email: student.email,
        name: student.name,
        // ✅ INCLUIR DADOS DAS PLATAFORMAS
        platforms: {
          discord: !!(
            student.discord?.discordIds?.length ||
            (Array.isArray(legacyDiscordIds) && legacyDiscordIds.length)
          ),
          hotmart: !!(
            student.hotmart?.hotmartUserId ||
            (typeof legacyHotmartUserId === "string" && legacyHotmartUserId)
          ),
          curseduca: !!(
            student.curseduca?.curseducaUserId ||
            (typeof legacyCurseducaUserId === "string" && legacyCurseducaUserId)
          )
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

  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro ao buscar histórico do aluno.", 
      details: errorMessage(error)
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
  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro ao sincronizar aluno.", 
      details: errorMessage(error)
    })
  }
}


/**
 * DELETE /api/users/:id
 * Eliminar aluno (mantido)
 */
export const deleteStudent = async (input: UsersDeleteStudentInput, res: Response): Promise<void> => {
  const { id } = input.params
  const { permanent = 'false' } = input.query

  try {
    if (permanent === 'true') {
      const deleted = await User.findByIdAndDelete(id)
      if (!deleted) {
        res.status(404).json({ message: "Aluno não encontrado" })
        return
      }
      await StudentClassHistory.deleteMany({ studentId: id })
      res.status(200).json({ message: "Aluno eliminado permanentemente" })
    } else {
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
        res.status(404).json({ message: "Aluno não encontrado" })
        return
      }
      res.status(200).json({ message: "Aluno marcado como inativo", student: updated })
    }
  } catch (error: unknown) {
    res.status(500).json({ message: "Erro ao eliminar aluno", details: errorMessage(error) })
  }
}
/**
 * ✅ ENDPOINT OTIMIZADO: Infinite Loading de Utilizadores
 * Cursor-based pagination para performance máxima
 */
export const getUsersInfinite = async (req: Request, res: Response): Promise<void> => {
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
      const cached = await cacheService.get<CachedUsersData>(cacheKey)
      if (cached) {
        console.log(`📦 Cache hit: ${cacheKey.substring(0, 50)}...`)
        res.status(200).json({
          ...cached,
          fromCache: true,
          cacheAge: Date.now() - ((cached && cached.cachedAt) || Date.now()),
          timestamp: new Date().toISOString()
        })
        return
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
    const pipeline: PipelineStage[] = []

    // Stage 1: Match básico com índices otimizados
    const matchStage: mongoose.PipelineStage.Match = {
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
    
    const users = await User.aggregate<UserListRecord>(pipeline)
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
      const estimatedCount = await User.estimatedDocumentCount()
        
        // Se a query tem filtros, fazer contagem exata
        if (search || (status && status !== 'all') || (engagementLevel && engagementLevel !== 'all')) {
          const countPipeline: PipelineStage[] = [matchStage]
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
    const processedUsers = users.map(user => ({
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

  } catch (error: unknown) {
    console.error('❌ Erro no infinite loading:', error)
    
    // Log detalhado para debugging
    if (
      isRecord(error)
      && (error.name === 'MongoError' || error.name === 'MongooseError')
    ) {
      console.error('MongoDB Error Details:', {
        code: error.code,
        codeName: error.codeName,
        errmsg: error.errmsg
      })
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar utilizadores',
      error: getRuntimeConfig().core.nodeEnv === 'development' ? errorMessage(error) : 'Internal server error',
      timestamp: new Date().toISOString()
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

  } catch (error: unknown) {
    console.error('❌ Erro ao calcular estatísticas:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error)
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
    ).lean<UserListRecord[]>()

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
      const u = user
      
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

  } catch (error: unknown) {
    console.error('❌ Erro ao calcular estatísticas de produtos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas',
      error: errorMessage(error)
    })
  }
}

// ===== MIDDLEWARE: Recalcular Dados Combinados =====

/**
 * Recalcular dados combinados após update
 */
const recalculateCombinedData = async (userId: string): Promise<void> => {
  try {
    const user = await User.findById(userId)
    if (!user) return

    const sourcesAvailable = []
    if (user.discord?.discordIds?.length) sourcesAvailable.push('discord')
    if (user.hotmart?.hotmartUserId) sourcesAvailable.push('hotmart')
    if (user.curseduca?.curseducaUserId) sourcesAvailable.push('curseduca')

    let status = 'ACTIVE'
    if (user.discord?.isDeleted) status = 'INACTIVE'
    else if (user.curseduca?.memberStatus === 'INACTIVE') status = 'INACTIVE'

    let totalProgress = 0
    let combinedEngagement = 0
    let bestEngagementSource = 'estimated'

    if (user.hotmart?.progress) {
      const totalTimeMinutes = user.hotmart.progress.totalTimeMinutes || 0
      totalProgress = Math.min((totalTimeMinutes / (20 * 60)) * 100, 100)
      combinedEngagement = user.hotmart.engagement?.engagementScore || 0
      bestEngagementSource = 'hotmart'
    } else if (user.curseduca?.progress) {
      totalProgress = user.curseduca.progress.estimatedProgress || 0
      combinedEngagement = user.curseduca.engagement?.alternativeEngagement || 0
      bestEngagementSource = 'curseduca'
    }

    const combinedData = {
      status,
      totalProgress: Math.round(totalProgress * 100) / 100,
      combinedEngagement: Math.round(combinedEngagement * 100) / 100,
      bestEngagementSource,
      sourcesAvailable,
      calculatedAt: new Date()
    }

    await User.findByIdAndUpdate(userId, { 
      combined: combinedData,
      "metadata.updatedAt": new Date()
    })

  } catch (error: unknown) {
    console.error(`❌ Erro ao recalcular dados combinados para ${userId}:`, errorMessage(error))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 LISTAGEM DE UTILIZADORES (V2 - COM USERPRODUCTS)
// ═


/**
 * GET /api/users/v2/:id
 * ✅ NOVO: Busca user com todos os UserProducts
 */

/**
 * GET /api/users/v2/by-email/:email
 * ✅ NOVO: Busca user por email com UserProducts
 */
export const getUserByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.params
    
    const user = await User.findOne({ email }).lean()
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    const enriched = await getUserWithProducts(user._id.toString())
    res.json({ success: true, data: enriched })
  } catch (error: unknown) {
    console.error('❌ Erro em getUserByEmail:', error)
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 ESTATÍSTICAS (CONSOLIDADO)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/users/v2/stats
 * ✅ CONSOLIDADO: Merge de getUserStats + getUsersStats
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    console.log('📊 Calculando estatísticas...')
    
    const baseQuery = { isDeleted: { $ne: true } }
    
    // Total de users
    const totalUsers = await User.countDocuments(baseQuery)
    
    // Users ativos
    const activeUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'combined.status': 'ACTIVE' },
        { status: 'ACTIVE' }
      ]
    })
    
    // ✅ Estatísticas por plataforma (via UserProducts)
    const byPlatform = await getUserCountsByPlatform()
    const byProduct = await getUserCountsByProduct()
    
    // ✅ Engagement via agregação
    const engagementAgg = await User.aggregate([
      { $match: baseQuery },
      {
        $project: {
          score: {
            $ifNull: [
              '$combined.combinedEngagement',
              { $ifNull: ['$hotmart.engagement.engagementScore', 0] }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
          topPerformers: { $sum: { $cond: [{ $gte: ['$score', 50] }, 1, 0] } },
          needsAttention: { $sum: { $cond: [{ $lt: ['$score', 30] }, 1, 0] } }
        }
      }
    ])
    
    const engStats = engagementAgg[0] || {
      avgScore: 0,
      topPerformers: 0,
      needsAttention: 0
    }
    
    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        averageEngagement: Math.round(engStats.avgScore * 100) / 100,
        topPerformersCount: engStats.topPerformers,
        needsAttentionCount: engStats.needsAttention,
        byPlatform,
        byProduct
      }
    })
    
  } catch (error: unknown) {
    console.error('❌ Erro em getStats:', error)
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}
export const getUsersStats = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    
    // Contar users por plataforma (usando agregação V2)
    const usersByPlatform = await getUserCountsByPlatform();
    
    // Contar users por produto
    const usersByProduct = await getUserCountsByProduct();
    
    res.json({ 
      success: true, 
      data: {
        totalUsers,
        byPlatform: usersByPlatform,
        byProduct: usersByProduct
      },
      _v2Enabled: true 
    });
  } catch (error: unknown) {
    console.error('Error in getUsersStats:', error);
    res.status(500).json({ success: false, error: errorMessage(error) });
  }
};


/**
 * Transforma dados segregados do modelo User para formato retrocompatível com o frontend
 */
function transformUserForFrontend(
  user: UserTransformSource,
  userProductsMap?: Map<string, PopulatedUserProductRecord[]>,
) {
  // Campos base sempre presentes
  const transformed = {
    _id: user._id,
    email: user.email,
    name: user.name,

    // Mapear discord.discordIds -> discordIds (retrocompatibilidade)
    discordIds: user.discord?.discordIds || [],

    // Mapear combined.status -> status (retrocompatibilidade)
    status: (user.combined?.status === 'INACTIVE' || user.discord?.isDeleted) ? 'INACTIVE' : 'ACTIVE',

    // Mapear discord.role -> role (retrocompatibilidade)
    role: user.discord?.role || 'STUDENT',

    // Campos opcionais do Discord
    acceptedTerms: user.discord?.acceptedTerms || false,
    isDeletable: user.discord?.isDeletable !== false,
    priority: user.discord?.priority || 'MEDIUM',
    locale: user.discord?.locale || 'pt_BR',

    // Campos da Hotmart
    hotmartUserId: user.hotmart?.hotmartUserId,
    purchaseDate: user.hotmart?.purchaseDate,
    signupDate: user.hotmart?.signupDate,
    plusAccess: user.hotmart?.plusAccess,
    firstAccessDate: user.hotmart?.firstAccessDate,
    lastAccessDate: user.hotmart?.lastAccessDate || user.hotmart?.progress?.lastAccessDate || user.curseduca?.lastLogin || user.curseduca?.lastAccess,

    // Campos da Curseduca
    curseducaUserId: user.curseduca?.curseducaUserId,

    // Progresso combinado
    progress: user.combined ? {
      completedPercentage: user.combined.totalProgress || 0,
      total: user.combined.totalLessons || 0,
      completed: Math.round((user.combined.totalProgress / 100) * (user.combined.totalLessons || 0)),
      lastUpdated: user.hotmart?.lastAccessDate || user.hotmart?.progress?.lastAccessDate || user.curseduca?.lastLogin || user.curseduca?.lastAccess
    } : undefined,

    // Engagement combinado
    engagement: user.combined?.engagement?.level || 'NONE',
    engagementScore: user.combined?.engagement?.score || 0,
    engagementLevel: user.combined?.engagement?.level,
    engagementCalculatedAt: user.combined?.calculatedAt,

    // Turma (retrocompatibilidade)
    classId: user.combined?.classId,
    className: user.combined?.className,

    // Turmas combinadas (novo) - agregar de UserProducts
    combined: (() => {
      const allClasses: FrontendClass[] = [...(user.combined?.allClasses || [])]
      const baseCombined = {
        ...user.combined,
        allClasses,
        primaryClass: user.combined?.primaryClass
      }

      // Se temos UserProducts, agregar turmas adicionais
      if (userProductsMap) {
        const userId = user._id.toString()
        const userProducts = userProductsMap.get(userId) || []

        // Adicionar cada UserProduct como uma "turma" virtual baseada no produto
        userProducts.forEach(up => {
          const productCode = up.productId?.code || 'UNKNOWN'
          const productName = up.productId?.name || 'Produto Desconhecido'

          // Verificar se já existe uma classe com este produto
          const existingClass = baseCombined.allClasses.find(
            currentClass => currentClass.classId === productCode
              || currentClass.className.includes(productName)
          )

          if (!existingClass) {
            baseCombined.allClasses.push({
              classId: productCode,
              className: productName,
              source: up.platform,
              isActive: up.status === 'ACTIVE',
              enrolledAt: up.enrolledAt,
              role: 'student'
            })
          }
        })
      }

      return baseCombined
    })(),

    // Performance metrics
    performanceMetrics: user.hotmart?.engagement ? {
      dailyAccess: 0, // TODO: calcular se necessário
      weeklyAccess: 0,
      monthlyAccess: 0
    } : undefined,

    accessCount: user.hotmart?.engagement?.accessCount || 0,

    // Metadados
    lastActivityAt: user.combined?.lastActivity,
    lastEditedAt: user.discord?.lastEditedAt,
    lastEditedBy: user.discord?.lastEditedBy,
    createdAt: user.metadata?.createdAt || user.discord?.createdAt,
    updatedAt: user.metadata?.updatedAt,

    // Campos adicionais que podem existir
    username: user.username,
    estado: user.combined?.status === 'ACTIVE' ? 'ativo' : 'inativo',
    timer: user.combined?.totalTimeMinutes || 0,
    isDeleted: user.discord?.isDeleted || false,
    deletedAt: user.deletedAt,
    deletedBy: user.deletedBy,
    tags: user.tags,
    notes: user.notes,
    source: user.source,
    type: user.type,

    // Tags do ActiveCampaign por produto (de UserProduct)
    acTagsByProduct: (() => {
      const userId = user._id.toString()
      const userProducts = userProductsMap ? (userProductsMap.get(userId) || []) : []

      const acc = userProducts.reduce<Record<string, ActiveCampaignTagsView>>((tagsByProduct, up) => {
        if (up.activeCampaignData?.tags && up.activeCampaignData.tags.length > 0) {
          const productCode = up.productId?.code || up.productId?._id?.toString() || 'UNKNOWN'
          const productName = up.productId?.name || 'Produto Desconhecido'

          tagsByProduct[productCode] = {
            productCode,
            productName,
            tags: up.activeCampaignData.tags,
            lastSyncAt: up.activeCampaignData.lastSyncAt
          }
        }
        return tagsByProduct
      }, {})

      const testimonialData = user.communicationByCourse?.get('TESTIMONIALS')
      const testimonialTags = testimonialData?.currentTags || []

      if (testimonialTags.length > 0) {
        acc.TESTIMONIALS = {
          productCode: 'TESTIMONIALS',
          productName: 'Testemunhos',
          tags: testimonialTags,
          lastSyncAt: testimonialData?.lastTagAppliedAt
        }
      }

      return acc
    })(),
  }

  return transformed
}

/**
 * GET /api/users/search
 * Pesquisar aluno por email, nome, discordId, hotmartUserId ou curseducaUserId
 */
export const searchStudent = async (req: Request, res: Response): Promise<void> => {
  const { email, name, discordId, hotmartUserId, curseducaUserId } = req.query

  if (!email && !name && !discordId && !hotmartUserId && !curseducaUserId) {
    res.status(400).json({
      message: "Pelo menos um critério de pesquisa é necessário (email, name, discordId, hotmartUserId, ou curseducaUserId)."
    })
    return
  }

  try {
    const matchConditions: MongoFilter = {}
    const platformConditions: MongoFilter[] = []
    
    if (email && typeof email === "string") {
      matchConditions.email = { $regex: new RegExp(email, "i") }
    }
    
    if (name && typeof name === "string") {
      matchConditions.name = { $regex: new RegExp(name, "i") }
    }
    
    if (discordId && typeof discordId === "string") {
      platformConditions.push(
        { "discord.discordIds": { $in: [discordId] } },
        { "discordIds": { $in: [discordId] } }
      )
    }

    if (hotmartUserId && typeof hotmartUserId === "string") {
      platformConditions.push(
        { "hotmart.hotmartUserId": hotmartUserId },
        { "hotmartUserId": hotmartUserId }
      )
    }

    if (curseducaUserId && typeof curseducaUserId === "string") {
      platformConditions.push(
        { "curseduca.curseducaUserId": curseducaUserId },
        { "curseducaUserId": curseducaUserId }
      )
    }

    if (platformConditions.length > 0) {
      matchConditions.$or = platformConditions
    }

    const students = await User.find(matchConditions)
      .select('email name hotmart curseduca discord combined status metadata username tags notes source type deletedAt deletedBy communicationByCourse')
      .lean<UserTransformSource[]>()

    if (!students.length) {
      res.status(404).json({ message: "Nenhum aluno encontrado com os critérios fornecidos." })
      return
    }

    // Buscar TODOS os UserProducts para agregar turmas e tags
    const userIds = students.map(s => s._id)
    const allUserProducts = await UserProduct.find({
      userId: { $in: userIds }
    })
      .populate('productId', 'code name')
      .select('userId productId platform status classes enrolledAt isPrimary activeCampaignData')
      .lean<PopulatedUserProductRecord[]>()

    // Criar map de userId -> UserProducts para passar ao transformer
    const userProductsMap = new Map<string, PopulatedUserProductRecord[]>()
    allUserProducts.forEach(up => {
      const userId = up.userId.toString()
      if (!userProductsMap.has(userId)) {
        userProductsMap.set(userId, [])
      }
      userProductsMap.get(userId)!.push(up)
    })

    // Transformar dados para formato retrocompatível
    const transformedStudents = students.map(s => transformUserForFrontend(s, userProductsMap))

    if (transformedStudents.length > 1) {
      res.status(200).json({
        message: `Encontrados ${transformedStudents.length} alunos`,
        students: transformedStudents,
        multiple: true
      })
      return
    }

    res.status(200).json(transformedStudents[0])
  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro ao buscar aluno.", 
      details: errorMessage(error)
    })
  }
}
