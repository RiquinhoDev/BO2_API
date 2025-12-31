// ════════════════════════════════════════════════════════════
// 🔍 VER CONDIÇÕES DETALHADAS DAS REGRAS OGI
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import TagRule from '../src/models/acTags/TagRule'
import Course from '../src/models/Course'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

console.clear()
console.log('═'.repeat(70))
console.log('🔍 CONDIÇÕES DETALHADAS DAS REGRAS OGI')
console.log('═'.repeat(70))
console.log()

async function main() {
  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()

    const course = await Course.findOne({ code: 'OGI' })
    if (!course) {
      console.log('❌ Course OGI não encontrado!')
      return
    }

    const rules = await TagRule.find({ courseId: course._id, isActive: true })
      .sort({ priority: -1, name: 1 })

    console.log(`📋 Regras ativas: ${rules.length}`)
    console.log()
    console.log('═'.repeat(70))

    for (const rule of rules) {
      console.log()
      console.log(`📝 ${rule.name}`)
      console.log(`   Tag: "${rule.actions.addTag}"`)
      console.log(`   Prioridade: ${rule.priority}`)
      console.log()
      console.log(`   📊 Condições:`)
      
      if (!rule.conditions || rule.conditions.length === 0) {
        console.log(`      ⚠️  SEM CONDIÇÕES (aplica sempre!)`)
      } else {
        rule.conditions.forEach((cond: any, i: number) => {
          console.log(`      ${i + 1}. Tipo: ${cond.type}`)
          
          if (cond.type === 'SIMPLE') {
            console.log(`         ${cond.field} ${cond.operator} ${cond.value} ${cond.unit || ''}`)
          } else if (cond.type === 'COMPOUND') {
            console.log(`         Lógica: ${cond.logic}`)
            cond.subConditions?.forEach((sub: any, j: number) => {
              console.log(`         ${j + 1}) ${sub.field} ${sub.operator} ${sub.value} ${sub.unit || ''}`)
            })
          }
        })
      }
      
      console.log()
      console.log(`   ─`.repeat(35))
    }

    console.log()
    console.log('═'.repeat(70))

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log()
    console.log('👋 Desconectado')
  }
}

main()