// ═══════════════════════════════════════════════════════════
// 📁 scripts/debug-clareza-rules.ts
// Script para analisar regras CLAREZA e identificar conflitos
// VERSÃO 2: Procura por TODOS os courses CLAREZA
// ═══════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Course from '../src/models/Course'
import TagRule from '../src/models/acTags/TagRule'
import { adaptTagRuleForDecisionEngine } from '../src/services/ac/tagRuleAdapter'

async function main() {
  try {
    // Conectar à BD
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    console.log('✅ Conectado à MongoDB')

    // 1. Buscar TODOS os courses que contenham "CLAREZA" no code
    const courses = await Course.find({
      code: { $regex: /CLAREZA/i }
    })

    console.log(`\n📚 Encontrados ${courses.length} courses CLAREZA:`)
    courses.forEach(c => {
      console.log(`   - ${c.code} (${c._id})`)
    })

    if (courses.length === 0) {
      console.log('\n❌ Nenhum course CLAREZA encontrado!')
      console.log('\nTodos os courses na BD:')
      const allCourses = await Course.find().limit(10)
      allCourses.forEach(c => {
        console.log(`   - ${c.code} (${c._id})`)
      })
      process.exit(1)
    }

    // 2. Processar cada course CLAREZA
    for (const course of courses) {
      console.log(`\n${'═'.repeat(80)}`)
      console.log(`📚 COURSE: ${course.code}`)
      console.log(`   ID: ${course._id}`)
      console.log(`   Nome: ${course.name}`)
      console.log(`   Tracking: ${course.trackingType}`)
      console.log(`${'═'.repeat(80)}`)

      // 3. Buscar TODAS as regras ativas deste course
      const rules = await TagRule.find({
        courseId: course._id,
        isActive: true
      }).sort({ priority: -1, name: 1 })

      console.log(`\n📋 Encontradas ${rules.length} regras ativas\n`)

      if (rules.length === 0) {
        console.log('   (nenhuma regra ativa)\n')
        continue
      }

      // 4. Agrupar por tipo (Level vs Regular)
      const levelRules: any[] = []
      const regularRules: any[] = []

      for (const rule of rules) {
        const adapted = adaptTagRuleForDecisionEngine(rule)
        
        // Detectar se é level rule
        const isLevel = adapted.condition?.includes('daysSinceLastAction >=') || 
                        adapted.condition?.includes('lastAccessDate >=')
        
        const ruleInfo = {
          _id: rule._id.toString(),
          name: rule.name,
          priority: rule.priority,
          condition: adapted.condition,
          action: adapted.action,
          tagName: adapted.tagName,
          removeTags: rule.actions?.removeTags || []
        }

        if (isLevel) {
          levelRules.push(ruleInfo)
        } else {
          regularRules.push(ruleInfo)
        }
      }

      // 5. Analisar LEVEL RULES
      console.log('\n───────────────────────────────────────────────────────────')
      console.log('🔢 LEVEL RULES (baseadas em dias de inatividade)')
      console.log('───────────────────────────────────────────────────────────\n')

      if (levelRules.length === 0) {
        console.log('   (nenhuma)\n')
      } else {
        levelRules.forEach((r, i) => {
          console.log(`${i + 1}. ${r.name}`)
          console.log(`   ID: ${r._id}`)
          console.log(`   Priority: ${r.priority}`)
          console.log(`   Condição: ${r.condition}`)
          console.log(`   Tag: "${r.tagName}"`)
          console.log(`   RemoveTags: ${r.removeTags.length > 0 ? JSON.stringify(r.removeTags) : '[]'}`)
          console.log()
        })
      }

      // 6. Analisar REGULAR RULES
      console.log('───────────────────────────────────────────────────────────')
      console.log('📌 REGULAR RULES (outras condições)')
      console.log('───────────────────────────────────────────────────────────\n')

      if (regularRules.length === 0) {
        console.log('   (nenhuma)\n')
      } else {
        regularRules.forEach((r, i) => {
          console.log(`${i + 1}. ${r.name}`)
          console.log(`   ID: ${r._id}`)
          console.log(`   Priority: ${r.priority}`)
          console.log(`   Condição: ${r.condition}`)
          console.log(`   Tag: "${r.tagName}"`)
          console.log(`   RemoveTags: ${r.removeTags.length > 0 ? JSON.stringify(r.removeTags) : '[]'}`)
          console.log()
        })
      }

      // 7. DETECTAR CONFLITOS
      console.log('───────────────────────────────────────────────────────────')
      console.log('⚠️ ANÁLISE DE CONFLITOS')
      console.log('───────────────────────────────────────────────────────────\n')

      // Agrupar por condição
      const byCondition = new Map<string, any[]>()
      
      for (const rule of [...levelRules, ...regularRules]) {
        const cond = rule.condition || 'NO_CONDITION'
        if (!byCondition.has(cond)) {
          byCondition.set(cond, [])
        }
        byCondition.get(cond)!.push(rule)
      }

      let conflictsFound = 0

      for (const [condition, rulesWithSameCond] of byCondition.entries()) {
        if (rulesWithSameCond.length > 1) {
          conflictsFound++
          console.log(`⚠️ CONFLITO ${conflictsFound}: ${rulesWithSameCond.length} regras com MESMA condição:`)
          console.log(`   Condição: "${condition}"`)
          console.log(`   Regras:`)
          rulesWithSameCond.forEach(r => {
            console.log(`      - ${r.name} → Tag: "${r.tagName}"`)
          })
          console.log()
        }
      }

      if (conflictsFound === 0) {
        console.log('✅ Nenhum conflito óbvio detectado!\n')
      } else {
        console.log(`❌ Total de conflitos: ${conflictsFound}\n`)
      }

      // 8. TESTAR COM USER RUI.SANTOS
      console.log('───────────────────────────────────────────────────────────')
      console.log('🧪 SIMULAÇÃO: rui.santos (5 dias desde última ação)')
      console.log('───────────────────────────────────────────────────────────\n')

      const daysSinceLastAction = 5

      console.log('Regras que APLICARIAM (condição satisfeita):\n')

      let wouldApply = 0
      const tagsToApply: string[] = []

      for (const rule of [...levelRules, ...regularRules]) {
        const condition = rule.condition || ''
        let satisfied = false

        // Avaliar condição (simplificado)
        if (condition.includes('lastAccessDate < 7')) {
          satisfied = daysSinceLastAction < 7
        } else if (condition.includes('lastAccessDate >= 7')) {
          satisfied = daysSinceLastAction >= 7
        } else if (condition.includes('daysSinceLastAction < 7')) {
          satisfied = daysSinceLastAction < 7
        } else if (condition.includes('daysSinceLastAction >= 7')) {
          satisfied = daysSinceLastAction >= 7
        }

        if (satisfied) {
          wouldApply++
          tagsToApply.push(rule.tagName)
          console.log(`   ✅ ${rule.name}`)
          console.log(`      Tag: "${rule.tagName}"`)
          console.log(`      Condição: ${condition}`)
          console.log()
        }
      }

      console.log(`📊 Total de regras que aplicariam: ${wouldApply}`)
      
      if (wouldApply > 1) {
        console.log(`\n⚠️ PROBLEMA: ${wouldApply} tags seriam aplicadas simultaneamente!`)
        console.log(`\nTags aplicadas:`)
        tagsToApply.forEach(t => console.log(`   - "${t}"`))
      } else if (wouldApply === 1) {
        console.log(`\n✅ OK: Apenas 1 tag seria aplicada: "${tagsToApply[0]}"`)
      } else {
        console.log(`\n⚠️ Nenhuma regra aplicaria para este cenário`)
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\n' + '═'.repeat(80))
    console.log('✅ Desconectado da MongoDB')
    console.log('═'.repeat(80))
  }
}

main()