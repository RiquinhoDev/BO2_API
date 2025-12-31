// ════════════════════════════════════════════════════════════
// 🔧 CORREÇÃO: REGRAS OGI
// Corrige condições das regras existentes
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import TagRule from '../src/models/acTags/TagRule'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
const DB_NAME = process.env.DB_NAME!

console.clear()
console.log('═'.repeat(70))
console.log('🔧 CORREÇÃO: REGRAS OGI')
console.log('═'.repeat(70))
console.log()

const DRY_RUN = false  // ← Mudar para false para executar!

async function main() {
  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()

    if (DRY_RUN) {
      console.log('🔍 MODO DRY RUN - Nenhuma alteração será feita')
      console.log()
    }

    // ═══════════════════════════════════════════════════════════
    // CORREÇÕES A APLICAR
    // ═══════════════════════════════════════════════════════════

    const corrections = [
      {
        name: 'OGI_V1 - Inativo 7-10d',
        fix: {
          conditions: [
            {
              type: 'COMPOUND',
              logic: 'AND',
              subConditions: [
                { field: 'daysSinceLastLogin', operator: 'greaterThan', value: 6, unit: 'days' },
                { field: 'daysSinceLastLogin', operator: 'lessThan', value: 10, unit: 'days' }
              ]
            }
          ]
        },
        reason: 'Operador > 7 exclui dia 7. Corrigido para > 6 (≥7)'
      },
      {
        name: 'OGI_V1 - Inativo 10-21d',
        fix: {
          conditions: [
            {
              type: 'COMPOUND',
              logic: 'AND',
              subConditions: [
                { field: 'daysSinceLastLogin', operator: 'greaterThan', value: 9, unit: 'days' },
                { field: 'daysSinceLastLogin', operator: 'lessThan', value: 21, unit: 'days' }
              ]
            }
          ]
        },
        reason: 'Operador > 10 exclui dia 10. Corrigido para > 9 (≥10)'
      },
      {
        name: 'OGI_V1 - Inativo 21d+',
        fix: {
          conditions: [
            {
              type: 'SIMPLE',
              field: 'daysSinceLastLogin',
              operator: 'greaterThan',
              value: 20,
              unit: 'days',
              subConditions: []
            }
          ]
        },
        reason: 'Operador > 21 exclui dia 21. Corrigido para > 20 (≥21)'
      },
      {
        name: 'OGI_V1 - Reativado',
        fix: {
          conditions: [
            {
              type: 'COMPOUND',
              logic: 'AND',
              subConditions: [
                { field: 'daysSinceLastLogin', operator: 'lessThan', value: 3, unit: 'days' },
                { field: 'currentProgress', operator: 'greaterThan', value: 0, unit: 'percentage' }
              ]
            }
          ]
        },
        reason: 'Reativado deve ser para users que voltaram recentemente (< 3 dias)'
      },
      {
        name: 'OGI_V1 - Parou após M1',
        fix: {
          conditions: [
            {
              type: 'COMPOUND',
              logic: 'AND',
              subConditions: [
                { field: 'currentModule', operator: 'equals', value: 1, unit: 'percentage' },
                { field: 'daysSinceLastLogin', operator: 'greaterThan', value: 4, unit: 'days' }
              ]
            }
          ]
        },
        reason: 'Operador > 5 exclui dia 5. Corrigido para > 4 (≥5)'
      },
      {
        name: 'OGI_V1 - Progresso Baixo',
        fix: {
          conditions: [
            {
              type: 'COMPOUND',
              logic: 'AND',
              subConditions: [
                { field: 'currentProgress', operator: 'lessThan', value: 25, unit: 'percentage' },
                { field: 'daysSinceLastLogin', operator: 'greaterThan', value: 29, unit: 'days' }
              ]
            }
          ]
        },
        reason: 'Operador > 30 exclui dia 30. Corrigido para > 29 (≥30)'
      }
    ]

    // ═══════════════════════════════════════════════════════════
    // APLICAR CORREÇÕES
    // ═══════════════════════════════════════════════════════════

    console.log('🔧 Correções a aplicar:')
    console.log()

    for (const correction of corrections) {
      console.log(`📝 ${correction.name}`)
      console.log(`   Razão: ${correction.reason}`)

      const rule = await TagRule.findOne({ name: correction.name })

      if (!rule) {
        console.log(`   ⚠️  Regra não encontrada!`)
        console.log()
        continue
      }

      console.log(`   Condição ANTES:`)
      console.log(`   ${JSON.stringify(rule.conditions, null, 2)}`)
      console.log()

      console.log(`   Condição DEPOIS:`)
      console.log(`   ${JSON.stringify(correction.fix.conditions, null, 2)}`)
      console.log()

      if (!DRY_RUN) {
        rule.conditions = correction.fix.conditions as any
        await rule.save()
        console.log(`   ✅ Corrigida!`)
      } else {
        console.log(`   🔍 [DRY RUN] Não aplicada`)
      }

      console.log()
    }

    // ═══════════════════════════════════════════════════════════
    // CRIAR REGRA FALTANTE: ATIVO
    // ═══════════════════════════════════════════════════════════

    console.log('═'.repeat(70))
    console.log('➕ CRIAR REGRA FALTANTE: ATIVO')
    console.log('═'.repeat(70))
    console.log()

    const activeRuleExists = await TagRule.findOne({ name: 'OGI_V1 - Ativo' })

    if (activeRuleExists) {
      console.log('✅ Regra "OGI_V1 - Ativo" já existe')
    } else {
      console.log('📝 Criar regra: OGI_V1 - Ativo')
      console.log('   Condição: daysSinceLastLogin < 7')
      console.log('   Ação: Adicionar "OGI_V1 - Ativo"')
      console.log('   Ação: Remover ["OGI_V1 - Inativo 7d", "OGI_V1 - Inativo 10d", "OGI_V1 - Inativo 21d"]')
      console.log()

      if (!DRY_RUN) {
        // Buscar courseId da primeira regra OGI
        const existingRule = await TagRule.findOne({ name: /^OGI_V1/ })
        
        if (!existingRule) {
          console.log('   ❌ Não foi possível encontrar courseId (nenhuma regra OGI existe)')
        } else {
          await TagRule.create({
            name: 'OGI_V1 - Ativo',
            courseId: existingRule.courseId,
            description: 'Aluno ativo (login < 7 dias)',
            category: existingRule.category || 'engagement',
            createdBy: existingRule.createdBy,
            conditions: [
              {
                type: 'SIMPLE',
                field: 'daysSinceLastLogin',
                operator: 'lessThan',
                value: 7,
                unit: 'days',
                subConditions: []
              }
            ],
            actions: {
              addTag: 'OGI_V1 - Ativo',
              removeTags: [
                'OGI_V1 - Inativo 7d',
                'OGI_V1 - Inativo 10d',
                'OGI_V1 - Inativo 21d'
              ]
            },
            isActive: true,
            priority: 10
          })

          console.log('   ✅ Regra criada!')
        }
      } else {
        console.log('   🔍 [DRY RUN] Não criada')
      }
    }

    console.log()

    // ═══════════════════════════════════════════════════════════
    // RESUMO
    // ═══════════════════════════════════════════════════════════

    if (DRY_RUN) {
      console.log('═'.repeat(70))
      console.log('🔍 DRY RUN COMPLETO')
      console.log('═'.repeat(70))
      console.log()
      console.log('💡 Para aplicar correções:')
      console.log('   1. Mudar DRY_RUN = false')
      console.log('   2. Executar novamente')
      console.log()
    } else {
      console.log('═'.repeat(70))
      console.log('✅ CORREÇÕES APLICADAS')
      console.log('═'.repeat(70))
      console.log()
      console.log('💡 Próximo passo:')
      console.log('   Testar novamente com: test-pipeline-single-user.ts')
      console.log()
    }

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('👋 Desconectado')
  }
}

main()