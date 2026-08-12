// ════════════════════════════════════════════════════════════
// 📁 src/services/userProductService.ts
// SERVIÇO DE USERPRODUCT - HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════

import mongoose, { type FilterQuery } from 'mongoose'
import User from '../../models/user'
import Product from '../../models/product/Product'
import UserProduct, {
  type EnrollmentStatus,
  type PlatformType,
  type IProgress,
  type IEngagement,
  type IUserProduct,
} from '../../models/UserProduct'
import type {
  UsersV2LegacyGroupedProduct,
  UsersV2LegacyGroupedUser,
} from '../../contracts/usersV2'

interface PopulatedProduct {
  _id: mongoose.Types.ObjectId
  code: string
  name: string
}

interface LegacyGroupedEnrollmentLean {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId | null
  productId: mongoose.Types.ObjectId | null
  platform?: PlatformType
  status?: EnrollmentStatus
  enrolledAt?: Date
  isPrimary?: boolean
  progress?: {
    percentage?: number
    lastActivity?: Date
  }
  engagement?: {
    engagementScore?: number
    engagementLevel?: string
    lastAction?: Date
  }
}

interface LegacyGroupedUserLean {
  _id: mongoose.Types.ObjectId
  name?: string
  email?: string
  combined?: {
    status?: string
  }
  isDeleted?: boolean
}

interface LegacyGroupedProductLean {
  _id: mongoose.Types.ObjectId
  name: string
  code: string
  platform: string
}

// ─────────────────────────────────────────────────────────────
// BUSCAR USER COM PRODUTOS (DUAL READ)
// ─────────────────────────────────────────────────────────────

export async function getUserWithProducts(userId: string | mongoose.Types.ObjectId) {
  // 1. Buscar user (V1 - mantém compatibilidade)
  const user = await User.findById(userId).lean()
  
  if (!user) {
    return null
  }
  
  // 2. Buscar UserProducts (V2 - dados novos)
  const userProducts = await UserProduct.find({ userId: user._id })
    .populate('productId', 'code name platform')
    .lean<Array<Omit<IUserProduct, 'productId'> & { productId: PopulatedProduct }>>()
  
  // 3. Montar resposta compatível
  return {
    ...user,
    
    // V2 data (novo campo)
    products: userProducts.map(up => ({
      _id: up._id,
      productId: up.productId._id,
      productCode: up.productId.code,
      productName: up.productId.name,
      platform: up.platform,
      platformUserId: up.platformUserId,
      platformUserUuid: up.platformUserUuid,
      status: up.status,
      enrolledAt: up.enrolledAt,
      progress: up.progress,
      engagement: up.engagement,
      classes: up.classes,
      metadata: up.metadata
    })),
    
    // Metadata
    _v2Enabled: true,
    _hasProducts: userProducts.length > 0
  }
}

// ─────────────────────────────────────────────────────────────
// DUAL WRITE: ATUALIZAR USER + USERPRODUCT
// ─────────────────────────────────────────────────────────────

export async function dualWriteUserData(
  userId: mongoose.Types.ObjectId,
  productCode: string,
  data: {
    progress?: IProgress
    engagement?: IEngagement
    platformUserId?: string
    platformUserUuid?: string
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CANCELLED'
  }
) {
  // 1. Buscar produto
  const product = await Product.findOne({ code: productCode })
  
  if (!product) {
    throw new Error(`Produto ${productCode} não encontrado`)
  }
  
  // 2. WRITE V2: UserProduct
  await UserProduct.findOneAndUpdate(
    {
      userId,
      productId: product._id
    },
    {
      $set: {
        ...(data.progress && { progress: data.progress }),
        ...(data.engagement && { engagement: data.engagement }),
        ...(data.status && { status: data.status }),
        ...(data.platformUserId && { platformUserId: data.platformUserId }),
        ...(data.platformUserUuid && { platformUserUuid: data.platformUserUuid }),
        'metadata.lastSyncAt': new Date()
      }
    },
    { upsert: true, new: true }
  )
  
  // 3. WRITE V1: User (backward compatibility)
  const platform = product.platform
  
  if (platform === 'hotmart') {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          ...(data.platformUserId && { 'hotmart.hotmartUserId': data.platformUserId }),
          ...(data.progress && { 'hotmart.progress': data.progress }),
          ...(data.engagement && { 'hotmart.engagement': data.engagement }),
          'hotmart.lastSyncAt': new Date()
        }
      }
    )
  } else if (platform === 'curseduca') {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          ...(data.platformUserId && { 'curseduca.curseducaUserId': data.platformUserId }),
          ...(data.platformUserUuid && { 'curseduca.curseducaUuid': data.platformUserUuid }),
          ...(data.progress && { 'curseduca.progress': data.progress }),
          ...(data.engagement && { 'curseduca.engagement': data.engagement }),
          'curseduca.lastSyncAt': new Date()
        }
      }
    )
  }
}

// ─────────────────────────────────────────────────────────────
// ENROLLAR USER EM PRODUTO
// ─────────────────────────────────────────────────────────────

export async function enrollUserInProduct(
  userId: mongoose.Types.ObjectId,
  productId: mongoose.Types.ObjectId,
  options: {
    platformUserId: string
    platformUserUuid?: string
    source?: 'PURCHASE' | 'MANUAL' | 'MIGRATION' | 'TRIAL'
    enrolledAt?: Date
  }
) {
  // Verificar se já existe
  const existing = await UserProduct.findOne({
    userId,
    productId
  })
  
  if (existing) {
    return {
      success: false,
      message: 'User já está enrollado neste produto',
      userProduct: existing
    }
  }
  
  // Buscar produto para pegar platform
  const product = await Product.findById(productId)
  
  if (!product) {
    throw new Error('Produto não encontrado')
  }
  
  // Criar enrollment
  const userProduct = await UserProduct.create({
    userId,
    productId,
    platform: product.platform,
    platformUserId: options.platformUserId,
    platformUserUuid: options.platformUserUuid,
    enrolledAt: options.enrolledAt || new Date(),
    status: 'ACTIVE',
    source: options.source || 'MANUAL',
    progress: {
      percentage: 0
    },
    engagement: {
      engagementScore: 0
    },
    classes: []
  })
  
  return {
    success: true,
    message: 'User enrollado com sucesso',
    userProduct
  }
}

// ─────────────────────────────────────────────────────────────
// BUSCAR PRODUTOS DO USER
// ─────────────────────────────────────────────────────────────

export async function getUserProducts(
  userId: mongoose.Types.ObjectId,
  filters?: {
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CANCELLED'
    platform?: string
  }
) {
  const query: FilterQuery<IUserProduct> = { userId }
  
  if (filters?.status) query.status = filters.status
  if (filters?.platform) query.platform = filters.platform
  
  const userProducts = await UserProduct.find(query)
    .populate('productId')
    .sort({ enrolledAt: -1 })
  
  return userProducts
}

// ─────────────────────────────────────────────────────────────
// BUSCAR PRODUTO ESPECÍFICO DO USER
// ─────────────────────────────────────────────────────────────

export async function getUserProductByCode(
  userId: mongoose.Types.ObjectId,
  productCode: string
) {
  const product = await Product.findOne({ code: productCode })
  
  if (!product) {
    return null
  }
  
  const userProduct = await UserProduct.findOne({
    userId,
    productId: product._id
  }).populate('productId')
  
  return userProduct
}

// ─────────────────────────────────────────────────────────────
// ATUALIZAR CLASSES DO USERPRODUCT
// ─────────────────────────────────────────────────────────────

export async function updateUserProductClasses(
  userId: mongoose.Types.ObjectId,
  productCode: string,
  classes: Array<{
    classId: string
    className?: string
    joinedAt?: Date
  }>
) {
  const product = await Product.findOne({ code: productCode })
  
  if (!product) {
    throw new Error(`Produto ${productCode} não encontrado`)
  }
  
  await UserProduct.updateOne(
    { userId, productId: product._id },
    { $set: { classes } }
  )
}

// ─────────────────────────────────────────────────────────────
// VERIFICAR SE USER ESTÁ EM PRODUTO
// ─────────────────────────────────────────────────────────────

export async function isUserInProduct(
  userId: mongoose.Types.ObjectId,
  productCode: string
): Promise<boolean> {
  const product = await Product.findOne({ code: productCode })
  
  if (!product) {
    return false
  }
  
  const userProduct = await UserProduct.findOne({
    userId,
    productId: product._id,
    status: 'ACTIVE'
  })
  
  return !!userProduct
}

// ─────────────────────────────────────────────────────────────
// 🎯 SPRINT 5.2 - MÉTODOS HELPER ADICIONAIS
// ─────────────────────────────────────────────────────────────

/**
 * Conta users de um produto específico
 */
export async function getUserCountForProduct(productId: string): Promise<number> {
  return await UserProduct.countDocuments({ productId })
}
// Lista users de um produto específico (helper para controllers, NÃO é Express handler)
export async function getUsersByProduct(productId: string): Promise<any[]> {
  const userProducts = await UserProduct.find({ productId })
    .populate('userId', 'name email isActive metadata')
    .populate('productId')
    .lean()

  // Agrupar por user (caso existam duplicados)
  const byUser = new Map<string, any>()

  for (const up of userProducts) {
    const user = up.userId as any
    if (!user?._id) continue

    const key = String(user._id)
    const entry = byUser.get(key) || {
      _id: user._id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      metadata: user.metadata,
      products: [],
      _v2Enabled: true
    }

    entry.products.push({
      _id: up._id,
      product: up.productId, // <- para bater com p.product._id no controller
      status: up.status,
      enrolledAt: up.enrolledAt,
      progress: up.progress
        ? {
            ...up.progress,
            // Alias do contrato legacy, derivado sempre do campo canónico.
            progressPercentage: up.progress.percentage ?? 0
          }
        : undefined,
      engagement: up.engagement,
      classes: up.classes,
      platform: up.platform,
      platformUserId: up.platformUserId,
      platformUserUuid: up.platformUserUuid,
      metadata: up.metadata
    })

    byUser.set(key, entry)
  }

  return Array.from(byUser.values())
}

export async function getUsersForProduct(
  productId: string,
): Promise<UsersV2LegacyGroupedUser[]> {
  const productObjectId = new mongoose.Types.ObjectId(productId)

  const userProducts = await UserProduct.find({
    productId: productObjectId,
  })
    .select([
      '_id',
      'userId',
      'productId',
      'platform',
      'status',
      'enrolledAt',
      'isPrimary',
      'progress.percentage',
      'progress.lastActivity',
      'engagement.engagementScore',
      'engagement.engagementLevel',
      'engagement.lastAction',
    ].join(' '))
    .lean<LegacyGroupedEnrollmentLean[]>()

  const userIds = new Map<string, mongoose.Types.ObjectId>()
  const productIds = new Map<string, mongoose.Types.ObjectId>()
  for (const userProduct of userProducts) {
    if (userProduct.userId !== null) {
      userIds.set(userProduct.userId.toString(), userProduct.userId)
    }
    if (userProduct.productId !== null) {
      productIds.set(userProduct.productId.toString(), userProduct.productId)
    }
  }

  const [users, products] = await Promise.all([
    User.find({
      _id: { $in: [...userIds.values()] },
      isDeleted: { $ne: true },
    })
      .select('_id name email combined.status isDeleted')
      .lean<LegacyGroupedUserLean[]>(),
    Product.find({ _id: { $in: [...productIds.values()] } })
      .select('_id name code platform')
      .lean<LegacyGroupedProductLean[]>(),
  ])

  const userMap = new Map(users.map(user => [user._id.toString(), user]))
  const productMap = new Map(
    products.map(product => [product._id.toString(), product]),
  )
  const groupedUsers = new Map<string, UsersV2LegacyGroupedUser>()

  for (const userProduct of userProducts) {
    if (userProduct.userId === null) continue
    const userId = userProduct.userId.toString()
    const user = userMap.get(userId)
    if (user === undefined) continue
    if (user.isDeleted === true) continue

    let groupedUser = groupedUsers.get(userId)
    if (groupedUser === undefined) {
      groupedUser = {
        _id: user._id,
        name: user.name || '',
        email: user.email || '',
        status: user.combined?.status || 'ACTIVE',
        products: [],
      }
      groupedUsers.set(userId, groupedUser)
    }

    const product = userProduct.productId === null
      ? undefined
      : productMap.get(userProduct.productId.toString())
    const groupedProduct: UsersV2LegacyGroupedProduct = {
      _id: userProduct._id,
      product: product ?? null,
      platform: userProduct.platform || product?.platform,
      status: userProduct.status,
      enrolledAt: userProduct.enrolledAt,
      isPrimary: userProduct.isPrimary,
      progress: {
        percentage: userProduct.progress?.percentage ?? 0,
        lastActivity: userProduct.progress?.lastActivity,
      },
      engagement: {
        score: userProduct.engagement?.engagementScore ?? 0,
        level: userProduct.engagement?.engagementLevel || 'NONE',
        lastAction: userProduct.engagement?.lastAction,
      },
    }
    groupedUser.products.push(groupedProduct)
  }

  return [...groupedUsers.values()]
}
