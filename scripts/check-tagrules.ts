import 'dotenv/config'
import mongoose from 'mongoose'
import TagRule from '../src/models/acTags/TagRule'
import Course from '../src/models/course'

async function checkTagRules() {
  await mongoose.connect(process.env.MONGO_URI!)

  console.log('🔍 Buscando Course OGI...')
  const course = await Course.findOne({ code: 'OGI' })
  console.log(`Course ID: ${course?._id}\n`)

  console.log('📋 TagRules para OGI:')
  const rules = await TagRule.find({ courseId: course?._id }).limit(5)

  console.log(`Total encontradas: ${rules.length}\n`)

  rules.forEach((rule: any, idx: number) => {
    console.log(`\n[${idx + 1}] ${rule.name}`)
    console.log(`   priority: ${rule.priority}`)
    console.log(`   category: ${rule.category}`)
    console.log(`   condition (string): "${rule.condition || ''}"`)
    console.log(`   conditions (array length): ${rule.conditions?.length || 0}`)
    if (rule.conditions && rule.conditions.length > 0) {
      console.log(`   conditions detail:`)
      rule.conditions.forEach((cond: any, i: number) => {
        console.log(`      [${i}] type: ${cond.type}, field: ${cond.field}, operator: ${cond.operator}, value: ${cond.value}, unit: ${cond.unit}`)
      })
    }
    console.log(`   actions.addTag: ${rule.actions?.addTag}`)
  })

  await mongoose.connection.close()
  process.exit(0)
}

checkTagRules()
