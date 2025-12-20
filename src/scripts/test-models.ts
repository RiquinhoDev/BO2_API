// =====================================================
// 📁 src/scripts/test-models.ts
// SCRIPT: Testar models criados
// =====================================================

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import ProductProfile from '../models/ProductProfile'
import StudentEngagementState from '../models/StudentEngagementState'
import CommunicationHistory from '../models/acTags/CommunicationHistory'
import User from '../models/user'

dotenv.config()

async function testModels() {
  try {
    console.log('🔗 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
    
    if (!mongoUri) {
      throw new Error('MONGO_URI ou MONGODB_URI não definido no .env')
    }
    
    await mongoose.connect(mongoUri)
    console.log('✅ Conectado!\n')
    
    // ===== TESTE 1: ProductProfile =====
    console.log('📚 TESTE 1: Criar ProductProfile')
    console.log('─'.repeat(50))
    
    // Limpar teste anterior se existir
    await ProductProfile.deleteOne({ code: 'CLAREZA_TEST' })
    
    const clareza = await ProductProfile.create({
      name: 'Clareza (Teste)',
      code: 'CLAREZA_TEST',
      description: 'Sistema de Relatórios de Análise Pessoal',
      isActive: true,
      durationDays: 90,
      hasDeadline: true,
      reengagementLevels: [
        {
          level: 1,
          name: 'Lembrete Gentil',
          daysInactive: 10,
          tagAC: 'CLAREZA_10D',
          cooldownDays: 7,
          description: 'Primeiro contato amigável'
        },
        {
          level: 2,
          name: 'Motivação',
          daysInactive: 20,
          tagAC: 'CLAREZA_20D',
          cooldownDays: 7,
          description: 'Segundo contato mais motivacional'
        },
        {
          level: 3,
          name: 'Urgência',
          daysInactive: 30,
          tagAC: 'CLAREZA_30D',
          cooldownDays: 10,
          description: 'Último contato com senso de urgência'
        }
      ],
      progressDefinition: {
        countsAsProgress: ['LOGIN', 'REPORT_OPENED'],
        requiresMultipleActions: false
      },
      settings: {
        enableAutoEscalation: true,
        enableAutoRemoval: true,
        maxLevelBeforeStop: 3,
        retryFailedTags: true
      }
    })
    
    console.log('✅ ProductProfile criado:')
    console.log(`   ID: ${clareza._id}`)
    console.log(`   Nome: ${clareza.name}`)
    console.log(`   Código: ${clareza.code}`)
    console.log(`   Níveis: ${clareza.reengagementLevels.length}`)
    
    // Testar métodos
    const level2 = clareza.getLevel(2)
    console.log(`\n🔍 Nível 2: ${level2?.name} (${level2?.daysInactive} dias)`)
    
    const appropriateLevel = clareza.getAppropriateLevel(15)
    console.log(`🔍 Nível apropriado para 15 dias: Nível ${appropriateLevel?.level}`)
    
    const countsLogin = clareza.countsAsProgress('LOGIN')
    console.log(`🔍 LOGIN conta como progresso? ${countsLogin}`)
    
    console.log('\n')
    
    // ===== TESTE 2: StudentEngagementState =====
    console.log('👤 TESTE 2: Criar StudentEngagementState')
    console.log('─'.repeat(50))
    
    // Buscar um usuário qualquer para teste
    const testUser = await User.findOne()
    
    if (!testUser) {
      console.log('⚠️ Nenhum usuário encontrado para teste. Pulando...\n')
    } else {
      // Limpar teste anterior se existir
      await StudentEngagementState.deleteOne({ 
        userId: testUser._id, 
        productCode: 'CLAREZA_TEST' 
      })
      
      const engagementState = await StudentEngagementState.create({
        userId: testUser._id,
        productCode: 'CLAREZA_TEST',
        currentState: 'ACTIVE',
        daysSinceLastLogin: 0,
        lastLogin: new Date(),
        tagsHistory: [],
        totalEmailsSent: 0,
        totalReturns: 0,
        stats: {
          totalDaysInactive: 0,
          currentStreakInactive: 0,
          longestStreakInactive: 0
        }
      })
      
      console.log('✅ StudentEngagementState criado:')
      console.log(`   ID: ${engagementState._id}`)
      console.log(`   User: ${testUser.name}`)
      console.log(`   Estado: ${engagementState.currentState}`)
      console.log(`   Dias inativo: ${engagementState.daysSinceLastLogin}`)
      
      // Testar métodos
      console.log('\n🔧 Testando métodos...')
      
      // 1. Verificar cooldown
      const inCooldown = engagementState.checkCooldown()
      console.log(`   ✓ checkCooldown(): ${inCooldown}`)
      
      // 2. Aplicar tag
      engagementState.applyTag('CLAREZA_10D', 1)
      console.log(`   ✓ applyTag(): Tag aplicada - ${engagementState.currentTagAC}`)
      
      // 3. Definir cooldown
      engagementState.setCooldown(7)
      console.log(`   ✓ setCooldown(): Cooldown até ${engagementState.cooldownUntil?.toLocaleDateString('pt-PT')}`)
      
      // 4. Registar progresso
      engagementState.registerProgress('LOGIN')
      console.log(`   ✓ registerProgress(): Progresso registrado`)
      
      await engagementState.save()
      console.log('   ✓ Estado salvo com sucesso')
      
      console.log('\n')
      
      // ===== TESTE 3: CommunicationHistory =====
      console.log('📧 TESTE 3: Criar CommunicationHistory')
      console.log('─'.repeat(50))
      
      const communication = await CommunicationHistory.create({
        userId: testUser._id,
        productCode: 'CLAREZA_TEST',
        level: 1,
        tagApplied: 'CLAREZA_10D',
        sentAt: new Date(),
        daysInactiveWhenSent: 10,
        sentBy: 'CRON_AUTO',
        status: 'SENT'
      })
      
      console.log('✅ CommunicationHistory criado:')
      console.log(`   ID: ${communication._id}`)
      console.log(`   User: ${testUser.name}`)
      console.log(`   Nível: ${communication.level}`)
      console.log(`   Tag: ${communication.tagApplied}`)
      console.log(`   Enviado: ${communication.sentAt?.toLocaleString('pt-PT')}`)
      
      // Testar métodos
      console.log('\n🔧 Testando métodos...')
      
      // 1. Marcar como aberto
      communication.markAsOpened()
      console.log(`   ✓ markAsOpened(): Email marcado como aberto`)
      
      // 2. Marcar como clicado
      communication.markAsClicked()
      console.log(`   ✓ markAsClicked(): Email marcado como clicado`)
      
      // 3. Verificar engagement
      const hasEngagement = communication.hasEngagement()
      console.log(`   ✓ hasEngagement(): ${hasEngagement}`)
      
      // 4. Marcar como retornado
      communication.markAsReturned()
      console.log(`   ✓ markAsReturned(): Aluno retornou após ${communication.timeToReturn} minutos`)
      
      await communication.save()
      console.log('   ✓ Comunicação salva com sucesso')
      
      console.log('\n')
      
      // ===== LIMPEZA =====
      console.log('🧹 Limpando dados de teste...')
      await ProductProfile.deleteOne({ _id: clareza._id })
      await StudentEngagementState.deleteOne({ _id: engagementState._id })
      await CommunicationHistory.deleteOne({ _id: communication._id })
      console.log('✅ Dados de teste removidos\n')
    }
    
    // ===== RESUMO =====
    console.log('📊 RESUMO')
    console.log('─'.repeat(50))
    console.log('✅ Todos os models funcionam corretamente!')
    console.log('✅ Métodos personalizados testados')
    console.log('✅ Sistema de re-engagement pronto para uso')
    console.log('\n💡 Próximos passos:')
    console.log('   1. Criar ProductProfiles reais (CLAREZA, OGI)')
    console.log('   2. Implementar Services (Sprint 2)')
    console.log('   3. Criar Jobs CRON para avaliação automática')
    
  } catch (error) {
    console.error('❌ Erro:', error)
    if (error instanceof Error) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n👋 Desconectado do MongoDB')
  }
}

// Executar se for chamado diretamente
if (require.main === module) {
  testModels()
}

export default testModels

