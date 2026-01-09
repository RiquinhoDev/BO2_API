import 'dotenv/config'
import mongoose from 'mongoose'
import TagRule from '../src/models/acTags/TagRule'
import Course from '../src/models/course'

async function checkCompoundConditions() {
  await mongoose.connect(process.env.MONGO_URI!)

  const course = await Course.findOne({ code: 'OGI' })

  const compoundRule = await TagRule.findOne({
    courseId: course?._id,
    'conditions.type': 'COMPOUND'
  })

  if (compoundRule) {
    console.log(`📋 Regra: ${compoundRule.name}\n`)
    console.log('Conditions completas:')
    console.log(JSON.stringify(compoundRule.conditions, null, 2))
  } else {
    console.log('❌ Nenhuma regra COMPOUND encontrada')
  }

  await mongoose.connection.close()
  process.exit(0)
}

checkCompoundConditions()
