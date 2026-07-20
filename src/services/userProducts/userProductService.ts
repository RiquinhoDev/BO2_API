// ════════════════════════════════════════════════════════════
// 📁 src/services/userProductService.ts
// SERVIÇO DE USERPRODUCT - HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../../models/user'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'

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
    .lean()
  
  // 3. Montar resposta compatível
  return {
    ...user,
    
    // V2 data (novo campo)
    products: userProducts.map(up => ({
      _id: up._id,
      productId: (up.productId as any)._id,
      productCode: (up.productId as any).code,
      productName: (up.productId as any).name,
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
    progress?: any
    engagement?: any
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
  const query: any = { userId }
  
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

/**
 * Conta users por plataforma
 */
export async function getUserCountsByPlatform(): Promise<Array<{ _id: string; count: number }>> {
  return await UserProduct.aggregate([
    {
      $lookup: {
        from: 'products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.platform',
        count: { $sum: 1 }
      }
    }
  ])
}

/**
 * Conta users por produto
 */
export async function getUserCountsByProduct(): Promise<Array<{ _id: string; productName: string; count: number }>> {
  return await UserProduct.aggregate([
    {
      $lookup: {
        from: 'products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product._id',
        productName: { $first: '$product.name' },
        count: { $sum: 1 }
      }
    }
  ])
}

export async function getUsersForProduct(productId: string) {
  const productObjectId = new mongoose.Types.ObjectId(productId)

  // Buscar todos os registos user<->product desse produto e trazer o user + produto
  const userProducts = await UserProduct.find({ productId: productObjectId })
    .populate('userId', 'name email combined.status isDeleted')
    .populate('productId', 'name code platform')
    .lean()

  // Agrupar por user
  const map = new Map<string, any>()

  for (const up of userProducts as any[]) {
    const user = up.userId
    if (!user) continue

    // ignorar soft-deleted
    if (user.isDeleted === true) continue

    const id = String(user._id)

    if (!map.has(id)) {
      map.set(id, {
        _id: user._id,
        name: user.name || '',
        email: user.email || '',
        status: user.combined?.status || 'ACTIVE',
        products: []
      })
    }

    map.get(id).products.push({
      _id: up._id,
      product: up.productId,
      platform: up.platform || up.productId?.platform, // fallback
      status: up.status,
      enrolledAt: up.enrolledAt,
      isPrimary: up.isPrimary,
      progress: {
        percentage: up.progress?.percentage || 0,
        lastActivity: up.progress?.lastActivity
      },
      engagement: {
        score: up.engagement?.engagementScore || 0,
        level: up.engagement?.engagementLevel || 'NONE',
        lastAction: up.engagement?.lastAction
      }
    })
  }

  return Array.from(map.values())
}
