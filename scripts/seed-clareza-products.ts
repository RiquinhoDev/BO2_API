// ════════════════════════════════════════════════════════════════════════════
// 🌱 SEED CLAREZA PRODUCTS - Criar produtos Clareza Mensal + Anual
// ════════════════════════════════════════════════════════════════════════════
//
// CONTEXTO:
// - CursEduca tem 2 grupos para Clareza: Mensal (6) e Anual (7)
// - No frontend, aparecem como 2 produtos separados
// - Sem estes produtos, o sync não cria UserProducts para users do Clareza
//
// EXECUÇÃO:
//   npm run seed:clareza-products
//
// ════════════════════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import Course from '../src/models/Course'
import Product from '../src/models/product/Product'

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function seedClarezaProducts() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🌱 SEED CLAREZA PRODUCTS')
  console.log('════════════════════════════════════════════════════════════════\n')

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: CONECTAR BD
    // ═══════════════════════════════════════════════════════════

    console.log('📡 Conectando à BD...')
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('✅ Conectado à BD\n')

    // ═══════════════════════════════════════════════════════════
    // STEP 2: VERIFICAR/CRIAR COURSE CLAREZA
    // ═══════════════════════════════════════════════════════════

    console.log('📚 Verificando Course CLAREZA...')

    let clarezaCourse = await Course.findOne({ code: 'CLAREZA' })

    if (!clarezaCourse) {
      console.log('   ⚠️  Course CLAREZA não encontrado. Criando...')

      clarezaCourse = await Course.create({
        code: 'CLAREZA',
        name: 'Clareza',
        trackingType: 'ACTION_BASED',
        trackingConfig: {
          actionType: 'REPORT_OPEN',
          actionThresholds: {
            warning: 7,
            critical: 14,
            inactive: 30
          },
          progressThresholds: {
            low: 25,
            medium: 50,
            high: 75
          }
        },
        activeCampaignConfig: {
          tagPrefix: 'CLAREZA',
          listId: '1' // TODO: Atualizar com listId real do Active Campaign
        },
        isActive: true
      })

      console.log(`   ✅ Course CLAREZA criado: ${clarezaCourse._id}`)
    } else {
      console.log(`   ✅ Course CLAREZA já existe: ${clarezaCourse._id}`)
    }

    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 3: CRIAR PRODUTO CLAREZA_MENSAL
    // ═══════════════════════════════════════════════════════════

    console.log('📦 Criando produto CLAREZA_MENSAL...')

    const existingMensal = await Product.findOne({ code: 'CLAREZA_MENSAL' })

    if (existingMensal) {
      console.log(`   ℹ️  CLAREZA_MENSAL já existe: ${existingMensal._id}`)
      console.log(`      GroupId: ${existingMensal.curseducaGroupId}`)
    } else {
      const mensalProduct = await Product.create({
        code: 'CLAREZA_MENSAL',
        name: 'Clareza - Mensal',
        courseCode: 'CLAREZA',
        description: 'Assinatura mensal do programa Clareza',
        courseId: clarezaCourse._id,
        platform: 'curseduca',
        curseducaGroupId: '6', // GroupId do CursEduca API
        activeCampaignConfig: {
          tagPrefix: 'CLAREZA_MENSAL',
          listId: '1', // TODO: Atualizar com listId real
          automationIds: []
        },
        isActive: true,
        settings: {
          allowMultipleEnrollments: false,
          requiresApproval: false
        }
      })

      console.log(`   ✅ CLAREZA_MENSAL criado: ${mensalProduct._id}`)
      console.log(`      GroupId: ${mensalProduct.curseducaGroupId}`)
    }

    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 4: CRIAR PRODUTO CLAREZA_ANUAL
    // ═══════════════════════════════════════════════════════════

    console.log('📦 Criando produto CLAREZA_ANUAL...')

    const existingAnual = await Product.findOne({ code: 'CLAREZA_ANUAL' })

    if (existingAnual) {
      console.log(`   ℹ️  CLAREZA_ANUAL já existe: ${existingAnual._id}`)
      console.log(`      GroupId: ${existingAnual.curseducaGroupId}`)
    } else {
      const anualProduct = await Product.create({
        code: 'CLAREZA_ANUAL',
        name: 'Clareza - Anual',
        courseCode: 'CLAREZA',
        description: 'Assinatura anual do programa Clareza',
        courseId: clarezaCourse._id,
        platform: 'curseduca',
        curseducaGroupId: '7', // GroupId do CursEduca API
        activeCampaignConfig: {
          tagPrefix: 'CLAREZA_ANUAL',
          listId: '1', // TODO: Atualizar com listId real
          automationIds: []
        },
        isActive: true,
        settings: {
          allowMultipleEnrollments: false,
          requiresApproval: false
        }
      })

      console.log(`   ✅ CLAREZA_ANUAL criado: ${anualProduct._id}`)
      console.log(`      GroupId: ${anualProduct.curseducaGroupId}`)
    }

    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 5: VALIDAR PRODUTOS CRIADOS
    // ═══════════════════════════════════════════════════════════

    console.log('🔍 Validando produtos CursEduca...\n')

    const curseducaProducts = await Product.find({ platform: 'curseduca' })
      .select('code name curseducaGroupId isActive')
      .lean()

    console.log(`📊 Total de produtos CursEduca: ${curseducaProducts.length}`)

    for (const product of curseducaProducts) {
      console.log(`   - ${product.code}: ${product.name}`)
      console.log(`      GroupId: ${product.curseducaGroupId || 'N/A'}`)
      console.log(`      Ativo: ${product.isActive ? 'SIM' : 'NÃO'}`)
      console.log('')
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 6: SUMÁRIO
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('✅ SEED COMPLETO!')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')
    console.log('📋 PRÓXIMOS PASSOS:')
    console.log('   1. Executar sync CursEduca: npm run test:single-user:complete')
    console.log('   2. Verificar se UserProducts são criados corretamente')
    console.log('   3. Atualizar listId no Active Campaign se necessário')
    console.log('')
    console.log('💡 MAPEAMENTO GRUPOS → PRODUTOS:')
    console.log('   GroupId 6 (Clareza - Mensal)  → CLAREZA_MENSAL')
    console.log('   GroupId 7 (Clareza - Anual)   → CLAREZA_ANUAL')
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

seedClarezaProducts()
  .then(() => {
    console.log('\n✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error)
    process.exit(1)
  })
