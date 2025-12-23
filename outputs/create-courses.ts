// ════════════════════════════════════════════════════════════════════════════
// 🏫 CRIAR COURSES NECESSÁRIOS
// ════════════════════════════════════════════════════════════════════════════
// Cria os courses Clareza e OGI se não existirem

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

async function createCourses() {
  try {
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🏫 CRIAR COURSES NECESSÁRIOS')
    console.log('════════════════════════════════════════════════════════════\n')

    // Conectar
    console.log('📡 Conectando à MongoDB...')
    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true")
    console.log('✅ Conectado\n')

    // Importar model
    const Course = (await import('../src/models/Course')).default

    // ─────────────────────────────────────────────────────────────
    // COURSE CLAREZA
    // ─────────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 CLAREZA')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    let clarezaCourse = await Course.findOne({
      $or: [
        { code: { $regex: /^CLAREZA/i } },
        { name: { $regex: /clareza/i } }
      ]
    })

    if (clarezaCourse) {
      console.log('✅ Course Clareza já existe:')
      console.log(`   ID: ${clarezaCourse._id}`)
      console.log(`   Code: ${clarezaCourse.code}`)
      console.log(`   Name: ${clarezaCourse.name}`)
      console.log(`   TrackingType: ${clarezaCourse.trackingType}\n`)
    } else {
      console.log('🆕 Criando Course Clareza...')
      
      clarezaCourse = await Course.create({
        code: 'CLAREZA',
        name: 'Clareza',
        trackingType: 'ACTION_BASED',
        trackingConfig: {
          actionType: 'REPORT_OPEN',  // ← Corrigido!
          actionThresholds: {
            warning: 7,
            critical: 14,
            inactive: 30
          },
          consistencyThresholds: {
            excellent: 20,
            good: 10
          }
        },
        activeCampaignConfig: {
          tagPrefix: 'CLAREZA',
          listId: '1'  // ← Placeholder (pode atualizar depois)
        },
        isActive: true
      })

      console.log('✅ Course Clareza criado:')
      console.log(`   ID: ${clarezaCourse._id}`)
      console.log(`   Code: ${clarezaCourse.code}`)
      console.log(`   TrackingType: ${clarezaCourse.trackingType}\n`)
    }

    // ─────────────────────────────────────────────────────────────
    // COURSE OGI
    // ─────────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎓 OGI')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    let ogiCourse = await Course.findOne({
      $or: [
        { code: { $regex: /^OGI/i } },
        { name: { $regex: /grande investimento/i } }
      ]
    })

    if (ogiCourse) {
      console.log('✅ Course OGI já existe:')
      console.log(`   ID: ${ogiCourse._id}`)
      console.log(`   Code: ${ogiCourse.code}`)
      console.log(`   Name: ${ogiCourse.name}`)
      console.log(`   TrackingType: ${ogiCourse.trackingType}\n`)
    } else {
      console.log('🆕 Criando Course OGI...')
      
      ogiCourse = await Course.create({
        code: 'OGI',
        name: 'O Grande Investimento',
        trackingType: 'LOGIN_BASED',
        trackingConfig: {
          loginThresholds: {
            warning: 10,
            critical: 21
          },
          progressThresholds: {
            low: 25,
            medium: 50,
            high: 75
          }
        },
        activeCampaignConfig: {
          tagPrefix: 'OGI',
          listId: '1'  // ← Placeholder
        },
        isActive: true
      })

      console.log('✅ Course OGI criado:')
      console.log(`   ID: ${ogiCourse._id}`)
      console.log(`   Code: ${ogiCourse.code}`)
      console.log(`   TrackingType: ${ogiCourse.trackingType}\n`)
    }

    // ─────────────────────────────────────────────────────────────
    // ASSOCIAR PRODUTOS AOS COURSES
    // ─────────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔗 ASSOCIAR PRODUTOS → COURSES')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const Product = (await import('../src/models/Product')).default

    // Produtos Clareza
    const clarezaProducts = await Product.find({
      code: { $regex: /^CLAREZA/i },
      isActive: true
    })

    console.log(`📦 Produtos Clareza: ${clarezaProducts.length}`)
    for (const product of clarezaProducts) {
      if (!product.courseId) {
        await Product.findByIdAndUpdate(product._id, {
          $set: { courseId: clarezaCourse._id }
        })
        console.log(`   ✅ ${product.name} → Clareza`)
      } else {
        console.log(`   ⏭️  ${product.name} (já associado)`)
      }
    }
    console.log()

    // Produtos OGI
    const ogiProducts = await Product.find({
      code: { $regex: /^OGI/i },
      isActive: true
    })

    console.log(`📦 Produtos OGI: ${ogiProducts.length}`)
    for (const product of ogiProducts) {
      if (!product.courseId) {
        await Product.findByIdAndUpdate(product._id, {
          $set: { courseId: ogiCourse._id }
        })
        console.log(`   ✅ ${product.name} → OGI`)
      } else {
        console.log(`   ⏭️  ${product.name} (já associado)`)
      }
    }
    console.log()

    // ─────────────────────────────────────────────────────────────
    // RESUMO FINAL
    // ─────────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 SETUP COMPLETO!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ Course Clareza: ${clarezaCourse._id}`)
    console.log(`✅ Course OGI: ${ogiCourse._id}`)
    console.log(`✅ Produtos Clareza associados: ${clarezaProducts.length}`)
    console.log(`✅ Produtos OGI associados: ${ogiProducts.length}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🚀 PRÓXIMO PASSO:')
    console.log('   npx ts-node scripts/seed-default-tag-rules.ts\n')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('📡 Desconectado da MongoDB\n')
  }
}

createCourses()