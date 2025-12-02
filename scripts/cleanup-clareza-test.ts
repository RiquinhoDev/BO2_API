// BO2_API/scripts/cleanup-clareza-test.ts
import mongoose from 'mongoose'
import Product from '../src/models/Product'
import UserProduct from '../src/models/UserProduct'

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🧹 LIMPEZA DE PRODUTOS DE TESTE\n')
    console.log('═'.repeat(80))
    
    const mensal = await Product.findOne({ code: 'CLAREZA_MENSAL' })
    const anual = await Product.findOne({ code: 'CLAREZA_ANUAL' })
    
    if (mensal) {
      const mensalUPs = await UserProduct.countDocuments({ productId: mensal._id })
      await UserProduct.deleteMany({ productId: mensal._id })
      await Product.findByIdAndDelete(mensal._id)
      console.log(`✅ CLAREZA_MENSAL apagado (${mensalUPs} UserProducts removidos)`)
    } else {
      console.log('ℹ️  CLAREZA_MENSAL não existe')
    }
    
    if (anual) {
      const anualUPs = await UserProduct.countDocuments({ productId: anual._id })
      await UserProduct.deleteMany({ productId: anual._id })
      await Product.findByIdAndDelete(anual._id)
      console.log(`✅ CLAREZA_ANUAL apagado (${anualUPs} UserProducts removidos)`)
    } else {
      console.log('ℹ️  CLAREZA_ANUAL não existe')
    }
    
    console.log('\n═'.repeat(80))
    console.log('✅ LIMPEZA COMPLETA\n')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

cleanup()