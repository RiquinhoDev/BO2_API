// =====================================================
// 📁 src/scripts/seed-product-profiles.ts
// SCRIPT: Criar ProductProfiles reais (CLAREZA e OGI)
// =====================================================

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import ProductProfile from '../models/ProductProfile'

dotenv.config()

async function seedProductProfiles() {
  try {
    console.log('🔗 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
    
    if (!mongoUri) {
      throw new Error('MONGO_URI ou MONGODB_URI não definido no .env')
    }
    
    await mongoose.connect(mongoUri)
    console.log('✅ Conectado!\n')
    
    console.log('🌱 Criando ProductProfiles...\n')
    
    // ===== CLAREZA =====
    console.log('1️⃣ CLAREZA - Sistema de Relatórios')
    console.log('─'.repeat(50))
    
    // Verificar se já existe
    let clareza = await ProductProfile.findOne({ code: 'CLAREZA' })
    
    if (clareza) {
      console.log('⚠️ CLAREZA já existe. Atualizando...')
      
      clareza.name = 'Clareza - Sistema de Relatórios'
      clareza.description = 'Sistema de Análise Pessoal com Relatórios Semanais'
      clareza.isActive = true
      clareza.durationDays = 90
      clareza.hasDeadline = true
      clareza.reengagementLevels = [
        {
          level: 1,
          name: 'Lembrete Gentil',
          daysInactive: 10,
          tagAC: 'CLAREZA_10D',
          cooldownDays: 7,
          description: 'Primeiro contato amigável lembrando do valor do sistema'
        },
        {
          level: 2,
          name: 'Motivação e Valor',
          daysInactive: 20,
          tagAC: 'CLAREZA_20D',
          cooldownDays: 7,
          description: 'Reforçar benefícios e motivar retorno'
        },
        {
          level: 3,
          name: 'Urgência e Última Chance',
          daysInactive: 30,
          tagAC: 'CLAREZA_30D',
          cooldownDays: 10,
          description: 'Último contato com senso de urgência'
        }
      ]
      clareza.progressDefinition = {
        countsAsProgress: ['LOGIN', 'REPORT_OPENED', 'REPORT_DOWNLOADED'],
        requiresMultipleActions: false
      }
      clareza.settings = {
        enableAutoEscalation: true,
        enableAutoRemoval: true,
        maxLevelBeforeStop: 3,
        retryFailedTags: true
      }
      
      await clareza.save()
      console.log('✅ CLAREZA atualizado')
    } else {
      clareza = await ProductProfile.create({
        name: 'Clareza - Sistema de Relatórios',
        code: 'CLAREZA',
        description: 'Sistema de Análise Pessoal com Relatórios Semanais',
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
            description: 'Primeiro contato amigável lembrando do valor do sistema'
          },
          {
            level: 2,
            name: 'Motivação e Valor',
            daysInactive: 20,
            tagAC: 'CLAREZA_20D',
            cooldownDays: 7,
            description: 'Reforçar benefícios e motivar retorno'
          },
          {
            level: 3,
            name: 'Urgência e Última Chance',
            daysInactive: 30,
            tagAC: 'CLAREZA_30D',
            cooldownDays: 10,
            description: 'Último contato com senso de urgência'
          }
        ],
        progressDefinition: {
          countsAsProgress: ['LOGIN', 'REPORT_OPENED', 'REPORT_DOWNLOADED'],
          requiresMultipleActions: false
        },
        settings: {
          enableAutoEscalation: true,
          enableAutoRemoval: true,
          maxLevelBeforeStop: 3,
          retryFailedTags: true
        }
      })
      console.log('✅ CLAREZA criado')
    }
    
    console.log(`   ID: ${clareza._id}`)
    console.log(`   Níveis: ${clareza.reengagementLevels.length}`)
    console.log(`   Ações que contam: ${clareza.progressDefinition.countsAsProgress.join(', ')}`)
    console.log('')
    
    // ===== O GRANDE INVESTIMENTO (OGI) =====
    console.log('2️⃣ OGI - O Grande Investimento')
    console.log('─'.repeat(50))
    
    // Verificar se já existe
    let ogi = await ProductProfile.findOne({ code: 'OGI' })
    
    if (ogi) {
      console.log('⚠️ OGI já existe. Atualizando...')
      
      ogi.name = 'O Grande Investimento'
      ogi.description = 'Programa de Investimento Pessoal e Profissional'
      ogi.isActive = true
      ogi.durationDays = 180
      ogi.hasDeadline = true
      ogi.reengagementLevels = [
        {
          level: 1,
          name: 'Check-in Motivacional',
          daysInactive: 7,
          tagAC: 'OGI_7D',
          cooldownDays: 5,
          description: 'Verificar progresso e motivar continuidade'
        },
        {
          level: 2,
          name: 'Suporte e Orientação',
          daysInactive: 14,
          tagAC: 'OGI_14D',
          cooldownDays: 7,
          description: 'Oferecer suporte e resolver dúvidas'
        },
        {
          level: 3,
          name: 'Re-engajamento Intensivo',
          daysInactive: 21,
          tagAC: 'OGI_21D',
          cooldownDays: 7,
          description: 'Comunicação mais intensa para recuperar aluno'
        },
        {
          level: 4,
          name: 'Última Oportunidade',
          daysInactive: 30,
          tagAC: 'OGI_30D',
          cooldownDays: 14,
          description: 'Última tentativa antes de marcar como perdido'
        }
      ]
      ogi.progressDefinition = {
        countsAsProgress: ['LOGIN', 'MODULE_STARTED', 'MODULE_COMPLETED', 'EXERCISE_SUBMITTED'],
        requiresMultipleActions: false
      }
      ogi.settings = {
        enableAutoEscalation: true,
        enableAutoRemoval: true,
        maxLevelBeforeStop: 4,
        retryFailedTags: true
      }
      
      await ogi.save()
      console.log('✅ OGI atualizado')
    } else {
      ogi = await ProductProfile.create({
        name: 'O Grande Investimento',
        code: 'OGI',
        description: 'Programa de Investimento Pessoal e Profissional',
        isActive: true,
        durationDays: 180,
        hasDeadline: true,
        reengagementLevels: [
          {
            level: 1,
            name: 'Check-in Motivacional',
            daysInactive: 7,
            tagAC: 'OGI_7D',
            cooldownDays: 5,
            description: 'Verificar progresso e motivar continuidade'
          },
          {
            level: 2,
            name: 'Suporte e Orientação',
            daysInactive: 14,
            tagAC: 'OGI_14D',
            cooldownDays: 7,
            description: 'Oferecer suporte e resolver dúvidas'
          },
          {
            level: 3,
            name: 'Re-engajamento Intensivo',
            daysInactive: 21,
            tagAC: 'OGI_21D',
            cooldownDays: 7,
            description: 'Comunicação mais intensa para recuperar aluno'
          },
          {
            level: 4,
            name: 'Última Oportunidade',
            daysInactive: 30,
            tagAC: 'OGI_30D',
            cooldownDays: 14,
            description: 'Última tentativa antes de marcar como perdido'
          }
        ],
        progressDefinition: {
          countsAsProgress: ['LOGIN', 'MODULE_STARTED', 'MODULE_COMPLETED', 'EXERCISE_SUBMITTED'],
          requiresMultipleActions: false
        },
        settings: {
          enableAutoEscalation: true,
          enableAutoRemoval: true,
          maxLevelBeforeStop: 4,
          retryFailedTags: true
        }
      })
      console.log('✅ OGI criado')
    }
    
    console.log(`   ID: ${ogi._id}`)
    console.log(`   Níveis: ${ogi.reengagementLevels.length}`)
    console.log(`   Ações que contam: ${ogi.progressDefinition.countsAsProgress.join(', ')}`)
    console.log('')
    
    // ===== RESUMO =====
    console.log('📊 RESUMO')
    console.log('─'.repeat(50))
    console.log('✅ ProductProfiles criados com sucesso!')
    console.log('')
    console.log('📋 CLAREZA:')
    console.log(`   - Duração: ${clareza.durationDays} dias`)
    console.log(`   - Níveis: ${clareza.reengagementLevels.length} (10d, 20d, 30d)`)
    console.log(`   - Tags: CLAREZA_10D, CLAREZA_20D, CLAREZA_30D`)
    console.log('')
    console.log('📋 OGI:')
    console.log(`   - Duração: ${ogi.durationDays} dias`)
    console.log(`   - Níveis: ${ogi.reengagementLevels.length} (7d, 14d, 21d, 30d)`)
    console.log(`   - Tags: OGI_7D, OGI_14D, OGI_21D, OGI_30D`)
    console.log('')
    console.log('💡 Próximo passo: Implementar Services (Sprint 2)')
    
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
  seedProductProfiles()
}

export default seedProductProfiles

