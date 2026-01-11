// ════════════════════════════════════════════════════════════
// TESTE DIRECTO: Tag Rules Only (executa função directamente)
// Não precisa do servidor a correr!
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

// Utilizadores específicos para monitorizar
const USERS_TO_MONITOR = [
  'marco_vidigal@hotmail.com',
  'ludovicsilva@hotmail.com',
  'ruifilipespteixeira@gmail.com',
  'joaomcf37@gmail.com'
]

interface TagDiscrepancy {
  email: string
  productCode: string
  type: 'NOT_INSERTED' | 'NOT_REMOVED'
  tag: string
  expected: string[]
  actual: string[]
}

async function main() {
  const startTime = Date.now()

  console.log('━'.repeat(70))
  console.log('TESTE DIRECTO: Tag Rules Only')
  console.log('(Executa função directamente - não precisa do servidor)')
  console.log('━'.repeat(70))
  console.log('')

  await mongoose.connect(MONGO_URI)
  console.log('MongoDB conectado\n')

  const { User, UserProduct, Product } = await import('../src/models')
  const activeCampaignService = (await import('../src/services/activeCampaign/activeCampaignService')).default
  const { decisionEngine } = await import('../src/services/activeCampaign/decisionEngine.service')
  const TagRule = (await import('../src/models/acTags/TagRule')).default

  // Get BO tag names
  const allTagRules = await TagRule.find({ isActive: true }).select('actions.addTag').lean()
  const boTagNames = new Set<string>()
  for (const rule of allTagRules) {
    const tagName = (rule as any).actions?.addTag
    if (tagName) boTagNames.add(tagName)
  }

  // ════════════════════════════════════════════════════════════
  // FASE 1: Capturar estado ANTES
  // ════════════════════════════════════════════════════════════
  console.log('═'.repeat(70))
  console.log('FASE 1: Capturar estado ANTES')
  console.log('═'.repeat(70))

  // Buscar produtos DISCORD para ignorar
  const discordProducts = await Product.find({ code: { $in: ['DISCORD_COMMUNITY', 'DISCORD'] } }).select('_id').lean()
  const discordProductIds = new Set(discordProducts.map((p: any) => p._id.toString()))

  // Buscar users pelos emails
  const monitoredUsers = await User.find({ email: { $in: USERS_TO_MONITOR } }).lean() as any[]
  const monitoredUserIds = monitoredUsers.map(u => u._id.toString())

  console.log(`\n📋 Utilizadores a monitorizar: ${USERS_TO_MONITOR.length}`)
  for (const email of USERS_TO_MONITOR) {
    const found = monitoredUsers.find(u => u.email === email)
    console.log(`   ${email}: ${found ? '✅ encontrado' : '❌ NÃO encontrado'}`)
  }

  // Buscar TODOS os UserProducts destes users
  const monitoredUserProducts = await UserProduct.find({
    userId: { $in: monitoredUserIds },
    status: 'ACTIVE'
  })
    .populate('userId', 'email')
    .populate('productId', 'code')
    .lean() as any[]

  // Filtrar apenas produtos com regras de tags (não DISCORD)
  const usersToCheck = monitoredUserProducts.filter(up => {
    const productIdStr = up.productId?._id?.toString()
    if (discordProductIds.has(productIdStr)) {
      console.log(`   ⚠️ ${up.userId?.email} - ${up.productId?.code}: ignorado (DISCORD)`)
      return false
    }
    return true
  })

  console.log(`\n✅ ${usersToCheck.length} UserProducts a processar:`)
  for (const up of usersToCheck) {
    console.log(`   ${up.userId?.email} - ${up.productId?.code}`)
  }

  type UserState = {
    email: string
    userId: string
    productId: string
    productCode: string
    tagsBefore: string[]
    expectedTags: string[]
  }

  const userStates: UserState[] = []

  console.log('\nA capturar estado ANTES...')

  for (const up of usersToCheck) {
    try {
      const email = up.userId.email
      const userIdStr = up.userId._id.toString()
      const productIdStr = up.productId._id.toString()
      const productCode = up.productId.code

      // Tags actuais na AC
      const acTags = await activeCampaignService.getContactTagsByEmail(email)
      const boTags = acTags.filter((t: string) => boTagNames.has(t))

      // Tags esperadas
      const evaluation = await decisionEngine.evaluateUserProduct(userIdStr, productIdStr)
      const expectedTags = evaluation.tagsToApply || []

      userStates.push({
        email,
        userId: userIdStr,
        productId: productIdStr,
        productCode,
        tagsBefore: boTags,
        expectedTags
      })
    } catch (err: any) {
      console.log(`   ❌ Erro ${up.userId?.email}: ${err.message}`)
    }
  }

  console.log(`\n✅ Estado ANTES capturado para ${userStates.length} utilizadores`)

  // Mostrar estado dos users monitorizados
  console.log('\n📋 Estado ANTES dos utilizadores monitorizados:')
  for (const s of userStates) {
    console.log(`   ${s.email} (${s.productCode}):`)
    console.log(`      Tags AC: [${s.tagsBefore.join(', ')}]`)
    console.log(`      Esperado: [${s.expectedTags.join(', ')}]`)
  }

  // ════════════════════════════════════════════════════════════
  // FASE 2: Executar Tag Rules DIRECTAMENTE
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70))
  console.log('FASE 2: Executar executeTagRulesOnly() DIRECTAMENTE')
  console.log('═'.repeat(70))

  const executeStart = Date.now()

  try {
    console.log('\n🚀 A executar... (pode demorar vários minutos)\n')

    // Importar e executar a função directamente
    const { executeTagRulesOnly } = await import('../src/services/cron/dailyPipeline.service')
    const result = await executeTagRulesOnly()

    const executeDuration = Math.floor((Date.now() - executeStart) / 1000)

    console.log(`\n✅ Execução completada em ${Math.floor(executeDuration / 60)}min ${executeDuration % 60}s`)
    console.log(`   Success: ${result.success}`)
    console.log(`   Tags aplicadas: ${result.summary?.tagsApplied || 0}`)
    console.log(`   Tags removidas: ${result.summary?.tagsRemoved || 0}`)

    if (result.errors?.length > 0) {
      console.log(`   Erros: ${result.errors.length}`)
      for (const err of result.errors.slice(0, 5)) {
        console.log(`      - ${err}`)
      }
    }
  } catch (err: any) {
    console.log(`❌ Erro na execução: ${err.message}`)
  }

  // ════════════════════════════════════════════════════════════
  // FASE 3: Verificar estado DEPOIS
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70))
  console.log('FASE 3: Verificar estado DEPOIS e detectar discrepâncias')
  console.log('═'.repeat(70))

  const discrepancies: TagDiscrepancy[] = []

  console.log('\nA verificar estado DEPOIS...')

  for (const state of userStates) {
    try {
      // Tags actuais na AC (DEPOIS)
      const acTagsAfter = await activeCampaignService.getContactTagsByEmail(state.email)
      const boTagsAfter = acTagsAfter.filter((t: string) => boTagNames.has(t))

      // Filtrar apenas tags do produto actual
      const productPrefix = state.productCode.toUpperCase()
      const productBoTagsAfter = boTagsAfter.filter((t: string) =>
        t.toUpperCase().startsWith(productPrefix)
      )
      const productExpectedTags = state.expectedTags.filter((t: string) =>
        t.toUpperCase().startsWith(productPrefix)
      )

      // Detectar discrepâncias
      for (const expectedTag of productExpectedTags) {
        if (!productBoTagsAfter.includes(expectedTag)) {
          discrepancies.push({
            email: state.email,
            productCode: state.productCode,
            type: 'NOT_INSERTED',
            tag: expectedTag,
            expected: productExpectedTags,
            actual: productBoTagsAfter
          })
        }
      }

      for (const actualTag of productBoTagsAfter) {
        if (!productExpectedTags.includes(actualTag)) {
          discrepancies.push({
            email: state.email,
            productCode: state.productCode,
            type: 'NOT_REMOVED',
            tag: actualTag,
            expected: productExpectedTags,
            actual: productBoTagsAfter
          })
        }
      }
    } catch (err: any) {
      console.log(`   ❌ Erro ao verificar ${state.email}: ${err.message}`)
    }
  }

  // Mostrar estado DEPOIS
  console.log('\n📋 Estado DEPOIS dos utilizadores monitorizados:')
  for (const email of USERS_TO_MONITOR) {
    try {
      const acTagsAfter = await activeCampaignService.getContactTagsByEmail(email)
      const boTagsAfter = acTagsAfter.filter((t: string) => boTagNames.has(t))
      const states = userStates.filter(s => s.email === email)

      console.log(`   ${email}:`)
      console.log(`      Tags AC DEPOIS: [${boTagsAfter.join(', ')}]`)

      for (const state of states) {
        const productPrefix = state.productCode.toUpperCase()
        const productTags = boTagsAfter.filter((t: string) => t.toUpperCase().startsWith(productPrefix))
        const productExpected = state.expectedTags.filter((t: string) => t.toUpperCase().startsWith(productPrefix))

        const isCorrect = productTags.length === productExpected.length &&
          productTags.every(t => productExpected.includes(t))

        if (isCorrect) {
          console.log(`      ${state.productCode}: ✅ CORRECTO!`)
        } else {
          const extra = productTags.filter(t => !productExpected.includes(t))
          const missing = productExpected.filter(t => !productTags.includes(t))
          console.log(`      ${state.productCode}:`)
          if (extra.length > 0) console.log(`         ❌ Extra: [${extra.join(', ')}]`)
          if (missing.length > 0) console.log(`         ❌ Falta: [${missing.join(', ')}]`)
        }
      }
    } catch (err) {
      console.log(`   ${email}: Erro ao verificar`)
    }
  }

  // ════════════════════════════════════════════════════════════
  // FASE 4: Relatório
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70))
  console.log('FASE 4: Relatório de discrepâncias')
  console.log('═'.repeat(70))

  const totalDuration = Math.floor((Date.now() - startTime) / 1000)

  const notInserted = discrepancies.filter(d => d.type === 'NOT_INSERTED')
  const notRemoved = discrepancies.filter(d => d.type === 'NOT_REMOVED')

  console.log(`\n📊 RESUMO:`)
  console.log(`   Total utilizadores verificados: ${userStates.length}`)
  console.log(`   Total discrepâncias: ${discrepancies.length}`)
  console.log(`      - Tags NÃO inseridas (deviam estar): ${notInserted.length}`)
  console.log(`      - Tags NÃO removidas (não deviam estar): ${notRemoved.length}`)
  console.log(`   Duração total: ${Math.floor(totalDuration / 60)}min ${totalDuration % 60}s`)

  if (discrepancies.length === 0) {
    console.log('\n🎉 PERFEITO! Nenhuma discrepância encontrada!')
  } else {
    console.log('\n❌ DISCREPÂNCIAS ENCONTRADAS:')

    if (notInserted.length > 0) {
      console.log('\n   📥 Tags que DEVIAM ser inseridas mas NÃO foram:')
      for (const d of notInserted) {
        console.log(`      ${d.email} (${d.productCode}): "${d.tag}"`)
      }
    }

    if (notRemoved.length > 0) {
      console.log('\n   📤 Tags que DEVIAM ser removidas mas NÃO foram:')
      for (const d of notRemoved) {
        console.log(`      ${d.email} (${d.productCode}): "${d.tag}"`)
      }
    }
  }

  // Guardar relatório
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportDir = path.join(process.cwd(), 'test-results')

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }

  const report = {
    timestamp: new Date().toISOString(),
    type: 'tag-rules-direct',
    usersVerified: userStates.length,
    discrepancies: {
      total: discrepancies.length,
      notInserted: notInserted.length,
      notRemoved: notRemoved.length,
      details: discrepancies
    },
    duration: totalDuration
  }

  const reportPath = path.join(reportDir, `tag-rules-direct-${timestamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\n💾 Relatório guardado: ${reportPath}`)

  console.log('\n' + '━'.repeat(70))
  console.log('Teste completo!')
  console.log('━'.repeat(70))

  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
