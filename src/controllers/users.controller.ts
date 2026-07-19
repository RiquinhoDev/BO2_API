// src/controllers/users.controller.ts - PARTE 1/3
import { NextFunction, Request, RequestHandler, Response } from "express"
import User, { type IUser } from "../models/user"
import IdsDiferentes from "../models/IdsDiferentes"
import UnmatchedUser from "../models/UnmatchedUser"
import mongoose from "mongoose"
import SyncHistory, { type ISyncHistory } from "../models/SyncHistory"
import UserHistory, { type IUserHistory } from "../models/UserHistory"

import StudentClassHistory, { type IStudentClassHistory } from "../models/StudentClassHistory"
import { Class } from "../models/Class"
import { cacheService } from "../services/cache.service"
import { getUserCountsByPlatform, getUserCountsByProduct, getUsersForProduct, getUserWithProducts } from "../services/userProducts/userProductService"
import { UserProduct } from "../models"
import Product, { type IProduct } from "../models/product/Product"
import type { IUserProduct } from "../models/UserProduct"
import { readImportedUsers } from "../services/importedUsersWorkbook"
import { withUploadedFileCleanup } from "../security/usersImportUpload"
import { HttpError } from "../security/errorHandling"
import { ensureUsersV2Products } from "../contracts/usersV2"
import type {
  UsersBulkDeleteInput,
  UsersDeleteByIdInput,
  UsersDeleteStudentInput,
} from "../security/usersDestructiveInput"

export {
  getIdsDiferentes,
  getUnmatchedUsers,
} from "./usersReviewLists.controller"


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

interface UserClassView {
  classId: string
  className: string
  source: 'hotmart' | 'curseduca'
  isActive: boolean
  enrolledAt?: Date
  expiresAt?: Date
  role?: string
  curseducaId?: string
  curseducaUuid?: string
}

type UserSummary = Pick<UserListRecord, '_id' | 'name' | 'email' | 'combined'>
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

interface UserIdFacet {
  total: Array<{ count: number }>
  data: Array<{ _id: mongoose.Types.ObjectId }>
}

interface UserProductResponse {
  _id: mongoose.Types.ObjectId
  userId: {
    _id: mongoose.Types.ObjectId
    name?: string
    email?: string
    averageEngagement: number
    averageEngagementLevel: string
  }
  productId: ProductSummary | mongoose.Types.ObjectId
  platform: IUserProduct['platform']
  status: IUserProduct['status']
  enrolledAt: Date
  isPrimary: boolean
  progress: {
    percentage: number
    progressPercentage: number
    lastActivity?: Date
  }
  engagement: {
    score: number
    level: string
    lastAction?: Date
  }
  averageEngagement: number
  averageEngagementLevel: string
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

function engagementLevelFromScore(score: number): string {
  if (score >= 80) return 'MUITO_ALTO'
  if (score >= 60) return 'ALTO'
  if (score >= 40) return 'MEDIO'
  if (score >= 20) return 'BAIXO'
  if (score > 0) return 'MUITO_BAIXO'
  return 'NONE'
}

function validDiscordIds(user: IUser): string[] {
  return (user.discord?.discordIds || []).filter(discordId => discordId.trim() !== '')
}

async function persistDiscordIds(user: IUser, discordIds: string[]): Promise<void> {
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        'discord.discordIds': discordIds,
        'discord.lastEditedAt': new Date(),
      },
    },
  )
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

  const baseFilter: MongoFilter = {
    $or: [
      { isDeleted: { $exists: false } },
      { isDeleted: false }
    ]
  }

  let statusFilter: MongoFilter = {}
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
      .lean<UserListRecord[]>() // ✅ USAR LEAN() para melhor performance
      .maxTimeMS(120000); // 2 minutos timeout

      // ✅ LOOKUP SEPARADO E OTIMIZADO para className (opcional)
const classIds = [...new Set(
  users
    .map(user => user.classId)
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
)];

const classMap: Record<string, string> = {};

if (classIds.length > 0 && classIds.length < 1000) {
  try {
    const db = mongoose.connection.db
    if (db) {
      const classes = await db.collection('classes')
        .find({ classId: { $in: classIds } })
        .project({ classId: 1, name: 1 })
        .toArray();

      for (const classRecord of classes) {
        if (typeof classRecord.classId === 'string' && typeof classRecord.name === 'string') {
          classMap[classRecord.classId] = classRecord.name
        }
      }
    }
  } catch (classError) {
    console.warn('⚠️ Erro ao carregar classes, continuando sem nomes...');
  }
}

// ✅ MAPEAR PARA ESTRUTURA COMPATÍVEL
const usersWithClassName = users.map(user => {
  const u = user
  
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
  const curseducaProgress = u.curseduca?.progress?.estimatedProgress || 0
  
  // Usar Combined se disponível, senão usar da plataforma principal
  const finalEngagement = u.combined?.engagement?.level || 
                         hotmartEngagement || 
                         curseducaEngagement || 
                         u.engagement || 
                         'NONE'
                         
  const finalAccessCount = hotmartAccessCount || 
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
    className: u.classId ? classMap[u.classId] || null : null,
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
      ...(actualLimit > 0 ? [{ $limit: actualLimit }] : []),
      
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

  } catch (error: unknown) {
    console.error(" Erro em listUsersSimple:", {
      message: errorMessage(error),
      stack: errorStack(error)?.slice(0, 500),
      params: { page: pageNum, limit: limitNum }
    });

    res.status(500).json({ 
      message: "Erro ao buscar utilizadores", 
      details: errorMessage(error),
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
export const getStudentStats = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  try {
    const student = await User.findById(id)
    
    if (!student) {
      res.status(404).json({ message: "Aluno não encontrado." })
      return
    }

const discordIds = student.discord?.discordIds || []
const progressPercentage = student.combined?.totalProgress || 0
const purchaseDate = student.hotmart?.purchaseDate
const lastAccessDate = student.combined?.lastActivity
  || student.hotmart?.lastAccessDate
  || student.curseduca?.lastAccess
const classId = student.combined?.classId || student.classId

const stats = {
  hasEmail: !!student.email,
  hasName: !!student.name,
  hasDiscordIds: discordIds.length > 0,
  totalDiscordIds: discordIds.length,
  isActive: student.combined?.status === 'ACTIVE',
  hasProgress: progressPercentage > 0,
  progressPercentage,
  hasPurchaseDate: !!purchaseDate,
  hasLastAccess: !!lastAccessDate,
  daysSincePurchase: purchaseDate
    ? Math.floor((Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24))
    : null,
  daysSinceLastAccess: lastAccessDate
    ? Math.floor((Date.now() - new Date(lastAccessDate).getTime()) / (1000 * 60 * 60 * 24))
    : null,
  hasClass: !!classId,
  classId,
  validationStatus: {
    email: !!student.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email),
    discordIds: discordIds.every(discordId => /^\d{17,19}$/.test(discordId)),
    name: !!student.name && student.name.trim().length > 0
  }
}

    res.status(200).json(stats)
  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro ao calcular estatísticas do aluno.", 
      details: errorMessage(error)
    })
  }
}


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

    const currentIds = validDiscordIds(user)
    let mergedIds = currentIds

    if (!currentIds.includes(newDiscordId)) {
      mergedIds = [...new Set([...currentIds, newDiscordId])]
      await persistDiscordIds(user, mergedIds)
    }

    if (id) {
      await IdsDiferentes.findByIdAndDelete(id);
    }

    res.status(200).json({ 
      message: "Merge concluído com sucesso.",
      user: {
        email: user.email,
        discordIds: mergedIds
      }
    });

  } catch (error: unknown) {
    console.error("Erro no merge:", error);
    res.status(500).json({ 
      message: "Erro interno no merge", 
      details: errorMessage(error)
    });
  }
}

export const deleteIdsDiferentes = async (input: UsersDeleteByIdInput, res: Response): Promise<void> => {
  const { id } = input.params
  try {
    const deleted = await IdsDiferentes.findByIdAndDelete(id)

    if (!deleted) {
      res.status(404).json({ message: "Registo não encontrado." })
      return
    }

    res.status(200).json({ message: "Registo removido com sucesso." })
  } catch (error: unknown) {
    res.status(500).json({ message: "Erro ao apagar registo.", details: errorMessage(error) })
  }
}

export const deleteUnmatchedUser = async (input: UsersDeleteByIdInput, res: Response): Promise<void> => {
  const { id } = input.params
  try {
    const result = await UnmatchedUser.findByIdAndDelete(id)
    if (!result) {
      res.status(404).json({ message: "Utilizador não encontrado." })
      return
    }
    res.status(200).json({ message: "Utilizador apagado com sucesso." })
  } catch (error: unknown) {
    res.status(500).json({ message: "Erro ao apagar utilizador.", details: errorMessage(error) })
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

    const discordIds = validDiscordIds(user)
    let mergedIds = discordIds
    
    if (!discordIds.includes(discordId)) {
      mergedIds = [...discordIds, discordId]
      await persistDiscordIds(user, mergedIds)
    }

    await UnmatchedUser.deleteOne({ discordId, email });

    res.json({ 
      message: "Correspondência manual criada com sucesso.",
      user: {
        email: user.email,
        discordIds: mergedIds,
        name: user.name
      }
    });

  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro na correspondência manual", 
      details: errorMessage(error)
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
          const currentIds = validDiscordIds(user)

          if (currentIds.length === 0) {
            await persistDiscordIds(user, [idDiferente.newDiscordId])
            await IdsDiferentes.findByIdAndDelete(id as string);
            mergedCount++;
          }
        }
      } catch (error: unknown) {
        errors.push(`Erro no ID ${id}: ${errorMessage(error)}`);
      }
    }

    res.json({ 
      message: `${mergedCount} merges concluídos com sucesso.`,
      mergedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro no merge em lote", 
      details: errorMessage(error)
    });
  }
}

export const bulkDeleteIds = async (input: UsersBulkDeleteInput, res: Response): Promise<void> => {
  const { ids } = input.body;
  
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

  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro na eliminação em lote", 
      details: errorMessage(error)
    });
  }
}

export const bulkDeleteUnmatchedUsers = async (input: UsersBulkDeleteInput, res: Response): Promise<void> => {
  const { ids } = input.body;
  
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

  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro na eliminação em lote", 
      details: errorMessage(error)
    });
  }
}
// src/controllers/users.controller.ts - PARTE 3/3 (final)

/**
 * POST /api/users/sync-csv
 * Sincronizar CSV Discord + Hotmart (mantido)
 */
export const syncDiscordAndHotmart = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.file) {
    next(
      new HttpError({
        status: 400,
        code: 'UPLOAD_FILE_REQUIRED',
        publicMessage: 'Nenhum ficheiro carregado',
      }),
    )
    return
  }

  const uploadedFile = req.file
  try {
    await withUploadedFileCleanup(uploadedFile, async (filePath) => {
      const syncRecord = new SyncHistory({
        type: "csv",
        user: req.body.user || "system",
        metadata: { fileName: uploadedFile.originalname },
        status: "running"
      })
      await syncRecord.save()

      try {
        const data = await readImportedUsers(filePath)

      let added = 0, unmatched = 0, errors = 0

      for (const record of data) {
        try {
          const discordId = String(record["User ID"] || "").trim()
          const email = String(record["Qual o e-mail com que te inscreveste no curso?"] || "").trim().toLowerCase()

          if (!email || !discordId) {
            unmatched++
            continue
          }

          const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
          if (!user) {
            unmatched++
            await UnmatchedUser.create({ discordId, email })
            continue
          }

          const currentIds = validDiscordIds(user)

          if (!currentIds.includes(discordId)) {
            await User.updateOne(
              { _id: user._id },
              {
                $set: {
                  'discord.discordIds': [...currentIds, discordId],
                  'discord.updatedAt': new Date()
                }
              }
            )
            added++
          }

        } catch (recordError: unknown) {
          errors++
          console.error(`Erro no registo:`, errorMessage(recordError))
        }
      }

      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: "completed",
        completedAt: new Date(),
        stats: { total: data.length, added, errors }
      })

      res.json({
        message: "Sincronização concluída",
        syncId: syncRecord._id,
        stats: { added, unmatched, errors }
      })

      } catch (error: unknown) {
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          status: "failed",
          completedAt: new Date()
        })

        throw new HttpError({
          status: 500,
          code: 'USER_IMPORT_FAILED',
          publicMessage: 'Erro na sincronização',
          cause: error,
        })
      }
    })
  } catch (error) {
    next(
      error instanceof HttpError
        ? error
        : new HttpError({
            status: 500,
            code: 'USER_IMPORT_FAILED',
            publicMessage: 'Erro na sincronização',
            cause: error,
          }),
    )
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
      error: process.env.NODE_ENV === 'development' ? errorMessage(error) : 'Internal server error',
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
    const allClasses: UserClassView[] = []

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

  } catch (error: unknown) {
    console.error('❌ Erro ao buscar turmas do utilizador:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar turmas do utilizador',
      error: errorMessage(error)
    })
  }
}


/**
 * GET /api/users/v2
 * ✅ NOVO: Lista users com seus UserProducts
 * Suporta filtros avançados: platform, productId, status, search, progress, engagement
 */

export const getUsers: RequestHandler = async (req, res) => {
  console.log("⚡ [V2] === FUNÇÃO getUsers INICIADA ===")
  try {
    const {
      platform,
      productId,
      status,
      search,
      progressLevel,
      engagementLevel,
      maxEngagement,
      topPercentage,
      lastAccessBefore,
      enrolledAfter,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string | undefined>

    console.log("🔍 [V2] getUsers chamado com filtros:", {
      platform,
      productId,
      status,
      search,
      progressLevel,
      engagementLevel,
      maxEngagement,
      topPercentage,
      lastAccessBefore,
      enrolledAfter,
    })

    // ✅ STRATEGY 1: Se filtrar por produto específico (query param)
    if (productId) {
      const usersWithProduct = await getUsersForProduct(productId)

      res.json({
        success: true,
        data: ensureUsersV2Products(usersWithProduct),
        pagination: { total: usersWithProduct.length },
        filters: { productId },
      })
      return
    }

    // ✅ OPTIMIZED: Build UserProduct query first to filter at DB level
    const userProductQuery: MongoFilter = {}

    if (platform) {
      userProductQuery.platform = platform.toLowerCase()
    }

    if (status) {
      userProductQuery.status = status
    }

    if (maxEngagement) {
      const max = parseInt(maxEngagement, 10)
      if (!Number.isNaN(max)) {
        userProductQuery["engagement.engagementScore"] = { $lte: max }
      }
    }

    if (topPercentage) {
      const threshold = 77
      userProductQuery["engagement.engagementScore"] = { $gte: threshold }
    }

    if (lastAccessBefore) {
      const cutoff = new Date(lastAccessBefore)
      userProductQuery.$or = [
        { "engagement.lastAction": { $exists: false } },
        { "engagement.lastAction": null },
        { "engagement.lastAction": { $lt: cutoff } },
      ]
    }

    if (progressLevel) {
      const ranges: Record<string, { min: number; max: number }> = {
        MUITO_BAIXO: { min: 0, max: 25 },
        BAIXO: { min: 25, max: 40 },
        MEDIO: { min: 40, max: 60 },
        ALTO: { min: 60, max: 80 },
        MUITO_ALTO: { min: 80, max: 100 },
      }

      const range = ranges[progressLevel.toUpperCase()]
      if (range) {
        userProductQuery["progress.percentage"] = { $gte: range.min, $lt: range.max }
      }
    }

    if (engagementLevel) {
      const levels = engagementLevel.split(",").map((x) => x.trim())
      userProductQuery["engagement.engagementLevel"] = { $in: levels }
    }

    // Paginação BEFORE queries (crucial!)
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))

    // ✅ OPTIMIZED: Get distinct userIds from UserProduct collection first
    const hasProductFilters = Object.keys(userProductQuery).length > 0
    let userIds: mongoose.Types.ObjectId[] = []
    let totalCount = 0

    if (hasProductFilters) {
      console.log("🔍 [V2] Aplicando filtros de UserProduct na DB:", userProductQuery)
      const startTime = Date.now()

      // ✅ CRITICAL FIX: Use aggregation to get UNIQUE userIds with pagination
      const aggregation = await UserProduct.aggregate<UserIdFacet>([
        { $match: userProductQuery },
        { $group: { _id: "$userId" } },
        { $facet: {
          total: [{ $count: "count" }],
          data: [
            { $skip: (pageNum - 1) * limitNum },
            { $limit: limitNum }
          ]
        }}
      ])

      const queryTime = Date.now() - startTime
      totalCount = aggregation[0].total[0]?.count || 0
      userIds = aggregation[0].data.map(item => item._id)

      console.log(`⚡ [V2] ${userIds.length} userIds (de ${totalCount} total) em ${queryTime}ms - página ${pageNum}`)

      if (userIds.length === 0) {
        // No users match the product filters
        return res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            totalPages: 0,
            page: 1,
            limit: parseInt(limit, 10) || 50,
          },
          filters: {
            platform,
            productId,
            status,
            search,
            progressLevel,
            engagementLevel,
            maxEngagement,
            topPercentage,
            lastAccessBefore,
            enrolledAfter,
          },
        })
      }
    }

    // Base user query
    const userConditions: MongoFilter[] = [{
      $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }],
    }]
    const userQuery = { $and: userConditions }

    // Add userIds filter if we have product filters
    if (hasProductFilters && userIds.length > 0) {
      userConditions.push({ _id: { $in: userIds } })
    }

    if (search) {
      const searchRegex = new RegExp(search, "i")
      userConditions.push({ $or: [{ name: searchRegex }, { email: searchRegex }] })
    }

    if (enrolledAfter) {
      userConditions.push({ createdAt: { $gte: new Date(enrolledAfter) } })
    }

    if (status === "ACTIVE") {
      userConditions.push({ "combined.status": "ACTIVE" })
    }

    // ✅ OPTIMIZED: Apply pagination at DB level for non-product-filter queries too
    let users: UserSummary[] = []

    if (!hasProductFilters) {
      // Sem filtros de produto: paginar direto nos Users
      const [usersData, usersTotalCount] = await Promise.all([
        User.find(userQuery)
          .select("_id name email combined.status")
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean<UserSummary[]>(),
        User.countDocuments(userQuery)
      ])
      users = usersData
      totalCount = usersTotalCount
      console.log(`📊 [V2] ${users.length} users (de ${totalCount} total) sem filtros de produto - página ${pageNum}`)
    } else {
      // Com filtros de produto: buscar apenas os users dos userIds paginados
      users = await User.find(userQuery)
        .select("_id name email combined.status")
        .lean<UserSummary[]>()
      console.log(`📊 [V2] ${users.length} users encontrados com filtros de produto`)
    }

    // ✅ OPTIMIZED: Buscar TODOS os UserProducts de uma vez (não N queries!)
    const userIdsToEnrich = users.map(user => user._id)
    const upQuery: MongoFilter = {
      userId: { $in: userIdsToEnrich },
      ...userProductQuery
    }

    console.log(`📊 [V2] Buscando UserProducts para ${userIdsToEnrich.length} users`)
    const startUpTime = Date.now()

    const allUserProducts = await UserProduct.find(upQuery).lean<UserProductRecord[]>()

    const upTime = Date.now() - startUpTime
    console.log(`📊 [V2] ${allUserProducts.length} UserProducts encontrados em ${upTime}ms`)

    // Buscar produtos únicos (sem populate - mais rápido!)
    const uniqueProductIds = [...new Set(
      allUserProducts.map(userProduct => userProduct.productId.toString())
    )]
    console.log(`📦 [V2] Buscando ${uniqueProductIds.length} produtos únicos`)

    const startProdTime = Date.now()
    const products = await Product.find({ _id: { $in: uniqueProductIds } })
      .select("_id name code platform")
      .lean<ProductSummary[]>()
    const prodTime = Date.now() - startProdTime
    console.log(`📦 [V2] ${products.length} produtos carregados em ${prodTime}ms`)

    // Criar map de produtos
    const productMap = new Map(products.map(product => [product._id.toString(), product]))

    // Agrupar UserProducts por userId
    const userProductsMap = new Map<string, UserProductRecord[]>()
    for (const up of allUserProducts) {
      const userId = up.userId.toString()
      if (!userProductsMap.has(userId)) {
        userProductsMap.set(userId, [])
      }
      userProductsMap.get(userId)!.push(up)
    }

    // ✅ Calculate average engagement per user
    const userEngagementMap = new Map<string, { averageScore: number; level: string }>()

    for (const user of users) {
      const userId = user._id.toString()
      const userProducts = userProductsMap.get(userId) || []

      if (userProducts.length > 0) {
        const totalScore = userProducts.reduce((sum, up) => {
          return sum + (up.engagement?.engagementScore || 0)
        }, 0)
        const averageScore = Math.round(totalScore / userProducts.length)

        // Calculate engagement level based on average score
        const level = engagementLevelFromScore(averageScore)

        userEngagementMap.set(userId, { averageScore, level })
      }
    }

    // ✅ CRITICAL FIX: Transform data to match frontend expectations
    // Frontend expects array of UserProducts, not array of Users with products
    const userProductsFlattened: UserProductResponse[] = []

    for (const user of users) {
      const userId = user._id.toString()
      const userProducts = userProductsMap.get(userId) || []

      // Se há filtros de produto e o user não tem produtos, pular
      if (hasProductFilters && userProducts.length === 0) {
        continue
      }

      // Get average engagement for this user
      const userEngagement = userEngagementMap.get(userId)

      // Para cada UserProduct do user, criar um objeto compatível com o frontend
      for (const up of userProducts) {
        const productId = up.productId?.toString()
        const product = productId ? productMap.get(productId) : null

        userProductsFlattened.push({
          _id: up._id,
          userId: {
            _id: user._id,
            name: user.name,
            email: user.email,
            averageEngagement: userEngagement?.averageScore || 0,
            averageEngagementLevel: userEngagement?.level || "NONE",
          },
          productId: product || up.productId,
          platform: up.platform,
          status: up.status,
          enrolledAt: up.enrolledAt,
          isPrimary: up.isPrimary,
          progress: {
            percentage: up.progress?.percentage || 0,
            progressPercentage: up.progress?.percentage || 0,
            lastActivity: up.progress?.lastActivity,
          },
          engagement: {
            score: up.engagement?.engagementScore || 0,
            level: engagementLevelFromScore(up.engagement?.engagementScore || 0),
            lastAction: up.engagement?.lastAction,
          },
          // Also add at root level for compatibility
          averageEngagement: userEngagement?.averageScore || 0,
          averageEngagementLevel: userEngagement?.level || "NONE",
        })
      }
    }

    console.log(`📊 [V2] ${userProductsFlattened.length} UserProducts após transformação`)

    // ✅ OPTIMIZED: Pagination já foi feita na query, não precisamos fatiar
    const paginatedUsers = userProductsFlattened // Já vem paginado!

    res.json({
      success: true,
      data: ensureUsersV2Products(paginatedUsers),
      pagination: {
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        page: pageNum,
        limit: limitNum,
      },
      filters: {
        platform,
        productId,
        status,
        search,
        progressLevel,
        engagementLevel,
        maxEngagement,
        topPercentage,
        lastAccessBefore,
        enrolledAfter,
      },
    })
  } catch (error: unknown) {
    console.error("❌ [V2] Erro em getUsers:", error)
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}
/**
 * GET /api/users/v2/:id
 * ✅ NOVO: Busca user com todos os UserProducts
 */

export const getUserById: RequestHandler<UserIdParams> = async (req, res) => {
  try {
    const { id } = req.params

    const user = await getUserWithProducts(id)

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" })
      return
    }

    res.json({ success: true, data: user })
  } catch (error: unknown) {
    console.error("❌ Erro em getUserById:", error)
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}
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

/**
 * GET /api/users/v2/:userId/products
 * ✅ NOVO: Lista UserProducts de um user
 */
export const getUserProducts: RequestHandler = async (req, res) => {
  try {
    const { userId } = req.params
    
    console.log(`🔍 [getUserProducts] Buscando UserProducts para userId: ${userId}`)
    
    // ✅ BUSCAR DIRETAMENTE (sem verificar se User existe)
    const userProducts = await UserProduct.find({ userId })
      .populate('productId', 'name code platform')
      .populate('userId', 'name email')  // Popula user info se existir
      .lean()
    
    console.log(`✅ [getUserProducts] ${userProducts.length} UserProducts encontrados`)
    
    // ✅ Retornar sempre 200 (mesmo se array vazio)
    res.json({ 
      success: true, 
      data: userProducts, 
      count: userProducts.length 
    })
  } catch (error: unknown) {
    console.error('❌ Erro em getUserProducts:', error)
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
