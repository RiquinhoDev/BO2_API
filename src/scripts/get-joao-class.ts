import mongoose from 'mongoose'
import User from '../models/User'
import dotenv from 'dotenv'

dotenv.config()

async function getJoaoClass() {
  await mongoose.connect(process.env.MONGO_URI || '')

  const user = await User.findOne({ email: 'joaomcf37@gmail.com' })

  console.log('📊 Dados do João Ferreira:')
  console.log('   Email:', (user as any).email)
  console.log('   Nome:', (user as any).name)
  console.log('   Discord IDs:', (user as any).discord?.discordIds)
  console.log('   Turma (classId):', (user as any).combined?.classId)
  console.log('   Status:', (user as any).status)
  console.log('   Combined Status:', (user as any).combined?.status)

  await mongoose.disconnect()
}

getJoaoClass()
