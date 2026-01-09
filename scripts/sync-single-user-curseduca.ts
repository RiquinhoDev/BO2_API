// ════════════════════════════════════════════════════════════════════════════
// 🔄 SYNC SINGLE USER - CursEduca
// ════════════════════════════════════════════════════════════════════════════
//
// Executa sync do CursEduca para um único user
// Cria UserProducts para produtos Clareza se necessário
//
// EXECUÇÃO:
//   npm run sync:single-user-curseduca
//
// ════════════════════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/user'
import { UserProduct, Product } from '../src/models'
import curseducaAdapter from '../src/services/syncUtilziadoresServices/curseducaServices/curseduca.adapter'
import universalSyncService from '../src/services/syncUtilziadoresServices/universalSyncService'

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ════════════════════════════════════════════════════════════════════════════

const TEST_EMAIL = 'ruifilipespteixeira@gmail.com'

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function syncSingleUserCurseduca() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🔄 SYNC SINGLE USER - CursEduca')
  console.log('════════════════════════════════════════════════════════════════\n')
  console.log(`📧 Email: ${TEST_EMAIL}`)
  console.log('════════════════════════════════════════════════════════════════\n')

  const startTime = Date.now()

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: CONECTAR BD
    // ═══════════════════════════════════════════════════════════

    console.log('📡 Conectando à BD...')
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('✅ Conectado à BD\n')

    // ═══════════════════════════════════════════════════════════
    // STEP 2: BUSCAR USER
    // ═══════════════════════════════════════════════════════════

    console.log('🔍 Buscando user na BD...')
    const user = await User.findOne({ email: TEST_EMAIL })

    if (!user) {
      console.error(`❌ User não encontrado: ${TEST_EMAIL}`)
      process.exit(1)
    }

    console.log(`✅ User encontrado: ${user.name || user.email}`)
    console.log(`   ID: ${user._id}`)
    console.log(`   CursEduca ID: ${user.curseduca?.curseducaUserId || 'N/A'}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 3: LISTAR USERPRODUCTS ANTES DO SYNC
    // ═══════════════════════════════════════════════════════════

    console.log('📦 UserProducts ANTES do sync:')
    const userProductsBefore = await UserProduct.find({ userId: user._id })
      .populate('productId', 'code name platform')

    if (userProductsBefore.length === 0) {
      console.log('   (nenhum)')
    } else {
      for (const up of userProductsBefore) {
        const product = up.productId as any
        console.log(`   - ${product.code}: ${product.name} (${product.platform})`)
      }
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 4: BUSCAR DADOS NO CURSEDUCA VIA ADAPTER (OTIMIZADO)
    // ═══════════════════════════════════════════════════════════

    const curseducaUserId = user.curseduca?.curseducaUserId
      ? Number(user.curseduca.curseducaUserId)
      : null

    if (!curseducaUserId) {
      console.error(`❌ User não tem curseducaUserId na BD`)
      process.exit(1)
    }

    console.log('🔄 Buscando dados no CursEduca (estratégia otimizada - 2 chamadas)...')
    console.log(`   CursEduca ID: ${curseducaUserId}`)

    const curseducaData = await curseducaAdapter.fetchSingleUserData(curseducaUserId)

    if (!curseducaData || curseducaData.length === 0) {
      console.error(`❌ Nenhum dado retornado para user ${curseducaUserId}`)
      process.exit(1)
    }

    console.log(`✅ ${curseducaData.length} enrollment(s) encontrado(s):`)
    for (const item of curseducaData) {
      console.log(`   - ${item.groupName} (GroupId: ${item.groupId})`)
      console.log(`      Subscription: ${item.subscriptionType}`)
      console.log(`      Progress: ${item.progress?.percentage || 0}%`)
      console.log(`      Last Login: ${item.lastLogin || 'N/A'}`)
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 5: EXECUTAR SYNC VIA UNIVERSALSYNCSERVICE
    // ═══════════════════════════════════════════════════════════

    console.log('🚀 Executando sync...')
    console.log(`   Processando ${curseducaData.length} enrollment(s)...\n`)

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: `Test Sync - ${TEST_EMAIL}`,
      triggeredBy: 'MANUAL',
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 10,
      sourceData: curseducaData, // Array com todos os enrollments
      onProgress: (progress) => {
        console.log(`   📊 Progresso: ${progress.percentage.toFixed(0)}%`)
      },
      onError: (error) => {
        console.error(`   ❌ Erro: ${error.message}`)
      }
    })

    console.log('')
    console.log('✅ Sync concluído!')
    console.log(`   Duração: ${result.duration}s`)
    console.log(`   Status: ${result.success ? 'SUCESSO' : 'ERRO'}`)
    console.log('')
    console.log('📊 Estatísticas:')
    console.log(`   Inseridos: ${result.stats.inserted}`)
    console.log(`   Atualizados: ${result.stats.updated}`)
    console.log(`   Inalterados: ${result.stats.unchanged || 0}`)
    console.log(`   Erros: ${result.stats.errors}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 6: LISTAR USERPRODUCTS DEPOIS DO SYNC
    // ═══════════════════════════════════════════════════════════

    console.log('📦 UserProducts DEPOIS do sync:')
    const userProductsAfter = await UserProduct.find({ userId: user._id })
      .populate('productId', 'code name platform curseducaGroupId')

    if (userProductsAfter.length === 0) {
      console.log('   ⚠️  NENHUM UserProduct encontrado!')
    } else {
      for (const up of userProductsAfter) {
        const product = up.productId as any
        console.log(`   - ${product.code}: ${product.name} (${product.platform})`)
        if (product.platform === 'curseduca') {
          console.log(`      GroupId: ${product.curseducaGroupId}`)
          console.log(`      isPrimary: ${up.isPrimary}`)
        }
      }
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 7: VALIDAR RESULTADO
    // ═══════════════════════════════════════════════════════════

    console.log('🔍 Validação:')

    const curseducaProducts = userProductsAfter.filter((up: any) =>
      up.productId?.platform === 'curseduca'
    )

    console.log(`   UserProducts CursEduca: ${curseducaProducts.length}`)
    console.log(`   Esperados: ${curseducaData.length} (1 por enrollment)`)

    // Validar cada enrollment
    for (const enrollment of curseducaData) {
      const expectedGroupId = enrollment.groupId?.toString()
      const found = curseducaProducts.find((up: any) =>
        up.productId?.curseducaGroupId === expectedGroupId
      )

      if (found) {
        console.log(`   ✅ ${enrollment.groupName} (GroupId: ${expectedGroupId})`)
      } else {
        console.log(`   ❌ ${enrollment.groupName} (GroupId: ${expectedGroupId}) - NÃO CRIADO!`)
      }
    }

    if (curseducaProducts.length !== curseducaData.length) {
      console.log(`\n⚠️  PROBLEMA: Esperava ${curseducaData.length} UserProducts, mas encontrou ${curseducaProducts.length}`)
      console.log(`\n🔍 Produtos CursEduca na BD:`)
      const allProducts = await Product.find({ platform: 'curseduca' })
        .select('code name curseducaGroupId')
      for (const p of allProducts) {
        console.log(`      - ${p.code} (GroupId: ${p.curseducaGroupId})`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 8: SUMÁRIO
    // ═══════════════════════════════════════════════════════════

    const duration = Math.floor((Date.now() - startTime) / 1000)

    console.log('')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('✅ TESTE FINALIZADO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log(`⏱️  Duração total: ${duration}s`)
    console.log(`📧 Email: ${TEST_EMAIL}`)
    console.log(`📊 UserProducts antes: ${userProductsBefore.length}`)
    console.log(`📊 UserProducts depois: ${userProductsAfter.length}`)
    console.log(`📊 Diferença: +${userProductsAfter.length - userProductsBefore.length}`)
    console.log('════════════════════════════════════════════════════════════════\n')

  } catch (error: any) {
    console.error('\n❌ Erro fatal:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Conexão BD fechada')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EXECUTAR
// ════════════════════════════════════════════════════════════════════════════

syncSingleUserCurseduca()
  .then(() => {
    console.log('\n✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error)
    process.exit(1)
  })
