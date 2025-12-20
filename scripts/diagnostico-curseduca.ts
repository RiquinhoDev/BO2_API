// ════════════════════════════════════════════════════════════
// 🔍 SCRIPT DE DIAGNÓSTICO: CursEDuca na Base de Dados
// ════════════════════════════════════════════════════════════
// Objetivo: Verificar EXATAMENTE onde está o problema
// Executar: npx tsx scripts/diagnostico-curseduca.ts
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'
import { DashboardStats } from '../src/models'


// ════════════════════════════════════════════════════════════
// CONECTAR À BD
// ════════════════════════════════════════════════════════════

async function conectar() {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

  await mongoose.connect(MONGODB_URI)
  console.log('✅ Conectado ao MongoDB\n')
}

// ════════════════════════════════════════════════════════════
// DIAGNÓSTICO 1: USERS CURSEDUCA
// ════════════════════════════════════════════════════════════

async function diagnosticoUsers() {
  console.log('━'.repeat(80))
  console.log('📊 DIAGNÓSTICO 1: USERS CURSEDUCA')
  console.log('━'.repeat(80))
  console.log('')

  // Total de users
  const totalUsers = await User.countDocuments()
  console.log(`📊 Total de users na BD: ${totalUsers}`)

  // Users CursEDuca (múltiplas variações)
  const curseducaNested = await User.countDocuments({
    'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] }
  })
  console.log(`   📚 curseduca.curseducaUserId: ${curseducaNested}`)

  const curseducaRoot = await User.countDocuments({
    curseducaUserId: { $exists: true, $nin: [null, ''] }
  })
  console.log(`   📚 curseducaUserId (root): ${curseducaRoot}`)

  const situation = await User.countDocuments({
    situation: 'ACTIVE'
  })
  console.log(`   📚 situation = ACTIVE: ${situation}`)

  const tenants = await User.countDocuments({
    'tenants.0': { $exists: true }
  })
  console.log(`   📚 tenants (array): ${tenants}`)

  // Query correta (mesma do tagRuleEngine)
  const queryCorreta = await User.countDocuments({
    $or: [
      { 'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] } },
      { curseducaUserId: { $exists: true, $nin: [null, ''] } }
    ]
  })
  console.log(`\n   ✅ Query CORRETA ($or): ${queryCorreta}`)

  // Exemplos
  const exemplos = await User.find({
    $or: [
      { 'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] } },
      { curseducaUserId: { $exists: true, $nin: [null, ''] } }
    ]
  })
    .limit(5)
    .select('email curseduca curseducaUserId situation tenants')
    .lean()

  console.log('\n   📄 Exemplos (primeiros 5):')
  exemplos.forEach((u, i) => {
    console.log(`      ${i + 1}. ${u.email}`)
    console.log(`         curseducaUserId (root): ${(u as any).curseducaUserId || 'N/A'}`)
    console.log(`         curseduca.curseducaUserId: ${(u as any).curseduca?.curseducaUserId || 'N/A'}`)
    console.log(`         situation: ${(u as any).situation || 'N/A'}`)
    console.log(`         tenants: ${(u as any).tenants?.length || 0} items`)
  })

  console.log('')
  return queryCorreta
}

// ════════════════════════════════════════════════════════════
// DIAGNÓSTICO 2: USERPRODUCTS CURSEDUCA
// ════════════════════════════════════════════════════════════

async function diagnosticoUserProducts() {
  console.log('━'.repeat(80))
  console.log('📊 DIAGNÓSTICO 2: USERPRODUCTS CURSEDUCA')
  console.log('━'.repeat(80))
  console.log('')

  // Total de UserProducts
  const totalUP = await UserProduct.countDocuments()
  console.log(`📊 Total de UserProducts na BD: ${totalUP}`)

  // Por plataforma
  const hotmart = await UserProduct.countDocuments({ platform: 'hotmart' })
  const curseduca = await UserProduct.countDocuments({ platform: 'curseduca' })
  const discord = await UserProduct.countDocuments({ platform: 'discord' })

  console.log(`   🔥 Hotmart: ${hotmart}`)
  console.log(`   📚 CursEDuca: ${curseduca}`)
  console.log(`   💬 Discord: ${discord}`)

  // Contar users únicos por plataforma
  const curseducaUniqueUsers = await UserProduct.distinct('userId', { platform: 'curseduca' })
  console.log(`\n   ✅ Users únicos CursEDuca: ${curseducaUniqueUsers.length}`)

  // Produtos CursEDuca
  const produtos = await Product.find({ platform: 'curseduca' }).select('_id code name').lean()
  console.log(`\n   📦 Produtos CursEDuca:`)
  for (const p of produtos) {
    const count = await UserProduct.countDocuments({ productId: p._id })
    const uniqueUsers = await UserProduct.distinct('userId', { productId: p._id })
    console.log(`      - ${p.code} (${p.name}): ${count} UserProducts, ${uniqueUsers.length} users únicos`)
  }

  // Exemplos de UserProducts
  const exemplosUP = await UserProduct.find({ platform: 'curseduca' })
    .populate('userId', 'email')
    .populate('productId', 'code name')
    .limit(5)
    .lean()

  console.log(`\n   📄 Exemplos (primeiros 5):`)
  exemplosUP.forEach((up, i) => {
    console.log(`      ${i + 1}. User: ${(up.userId as any)?.email || 'N/A'}`)
    console.log(`         Produto: ${(up.productId as any)?.code || 'N/A'}`)
    console.log(`         Status: ${up.status}`)
    console.log(`         Platform: ${up.platform}`)
  })

  console.log('')
  return curseducaUniqueUsers.length
}

// ════════════════════════════════════════════════════════════
// DIAGNÓSTICO 3: DASHBOARD STATS (MATERIALIZED VIEW)
// ════════════════════════════════════════════════════════════

async function diagnosticoDashboardStats() {
  console.log('━'.repeat(80))
  console.log('📊 DIAGNÓSTICO 3: DASHBOARD STATS (MATERIALIZED VIEW)')
  console.log('━'.repeat(80))
  console.log('')

  const stats = await DashboardStats.findOne({ version: 'v3' }).lean()

  if (!stats) {
    console.log('❌ NENHUM documento encontrado! (materialized view vazia)')
    return null
  }

  console.log(`✅ Documento encontrado:`)
  console.log(`   📅 Calculado em: ${stats.calculatedAt}`)
  console.log(
    `   ⏰ Idade: ${Math.floor((Date.now() - new Date(stats.calculatedAt).getTime()) / 1000 / 60)} minutos`
  )
  console.log('')

  // Overview
  console.log(`📊 Overview:`)
  console.log(`   Total de Alunos: ${stats.overview.totalStudents}`)
  console.log(`   Engagement Médio: ${stats.overview.avgEngagement}`)
  console.log(`   Progresso Médio: ${stats.overview.avgProgress}%`)
  console.log('')

  // By Platform
  console.log(`📦 Por Plataforma:`)
  stats.byPlatform.forEach((p: any) => {
    console.log(`   ${p.icon} ${p.name}: ${p.count} alunos (${p.percentage}%)`)
  })
  console.log('')

  // Quick Filters
  console.log(`🎯 Quick Filters:`)
  console.log(`   🚨 Em Risco: ${stats.quickFilters.atRisk}`)
  console.log(`   🏆 Top 10%: ${stats.quickFilters.topPerformers}`)
  console.log(`   😴 Inativos 30d: ${stats.quickFilters.inactive30d}`)
  console.log(`   📅 Novos 7d: ${stats.quickFilters.new7d}`)
  console.log('')

  // Procurar CursEDuca especificamente
  const curseduca = stats.byPlatform.find((p: any) => p.name.toLowerCase() === 'curseduca')
  if (curseduca) {
    console.log(`✅ CursEDuca encontrado na materialized view: ${curseduca.count} alunos`)
  } else {
    console.log(`❌ CursEDuca NÃO encontrado na materialized view!`)
  }

  return curseduca?.count || 0
}

// ════════════════════════════════════════════════════════════
// DIAGNÓSTICO 4: CRUZAMENTO DE DADOS
// ════════════════════════════════════════════════════════════

async function diagnosticoCruzamento() {
  console.log('━'.repeat(80))
  console.log('📊 DIAGNÓSTICO 4: CRUZAMENTO DE DADOS')
  console.log('━'.repeat(80))
  console.log('')

  // Buscar users CursEDuca
  const usersCurseduca = await User.find({
    $or: [
      { 'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] } },
      { curseducaUserId: { $exists: true, $nin: [null, ''] } }
    ]
  })
    .select('_id email')
    .lean()

  console.log(`✅ ${usersCurseduca.length} users CursEDuca na collection Users`)

  // Para cada user, ver se tem UserProducts
  let comUserProducts = 0
  let semUserProducts = 0

  for (const user of usersCurseduca.slice(0, 10)) {
    const up = await UserProduct.findOne({ userId: user._id, platform: 'curseduca' })
    if (up) {
      comUserProducts++
    } else {
      semUserProducts++
      console.log(`   ⚠️ User ${user.email} NÃO tem UserProduct CursEDuca`)
    }
  }

  console.log(`\n   ✅ Com UserProducts: ${comUserProducts}/10`)
  console.log(`   ❌ Sem UserProducts: ${semUserProducts}/10`)

  // Verificar se há UserProducts órfãos (sem user correspondente)
  const orfaos = await UserProduct.aggregate([
    { $match: { platform: 'curseduca' } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $match: { 'user.0': { $exists: false } } },
    { $count: 'total' }
  ])

  const totalOrfaos = orfaos[0]?.total || 0
  console.log(`\n   ${totalOrfaos > 0 ? '⚠️' : '✅'} UserProducts órfãos (sem user): ${totalOrfaos}`)
  console.log('')
}

// ════════════════════════════════════════════════════════════
// DIAGNÓSTICO 5: VERIFICAR DUPLICAÇÕES
// ════════════════════════════════════════════════════════════

async function diagnosticoDuplicacoes() {
  console.log('━'.repeat(80))
  console.log('📊 DIAGNÓSTICO 5: VERIFICAR DUPLICAÇÕES')
  console.log('━'.repeat(80))
  console.log('')

  // Users com múltiplos UserProducts CursEDuca
  const multiProducts = await UserProduct.aggregate([
    { $match: { platform: 'curseduca' } },
    {
      $group: {
        _id: '$userId',
        count: { $sum: 1 },
        produtos: { $push: '$productId' }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ])

  console.log(`📊 Users com múltiplos produtos CursEDuca: ${multiProducts.length}`)

  if (multiProducts.length > 0) {
    console.log(`\n   Exemplos (primeiros 5):`)
    for (const mp of multiProducts.slice(0, 5)) {
      const user = await User.findById(mp._id).select('email').lean()
      console.log(`      - ${user?.email || 'N/A'}: ${mp.count} produtos`)
    }
  }

  console.log('')
}

// ════════════════════════════════════════════════════════════
// RELATÓRIO FINAL
// ════════════════════════════════════════════════════════════

async function relatorioFinal(usersCount: number, userProductsCount: number, dashboardStatsCount: number) {
  console.log('═'.repeat(80))
  console.log('🎯 RELATÓRIO FINAL - ONDE ESTÁ O PROBLEMA?')
  console.log('═'.repeat(80))
  console.log('')

  console.log(`📊 RESUMO:`)
  console.log(`   Users CursEDuca (BD):              ${usersCount}`)
  console.log(`   UserProducts CursEDuca (BD):       ${userProductsCount} users únicos`)
  console.log(`   Dashboard Stats (Materialized):    ${dashboardStatsCount}`)
  console.log('')

  if (usersCount > 300 && userProductsCount > 300) {
    console.log(`✅ DADOS NA BD ESTÃO CORRETOS (>300 users)`)
    console.log(`   ✅ Paginação funcionou!`)
    console.log(`   ✅ Sync guardou os dados!`)
    console.log('')

    if (dashboardStatsCount < 300) {
      console.log(`❌ PROBLEMA: Materialized View está DESATUALIZADA`)
      console.log(`   💡 SOLUÇÃO: Forçar rebuild da materialized view`)
      console.log(`   🔧 Comando: POST http://localhost:3001/api/dashboard/stats/v3/rebuild`)
      console.log(`   🔧 Ou executar: db.dashboardstats.deleteMany({})`)
    } else {
      console.log(`✅ TUDO CORRETO! Dashboard Stats está atualizado`)
    }
  } else if (usersCount < 50 && userProductsCount < 50) {
    console.log(`❌ PROBLEMA: Dados NÃO FORAM GUARDADOS na BD`)
    console.log(`   💡 Possíveis causas:`)
    console.log(`      1. Paginação não está a funcionar`)
    console.log(`      2. Sync não está a guardar os dados`)
    console.log(`      3. Credenciais CursEDuca incorretas`)
    console.log('')
    console.log(`   🔧 SOLUÇÃO: Verificar logs do sync`)
  } else {
    console.log(`⚠️ PROBLEMA: Dados PARCIAIS`)
    console.log(`   Users: ${usersCount}`)
    console.log(`   UserProducts: ${userProductsCount}`)
    console.log(`   💡 Alguns dados foram guardados, mas não todos`)
  }

  console.log('')
  console.log('═'.repeat(80))
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  try {
    console.log('')
    console.log('🔍 '.repeat(40))
    console.log('🔍 DIAGNÓSTICO COMPLETO: CursEDuca')
    console.log('🔍 '.repeat(40))
    console.log('')

    await conectar()

    const usersCount = await diagnosticoUsers()
    const userProductsCount = await diagnosticoUserProducts()
    const dashboardStatsCount = await diagnosticoDashboardStats()
    await diagnosticoCruzamento()
    await diagnosticoDuplicacoes()

    await relatorioFinal(usersCount, userProductsCount, dashboardStatsCount || 0)
  } catch (error) {
    console.error('❌ ERRO:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Desconectado do MongoDB')
  }
}

main()
