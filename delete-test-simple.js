// Script simplificado para apagar eventos de teste
const { MongoClient } = require('mongodb')

const url = 'mongodb://localhost:27017'
const dbName = 'bo2'

async function deleteTestEvents() {
  const client = new MongoClient(url)

  try {
    await client.connect()
    console.log('✅ Conectado ao MongoDB')

    const db = client.db(dbName)

    // Apagar eventos de teste do histórico
    const historyResult = await db.collection('userhistories').deleteMany({
      userEmail: 'joaomcf37@gmail.com',
      changeDate: '2026-01-19T17:09:06.703Z'
    })

    console.log(`🗑️ ${historyResult.deletedCount} eventos de teste apagados`)

    // Reverter nome do user
    const userResult = await db.collection('users').updateOne(
      { email: 'joaomcf37@gmail.com' },
      { $set: { name: 'João Ferreira' } }
    )

    console.log(`✅ Nome do user atualizado (${userResult.modifiedCount} documento modificado)`)

    console.log('\n✅ Limpeza concluída!')

  } catch (err) {
    console.error('❌ Erro:', err)
  } finally {
    await client.close()
  }
}

deleteTestEvents()
