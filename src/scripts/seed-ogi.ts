// =====================================================
// 📁 src/scripts/seed-ogi.ts
// Seed para criar curso OGI + regras iniciais
// =====================================================

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Course from '../models/Course'
import TagRule from '../models/acTags/TagRule'

dotenv.config()

async function seedOGI() {
  try {
    // Conectar ao MongoDB
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('✅ Conectado ao MongoDB')
    
    // Criar/Atualizar curso OGI
    const ogiCourse = await Course.findOneAndUpdate(
      { code: 'OGI' },
      {
        name: 'O Grande Investimento',
        code: 'OGI',
        trackingType: 'LOGIN_BASED',
        isActive: true,
        activeCampaignListId: process.env.AC_LIST_ID_OGI || '123'
      },
      { upsert: true, new: true }
    )
    
    console.log('✅ Curso OGI criado/atualizado')
    
    // Regras de tags para OGI
    const rules = [
      {
        name: 'OGI - Inativo 10 dias',
        courseId: ogiCourse._id,
        condition: {
          field: 'daysSinceLastLogin',
          operator: 'GREATER_THAN',
          value: 10
        },
        action: {
          type: 'ADD_TAG',
          tagName: 'OGI - Inativo 10d'
        },
        priority: 1,
        isActive: true
      },
      {
        name: 'OGI - Inativo 21 dias',
        courseId: ogiCourse._id,
        condition: {
          field: 'daysSinceLastLogin',
          operator: 'GREATER_THAN',
          value: 21
        },
        action: {
          type: 'ADD_TAG',
          tagName: 'OGI - Inativo 21d'
        },
        priority: 2,
        isActive: true
      },
      {
        name: 'OGI - Reativado',
        courseId: ogiCourse._id,
        condition: {
          field: 'daysSinceLastLogin',
          operator: 'LESS_THAN_OR_EQUAL',
          value: 3
        },
        action: {
          type: 'ADD_TAG',
          tagName: 'OGI - Reativado'
        },
        priority: 1,
        isActive: true
      },
      {
        name: 'OGI - Login Recente',
        courseId: ogiCourse._id,
        condition: {
          field: 'daysSinceLastLogin',
          operator: 'LESS_THAN_OR_EQUAL',
          value: 7
        },
        action: {
          type: 'ADD_TAG',
          tagName: 'OGI - Ativo'
        },
        priority: 1,
        isActive: true
      },
      {
        name: 'OGI - Remover Inativo 10d se Reativado',
        courseId: ogiCourse._id,
        condition: {
          field: 'daysSinceLastLogin',
          operator: 'LESS_THAN_OR_EQUAL',
          value: 10
        },
        action: {
          type: 'REMOVE_TAG',
          tagName: 'OGI - Inativo 10d'
        },
        priority: 3,
        isActive: true
      },
      {
        name: 'OGI - Remover Inativo 21d se Reativado',
        courseId: ogiCourse._id,
        condition: {
          field: 'daysSinceLastLogin',
          operator: 'LESS_THAN_OR_EQUAL',
          value: 21
        },
        action: {
          type: 'REMOVE_TAG',
          tagName: 'OGI - Inativo 21d'
        },
        priority: 3,
        isActive: true
      }
    ]
    
    // Criar/Atualizar regras
    for (const rule of rules) {
      await TagRule.findOneAndUpdate(
        { name: rule.name },
        rule,
        { upsert: true, new: true }
      )
    }
    
    console.log(`✅ ${rules.length} regras OGI criadas/atualizadas`)
    console.log('🎉 Seed OGI concluído com sucesso!')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Erro no seed:', error)
    process.exit(1)
  }
}

seedOGI()
