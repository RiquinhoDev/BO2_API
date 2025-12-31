// ════════════════════════════════════════════════════════════
// 🔍 VERIFICAR TAGS DAS REGRAS OGI NA BD
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
console.log('🔍 VERIFICAR TAGS DAS REGRAS OGI')
console.log('═'.repeat(70))
console.log()

async function main() {
  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()

    // Buscar course OGI
    const course = await Course.findOne({ code: 'OGI' })
    if (!course) {
      console.log('❌ Course OGI não encontrado!')
      return
    }

    console.log(`✅ Course encontrado: ${course.name} (${course.code})`)
    console.log()

    // Buscar regras
    const rules = await TagRule.find({ courseId: course._id, isActive: true })
      .sort({ priority: -1, name: 1 })

    console.log(`📋 Regras ativas: ${rules.length}`)
    console.log()

    console.log('═'.repeat(70))
    console.log('TAGS NAS REGRAS:')
    console.log('═'.repeat(70))

    for (const rule of rules) {
      const tag = rule.actions.addTag
      const hasPrefix = tag.startsWith('OGI')
      
      console.log()
      console.log(`📝 ${rule.name}`)
      console.log(`   Tag: "${tag}"`)
      console.log(`   ${hasPrefix ? '✅' : '❌'} Tem prefixo OGI: ${hasPrefix}`)
      
      if (!hasPrefix) {
        console.log(`   💡 DEVERIA SER: "OGI_V1 - ${tag}"`)
      }
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