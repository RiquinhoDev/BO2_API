// ════════════════════════════════════════════════════════════
// 📁 src/services/userProductService.ts
// SERVIÇO DE USERPRODUCT - HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../models/user'
import Product from '../models/Product'
import UserProduct from '../models/UserProduct'

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

