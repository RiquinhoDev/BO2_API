// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SCRIPT DE DIAGNÓSTICO NODE.JS: VALIDAÇÃO DE FILTROS
// ═══════════════════════════════════════════════════════════════════════════
// 
// COMO EXECUTAR:
// 1. Salvar este ficheiro como: BO2_API/scripts/diagnosticoFiltros.ts
// 2. No terminal: cd BO2_API
// 3. Executar: npx ts-node scripts/diagnosticoFiltros.ts
// 
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

// ═══════════════════════════════════════════════════════════════════════════
// CONECTAR À BD
// ═══════════════════════════════════════════════════════════════════════════

async function connect() {
  try {
    await mongoose.connect(MONGO_URI)
    console.log('✅ Conectado ao MongoDB\n')
  } catch (error) {
    console.error('❌ Erro ao conectar:', error)
    process.exit(1)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODELS E TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface IUserProduct {
  _id: any
  userId: any
  productId: any
  platform?: string
  status?: string
  engagement?: {
    engagementScore?: number
    engagementLevel?: string
  }
  progress?: {
    percentage?: number
  }
  enrolledAt?: Date
  createdAt?: Date
  lastAccessDate?: Date
}

interface IUser {
  _id: any
  name?: string
  email?: string
  discord?: {
    discordIds?: string[]
    engagement?: {
      lastMessageDate?: Date
    }
  }
  discordIds?: string[]
  lastAccessDate?: Date
}

const UserProduct = mongoose.model<IUserProduct>('UserProduct', new mongoose.Schema({}, { strict: false }))
const User = mongoose.model<IUser>('User', new mongoose.Schema({}, { strict: false }))

// ═══════════════════════════════════════════════════════════════════════════
// 📊 FUNÇÃO 1: OVERVIEW GERAL
// ═══════════════════════════════════════════════════════════════════════════

async function getOverview() {
  console.log('═'.repeat(80))
  console.log('📊 OVERVIEW GERAL')
  console.log('═'.repeat(80))
  
  const totalUserProducts = await UserProduct.countDocuments()
  const totalUsers = await User.countDocuments()
  
  const byPlatform = await UserProduct.aggregate([
    { $group: { _id: '$platform', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ])
  
  const byStatus = await UserProduct.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ])
  
  const withEngagement = await UserProduct.countDocuments({
    'engagement.engagementScore': { $exists: true, $ne: null }
  })
  
  const withProgress = await UserProduct.countDocuments({
    'progress.percentage': { $gt: 0 }
  })
  
  console.log(`\n📌 Total UserProducts: ${totalUserProducts}`)
  console.log(`📌 Total Users: ${totalUsers}`)
  console.log(`📌 Com Engagement: ${withEngagement}`)
  console.log(`📌 Com Progresso: ${withProgress}\n`)
  
  console.log('Por Plataforma:')
  byPlatform.forEach(p => console.log(`  ${p._id || 'null'}: ${p.count}`))
  
  console.log('\nPor Status:')
  byStatus.forEach(s => console.log(`  ${s._id || 'null'}: ${s.count}`))
  
  console.log('')
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚨 FUNÇÃO 2: DIAGNÓSTICO "EM RISCO"
// ═══════════════════════════════════════════════════════════════════════════

async function diagnosticoEmRisco() {
  console.log('═'.repeat(80))
  console.log('🚨 FILTRO: EM RISCO')
  console.log('═'.repeat(80))
  console.log('Dashboard mostra: 2450\n')
  
  // Método 1: Por engagementLevel
  const porLevel = await UserProduct.countDocuments({
    'engagement.engagementLevel': { $in: ['MUITO_BAIXO', 'BAIXO'] }
  })
  
  // Método 2: Por engagementScore < 30
  const porScore = await UserProduct.countDocuments({
    'engagement.engagementScore': { $lt: 30 }
  })
  
  // Método 3: Sem engagement
  const semEngagement = await UserProduct.countDocuments({
    $or: [
      { 'engagement.engagementScore': { $exists: false } },
      { 'engagement.engagementScore': null },
      { 'engagement.engagementScore': 0 }
    ]
  })
  
  // Distribuição de níveis
  const distribuicao = await UserProduct.aggregate([
    { $group: { _id: '$engagement.engagementLevel', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ])
  
  console.log(`✅ Por Engagement Level (MUITO_BAIXO + BAIXO): ${porLevel}`)
  console.log(`✅ Por Engagement Score (< 30): ${porScore}`)
  console.log(`✅ Sem Engagement: ${semEngagement}\n`)
  
  console.log('Distribuição de Níveis:')
  distribuicao.forEach(d => console.log(`  ${d._id || 'null'}: ${d.count}`))
  
  // Análise
  console.log('\n🔍 ANÁLISE:')
  if (porLevel === 2450) {
    console.log('  ✅ Contador CORRETO (usa engagementLevel)')
  } else if (porScore === 2450) {
    console.log('  ⚠️  Contador usa engagementScore < 30')
  } else if (semEngagement === 2450) {
    console.log('  ⚠️  Contador conta apenas sem engagement')
  } else {
    console.log(`  ❌ DISCREPÂNCIA! Nenhum método resulta em 2450`)
    console.log(`     Possível critério: MUITO_BAIXO + BAIXO + SEM ENGAGEMENT`)
    console.log(`     Soma: ${porLevel + semEngagement}`)
  }
  
  console.log('')
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏆 FUNÇÃO 3: DIAGNÓSTICO "TOP 10%"
// ═══════════════════════════════════════════════════════════════════════════

async function diagnosticoTop10() {
  console.log('═'.repeat(80))
  console.log('🏆 FILTRO: TOP 10%')
  console.log('═'.repeat(80))
  console.log('Dashboard mostra: 0\n')
  
  const total = await UserProduct.countDocuments()
  const comScore = await UserProduct.countDocuments({
    'engagement.engagementScore': { $exists: true, $ne: null, $gt: 0 }
  })
  
  const top10Count = Math.ceil(total * 0.10)
  
  // Buscar top 10%
  const topUsers = await UserProduct.find({
    'engagement.engagementScore': { $exists: true, $ne: null }
  })
    .sort({ 'engagement.engagementScore': -1 })
    .limit(top10Count)
    .select('engagement.engagementScore')
    .lean() as IUserProduct[]
  
  const minScoreTop10 = topUsers[topUsers.length - 1]?.engagement?.engagementScore || 0
  const maxScoreTop10 = topUsers[0]?.engagement?.engagementScore || 0
  
  // Critério fixo ERRADO atual
  const scoreAlto = await UserProduct.countDocuments({
    'engagement.engagementScore': { $gte: 70 }
  })
  
  console.log(`✅ Total UserProducts: ${total}`)
  console.log(`✅ Com Engagement Score: ${comScore}`)
  console.log(`✅ Top 10% deveria ser: ${top10Count} alunos`)
  console.log(`   Score range dos Top 10%: ${minScoreTop10} - ${maxScoreTop10}`)
  console.log(`✅ Score >= 70 (critério fixo ERRADO): ${scoreAlto}\n`)
  
  // Análise
  console.log('🔍 ANÁLISE:')
  if (scoreAlto === 0) {
    console.log('  ❌ PROBLEMA: Contador usa score >= 70 (critério fixo)')
    console.log('  ❌ Nenhum aluno tem score >= 70!')
    console.log(`  ✅ SOLUÇÃO: Mudar para Top 10% dinâmico (${top10Count} alunos)`)
    console.log(`  ✅ Threshold deveria ser: ${minScoreTop10}`)
  } else {
    console.log(`  ⚠️  Contador pode estar usando score >= 70`)
    console.log(`  ✅ Mas deveria usar Top 10% dinâmico (${top10Count} alunos)`)
  }
  
  console.log('')
}

// ═══════════════════════════════════════════════════════════════════════════
// 😴 FUNÇÃO 4: DIAGNÓSTICO "INATIVOS 30D"
// ═══════════════════════════════════════════════════════════════════════════

async function diagnosticoInativos30d() {
  console.log('═'.repeat(80))
  console.log('😴 FILTRO: INATIVOS 30D')
  console.log('═'.repeat(80))
  console.log('Dashboard mostra: 785\n')
  
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  // Método 1: Users com Discord
  const comDiscord = await User.countDocuments({
    $or: [
      { 'discord.discordIds.0': { $exists: true } },
      { 'discordIds.0': { $exists: true } }
    ]
  })
  
  // Método 2: Discord inativo há 30+ dias
  const inativosDiscord = await User.countDocuments({
    $or: [
      { 'discord.engagement.lastMessageDate': { $lt: thirtyDaysAgo } },
      {
        $and: [
          { $or: [
            { 'discord.discordIds.0': { $exists: true } },
            { 'discordIds.0': { $exists: true } }
          ]},
          { 'discord.engagement.lastMessageDate': { $exists: false } }
        ]
      }
    ]
  })
  
  // Método 3: Hotmart inativo há 30+ dias (PODE SER O ATUAL - ERRADO!)
  const inativosHotmart = await User.countDocuments({
    lastAccessDate: { $lt: thirtyDaysAgo }
  })
  
  // Sem atividade Discord
  const semAtividadeDiscord = await User.countDocuments({
    $and: [
      { $or: [
        { 'discord.discordIds.0': { $exists: true } },
        { 'discordIds.0': { $exists: true } }
      ]},
      { 'discord.engagement.lastMessageDate': { $exists: false } }
    ]
  })
  
  console.log(`✅ Users com Discord: ${comDiscord}`)
  console.log(`✅ Discord Inativos 30+ dias: ${inativosDiscord}`)
  console.log(`✅ Hotmart Inativos 30+ dias: ${inativosHotmart}`)
  console.log(`✅ Sem atividade Discord registada: ${semAtividadeDiscord}\n`)
  
  // Análise
  console.log('🔍 ANÁLISE:')
  if (inativosDiscord === 785) {
    console.log('  ✅ Contador CORRETO (usa Discord)')
  } else if (inativosHotmart === 785) {
    console.log('  ❌ PROBLEMA: Contador usa Hotmart (lastAccessDate)')
    console.log('  ❌ Deveria usar Discord (discord.engagement.lastMessageDate)')
  } else if (semAtividadeDiscord === 785) {
    console.log('  ⚠️  Contador conta apenas users SEM data de atividade')
  } else {
    console.log(`  ❌ DISCREPÂNCIA! Nenhum método resulta em 785`)
    console.log('     Possíveis critérios:')
    console.log(`     - Discord inativos + sem atividade: ${inativosDiscord + semAtividadeDiscord}`)
  }
  
  console.log('')
}

// ═══════════════════════════════════════════════════════════════════════════
// 📅 FUNÇÃO 5: DIAGNÓSTICO "NOVOS 7D"
// ═══════════════════════════════════════════════════════════════════════════

async function diagnosticoNovos7d() {
  console.log('═'.repeat(80))
  console.log('📅 FILTRO: NOVOS 7D')
  console.log('═'.repeat(80))
  console.log('Dashboard mostra: 9\n')
  
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  // Método 1: enrolledAt
  const porEnrolledAt = await UserProduct.countDocuments({
    enrolledAt: { $gte: sevenDaysAgo }
  })
  
  // Método 2: createdAt
  const porCreatedAt = await UserProduct.countDocuments({
    createdAt: { $gte: sevenDaysAgo }
  })
  
  // Detalhes
  const detalhes = await UserProduct.aggregate([
    { $match: { enrolledAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        plataformas: { $addToSet: '$platform' },
        primeira: { $min: '$enrolledAt' },
        ultima: { $max: '$enrolledAt' }
      }
    }
  ])
  
  console.log(`✅ Por enrolledAt (últimos 7 dias): ${porEnrolledAt}`)
  console.log(`✅ Por createdAt (últimos 7 dias): ${porCreatedAt}\n`)
  
  if (detalhes.length > 0) {
    console.log('Detalhes:')
    console.log(`  Plataformas: ${detalhes[0].plataformas.join(', ')}`)
    console.log(`  Primeira inscrição: ${detalhes[0].primeira}`)
    console.log(`  Última inscrição: ${detalhes[0].ultima}`)
  }
  
  // Análise
  console.log('\n🔍 ANÁLISE:')
  if (porEnrolledAt === 9) {
    console.log('  ✅ Contador CORRETO (usa enrolledAt)')
  } else if (porCreatedAt === 9) {
    console.log('  ⚠️  Contador usa createdAt em vez de enrolledAt')
  } else {
    console.log(`  ❌ DISCREPÂNCIA! Nenhum método resulta em 9`)
    console.log('     Possíveis problemas:')
    console.log('     - Timezone diferente')
    console.log('     - Campo diferente sendo usado')
  }
  
  console.log('')
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FUNÇÃO 6: AMOSTRAS PARA DEBUG
// ═══════════════════════════════════════════════════════════════════════════

async function mostrarAmostras() {
  console.log('═'.repeat(80))
  console.log('🔍 AMOSTRAS DE DADOS (para debug)')
  console.log('═'.repeat(80))
  
  // Amostra "Em Risco"
  console.log('\n🚨 Amostra de "Em Risco":')
  const emRisco = await UserProduct.find({
    'engagement.engagementLevel': { $in: ['MUITO_BAIXO', 'BAIXO'] }
  })
    .populate('userId', 'name email')
    .limit(3)
    .lean() as IUserProduct[]
  
  emRisco.forEach((up, i) => {
    const user = up.userId as any
    console.log(`\n  [${i+1}] ${user?.name || 'N/A'} (${user?.email || 'N/A'})`)
    console.log(`      Plataforma: ${up.platform}`)
    console.log(`      Engagement: ${up.engagement?.engagementLevel} (${up.engagement?.engagementScore})`)
  })
  
  // Amostra "Top Performers"
  console.log('\n\n🏆 Amostra de "Top Performers":')
  const topPerformers = await UserProduct.find({
    'engagement.engagementScore': { $exists: true, $ne: null }
  })
    .sort({ 'engagement.engagementScore': -1 })
    .populate('userId', 'name email')
    .limit(3)
    .lean() as IUserProduct[]
  
  topPerformers.forEach((up, i) => {
    const user = up.userId as any
    console.log(`\n  [${i+1}] ${user?.name || 'N/A'} (${user?.email || 'N/A'})`)
    console.log(`      Plataforma: ${up.platform}`)
    console.log(`      Engagement: ${up.engagement?.engagementLevel} (${up.engagement?.engagementScore})`)
  })
  
  // Amostra "Novos 7d"
  console.log('\n\n📅 Amostra de "Novos 7d":')
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  const novos = await UserProduct.find({
    enrolledAt: { $gte: sevenDaysAgo }
  })
    .sort({ enrolledAt: -1 })
    .populate('userId', 'name email')
    .limit(3)
    .lean() as IUserProduct[]
  
  novos.forEach((up, i) => {
    const user = up.userId as any
    console.log(`\n  [${i+1}] ${user?.name || 'N/A'} (${user?.email || 'N/A'})`)
    console.log(`      Plataforma: ${up.platform}`)
    console.log(`      Inscrito em: ${up.enrolledAt}`)
  })
  
  console.log('\n')
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    await connect()
    
    await getOverview()
    await diagnosticoEmRisco()
    await diagnosticoTop10()
    await diagnosticoInativos30d()
    await diagnosticoNovos7d()
    await mostrarAmostras()
    
    console.log('═'.repeat(80))
    console.log('✅ DIAGNÓSTICO COMPLETO')
    console.log('═'.repeat(80))
    console.log('\n💡 PRÓXIMOS PASSOS:')
    console.log('   1. Comparar valores acima com Dashboard')
    console.log('   2. Identificar discrepâncias')
    console.log('   3. Corrigir lógica dos contadores no backend')
    console.log('   4. Executar novamente para validar\n')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.connection.close()
    console.log('👋 Desconectado\n')
    process.exit(0)
  }
}

main()