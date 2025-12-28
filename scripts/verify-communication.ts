// ════════════════════════════════════════════════════════════
// 🔍 VERIFICAÇÃO: Pós-inicialização communicationByCourse
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../src/models/user'
import { Product } from '../src/models'

dotenv.config()

async function verify() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🔍 VERIFICAÇÃO: communicationByCourse')
  console.log('═'.repeat(70))
  console.log()
  
  try {
    // Conectar
    console.log('📡 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"
    await mongoose.connect(mongoUri)
    console.log('✅ Conectado\n')
    
    // Estatísticas gerais
    console.log('═'.repeat(70))
    console.log('📊 ESTATÍSTICAS GERAIS')
    console.log('═'.repeat(70))
    console.log()
    
    const totalUsers = await User.countDocuments()
    const activeUsers = await User.countDocuments({
      $or: [
        { 'combined.status': 'ACTIVE' },
        { 'situation': 'ACTIVE' }
      ]
    })
    const withComm = await User.countDocuments({
      communicationByCourse: { $exists: true, $ne: {} }
    })
    
    console.log(`📊 Total users: ${totalUsers}`)
    console.log(`✅ Users ativos: ${activeUsers}`)
    console.log(`📧 Com communicationByCourse: ${withComm}`)
    console.log()
    
    const percentage = Math.round((withComm / activeUsers) * 100)
    console.log(`📈 Cobertura: ${percentage}%`)
    console.log()
    
    // Por produto
    console.log('═'.repeat(70))
    console.log('📦 DISTRIBUIÇÃO POR PRODUTO/CURSO')
    console.log('═'.repeat(70))
    console.log()
    
    const products = await Product.find({ isActive: true }).populate('courseId')
    
    for (const product of products) {
      const course = product.courseId as any
      const courseCode = course.code || product.code
      
      const count = await User.countDocuments({
        [`communicationByCourse.${courseCode}`]: { $exists: true }
      })
      
      console.log(`${product.name} (${courseCode}):`)
      console.log(`   Users com comunicação: ${count}`)
    }
    
    console.log()
    
    // Sample de dados
    console.log('═'.repeat(70))
    console.log('🔍 AMOSTRA DE DADOS (primeiros 5 users)')
    console.log('═'.repeat(70))
    console.log()
    
    const sampleUsers = await User.find({
      communicationByCourse: { $exists: true, $ne: {} }
    }).limit(5)
    
    for (const user of sampleUsers) {
      console.log(`👤 ${user.email}`)
      
      if (user.communicationByCourse) {
        const courses = Object.keys(user.communicationByCourse)
        console.log(`   Cursos: ${courses.join(', ')}`)
        
        courses.forEach(courseCode => {
          const data = (user.communicationByCourse as any)[courseCode]
          console.log(`   ${courseCode}:`)
          console.log(`      Phase: ${data.currentPhase}`)
          console.log(`      Tags: ${data.currentTags.length}`)
          console.log(`      Emails enviados: ${data.emailStats?.totalSent || 0}`)
        })
      }
      
      console.log()
    }
    
    // Validação
    console.log('═'.repeat(70))
    console.log('✅ VALIDAÇÃO')
    console.log('═'.repeat(70))
    console.log()
    
    if (withComm >= activeUsers * 0.9) {
      console.log('✅ EXCELENTE!')
      console.log(`   ${percentage}% dos users ativos têm communicationByCourse`)
      console.log('   Sistema pronto para processar todos!')
      console.log()
      
      console.log('📋 PRÓXIMOS PASSOS:')
      console.log('   1. Testar ResetCounters:')
      console.log('      npx ts-node scripts/test-reset-counters.ts')
      console.log('   2. Executar EvaluateRules:')
      console.log('      → Deve processar TODOS os users agora!')
      console.log('   3. Verificar tags no Active Campaign')
      console.log()
      
    } else if (withComm >= activeUsers * 0.5) {
      console.log('⚠️  BOA COBERTURA MAS PODE MELHORAR')
      console.log(`   ${percentage}% dos users ativos têm communicationByCourse`)
      console.log()
      console.log('💡 SUGESTÃO:')
      console.log('   Executar script de inicialização novamente:')
      console.log('   npx ts-node scripts/initialize-communication.ts')
      console.log()
      
    } else {
      console.log('❌ COBERTURA BAIXA!')
      console.log(`   Apenas ${percentage}% dos users ativos têm communicationByCourse`)
      console.log()
      console.log('⚠️  AÇÃO NECESSÁRIA:')
      console.log('   Executar script de inicialização:')
      console.log('   npx ts-node scripts/initialize-communication.ts')
      console.log()
    }
    
    await mongoose.connection.close()
    console.log('✅ Verificação completa')
    
  } catch (error: any) {
    console.error('\n❌ Erro:', error.message)
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
    
    process.exit(1)
  }
}

verify()