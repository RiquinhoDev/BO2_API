// ════════════════════════════════════════════════════════════
// 🔍 VALIDAÇÃO COMPLETA DE DADOS SINCRONIZADOS (CORRIGIDO)
// ════════════════════════════════════════════════════════════
// Busca 1 user de cada plataforma e valida campos EXISTENTES no schema
// Executar: npx tsx scripts/validate-sync-data.ts

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'

dotenv.config()

const MONGODB_URI =  'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

type ResultBlock = { pass: number; fail: number; score: number }
type Results = {
  hotmart: ResultBlock
  curseduca: ResultBlock
  discord: ResultBlock
}

const makeResults = (): Results => ({
  hotmart: { pass: 0, fail: 0, score: 0 },
  curseduca: { pass: 0, fail: 0, score: 0 },
  discord: { pass: 0, fail: 0, score: 0 }
})

// ✅ Regra simples para “tem valor”
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false

  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return value !== 0 // (mantive a tua lógica: 0 conta como vazio)
  if (typeof value === 'boolean') return true
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (Array.isArray(value)) return value.length > 0

  return true
}

function printCheck(
  resultsBlock: ResultBlock,
  label: string,
  value: unknown
) {
  const ok = hasValue(value)
  const status = ok ? '✅' : '❌'
  console.log(`   ${status} ${label}: ${value ?? 'VAZIO'}`)
  if (ok) resultsBlock.pass++
  else resultsBlock.fail++
}

function finalizeScore(block: ResultBlock) {
  const total = block.pass + block.fail
  block.score = total > 0 ? Math.round((block.pass / total) * 100) : 0
}

async function validateSyncData() {
  if (!MONGODB_URI) {
    throw new Error('❌ MONGODB_URI não definido. Define no .env antes de correr o script.')
  }

  await mongoose.connect(MONGODB_URI)

  console.log('\n🔍 ════════════════════════════════════════════════════════════')
  console.log('🔍 VALIDAÇÃO COMPLETA DE DADOS SINCRONIZADOS (CORRIGIDO)')
  console.log('🔍 ════════════════════════════════════════════════════════════\n')

  const results = makeResults()

  // ═══════════════════════════════════════════════════════════
  // 🔥 HOTMART - VALIDAÇÃO
  // ═══════════════════════════════════════════════════════════

  console.log('═'.repeat(70))
  console.log('🔥 HOTMART - VALIDAÇÃO COMPLETA')
  console.log('═'.repeat(70) + '\n')

  const hotmartUser = await User.findOne({
    'hotmart.hotmartUserId': { $exists: true, $ne: null }
  })

  if (hotmartUser) {
    console.log(`📧 User: ${hotmartUser.email}`)
    console.log(`📛 Nome: ${hotmartUser.name}\n`)

    console.log('📊 DADOS DO USER (schema segregado):')
    console.log('-'.repeat(70))

    // ✅ Campos existentes no schema atual
    printCheck(results.hotmart, 'hotmartUserId', hotmartUser.hotmart?.hotmartUserId)
    printCheck(results.hotmart, 'purchaseDate', hotmartUser.hotmart?.purchaseDate)
    printCheck(results.hotmart, 'signupDate', hotmartUser.hotmart?.signupDate)
    printCheck(results.hotmart, 'firstAccessDate', hotmartUser.hotmart?.firstAccessDate)

    // lastAccessDate está dentro do progress
    printCheck(results.hotmart, 'lastAccessDate', hotmartUser.hotmart?.progress?.lastAccessDate)

    printCheck(results.hotmart, 'plusAccess', hotmartUser.hotmart?.plusAccess)

    // progress
    printCheck(results.hotmart, 'totalTimeMinutes', hotmartUser.hotmart?.progress?.totalTimeMinutes)
    printCheck(results.hotmart, 'completedLessons', hotmartUser.hotmart?.progress?.completedLessons)
    printCheck(results.hotmart, 'lessonsData.length', hotmartUser.hotmart?.progress?.lessonsData?.length)

    // engagement
    printCheck(results.hotmart, 'accessCount', hotmartUser.hotmart?.engagement?.accessCount)
    printCheck(results.hotmart, 'engagementScore', hotmartUser.hotmart?.engagement?.engagementScore)
    printCheck(results.hotmart, 'engagementLevel', hotmartUser.hotmart?.engagement?.engagementLevel)
    printCheck(results.hotmart, 'calculatedAt', hotmartUser.hotmart?.engagement?.calculatedAt)

    // turmas
    printCheck(results.hotmart, 'enrolledClasses.length', hotmartUser.hotmart?.enrolledClasses?.length)

    // sync metadata
    printCheck(results.hotmart, 'lastSyncAt', hotmartUser.hotmart?.lastSyncAt)
    printCheck(results.hotmart, 'syncVersion', hotmartUser.hotmart?.syncVersion)

    // (opcional) dados combinados
    console.log('\n🧩 DADOS COMBINADOS (opcional):')
    console.log('-'.repeat(70))
    printCheck(results.hotmart, 'combined.totalProgress', (hotmartUser as any).combined?.totalProgress)
    printCheck(results.hotmart, 'combined.combinedEngagement', (hotmartUser as any).combined?.combinedEngagement)
    printCheck(results.hotmart, 'combined.dataQuality', (hotmartUser as any).combined?.dataQuality)

    // UserProduct
    console.log('\n📦 DADOS DO USERPRODUCT:')
    console.log('-'.repeat(70))

    const hotmartUP = await UserProduct.findOne({
      userId: hotmartUser._id,
      platform: 'hotmart'
    }).lean()

    if (hotmartUP) {
      console.log(`   ✅ UserProduct encontrado`)
      console.log(`   📊 Progress: ${(hotmartUP as any).progress?.percentage || 0}%`)
      console.log(`   🔥 Engagement Score: ${(hotmartUP as any).engagement?.engagementScore || 0}`)
      console.log(`   📅 Last Activity: ${(hotmartUP as any).progress?.lastActivity || 'null'}`)
      console.log(`   🎯 Last Action: ${(hotmartUP as any).engagement?.lastAction || 'null'}`)
      console.log(`   📌 Status: ${(hotmartUP as any).status}`)
      console.log(`   🎫 Platform User ID: ${(hotmartUP as any).platformUserId || 'null'}`)

      printCheck(results.hotmart, 'UP.progress.percentage', (hotmartUP as any).progress?.percentage)
      printCheck(results.hotmart, 'UP.engagement.engagementScore', (hotmartUP as any).engagement?.engagementScore)
    } else {
      console.log(`   ❌ UserProduct NÃO ENCONTRADO!`)
      results.hotmart.fail += 2
    }

    finalizeScore(results.hotmart)
  } else {
    console.log('❌ Nenhum user Hotmart encontrado!')
  }

  // ═══════════════════════════════════════════════════════════
  // 📚 CURSEDUCA - VALIDAÇÃO
  // ═══════════════════════════════════════════════════════════

  console.log('\n\n' + '═'.repeat(70))
  console.log('📚 CURSEDUCA - VALIDAÇÃO COMPLETA')
  console.log('═'.repeat(70) + '\n')

  const curseducaUser = await User.findOne({
    'curseduca.curseducaUserId': { $exists: true, $ne: null }
  })

  if (curseducaUser) {
    console.log(`📧 User: ${curseducaUser.email}`)
    console.log(`📛 Nome: ${curseducaUser.name}\n`)

    console.log('📊 DADOS DO USER (schema segregado):')
    console.log('-'.repeat(70))

    // ✅ Campos existentes no schema atual
    printCheck(results.curseduca, 'curseducaUserId', curseducaUser.curseduca?.curseducaUserId)
    printCheck(results.curseduca, 'curseducaUuid', curseducaUser.curseduca?.curseducaUuid)

    printCheck(results.curseduca, 'groupId', curseducaUser.curseduca?.groupId)
    printCheck(results.curseduca, 'groupName', curseducaUser.curseduca?.groupName)
    printCheck(results.curseduca, 'groupCurseducaId', curseducaUser.curseduca?.groupCurseducaId)
    printCheck(results.curseduca, 'groupCurseducaUuid', curseducaUser.curseduca?.groupCurseducaUuid)

    printCheck(results.curseduca, 'memberStatus', curseducaUser.curseduca?.memberStatus)
    printCheck(results.curseduca, 'neverLogged', curseducaUser.curseduca?.neverLogged)
    printCheck(results.curseduca, 'joinedDate', curseducaUser.curseduca?.joinedDate)

    // progress
    printCheck(results.curseduca, 'estimatedProgress', curseducaUser.curseduca?.progress?.estimatedProgress)
    printCheck(results.curseduca, 'activityLevel(progress)', curseducaUser.curseduca?.progress?.activityLevel)
    printCheck(results.curseduca, 'groupEngagement', curseducaUser.curseduca?.progress?.groupEngagement)

    // engagement
    printCheck(results.curseduca, 'alternativeEngagement', curseducaUser.curseduca?.engagement?.alternativeEngagement)
    printCheck(results.curseduca, 'activityLevel(engagement)', curseducaUser.curseduca?.engagement?.activityLevel)
    printCheck(results.curseduca, 'engagementLevel', curseducaUser.curseduca?.engagement?.engagementLevel)
    printCheck(results.curseduca, 'calculatedAt', curseducaUser.curseduca?.engagement?.calculatedAt)

    // turmas
    printCheck(results.curseduca, 'enrolledClasses.length', curseducaUser.curseduca?.enrolledClasses?.length)

    // sync metadata
    printCheck(results.curseduca, 'lastSyncAt', curseducaUser.curseduca?.lastSyncAt)
    printCheck(results.curseduca, 'syncVersion', curseducaUser.curseduca?.syncVersion)

    // UserProduct
    console.log('\n📦 DADOS DO USERPRODUCT:')
    console.log('-'.repeat(70))

    const curseducaUP = await UserProduct.findOne({
      userId: curseducaUser._id,
      platform: 'curseduca'
    }).lean()

    if (curseducaUP) {
      console.log(`   ✅ UserProduct encontrado`)
      console.log(`   📊 Progress: ${(curseducaUP as any).progress?.percentage || 0}%`)
      console.log(`   🔥 Engagement Score: ${(curseducaUP as any).engagement?.engagementScore || 0}`)
      console.log(`   📅 Last Activity: ${(curseducaUP as any).progress?.lastActivity || 'null'}`)
      console.log(`   🎯 Last Action: ${(curseducaUP as any).engagement?.lastAction || 'null'}`)
      console.log(`   📌 Status: ${(curseducaUP as any).status}`)
      console.log(`   🎫 Platform User ID: ${(curseducaUP as any).platformUserId || 'null'}`)
      console.log(`   ⭐ isPrimary: ${(curseducaUP as any).isPrimary ?? 'undefined'}`)

      printCheck(results.curseduca, 'UP.progress.percentage', (curseducaUP as any).progress?.percentage)
      printCheck(results.curseduca, 'UP.engagement.engagementScore', (curseducaUP as any).engagement?.engagementScore)
      printCheck(results.curseduca, 'UP.isPrimary', (curseducaUP as any).isPrimary)
    } else {
      console.log(`   ❌ UserProduct NÃO ENCONTRADO!`)
      results.curseduca.fail += 3
    }

    finalizeScore(results.curseduca)
  } else {
    console.log('❌ Nenhum user CursEDuca encontrado!')
  }

  // ═══════════════════════════════════════════════════════════
  // 💬 DISCORD - VALIDAÇÃO
  // ═══════════════════════════════════════════════════════════

  console.log('\n\n' + '═'.repeat(70))
  console.log('💬 DISCORD - VALIDAÇÃO COMPLETA')
  console.log('═'.repeat(70) + '\n')

  const discordUser = await User.findOne({ 'discord.discordIds.0': { $exists: true } })

  if (discordUser) {
    console.log(`📧 User: ${discordUser.email}`)
    console.log(`📛 Nome: ${discordUser.name}\n`)

    console.log('📊 DADOS DO USER (schema segregado):')
    console.log('-'.repeat(70))

    // ✅ Campos existentes no schema atual
    printCheck(results.discord, 'discordId (primeiro)', discordUser.discord?.discordIds?.[0])
    printCheck(results.discord, 'role', discordUser.discord?.role)
    printCheck(results.discord, 'priority', discordUser.discord?.priority)
    printCheck(results.discord, 'locale', discordUser.discord?.locale)

    printCheck(results.discord, 'acceptedTerms', discordUser.discord?.acceptedTerms)
    printCheck(results.discord, 'isDeletable', discordUser.discord?.isDeletable)
    printCheck(results.discord, 'isDeleted', discordUser.discord?.isDeleted)

    printCheck(results.discord, 'lastEditedBy', discordUser.discord?.lastEditedBy)
    printCheck(results.discord, 'lastEditedAt', discordUser.discord?.lastEditedAt)
    printCheck(results.discord, 'createdAt', discordUser.discord?.createdAt)

    // UserProduct
    console.log('\n📦 DADOS DO USERPRODUCT:')
    console.log('-'.repeat(70))

    const discordUP = await UserProduct.findOne({
      userId: discordUser._id,
      platform: 'discord'
    }).lean()

    if (discordUP) {
      console.log(`   ✅ UserProduct encontrado`)
      console.log(`   📌 Status: ${(discordUP as any).status}`)
      console.log(`   🎫 Platform User ID: ${(discordUP as any).platformUserId || 'null'}`)
      results.discord.pass++
    } else {
      console.log(`   ❌ UserProduct NÃO ENCONTRADO!`)
      results.discord.fail++
    }

    finalizeScore(results.discord)
  } else {
    console.log('❌ Nenhum user Discord encontrado!')
  }

  // ═══════════════════════════════════════════════════════════
  // 📊 RESUMO FINAL
  // ═══════════════════════════════════════════════════════════

  console.log('\n\n' + '═'.repeat(70))
  console.log('📊 RESUMO FINAL DA VALIDAÇÃO')
  console.log('═'.repeat(70) + '\n')

  console.log('Plataforma    | Score | Pass | Fail | Status')
  console.log('-'.repeat(70))

  for (const [platform, data] of Object.entries(results)) {
    const emoji = platform === 'hotmart' ? '🔥' : platform === 'curseduca' ? '📚' : '💬'
    const status =
      data.score >= 80 ? '✅ EXCELENTE' :
      data.score >= 60 ? '⚠️  BOM' :
      data.score >= 40 ? '🔶 RAZOÁVEL' : '❌ CRÍTICO'

    console.log(
      `${emoji} ${platform.padEnd(12)} | ${data.score.toString().padStart(3)}%  | ${data.pass.toString().padStart(4)} | ${data.fail.toString().padStart(4)} | ${status}`
    )
  }

  const totalPass = results.hotmart.pass + results.curseduca.pass + results.discord.pass
  const totalFail = results.hotmart.fail + results.curseduca.fail + results.discord.fail
  const totalScore = Math.round((totalPass / (totalPass + totalFail)) * 100)

  console.log('-'.repeat(70))
  console.log(
    `🎯 TOTAL       | ${totalScore.toString().padStart(3)}%  | ${totalPass.toString().padStart(4)} | ${totalFail.toString().padStart(4)} | ${totalScore >= 80 ? '✅ SISTEMA OK' : '⚠️  ATENÇÃO NECESSÁRIA'}`
  )

  console.log('\n' + '═'.repeat(70))

  if (totalScore >= 80) {
    console.log('✅ SISTEMA FUNCIONANDO PERFEITAMENTE!')
    console.log('✅ Os campos existentes no schema estão a ser preenchidos')
  } else if (totalScore >= 60) {
    console.log('⚠️  SISTEMA FUNCIONAL MAS PRECISA ATENÇÃO')
    console.log('⚠️  Alguns campos estão a vir vazios/0')
  } else {
    console.log('❌ SISTEMA COM PROBLEMAS CRÍTICOS')
    console.log('❌ Muitos campos estão vazios/0 — rever sync/adapters')
  }

  console.log('═'.repeat(70) + '\n')

  await mongoose.disconnect()
}

validateSyncData()
  .catch(async (err) => {
    console.error('❌ ERRO:', err)
    try { await mongoose.disconnect() } catch {}
    process.exit(1)
  })
