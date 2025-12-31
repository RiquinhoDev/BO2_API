// ════════════════════════════════════════════════════════════
// 🔍 DIAGNÓSTICO: REGRAS OGI
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import Course from '../src/models/Course'
import TagRule from '../src/models/acTags/TagRule'
import Product from '../src/models/Product'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
const DB_NAME = process.env.DB_NAME!

console.clear()
console.log('═'.repeat(70))
console.log('🔍 DIAGNÓSTICO: REGRAS OGI')
console.log('═'.repeat(70))
console.log()

async function main() {
  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR PRODUTO OGI
    // ═══════════════════════════════════════════════════════════

    console.log('📦 Buscando produto OGI...')
    const product = await Product.findOne({ code: 'OGI_V1' })

    if (!product) {
      console.log('❌ Produto OGI_V1 não encontrado!')
      return
    }

    console.log(`✅ Produto encontrado: ${product._id}`)
    console.log(`   Nome: ${product.name}`)
    console.log(`   CourseCode: ${(product as any).courseCode}`)
    console.log()

    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR COURSE
    // ═══════════════════════════════════════════════════════════

    console.log('📚 Buscando course...')
    const course = await Course.findOne({ 
      code: (product as any).courseCode || product.code 
    })

    if (!course) {
      console.log('❌ Course não encontrado!')
      console.log(`   Tentou buscar: ${(product as any).courseCode || product.code}`)
      
      console.log()
      console.log('📋 Courses disponíveis:')
      const allCourses = await Course.find()
      for (const c of allCourses) {
        console.log(`   - ${c.code} (${c.name})`)
      }
      return
    }

    console.log(`✅ Course encontrado: ${course._id}`)
    console.log(`   Code: ${course.code}`)
    console.log(`   Nome: ${course.name}`)
    console.log()

    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR REGRAS
    // ═══════════════════════════════════════════════════════════

    console.log('🏷️  Buscando regras...')
    const rules = await TagRule.find({ 
      courseId: course._id 
    }).sort({ priority: -1 })

    console.log(`📋 ${rules.length} regras encontradas`)
    console.log()

    if (rules.length === 0) {
      console.log('❌ PROBLEMA: Nenhuma regra encontrada para este course!')
      console.log()
      console.log('💡 SOLUÇÃO:')
      console.log('   Criar regras em: POST /api/tag-rules')
      console.log()
      console.log('   Exemplo de regra:')
      console.log('   {')
      console.log('     "name": "OGI - Inativo 7d",')
      console.log('     "courseId": "' + course._id + '",')
      console.log('     "conditions": [')
      console.log('       {')
      console.log('         "type": "SIMPLE",')
      console.log('         "field": "daysSinceLastLogin",')
      console.log('         "operator": "greaterThan",')
      console.log('         "value": 7')
      console.log('       }')
      console.log('     ],')
      console.log('     "actions": {')
      console.log('       "addTag": "OGI_V1 - Inativo 7d",')
      console.log('       "removeTags": ["OGI_V1 - Ativo"]')
      console.log('     },')
      console.log('     "isActive": true,')
      console.log('     "priority": 10')
      console.log('   }')
      return
    }

    // ═══════════════════════════════════════════════════════════
    // 4. MOSTRAR REGRAS
    // ═══════════════════════════════════════════════════════════

    console.log('═'.repeat(70))
    console.log('📋 REGRAS ENCONTRADAS:')
    console.log('═'.repeat(70))
    console.log()

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]

      console.log(`${i + 1}. ${rule.name}`)
      console.log(`   ID: ${rule._id}`)
      console.log(`   Status: ${rule.isActive ? '🟢 ATIVO' : '🔴 INATIVO'}`)
      console.log(`   Prioridade: ${rule.priority}`)
      console.log()

      console.log(`   Condições:`)
      for (const cond of rule.conditions) {
        if (cond.type === 'SIMPLE') {
          console.log(`      ${cond.field} ${cond.operator} ${cond.value}`)
        } else if (cond.type === 'COMPOUND') {
          console.log(`      ${cond.logic}:`)
          for (const sub of cond.subConditions || []) {
            console.log(`         ${sub.field} ${sub.operator} ${sub.value}`)
          }
        }
      }
      console.log()

      console.log(`   Ações:`)
      console.log(`      Adicionar tag: ${rule.actions.addTag}`)
      if (rule.actions.removeTags && rule.actions.removeTags.length > 0) {
        console.log(`      Remover tags: [${rule.actions.removeTags.join(', ')}]`)
      }
      console.log()
    }

    // ═══════════════════════════════════════════════════════════
    // 5. TESTAR CONDIÇÕES COM TEU USER
    // ═══════════════════════════════════════════════════════════

    console.log('═'.repeat(70))
    console.log('🧪 TESTE COM TEU USER:')
    console.log('═'.repeat(70))
    console.log()

    const testData = {
      daysSinceLastLogin: 7,
      daysSinceLastAction: 7,
      currentProgress: 0,
      reportsOpenedLastWeek: 0,
      reportsOpenedLastMonth: 0
    }

    console.log('📊 Dados do user:')
    console.log(JSON.stringify(testData, null, 2))
    console.log()

    console.log('🎯 Regras que deveriam aplicar:')
    console.log()

    let matchCount = 0

    for (const rule of rules) {
      if (!rule.isActive) continue

      let matches = true

      for (const cond of rule.conditions) {
        if (cond.type === 'SIMPLE') {
          const fieldValue = (testData as any)[cond.field]
          
          if (fieldValue === undefined) {
            matches = false
            break
          }

          switch (cond.operator) {
            case 'greaterThan':
              if (!(fieldValue > cond.value)) matches = false
              break
            case 'lessThan':
              if (!(fieldValue < cond.value)) matches = false
              break
            case 'equals':
              if (!(fieldValue === cond.value)) matches = false
              break
            case 'olderThan':
              if (!(fieldValue > cond.value)) matches = false
              break
            case 'newerThan':
              if (!(fieldValue < cond.value)) matches = false
              break
          }

          if (!matches) break
        }
      }

      if (matches) {
        matchCount++
        console.log(`   ✅ ${rule.name}`)
        console.log(`      Tag a aplicar: ${rule.actions.addTag}`)
        console.log()
      }
    }

    if (matchCount === 0) {
      console.log('   ❌ NENHUMA REGRA APLICÁVEL!')
      console.log()
      console.log('💡 Possíveis razões:')
      console.log('   1. Condições das regras não batem com os dados do user')
      console.log('   2. Todas as regras estão inativas')
      console.log('   3. Campo usado nas condições não existe nos dados')
    }

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log()
    console.log('👋 Desconectado')
  }
}

main()