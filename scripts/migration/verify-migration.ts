// ════════════════════════════════════════════════════════════
// 📁 scripts/migration/verify-migration.ts
// VERIFICAR INTEGRIDADE DA MIGRAÇÃO
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../../src/models/user'
import Product from '../../src/models/Product'
import UserProduct from '../../src/models/UserProduct'
import { Class } from '../../src/models/Class'

dotenv.config()

interface VerificationReport {
  totalUsers: number
  totalProducts: number
  totalUserProducts: number
  totalClasses: number
  
  usersWithoutProducts: number
  classesWithoutProduct: number
  
  platformDistribution: {
    hotmart: number
    curseduca: number
    discord: number
  }
  
  multiPlatformUsers: number
  
  issues: Array<{ type: string, description: string }>
}

async function verifyMigration() {
  console.log('🔍 VERIFICANDO MIGRAÇÃO V2')
  console.log('─'.repeat(60))
  
  const report: VerificationReport = {
    totalUsers: 0,
    totalProducts: 0,
    totalUserProducts: 0,
    totalClasses: 0,
    usersWithoutProducts: 0,
    classesWithoutProduct: 0,
    platformDistribution: {
      hotmart: 0,
      curseduca: 0,
      discord: 0
    },
    multiPlatformUsers: 0,
    issues: []
  }
  
  try {
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado ao MongoDB\n')
    
    // ═══════════════════════════════════════════════════════════
    // CONTAGENS BÁSICAS
    // ═══════════════════════════════════════════════════════════
    
    report.totalUsers = await User.countDocuments({ 'discord.isDeleted': { $ne: true } })
    report.totalProducts = await Product.countDocuments()
    report.totalUserProducts = await UserProduct.countDocuments()
    report.totalClasses = await Class.countDocuments()
    
    console.log('📊 CONTAGENS:')
    console.log(`Users: ${report.totalUsers}`)
    console.log(`Products: ${report.totalProducts}`)
    console.log(`UserProducts: ${report.totalUserProducts}`)
    console.log(`Classes: ${report.totalClasses}`)
    
    // ═══════════════════════════════════════════════════════════
    // VERIFICAR USERS SEM PRODUCTS
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n🔍 Verificando users sem products...')
    
    const usersWithProducts = await UserProduct.distinct('userId')
    report.usersWithoutProducts = report.totalUsers - usersWithProducts.length
    
    if (report.usersWithoutProducts > 0) {
      report.issues.push({
        type: 'USERS_WITHOUT_PRODUCTS',
        description: `${report.usersWithoutProducts} users não têm nenhum UserProduct`
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // VERIFICAR CLASSES SEM PRODUCTID
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔍 Verificando classes sem productId...')
    
    report.classesWithoutProduct = await Class.countDocuments({
      productId: { $exists: false }
    })
    
    if (report.classesWithoutProduct > 0) {
      report.issues.push({
        type: 'CLASSES_WITHOUT_PRODUCT',
        description: `${report.classesWithoutProduct} classes não têm productId`
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // DISTRIBUIÇÃO POR PLATAFORMA
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔍 Analisando distribuição por plataforma...')
    
    report.platformDistribution.hotmart = await UserProduct.countDocuments({ platform: 'hotmart' })
    report.platformDistribution.curseduca = await UserProduct.countDocuments({ platform: 'curseduca' })
    report.platformDistribution.discord = await UserProduct.countDocuments({ platform: 'discord' })
    
    // ═══════════════════════════════════════════════════════════
    // USERS EM MÚLTIPLAS PLATAFORMAS
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔍 Identificando users multi-plataforma...')
    
    const usersGrouped = await UserProduct.aggregate([
      {
        $group: {
          _id: '$userId',
          platforms: { $addToSet: '$platform' },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ])
    
    report.multiPlatformUsers = usersGrouped.length
    
    // ═══════════════════════════════════════════════════════════
    // VERIFICAR INTEGRIDADE DOS DADOS
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔍 Verificando integridade dos dados...')
    
    // Verificar UserProducts sem userId válido
    const invalidUserProducts = await UserProduct.countDocuments({
      userId: { $exists: false }
    })
    
    if (invalidUserProducts > 0) {
      report.issues.push({
        type: 'INVALID_USERPRODUCTS',
        description: `${invalidUserProducts} UserProducts sem userId`
      })
    }
    
    // Verificar UserProducts sem productId válido
    const invalidProductRefs = await UserProduct.countDocuments({
      productId: { $exists: false }
    })
    
    if (invalidProductRefs > 0) {
      report.issues.push({
        type: 'INVALID_PRODUCT_REFS',
        description: `${invalidProductRefs} UserProducts sem productId`
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // RELATÓRIO FINAL
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n' + '═'.repeat(60))
    console.log('📋 RELATÓRIO DE VERIFICAÇÃO')
    console.log('═'.repeat(60))
    
    console.log('\n📊 ESTATÍSTICAS:')
    console.log(`Users total: ${report.totalUsers}`)
    console.log(`Products total: ${report.totalProducts}`)
    console.log(`UserProducts total: ${report.totalUserProducts}`)
    console.log(`Classes total: ${report.totalClasses}`)
    
    console.log('\n📈 DISTRIBUIÇÃO:')
    console.log(`Hotmart: ${report.platformDistribution.hotmart}`)
    console.log(`Curseduca: ${report.platformDistribution.curseduca}`)
    console.log(`Discord: ${report.platformDistribution.discord}`)
    console.log(`Users multi-plataforma: ${report.multiPlatformUsers}`)
    
    console.log('\n⚠️  ISSUES:')
    if (report.issues.length === 0) {
      console.log('✅ Nenhum problema encontrado!')
    } else {
      report.issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. [${issue.type}] ${issue.description}`)
      })
    }
    
    console.log('\n' + '═'.repeat(60))
    
    if (report.issues.length === 0) {
      console.log('✅ MIGRAÇÃO VERIFICADA COM SUCESSO!')
      process.exit(0)
    } else {
      console.log('⚠️  MIGRAÇÃO TEM ISSUES - VERIFICAR ACIMA')
      process.exit(1)
    }
    
  } catch (error: any) {
    console.error('❌ ERRO:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
  }
}

verifyMigration()

