// ════════════════════════════════════════════════════════════════════════════
// 🔗 ASSOCIAR PRODUTOS → COURSES
// ════════════════════════════════════════════════════════════════════════════
// Corrige a associação entre Products e Courses

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

async function linkProductsToCourses() {
  try {
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🔗 ASSOCIAR PRODUTOS → COURSES')
    console.log('════════════════════════════════════════════════════════════\n')

    // Conectar
    console.log('📡 Conectando à MongoDB...')
    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true")
    console.log('✅ Conectado\n')

    // Importar models
    const Course = (await import('../src/models/Course')).default
    const Product = (await import('../src/models/Product')).default

    // Buscar courses
    const clarezaCourse = await Course.findOne({ code: 'CLAREZA' })
    const ogiCourse = await Course.findOne({ code: 'OGI' })

    if (!clarezaCourse) {
      console.error('❌ Course CLAREZA não encontrado!')
      return
    }

    if (!ogiCourse) {
      console.error('❌ Course OGI não encontrado!')
      return
    }

    console.log('📚 Courses encontrados:')
    console.log(`   CLAREZA: ${clarezaCourse._id}`)
    console.log(`   OGI: ${ogiCourse._id}\n`)

    // ═══════════════════════════════════════════════════════════
    // ASSOCIAR PRODUTOS CLAREZA
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 CLAREZA')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const clarezaProducts = await Product.find({
      code: { $regex: /^CLAREZA/i },
      isActive: true
    })

    console.log(`Produtos encontrados: ${clarezaProducts.length}\n`)

    for (const product of clarezaProducts) {
      if (product.courseId) {
        console.log(`⏭️  ${product.name} → Já associado`)
      } else {
        await Product.findByIdAndUpdate(product._id, {
          $set: { courseId: clarezaCourse._id }
        })
        console.log(`✅ ${product.name} → CLAREZA`)
      }
    }

    console.log()

    // ═══════════════════════════════════════════════════════════
    // ASSOCIAR PRODUTOS OGI
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎓 OGI')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const ogiProducts = await Product.find({
      code: { $regex: /^OGI/i },
      isActive: true
    })

    console.log(`Produtos encontrados: ${ogiProducts.length}\n`)

    for (const product of ogiProducts) {
      if (product.courseId) {
        console.log(`⏭️  ${product.name} → Já associado`)
      } else {
        await Product.findByIdAndUpdate(product._id, {
          $set: { courseId: ogiCourse._id }
        })
        console.log(`✅ ${product.name} → OGI`)
      }
    }

    console.log()

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ VERIFICAÇÃO FINAL')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const allProducts = await Product.find({
      $or: [
        { code: { $regex: /^CLAREZA/i } },
        { code: { $regex: /^OGI/i } }
      ],
      isActive: true
    }).populate('courseId', 'name code')

    for (const product of allProducts) {
      const course = product.courseId as any
      console.log(`📦 ${product.name}`)
      console.log(`   Course: ${course ? `${course.name} (${course.code})` : '⚠️ SEM COURSE'}\n`)
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 ASSOCIAÇÃO COMPLETA!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🔍 PRÓXIMO PASSO:')
    console.log('   npx ts-node outputs/audit-system.ts\n')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('📡 Desconectado da MongoDB\n')
  }
}

linkProductsToCourses()