// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/audit-complete.ts
// AUDITORIA COMPLETA DO ESTADO DA BASE DE DADOS
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import Product from '../src/models/Product'
import UserProduct from '../src/models/UserProduct'
import fs from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

interface AuditReport {
  timestamp: Date
  summary: {
    totalUsers: number
    totalProducts: number
    totalUserProducts: number
    totalOrphans: number
    totalDuplicates: number
  }
  users: {
    total: number
    withHotmart: number
    withCurseduca: number
    withDiscord: number
    withMultiplePlatforms: number
    withNoV1Data: number
    curseducaGroups: {
      group6: number
      group7: number
      both: number
      neither: number
    }
  }
  products: {
    total: number
    byPlatform: Record<string, number>
    details: Array<{
      id: string
      code: string
      name: string
      platform: string
      curseducaGroupId?: string
      hotmartProductId?: string
      discordRoleId?: string
    }>
  }
  userProducts: {
    total: number
    byProduct: Array<{
      productCode: string
      productName: string
      count: number
      withDates: number
      withoutDates: number
      oldestDate: Date | null
      newestDate: Date | null
    }>
    byPlatform: Record<string, number>
    orphaned: {
      missingUser: number
      missingProduct: number
    }
    duplicates: number
  }
  integrity: {
    usersWithoutUserProducts: number
    userProductsWithoutUser: number
    userProductsWithoutProduct: number
    usersWithV1ButNoV2: {
      hotmart: number
      curseduca: number
      discord: number
    }
  }
  recommendations: string[]
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function auditComplete(): Promise<AuditReport> {
  console.log('\n🔍 AUDITORIA COMPLETA DA BASE DE DADOS')
  console.log('═'.repeat(80))
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-PT')}`)
  console.log('═'.repeat(80))
  
  const report: AuditReport = {
    timestamp: new Date(),
    summary: {
      totalUsers: 0,
      totalProducts: 0,
      totalUserProducts: 0,
      totalOrphans: 0,
      totalDuplicates: 0
    },
    users: {
      total: 0,
      withHotmart: 0,
      withCurseduca: 0,
      withDiscord: 0,
      withMultiplePlatforms: 0,
      withNoV1Data: 0,
      curseducaGroups: {
        group6: 0,
        group7: 0,
        both: 0,
        neither: 0
      }
    },
    products: {
      total: 0,
      byPlatform: {},
      details: []
    },
    userProducts: {
      total: 0,
      byProduct: [],
      byPlatform: {},
      orphaned: {
        missingUser: 0,
        missingProduct: 0
      },
      duplicates: 0
    },
    integrity: {
      usersWithoutUserProducts: 0,
      userProductsWithoutUser: 0,
      userProductsWithoutProduct: 0,
      usersWithV1ButNoV2: {
        hotmart: 0,
        curseduca: 0,
        discord: 0
      }
    },
    recommendations: []
  }
  
  // ═════════════════════════════════════════════════════════════
  // PARTE 1: USERS
  // ═════════════════════════════════════════════════════════════
  
  console.log('\n━━━ PARTE 1/4: ANÁLISE DE USERS ━━━\n')
  
  const totalUsers = await User.countDocuments()
  report.users.total = totalUsers
  report.summary.totalUsers = totalUsers
  
  console.log(`📊 Total de Users: ${totalUsers}`)
  
  // Users com Hotmart
  const usersWithHotmart = await User.countDocuments({
    $or: [
      { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
      { hotmartUserId: { $exists: true, $ne: null } }
    ]
  })
  report.users.withHotmart = usersWithHotmart
  console.log(`   🔥 Com Hotmart (V1): ${usersWithHotmart}`)
  
  // Users com CursEduca
  const usersWithCurseduca = await User.countDocuments({
    $or: [
      { 'curseduca.curseducaUserId': { $exists: true, $ne: null } },
      { curseducaUserId: { $exists: true, $ne: null } }
    ]
  })
  report.users.withCurseduca = usersWithCurseduca
  console.log(`   📚 Com CursEduca (V1): ${usersWithCurseduca}`)
  
  // Users do Grupo 6 (Clareza Mensal)
  const usersGroup6 = await User.countDocuments({
    $or: [
      { 'curseduca.groupCurseducaId': '6' },
      { groupCurseducaId: '6' }
    ]
  })
  report.users.curseducaGroups.group6 = usersGroup6
  console.log(`      └─ Grupo 6 (Mensal): ${usersGroup6}`)
  
  // Users do Grupo 7 (Clareza Anual)
  const usersGroup7 = await User.countDocuments({
    $or: [
      { 'curseduca.groupCurseducaId': '7' },
      { groupCurseducaId: '7' }
    ]
  })
  report.users.curseducaGroups.group7 = usersGroup7
  console.log(`      └─ Grupo 7 (Anual): ${usersGroup7}`)
  
  // Users em ambos os grupos (não deveria acontecer)
  const usersBothGroups = await User.countDocuments({
    $and: [
      {
        $or: [
          { 'curseduca.groupCurseducaId': '6' },
          { groupCurseducaId: '6' }
        ]
      },
      {
        $or: [
          { 'curseduca.groupCurseducaId': '7' },
          { groupCurseducaId: '7' }
        ]
      }
    ]
  })
  report.users.curseducaGroups.both = usersBothGroups
  if (usersBothGroups > 0) {
    console.log(`      ⚠️  Em AMBOS os grupos: ${usersBothGroups}`)
  }
  
  // Users com Discord
  const usersWithDiscord = await User.countDocuments({
    $or: [
      { 'discord.discordIds': { $exists: true, $ne: [] } },
      { discordIds: { $exists: true, $ne: [] } }
    ]
  })
  report.users.withDiscord = usersWithDiscord
  console.log(`   💬 Com Discord (V1): ${usersWithDiscord}`)
  
  // Users com múltiplas plataformas
  const usersMultiPlatform = await User.countDocuments({
    $expr: {
      $gt: [
        {
          $size: {
            $filter: {
              input: [
                { $cond: [{ $ifNull: ['$hotmart.hotmartUserId', false] }, 1, 0] },
                { $cond: [{ $ifNull: ['$curseduca.curseducaUserId', false] }, 1, 0] },
                { $cond: [{ $gt: [{ $size: { $ifNull: ['$discord.discordIds', []] } }, 0] }, 1, 0] }
              ],
              as: 'item',
              cond: { $eq: ['$$item', 1] }
            }
          }
        },
        1
      ]
    }
  })
  report.users.withMultiplePlatforms = usersMultiPlatform
  console.log(`   🔗 Com múltiplas plataformas: ${usersMultiPlatform}`)
  
  // Users sem dados V1
  const usersNoV1 = totalUsers - usersWithHotmart - usersWithCurseduca - usersWithDiscord
  report.users.withNoV1Data = usersNoV1
  if (usersNoV1 > 0) {
    console.log(`   ⚠️  Sem dados V1: ${usersNoV1}`)
  }
  
  // ═════════════════════════════════════════════════════════════
  // PARTE 2: PRODUCTS
  // ═════════════════════════════════════════════════════════════
  
  console.log('\n━━━ PARTE 2/4: ANÁLISE DE PRODUCTS ━━━\n')
  
  const products = await Product.find({ isActive: true }).lean()
  report.products.total = products.length
  report.summary.totalProducts = products.length
  
  console.log(`📦 Total de Produtos: ${products.length}`)
  
  const platformCount: Record<string, number> = {}
  
  for (const product of products) {
    // Contar por plataforma
    platformCount[product.platform] = (platformCount[product.platform] || 0) + 1
    
    // ✅ CORREÇÃO: Cast explícito para string
    const productId = (product._id as mongoose.Types.ObjectId).toString()
    
    // Adicionar detalhes
    report.products.details.push({
      id: productId,
      code: product.code,
      name: product.name,
      platform: product.platform,
      curseducaGroupId: product.curseducaGroupId,
      hotmartProductId: product.hotmartProductId,
      discordRoleId: product.discordRoleId
    })
    
    console.log(`\n   ${product.code} - ${product.name}`)
    console.log(`      Plataforma: ${product.platform}`)
    console.log(`      ID: ${productId}`)
    
    if (product.curseducaGroupId) {
      console.log(`      CursEduca Group ID: ${product.curseducaGroupId}`)
    }
    if (product.hotmartProductId) {
      console.log(`      Hotmart Product ID: ${product.hotmartProductId}`)
    }
    if (product.discordRoleId) {
      console.log(`      Discord Role ID: ${product.discordRoleId}`)
    }
  }
  
  report.products.byPlatform = platformCount
  
  console.log(`\n   📊 Por Plataforma:`)
  for (const [platform, count] of Object.entries(platformCount)) {
    console.log(`      ${platform}: ${count}`)
  }
  
  // ═════════════════════════════════════════════════════════════
  // PARTE 3: USERPRODUCTS
  // ═════════════════════════════════════════════════════════════
  
  console.log('\n━━━ PARTE 3/4: ANÁLISE DE USERPRODUCTS ━━━\n')
  
  const totalUserProducts = await UserProduct.countDocuments()
  report.userProducts.total = totalUserProducts
  report.summary.totalUserProducts = totalUserProducts
  
  console.log(`🔗 Total de UserProducts: ${totalUserProducts}`)
  
  // ✅ Declarar variáveis no escopo correto
  let upMissingUser = 0
  let upMissingProduct = 0
  let duplicateCount = 0
  
  if (totalUserProducts === 0) {
    console.log(`   ⚠️  NENHUM UserProduct encontrado!`)
    console.log(`   💡 É necessário executar migração`)
  } else {
    // Por produto
    console.log(`\n   📊 Por Produto:`)
    
    for (const product of products) {
      const count = await UserProduct.countDocuments({ productId: product._id })
      const withDates = await UserProduct.countDocuments({
        productId: product._id,
        enrolledAt: { $exists: true, $ne: null }
      })
      const withoutDates = count - withDates
      
      let oldestDate: Date | null = null
      let newestDate: Date | null = null
      
      if (count > 0) {
        const oldest = await UserProduct.findOne({ productId: product._id })
          .sort({ enrolledAt: 1 })
          .select('enrolledAt')
        const newest = await UserProduct.findOne({ productId: product._id })
          .sort({ enrolledAt: -1 })
          .select('enrolledAt')
        
        oldestDate = oldest?.enrolledAt || null
        newestDate = newest?.enrolledAt || null
      }
      
      report.userProducts.byProduct.push({
        productCode: product.code,
        productName: product.name,
        count,
        withDates,
        withoutDates,
        oldestDate,
        newestDate
      })
      
      console.log(`\n      ${product.code}: ${count} UserProducts`)
      if (count > 0) {
        console.log(`         Com datas: ${withDates}`)
        console.log(`         Sem datas: ${withoutDates}`)
        if (oldestDate) {
          console.log(`         Mais antigo: ${oldestDate.toLocaleDateString('pt-PT')}`)
        }
        if (newestDate) {
          console.log(`         Mais recente: ${newestDate.toLocaleDateString('pt-PT')}`)
        }
      }
    }
    
    // Por plataforma
    const upByPlatform: Record<string, number> = {}
    for (const product of products) {
      const count = await UserProduct.countDocuments({ productId: product._id })
      upByPlatform[product.platform] = (upByPlatform[product.platform] || 0) + count
    }
    report.userProducts.byPlatform = upByPlatform
    
    console.log(`\n   📊 Por Plataforma:`)
    for (const [platform, count] of Object.entries(upByPlatform)) {
      console.log(`      ${platform}: ${count}`)
    }
    
    // Órfãos
    upMissingUser = await UserProduct.countDocuments({
      userId: { $nin: await User.find().distinct('_id') }
    })
    report.userProducts.orphaned.missingUser = upMissingUser
    
    upMissingProduct = await UserProduct.countDocuments({
      productId: { $nin: await Product.find().distinct('_id') }
    })
    report.userProducts.orphaned.missingProduct = upMissingProduct
    
    if (upMissingUser > 0) {
      console.log(`\n   ⚠️  UserProducts órfãos (user não existe): ${upMissingUser}`)
    }
    if (upMissingProduct > 0) {
      console.log(`   ⚠️  UserProducts órfãos (produto não existe): ${upMissingProduct}`)
    }
    
    report.summary.totalOrphans = upMissingUser + upMissingProduct
    
    // Duplicados
    const duplicates = await UserProduct.aggregate([
      {
        $group: {
          _id: { userId: '$userId', productId: '$productId' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $count: 'total'
      }
    ])
    
    duplicateCount = duplicates[0]?.total || 0
    report.userProducts.duplicates = duplicateCount
    report.summary.totalDuplicates = duplicateCount
    
    if (duplicateCount > 0) {
      console.log(`   ⚠️  Duplicados (userId + productId): ${duplicateCount}`)
    }
  }
  
  // ═════════════════════════════════════════════════════════════
  // PARTE 4: INTEGRIDADE
  // ═════════════════════════════════════════════════════════════
  
  console.log('\n━━━ PARTE 4/4: ANÁLISE DE INTEGRIDADE ━━━\n')
  
  // Users sem UserProducts
  const usersWithoutUP = await User.countDocuments({
    _id: { $nin: await UserProduct.find().distinct('userId') }
  })
  report.integrity.usersWithoutUserProducts = usersWithoutUP
  console.log(`⚠️  Users SEM UserProducts: ${usersWithoutUP}`)
  
  // UserProducts sem User
  const upWithoutUser = await UserProduct.countDocuments({
    userId: { $nin: await User.find().distinct('_id') }
  })
  report.integrity.userProductsWithoutUser = upWithoutUser
  if (upWithoutUser > 0) {
    console.log(`⚠️  UserProducts SEM User válido: ${upWithoutUser}`)
  }
  
  // UserProducts sem Product
  const upWithoutProduct = await UserProduct.countDocuments({
    productId: { $nin: await Product.find().distinct('_id') }
  })
  report.integrity.userProductsWithoutProduct = upWithoutProduct
  if (upWithoutProduct > 0) {
    console.log(`⚠️  UserProducts SEM Product válido: ${upWithoutProduct}`)
  }
  
  // Users com V1 mas sem V2
  console.log(`\n💡 Users com dados V1 mas SEM UserProducts:`)
  
  const hotmartNoV2 = await User.countDocuments({
    $and: [
      {
        $or: [
          { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
          { hotmartUserId: { $exists: true, $ne: null } }
        ]
      },
      {
        _id: { $nin: await UserProduct.find().distinct('userId') }
      }
    ]
  })
  report.integrity.usersWithV1ButNoV2.hotmart = hotmartNoV2
  console.log(`   Hotmart: ${hotmartNoV2}`)
  
  const curseducaNoV2 = await User.countDocuments({
    $and: [
      {
        $or: [
          { 'curseduca.curseducaUserId': { $exists: true, $ne: null } },
          { curseducaUserId: { $exists: true, $ne: null } }
        ]
      },
      {
        _id: { $nin: await UserProduct.find().distinct('userId') }
      }
    ]
  })
  report.integrity.usersWithV1ButNoV2.curseduca = curseducaNoV2
  console.log(`   CursEduca: ${curseducaNoV2}`)
  
  const discordNoV2 = await User.countDocuments({
    $and: [
      {
        $or: [
          { 'discord.discordIds': { $exists: true, $ne: [] } },
          { discordIds: { $exists: true, $ne: [] } }
        ]
      },
      {
        _id: { $nin: await UserProduct.find().distinct('userId') }
      }
    ]
  })
  report.integrity.usersWithV1ButNoV2.discord = discordNoV2
  console.log(`   Discord: ${discordNoV2}`)
  
  // ═════════════════════════════════════════════════════════════
  // RECOMENDAÇÕES
  // ═════════════════════════════════════════════════════════════
  
  console.log('\n━━━ RECOMENDAÇÕES ━━━\n')
  
  // Produtos
  if (report.products.total < 3) {
    const rec = '⚠️  Faltam produtos! Deves ter pelo menos: OGI_V1, CLAREZA_MENSAL, CLAREZA_ANUAL, DISCORD_COMMUNITY'
    report.recommendations.push(rec)
    console.log(rec)
  }
  
  const hasClarezaMensal = products.some(p => p.code === 'CLAREZA_MENSAL')
  const hasClarezaAnual = products.some(p => p.code === 'CLAREZA_ANUAL')
  
  if (!hasClarezaMensal) {
    const rec = '❌ FALTA: Produto CLAREZA_MENSAL (groupId: 6)'
    report.recommendations.push(rec)
    console.log(rec)
  }
  
  if (!hasClarezaAnual) {
    const rec = '❌ FALTA: Produto CLAREZA_ANUAL (groupId: 7)'
    report.recommendations.push(rec)
    console.log(rec)
  }
  
  // Migração
  if (totalUserProducts === 0) {
    const rec = '🚨 CRÍTICO: Nenhum UserProduct! Executar migração completa'
    report.recommendations.push(rec)
    console.log(rec)
  } else if (usersWithoutUP > totalUserProducts) {
    const rec = `⚠️  ${usersWithoutUP} users precisam ser migrados para UserProducts`
    report.recommendations.push(rec)
    console.log(rec)
  }
  
  // Duplicados
  if (duplicateCount > 0) {
    const rec = `⚠️  ${duplicateCount} duplicados precisam ser removidos`
    report.recommendations.push(rec)
    console.log(rec)
  }
  
  // Órfãos
  if (upMissingUser > 0 || upMissingProduct > 0) {
    const rec = `⚠️  ${upMissingUser + upMissingProduct} órfãos precisam ser limpos`
    report.recommendations.push(rec)
    console.log(rec)
  }
  
  // Users em ambos os grupos Clareza
  if (usersBothGroups > 0) {
    const rec = `⚠️  ${usersBothGroups} users estão em AMBOS os grupos Clareza (não deveria acontecer)`
    report.recommendations.push(rec)
    console.log(rec)
  }
  
  if (report.recommendations.length === 0) {
    console.log('✅ Tudo parece estar OK!')
    report.recommendations.push('✅ Base de dados está íntegra')
  }
  
  return report
}

// ─────────────────────────────────────────────────────────────
// EXECUÇÃO
// ─────────────────────────────────────────────────────────────

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    const report = await auditComplete()
    
    // Gravar relatório em JSON
    const reportPath = path.join(__dirname, '..', 'audit-reports')
    if (!fs.existsSync(reportPath)) {
      fs.mkdirSync(reportPath, { recursive: true })
    }
    
    const filename = `audit-${Date.now()}.json`
    const filepath = path.join(reportPath, filename)
    
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8')
    
    console.log('\n═'.repeat(80))
    console.log('✅ AUDITORIA COMPLETA')
    console.log('═'.repeat(80))
    console.log(`\n📄 Relatório gravado em: ${filepath}`)
    console.log(`\n📊 RESUMO:`)
    console.log(`   Users: ${report.summary.totalUsers}`)
    console.log(`   Products: ${report.summary.totalProducts}`)
    console.log(`   UserProducts: ${report.summary.totalUserProducts}`)
    console.log(`   Órfãos: ${report.summary.totalOrphans}`)
    console.log(`   Duplicados: ${report.summary.totalDuplicates}`)
    console.log(`\n⚠️  Total de problemas: ${report.recommendations.length}`)
    console.log('\n')
    
  } catch (error) {
    console.error('❌ Erro na auditoria:', error)
    throw error
  } finally {
    await mongoose.disconnect()
  }
}

run()