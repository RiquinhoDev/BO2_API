// ════════════════════════════════════════════════════════════
// 🚀 INICIALIZAÇÃO: communicationByCourse para TODOS
// ════════════════════════════════════════════════════════════
//
// Inicializa communicationByCourse para TODOS os users ativos
// com base nos seus produtos (UserProduct)
//
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../src/models/user'
import { UserProduct, Product } from '../src/models'

dotenv.config()

async function initializeCommunication() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🚀 INICIALIZAÇÃO: communicationByCourse')
  console.log('═'.repeat(70))
  console.log()
  console.log('Objetivo: Inicializar comunicação para TODOS os users ativos')
  console.log()
  
  try {
    // 1. Conectar MongoDB
    console.log('📡 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGODB_URI ||  "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"
    await mongoose.connect(mongoUri)
    console.log('✅ Conectado')
    console.log()
    
    // 2. Análise PRÉ-INICIALIZAÇÃO
    console.log('═'.repeat(70))
    console.log('📊 ANÁLISE PRÉ-INICIALIZAÇÃO')
    console.log('═'.repeat(70))
    console.log()
    
    const totalUsers = await User.countDocuments()
    const usersWithComm = await User.countDocuments({
      communicationByCourse: { $exists: true, $ne: {} }
    })
    const activeUsers = await User.countDocuments({
      $or: [
        { 'combined.status': 'ACTIVE' },
        { 'situation': 'ACTIVE' }
      ]
    })
    
    console.log(`📊 Total users na BD: ${totalUsers}`)
    console.log(`✅ Users ativos: ${activeUsers}`)
    console.log(`📧 Com communicationByCourse: ${usersWithComm}`)
    console.log(`❌ SEM communicationByCourse: ${activeUsers - usersWithComm}`)
    console.log()
    
    // 3. Buscar produtos ativos
    console.log('═'.repeat(70))
    console.log('📦 PRODUTOS ATIVOS')
    console.log('═'.repeat(70))
    console.log()
    
    const products = await Product.find({ isActive: true }).populate('courseId')
    
    console.log(`📦 Produtos ativos: ${products.length}`)
    products.forEach(product => {
      const course = product.courseId as any
      console.log(`   - ${product.name} (${product.code}) → Course: ${course.name}`)
    })
    console.log()
    
    // 4. Buscar todos os UserProducts ativos
    console.log('═'.repeat(70))
    console.log('👥 USER-PRODUCTS ATIVOS')
    console.log('═'.repeat(70))
    console.log()
    
    const userProducts = await UserProduct.find({ status: 'ACTIVE' })
      .populate('userId')
      .populate('productId')
    
    console.log(`👥 Total UserProducts ativos: ${userProducts.length}`)
    console.log()
    
    // Agrupar por produto
    const byProduct = new Map<string, number>()
    userProducts.forEach(up => {
      const product = up.productId as any
      const count = byProduct.get(product.code) || 0
      byProduct.set(product.code, count + 1)
    })
    
    console.log('Distribuição por produto:')
    byProduct.forEach((count, code) => {
      console.log(`   ${code}: ${count} users`)
    })
    console.log()
    
    // 5. Confirmar inicialização
    console.log('═'.repeat(70))
    console.log('⚠️  CONFIRMAR INICIALIZAÇÃO')
    console.log('═'.repeat(70))
    console.log()
    console.log(`Vais inicializar communicationByCourse para:`)
    console.log(`   ${userProducts.length} user-product combinations`)
    console.log()
    console.log('Cada user receberá estrutura inicial para seus produtos:')
    console.log(`   - currentPhase: 'ENGAGEMENT'`)
    console.log(`   - currentTags: []`)
    console.log(`   - emailStats inicializadas`)
    console.log(`   - courseSpecificData inicializado`)
    console.log()
    console.log('⏳ Continuando em 5 segundos...')
    console.log('   (Ctrl+C para cancelar)')
    console.log()
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // 6. INICIALIZAÇÃO
    console.log('═'.repeat(70))
    console.log('🔄 INICIALIZANDO...')
    console.log('═'.repeat(70))
    console.log()
    
    let initialized = 0
    let skipped = 0
    let errors = 0
    
    // Processar por produto
    for (const product of products) {
      const course = product.courseId as any
      const courseCode = course.code || product.code
      
      console.log(`📦 Processando produto: ${product.name} (${product.code})`)
      
      // Buscar UserProducts deste produto
      const productUserProducts = userProducts.filter(up => {
        const p = up.productId as any
        return p._id.toString() === product._id.toString()
      })
      
      console.log(`   👥 ${productUserProducts.length} users neste produto`)
      
      for (const userProduct of productUserProducts) {
        try {
          const user = userProduct.userId as any
          
          if (!user) {
            console.log(`   ⚠️  UserProduct sem user: ${userProduct._id}`)
            skipped++
            continue
          }
          
          // Inicializar communicationByCourse se não existir
          if (!user.communicationByCourse) {
            user.communicationByCourse = {}
          }
          
          // Verificar se já tem dados para este curso
          if (user.communicationByCourse[courseCode]) {
            // Já tem, pular
            skipped++
            continue
          }
          
          // ✅ INICIALIZAR estrutura para este curso
          user.communicationByCourse[courseCode] = {
            currentPhase: 'ENGAGEMENT',
            currentTags: [],
            lastTagAppliedAt: undefined,
            lastEmailSentAt: undefined,
            emailStats: {
              totalSent: 0,
              totalOpened: 0,
              totalClicked: 0,
              engagementRate: 0
            },
            courseSpecificData: {
              reportsOpenedLastWeek: 0,
              reportsOpenedLastMonth: 0,
              totalReportsOpened: 0,
              lastReportOpenedAt: undefined,
              lastModuleCompletedAt: undefined,
              currentModule: undefined
            }
          }
          
          // Salvar (sem validação por causa da migração)
          await user.save({ validateBeforeSave: false })
          
          initialized++
          
          // Progresso a cada 100
          if (initialized % 100 === 0) {
            console.log(`   ✅ Progresso: ${initialized} inicializados...`)
          }
          
        } catch (error: any) {
          errors++
          console.error(`   ❌ Erro ao inicializar user ${userProduct.userId}: ${error.message}`)
        }
      }
      
      console.log(`   ✅ ${product.code}: Completo`)
      console.log()
    }
    
    // 7. VERIFICAÇÃO PÓS-INICIALIZAÇÃO
    console.log('═'.repeat(70))
    console.log('📊 VERIFICAÇÃO PÓS-INICIALIZAÇÃO')
    console.log('═'.repeat(70))
    console.log()
    
    const usersWithCommAfter = await User.countDocuments({
      communicationByCourse: { $exists: true, $ne: {} }
    })
    
    console.log('ANTES da inicialização:')
    console.log(`   Com communicationByCourse: ${usersWithComm}`)
    console.log()
    console.log('DEPOIS da inicialização:')
    console.log(`   Com communicationByCourse: ${usersWithCommAfter}`)
    console.log()
    console.log('RESULTADO:')
    console.log(`   ✅ Inicializados: ${initialized}`)
    console.log(`   ⏭️  Pulados (já tinham): ${skipped}`)
    console.log(`   ❌ Erros: ${errors}`)
    console.log()
    
    // Contar por curso
    console.log('Distribuição por curso:')
    for (const product of products) {
      const course = product.courseId as any
      const courseCode = course.code || product.code
      
      const count = await User.countDocuments({
        [`communicationByCourse.${courseCode}`]: { $exists: true }
      })
      
      console.log(`   ${courseCode}: ${count} users`)
    }
    console.log()
    
    // 8. RESULTADO FINAL
    console.log('═'.repeat(70))
    console.log('🎉 INICIALIZAÇÃO COMPLETA!')
    console.log('═'.repeat(70))
    console.log()
    
    if (errors === 0) {
      console.log('✅ SUCESSO TOTAL!')
      console.log()
      console.log('📋 PRÓXIMOS PASSOS:')
      console.log('   1. Testar ResetCounters:')
      console.log('      → Deve processar ~4500 users agora!')
      console.log('   2. Testar EvaluateRules:')
      console.log('      → Deve avaliar TODOS os users!')
      console.log('   3. Verificar tags no Active Campaign')
      console.log()
    } else {
      console.log(`⚠️  Completo com ${errors} erros`)
      console.log('   Verificar logs acima para detalhes')
      console.log()
    }
    
    await mongoose.connection.close()
    console.log('✅ MongoDB desconectado')
    console.log()
    
  } catch (error: any) {
    console.error()
    console.error('═'.repeat(70))
    console.error('❌ ERRO NA INICIALIZAÇÃO!')
    console.error('═'.repeat(70))
    console.error()
    console.error('Erro:', error.message)
    console.error()
    console.error('Stack:')
    console.error(error.stack)
    console.error()
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
    
    process.exit(1)
  }
}

initializeCommunication()