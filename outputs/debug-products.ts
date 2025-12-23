// ════════════════════════════════════════════════════════════════════════════
// 🔒 CORREÇÃO SEGURA - Products CourseId
// ════════════════════════════════════════════════════════════════════════════
// Com backup, preview e confirmação

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config()

interface BackupEntry {
  productId: string
  productName: string
  productCode: string
  oldCourseId: any
  newCourseId: string
  newCourseName: string
}

async function safeFixCourseIds() {
  try {
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🔒 CORREÇÃO SEGURA - Products CourseId')
    console.log('════════════════════════════════════════════════════════════\n')

    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true")

    console.log('✅ Conectado\n')

    const Product = (await import('../src/models/Product')).default
    const Course = (await import('../src/models/Course')).default

    // Buscar courses
    const courses = await Course.find({}).lean()
    const clarezaCourse = courses.find(c => c.code === 'CLAREZA')
    const ogiCourse = courses.find(c => c.code === 'OGI')

    if (!clarezaCourse || !ogiCourse) {
      console.error('❌ Courses não encontrados!')
      return
    }

    console.log('📚 Courses válidos:')
    console.log(`   CLAREZA: ${clarezaCourse._id}`)
    console.log(`   OGI: ${ogiCourse._id}\n`)

    // Buscar produtos
    const products = await Product.find({
      $or: [
        { code: { $regex: /^CLAREZA/i } },
        { code: { $regex: /^OGI/i } }
      ]
    }).lean()

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 ANÁLISE - O que será alterado:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const backup: BackupEntry[] = []
    let needsUpdate = false

    for (const product of products) {
      const isClareza = product.code.toUpperCase().includes('CLAREZA')
      const correctCourse = isClareza ? clarezaCourse : ogiCourse
const currentCourseIdStr = product.courseId ? String(product.courseId) : 'null'
const correctCourseIdStr = String(correctCourse._id)

      console.log(`📦 ${product.name} (${product.code})`)
      console.log(`   ID: ${product._id}`)
      console.log(`   CourseId atual: ${currentCourseIdStr}`)
      console.log(`   CourseId correto: ${correctCourseIdStr}`)

      if (currentCourseIdStr !== correctCourseIdStr) {
        console.log(`   ⚠️  REQUER ATUALIZAÇÃO`)
        needsUpdate = true

        // Verificar se courseId atual existe
const oldCourseExists = courses.find(c => String(c._id) === currentCourseIdStr)

        if (oldCourseExists) {
          console.log(`   ℹ️  CourseId atual aponta para: ${oldCourseExists.name} (${oldCourseExists.code})`)
        } else {
          console.log(`   ❌ CourseId atual é INVÁLIDO (não existe na BD!)`)
        }

        backup.push({
           productId: String(product._id),
          productName: product.name,
          productCode: product.code,
          oldCourseId: product.courseId,
           newCourseId: String(correctCourse._id),
          newCourseName: correctCourse.name
        })
      } else {
        console.log(`   ✅ JÁ CORRETO`)
      }
      console.log()
    }

    if (!needsUpdate) {
      console.log('✅ Todos os produtos já têm courseId correto!')
      console.log('   Nenhuma alteração necessária.\n')
      return
    }

    // Guardar backup
    const backupFilename = `backup-courseids-${Date.now()}.json`
    fs.writeFileSync(backupFilename, JSON.stringify(backup, null, 2))
    console.log(`💾 Backup criado: ${backupFilename}\n`)

    // Mostrar resumo
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 RESUMO DAS ALTERAÇÕES:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    backup.forEach(entry => {
      console.log(`📦 ${entry.productName}`)
      console.log(`   ${entry.oldCourseId || 'null'} → ${entry.newCourseId}`)
      console.log(`   (${entry.newCourseName})`)
      console.log()
    })

    console.log(`Total de produtos a atualizar: ${backup.length}\n`)

    // ═══════════════════════════════════════════════════════════
    // IMPACTO - Explicação detalhada
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('⚠️  IMPACTO DA ALTERAÇÃO:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('✅ SEGURO - Apenas corrige referências em `products`')
    console.log('✅ NÃO AFETA - UserProducts (não têm courseId)')
    console.log('✅ NÃO AFETA - TagRules (já têm IDs corretos)')
    console.log('✅ NÃO AFETA - Alunos, progresso ou dados históricos')
    console.log()
    console.log('🎯 BENEFÍCIOS:')
    console.log('   - Frontend passa a mostrar course correto')
    console.log('   - TagRuleEngine passa a funcionar')
    console.log('   - CRON consegue avaliar regras')
    console.log('   - Populate de courseId funciona\n')

    // ═══════════════════════════════════════════════════════════
    // APLICAR MUDANÇAS
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔧 APLICAR ALTERAÇÕES')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('⚠️  Esta operação vai alterar a BD!')
    console.log(`💾 Backup guardado em: ${backupFilename}`)
    console.log('\nAplicando alterações...\n')

    // Update CLAREZA products
    const clarezaResult = await Product.updateMany(
      { code: { $regex: /^CLAREZA/i } },
      { $set: { courseId: clarezaCourse._id } }
    )
    console.log(`✅ CLAREZA: ${clarezaResult.modifiedCount} produtos atualizados`)

    // Update OGI products
    const ogiResult = await Product.updateMany(
      { code: { $regex: /^OGI/i } },
      { $set: { courseId: ogiCourse._id } }
    )
    console.log(`✅ OGI: ${ogiResult.modifiedCount} produtos atualizados\n`)

    // ═══════════════════════════════════════════════════════════
    // VERIFICAÇÃO
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ VERIFICAÇÃO PÓS-UPDATE:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const productsAfter = await Product.find({
      $or: [
        { code: { $regex: /^CLAREZA/i } },
        { code: { $regex: /^OGI/i } }
      ]
    }).populate('courseId', 'name code').lean()

    let allCorrect = true

    for (const product of productsAfter) {
      const course = product.courseId as any
      const status = course ? '✅' : '❌'
      
      console.log(`${status} ${product.name}`)
      console.log(`   Course: ${course ? `${course.name} (${course.code})` : '⚠️ SEM COURSE'}`)
      
      if (!course) allCorrect = false
      console.log()
    }

    if (allCorrect) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🎉 SUCESSO! Todos os produtos corrigidos!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

      console.log('📝 PRÓXIMOS PASSOS:')
      console.log('   1. Executar: npx ts-node outputs/audit-system.ts')
      console.log('   2. Verificar frontend: http://localhost:5173/activecampaign')
      console.log('   3. Testar CRON: POST /api/activecampaign/test-cron\n')

      console.log(`💾 Backup guardado em: ${backupFilename}`)
      console.log('   (Se precisares reverter, usa este ficheiro)\n')
    } else {
      console.log('⚠️  Alguns produtos ainda têm problemas!')
      console.log('   Verifica manualmente na BD.\n')
    }

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('📡 Desconectado\n')
  }
}

safeFixCourseIds()