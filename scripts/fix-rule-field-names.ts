// ═══════════════════════════════════════════════════════════
// 🔧 CORRIGIR NOMES DE CAMPOS NAS TAG RULES
// ✅ VERSÃO CORRIGIDA: TypeScript tipado
// ═══════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import TagRule from '../src/models/acTags/TagRule'

dotenv.config()

// ✅ CORRIGIDO: Tipagem explícita
const FIELD_MAPPINGS: Record<string, string> = {
  // LOGIN_BASED (OGI)
  'engagement.daysSinceLastLogin': 'daysSinceLastLogin',
  'engagement.lastLogin': 'lastLogin',
  'engagement.totalLogins': 'totalLogins',
  'engagement.loginStreak': 'loginStreak',
  
  // ACTION_BASED (Clareza)
  'engagement.daysSinceLastAction': 'daysSinceLastAction',
  'engagement.lastAction': 'lastAction',
  'engagement.totalActions': 'totalActions',
  'engagement.actionsLastWeek': 'actionsLastWeek',
  'engagement.actionsLastMonth': 'actionsLastMonth',
  
  // Progress (ambos)
  'progress.percentage': 'currentProgress',
  'progress.currentModule': 'currentModule',
  'progress.modulesCompleted': 'modulesCompleted',
  'progress.lessonsCompleted': 'lessonsCompleted',
  
  // Aliases
  'lastAccessDate': 'daysSinceLastAction',
  'lastReportOpenedAt': 'daysSinceLastAction',
  'lastReportOpened': 'daysSinceLastAction',
  'reportsOpenedLastWeek': 'reportsOpenedLastWeek',
  'reportsOpenedLastMonth': 'reportsOpenedLastMonth',
  'totalReportsOpened': 'totalReportsOpened'
}

async function fixRuleFieldNames() {
  try {
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado à BD\n')

    console.log('═'.repeat(70))
    console.log('🔧 CORRIGINDO NOMES DE CAMPOS NAS TAG RULES')
    console.log('═'.repeat(70))
    console.log()

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR TODAS AS REGRAS
    // ═══════════════════════════════════════════════════════════

    const rules = await TagRule.find()
    console.log(`📋 Encontradas ${rules.length} regras\n`)

    let rulesUpdated = 0
    let fieldsFixed = 0

    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA REGRA
    // ═══════════════════════════════════════════════════════════

    for (const rule of rules) {
      let ruleModified = false
      
      console.log(`🔍 Processando: ${rule.name}`)

      // Processar cada condição
      for (const condition of rule.conditions) {
        if (condition.type === 'SIMPLE' && condition.field) {
          const originalField = condition.field
          const mappedField = FIELD_MAPPINGS[originalField]

          if (mappedField && mappedField !== originalField) {
            console.log(`   ✏️  "${originalField}" → "${mappedField}"`)
            condition.field = mappedField
            ruleModified = true
            fieldsFixed++
          }
        } else if (condition.type === 'COMPOUND' && condition.subConditions) {
          for (const sub of condition.subConditions) {
            if (sub.field) {
              const originalField = sub.field
              const mappedField = FIELD_MAPPINGS[originalField]

              if (mappedField && mappedField !== originalField) {
                console.log(`   ✏️  "${originalField}" → "${mappedField}"`)
                sub.field = mappedField
                ruleModified = true
                fieldsFixed++
              }
            }
          }
        }
      }

      // Salvar se modificado
      if (ruleModified) {
        await rule.save()
        rulesUpdated++
        console.log(`   ✅ Regra atualizada`)
      } else {
        console.log(`   ⏭️  Sem mudanças`)
      }

      console.log()
    }

    // ═══════════════════════════════════════════════════════════
    // 3. RESUMO
    // ═══════════════════════════════════════════════════════════

    console.log('═'.repeat(70))
    console.log('📊 RESUMO')
    console.log('═'.repeat(70))
    console.log()
    console.log(`Total de regras: ${rules.length}`)
    console.log(`Regras atualizadas: ${rulesUpdated}`)
    console.log(`Campos corrigidos: ${fieldsFixed}`)
    console.log()

    if (rulesUpdated > 0) {
      console.log('✅ CORREÇÃO COMPLETA!')
      console.log()
      console.log('📋 PRÓXIMO PASSO:')
      console.log('   → Testar novamente: npx ts-node scripts/test-evaluate-rules-only.ts')
      console.log('   → Warnings devem desaparecer!')
    } else {
      console.log('ℹ️  Nenhuma regra precisou de correção')
    }

    console.log()

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
  } finally {
    await mongoose.disconnect()
  }
}

fixRuleFieldNames()