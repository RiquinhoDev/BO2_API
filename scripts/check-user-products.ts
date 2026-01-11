// Script simples para verificar produtos de utilizadores
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

async function main() {
  console.log('A conectar...')
  await mongoose.connect(MONGO_URI)
  console.log('Conectado!\n')

  const { User, UserProduct } = await import('../src/models')

  const emails = [
    'andregaspar1996@gmail.com',
    'jcarmovaz@gmail.com',
    'joaopmgomes.1995@gmail.com',
    'francinamoreira@sapo.pt',
    'antlusilva@gmail.com'
  ]

  console.log('Verificando produtos de cada utilizador:\n')

  for (const email of emails) {
    const user = await User.findOne({ email }).lean() as any
    if (!user) {
      console.log(`${email}: NAO ENCONTRADO`)
      continue
    }

    const userProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'code name')
      .lean() as any[]

    console.log(`${email}:`)
    if (userProducts.length === 0) {
      console.log('   - Nenhum produto')
    } else {
      for (const up of userProducts) {
        const productCode = up.productId?.code || 'N/A'
        console.log(`   - ${productCode} (${up.status})`)
      }
    }
    console.log('')
  }

  await mongoose.disconnect()
  console.log('Feito!')
}

main().catch(err => {
  console.error('Erro:', err)
  process.exit(1)
})
