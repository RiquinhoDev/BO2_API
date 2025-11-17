// ================================================================
// 🌱 SEED: Product Profiles
// ================================================================
// Script para criar perfis de produto de exemplo
// Uso: npx ts-node src/scripts/seed-product-profiles.ts
// ================================================================

import mongoose from 'mongoose'
import ProductProfile from '../models/ProductProfile'
import dotenv from 'dotenv'

// Carregar variáveis de ambiente
dotenv.config()

// Conectar ao MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bo2_db'
    await mongoose.connect(mongoUri)
    console.log('✅ MongoDB conectado')
  } catch (error) {
    console.error('❌ Erro ao conectar MongoDB:', error)
    process.exit(1)
  }
}

// Perfis de produto
const productProfiles = [
  // ─────────────────────────────────────────────────────────────
  // CLAREZA - Relatórios Diários (90 dias, urgência alta)
  // ─────────────────────────────────────────────────────────────
  {
    name: 'Clareza - Relatórios Diários',
    code: 'CLAREZA',
    description: 'Programa de 90 dias de relatórios diários de autorreflexão',
    isActive: true,
    durationDays: 90,
    hasDeadline: true,
    
    reengagementLevels: [
      {
        level: 1,
        name: 'Lembrete Gentil',
        daysInactive: 3,
        tagAC: 'CLAREZA_3D',
        cooldownDays: 4,
        emailTemplateId: '',
        description: 'Primeiro lembrete amigável após 3 dias sem atividade'
      },
      {
        level: 2,
        name: 'Motivação',
        daysInactive: 7,
        tagAC: 'CLAREZA_7D',
        cooldownDays: 7,
        emailTemplateId: '',
        description: 'Mensagem motivacional após 7 dias sem atividade'
      },
      {
        level: 3,
        name: 'Urgência',
        daysInactive: 14,
        tagAC: 'CLAREZA_14D',
        cooldownDays: 10,
        emailTemplateId: '',
        description: 'Mensagem de urgência após 14 dias sem atividade'
      },
      {
        level: 4,
        name: 'Última Chamada',
        daysInactive: 30,
        tagAC: 'CLAREZA_30D',
        cooldownDays: 14,
        emailTemplateId: '',
        description: 'Última tentativa de reengajamento'
      }
    ],
    
    progressDefinition: {
      countsAsProgress: ['LOGIN', 'REPORT_OPENED', 'REPORT_SUBMITTED', 'EXERCISE_COMPLETED'],
      requiresMultipleActions: false,
      minimumActionsPerDay: 1
    },
    
    settings: {
      enableAutoEscalation: true,
      enableAutoRemoval: true,
      maxLevelBeforeStop: 4,
      retryFailedTags: true
    },
    
    createdBy: 'seed-script'
  },

  // ─────────────────────────────────────────────────────────────
  // OGI-V1 - O Grande Investimento (180 dias, urgência média)
  // ─────────────────────────────────────────────────────────────
  {
    name: 'O Grande Investimento V1',
    code: 'OGI-V1',
    description: 'Curso de 180 dias sobre investimento pessoal e desenvolvimento',
    isActive: true,
    durationDays: 180,
    hasDeadline: true,
    
    reengagementLevels: [
      {
        level: 1,
        name: 'Check-in Amigável',
        daysInactive: 7,
        tagAC: 'OGI_7D',
        cooldownDays: 5,
        emailTemplateId: '',
        description: 'Primeiro check-in após 1 semana sem atividade'
      },
      {
        level: 2,
        name: 'Encorajamento',
        daysInactive: 14,
        tagAC: 'OGI_14D',
        cooldownDays: 7,
        emailTemplateId: '',
        description: 'Mensagem de encorajamento após 2 semanas'
      },
      {
        level: 3,
        name: 'Re-ativação',
        daysInactive: 30,
        tagAC: 'OGI_30D',
        cooldownDays: 14,
        emailTemplateId: '',
        description: 'Tentativa de re-ativação após 1 mês'
      }
    ],
    
    progressDefinition: {
      countsAsProgress: ['LOGIN', 'MODULE_COMPLETED', 'VIDEO_WATCHED', 'QUIZ_COMPLETED'],
      requiresMultipleActions: false,
      minimumActionsPerDay: 1
    },
    
    settings: {
      enableAutoEscalation: true,
      enableAutoRemoval: true,
      maxLevelBeforeStop: 3,
      retryFailedTags: true
    },
    
    createdBy: 'seed-script'
  },

  // ─────────────────────────────────────────────────────────────
  // TESTE - Perfil para testes (30 dias, urgência baixa)
  // ─────────────────────────────────────────────────────────────
  {
    name: 'Produto de Teste',
    code: 'TEST',
    description: 'Perfil para testes do sistema de re-engagement',
    isActive: false, // Inativo por padrão
    durationDays: 30,
    hasDeadline: true,
    
    reengagementLevels: [
      {
        level: 1,
        name: 'Teste Nível 1',
        daysInactive: 1,
        tagAC: 'TEST_1D',
        cooldownDays: 1,
        emailTemplateId: '',
        description: 'Nível 1 de teste (1 dia)'
      },
      {
        level: 2,
        name: 'Teste Nível 2',
        daysInactive: 2,
        tagAC: 'TEST_2D',
        cooldownDays: 2,
        emailTemplateId: '',
        description: 'Nível 2 de teste (2 dias)'
      }
    ],
    
    progressDefinition: {
      countsAsProgress: ['LOGIN'],
      requiresMultipleActions: false
    },
    
    settings: {
      enableAutoEscalation: true,
      enableAutoRemoval: true,
      maxLevelBeforeStop: 2,
      retryFailedTags: false
    },
    
    createdBy: 'seed-script'
  }
]

// Executar seed
const seedProductProfiles = async () => {
  try {
    console.log('🌱 Iniciando seed de ProductProfiles...\n')

    // Deletar perfis existentes criados pelo script
    const deleteResult = await ProductProfile.deleteMany({ createdBy: 'seed-script' })
    console.log(`🗑️ ${deleteResult.deletedCount} perfis antigos removidos\n`)

    // Criar novos perfis
    for (const profileData of productProfiles) {
      console.log(`📝 Criando perfil: ${profileData.name} (${profileData.code})`)
      
      const profile = await ProductProfile.create(profileData)
      
      console.log(`   ✅ Criado com sucesso`)
      console.log(`   • ${profile.reengagementLevels.length} níveis de reengajamento`)
      console.log(`   • Duração: ${profile.durationDays} dias`)
      console.log(`   • Status: ${profile.isActive ? 'ATIVO' : 'INATIVO'}`)
      console.log()
    }

    console.log('🎉 Seed concluído com sucesso!')
    console.log(`\n📊 Total de perfis criados: ${productProfiles.length}`)
    
    // Listar perfis ativos
    const activeProfiles = await ProductProfile.find({ isActive: true })
    console.log(`\n✅ Perfis ATIVOS (${activeProfiles.length}):`)
    activeProfiles.forEach(p => {
      console.log(`   • ${p.name} (${p.code})`)
    })

  } catch (error: any) {
    console.error('❌ Erro ao executar seed:', error)
    console.error(error.message)
    process.exit(1)
  }
}

// Executar
const run = async () => {
  await connectDB()
  await seedProductProfiles()
  
  console.log('\n👋 Encerrando conexão...')
  await mongoose.disconnect()
  console.log('✅ Desconectado')
  
  process.exit(0)
}

run()
