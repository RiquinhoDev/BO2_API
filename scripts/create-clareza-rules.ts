// ═══════════════════════════════════════════════════════════════════════════
// 📝 SCRIPT: Criar 6 Regras CLAREZA Simplificadas
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Course from '../src/models/Course'
import TagRule from '../src/models/acTags/TagRule'

async function main() {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    console.log('✅ Conectado à MongoDB\n')

    const course = await Course.findOne({ code: { $regex: /CLAREZA/i } })
    
    if (!course) {
      console.log('❌ Course CLAREZA não encontrado!')
      process.exit(1)
    }

    console.log(`📚 Course encontrado: ${course.code} (${course._id})`)
    console.log(`   Nome: ${course.name}`)
    console.log(`   Tracking: ${course.trackingType}\n`)

    console.log('🗑️ Desativando regras antigas...\n')

    const oldRules = await TagRule.find({
      courseId: course._id,
      isActive: true
    })

    console.log(`   Encontradas ${oldRules.length} regras ativas`)

    for (const rule of oldRules) {
      await TagRule.findByIdAndUpdate(rule._id, {
        $set: { isActive: false, updatedAt: new Date() }
      })
      console.log(`   ❌ Desativada: ${rule.name}`)
    }

    console.log(`\n✅ ${oldRules.length} regras antigas desativadas\n`)

    console.log('✨ Criando 6 novas regras CLAREZA...\n')

    const newRules = [
      {
        name: 'CLAREZA - Novo Aluno',
        courseId: course._id,
        category: 'ENGAGEMENT',
        description: 'Alunos com menos de 7 dias desde inscrição e ativos',
        createdBy: 'SYSTEM',
        priority: 10,
        isActive: true,
        condition: '(daysSinceEnrollment < 7 AND daysSinceLastAction < 7)',
        conditions: [],
        actions: {
          addTag: 'CLAREZA - Novo Aluno',
          removeTags: [
            'CLAREZA - Super Utilizador',
            'CLAREZA - Ativo',
            'CLAREZA - Inativo 7d',
            'CLAREZA - Inativo 14d',
            'CLAREZA - Inativo 30d'
          ]
        }
      },
      {
        name: 'CLAREZA - Super Utilizador',
        courseId: course._id,
        category: 'ENGAGEMENT',
        description: 'Utilizadores super ativos (< 3 dias de inatividade)',
        createdBy: 'SYSTEM',
        priority: 10,
        isActive: true,
        condition: '(daysSinceLastAction < 3 AND daysSinceEnrollment >= 7)',
        conditions: [],
        actions: {
          addTag: 'CLAREZA - Super Utilizador',
          removeTags: [
            'CLAREZA - Novo Aluno',
            'CLAREZA - Ativo',
            'CLAREZA - Inativo 7d',
            'CLAREZA - Inativo 14d',
            'CLAREZA - Inativo 30d'
          ]
        }
      },
      {
        name: 'CLAREZA - Ativo',
        courseId: course._id,
        category: 'ENGAGEMENT',
        description: 'Utilizadores ativos (< 7 dias de inatividade)',
        createdBy: 'SYSTEM',
        priority: 9,
        isActive: true,
        condition: '(daysSinceLastAction < 7 AND daysSinceEnrollment >= 7)',
        conditions: [],
        actions: {
          addTag: 'CLAREZA - Ativo',
          removeTags: [
            'CLAREZA - Novo Aluno',
            'CLAREZA - Super Utilizador',
            'CLAREZA - Inativo 7d',
            'CLAREZA - Inativo 14d',
            'CLAREZA - Inativo 30d'
          ]
        }
      },
      {
        name: 'CLAREZA - Inativo 7-14d',
        courseId: course._id,
        category: 'ENGAGEMENT',
        description: 'Utilizadores inativos entre 7 e 14 dias (primeira semana)',
        createdBy: 'SYSTEM',
        priority: 8,
        isActive: true,
        condition: '(daysSinceLastAction >= 7 AND daysSinceLastAction < 14)',
        conditions: [],
        actions: {
          addTag: 'CLAREZA - Inativo 7d',
          removeTags: [
            'CLAREZA - Novo Aluno',
            'CLAREZA - Super Utilizador',
            'CLAREZA - Ativo',
            'CLAREZA - Inativo 14d',
            'CLAREZA - Inativo 30d'
          ]
        }
      },
      {
        name: 'CLAREZA - Inativo 14-30d',
        courseId: course._id,
        category: 'ENGAGEMENT',
        description: 'Utilizadores inativos entre 14 e 30 dias (segunda semana)',
        createdBy: 'SYSTEM',
        priority: 7,
        isActive: true,
        condition: '(daysSinceLastAction >= 14 AND daysSinceLastAction < 30)',
        conditions: [],
        actions: {
          addTag: 'CLAREZA - Inativo 14d',
          removeTags: [
            'CLAREZA - Novo Aluno',
            'CLAREZA - Super Utilizador',
            'CLAREZA - Ativo',
            'CLAREZA - Inativo 7d',
            'CLAREZA - Inativo 30d'
          ]
        }
      },
      {
        name: 'CLAREZA - Inativo 30d+',
        courseId: course._id,
        category: 'ENGAGEMENT',
        description: 'Utilizadores inativos há mais de 30 dias (crítico)',
        createdBy: 'SYSTEM',
        priority: 6,
        isActive: true,
        condition: 'daysSinceLastAction >= 30',
        conditions: [],
        actions: {
          addTag: 'CLAREZA - Inativo 30d',
          removeTags: [
            'CLAREZA - Novo Aluno',
            'CLAREZA - Super Utilizador',
            'CLAREZA - Ativo',
            'CLAREZA - Inativo 7d',
            'CLAREZA - Inativo 14d'
          ]
        }
      }
    ]

    for (const ruleData of newRules) {
      const created = await TagRule.create(ruleData)
      console.log(`   ✅ ${ruleData.name}`)
      console.log(`      ID: ${created._id}`)
      console.log(`      Condição: ${ruleData.condition}`)
      console.log(`      Tag: ${ruleData.actions.addTag}`)
      console.log()
    }

    console.log(`✅ ${newRules.length} novas regras criadas com sucesso!\n`)

    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 RESUMO DA MIGRAÇÃO')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`✅ Regras antigas desativadas: ${oldRules.length}`)
    console.log(`✅ Regras novas criadas: ${newRules.length}`)
    console.log()
    console.log('🎯 ESTRUTURA FINAL:')
    console.log('   1. CLAREZA - Novo Aluno (< 7 dias inscrição)')
    console.log('   2. CLAREZA - Super Utilizador (< 3 dias ativo)')
    console.log('   3. CLAREZA - Ativo (< 7 dias ativo)')
    console.log('   4. CLAREZA - Inativo 7d (7-14 dias)')
    console.log('   5. CLAREZA - Inativo 14d (14-30 dias)')
    console.log('   6. CLAREZA - Inativo 30d (30+ dias)')
    console.log('═══════════════════════════════════════════════════════════\n')

  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Desconectado da MongoDB')
  }
}

main()