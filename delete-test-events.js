// Script para apagar eventos de teste do histórico
const mongoose = require('mongoose')

mongoose.connect('mongodb://localhost:27017/bo2')
  .then(async () => {
    console.log('✅ Conectado ao MongoDB')

    const UserHistory = require('./dist/models/UserHistory').default

    // IDs dos eventos de teste a apagar
    const testEventIds = [
      '696e65325cdee48d89bed2b2', // Nome alterado para "(TESTE)"
      '696e65325cdee48d89bed2b3', // Progresso aumentou de 0% para 15%
      '696e65325cdee48d89bed2b4'  // 20 novos acessos (713 → 733)
    ]

    console.log(`\n🗑️ Apagando ${testEventIds.length} eventos de teste...`)

    const result = await UserHistory.deleteMany({
      _id: { $in: testEventIds }
    })

    console.log(`✅ ${result.deletedCount} eventos apagados!`)

    // Também vou reverter o nome do user
    const User = require('./dist/models/user').default

    await User.findOneAndUpdate(
      { email: 'joaomcf37@gmail.com' },
      { $set: { name: 'João Ferreira' } }
    )

    console.log('✅ Nome do user revertido para "João Ferreira"')

    console.log('\n✅ Limpeza concluída! Eventos de teste removidos, histórico retroativo mantido.')

    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Erro:', err)
    process.exit(1)
  })
