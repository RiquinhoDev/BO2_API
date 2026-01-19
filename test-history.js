// Script de teste para sistema de histórico
const mongoose = require('mongoose')

// Conectar ao MongoDB
mongoose.connect('mongodb://localhost:27017/bo2')
  .then(async () => {
    console.log('✅ Conectado ao MongoDB')

    // Importar modelos
    const User = require('./dist/models/user').default
    const UserProduct = require('./dist/models/UserProduct').default
    const { snapshotAndCompare } = require('./dist/services/snapshotServices/userSnapshot.service')

    const email = 'joaomcf37@gmail.com'

    // 1. Buscar user
    console.log(`\n📋 Buscando dados de ${email}...`)
    const user = await User.findOne({ email })

    if (!user) {
      console.log('❌ User não encontrado')
      process.exit(1)
    }

    console.log(`✅ User encontrado: ${user.name} (${user._id})`)

    // 2. Buscar produtos
    const products = await UserProduct.find({ userId: user._id })
      .populate('productId', 'name code platform')

    console.log(`✅ ${products.length} produtos encontrados`)

    // 3. Guardar estado original
    const originalState = {
      name: user.name,
      averageEngagement: user.averageEngagement,
      products: products.map(p => ({
        _id: p._id,
        status: p.status,
        progressPercentage: p.progress?.percentage || 0,
        completedLessons: p.progress?.completed || 0,
        totalLogins: p.engagement?.totalLogins || 0,
        engagementScore: p.engagement?.engagementScore || 0
      }))
    }

    console.log('\n📸 Estado original guardado')
    console.log('   Nome:', originalState.name)
    console.log('   Engagement médio:', originalState.averageEngagement)
    console.log('   Produtos:', originalState.products.length)

    // 4. Criar snapshot ANTES das alterações
    console.log('\n📸 Criando snapshot inicial...')
    await snapshotAndCompare(user, products, 'manual')

    // 5. Fazer alterações
    console.log('\n🔧 Fazendo alterações de teste...\n')

    // Alteração 1: Nome
    const newName = user.name + ' (TESTE)'
    console.log(`1️⃣ Alterando nome: "${user.name}" → "${newName}"`)
    user.name = newName
    await user.save()

    // Alteração 2: Engagement médio
    const newEngagement = (user.averageEngagement || 50) + 10
    console.log(`2️⃣ Alterando engagement: ${user.averageEngagement} → ${newEngagement}`)
    user.averageEngagement = newEngagement
    await user.save()

    // Alteração 3: Progresso do primeiro produto
    if (products.length > 0) {
      const product = products[0]
      const oldProgress = product.progress?.percentage || 0
      const newProgress = Math.min(oldProgress + 15, 100)

      console.log(`3️⃣ Alterando progresso em "${product.productId?.name || 'Produto'}": ${oldProgress}% → ${newProgress}%`)

      await UserProduct.findByIdAndUpdate(product._id, {
        $set: { 'progress.percentage': newProgress }
      })
    }

    // Alteração 4: Lições completadas
    if (products.length > 0) {
      const product = products[0]
      const oldLessons = product.progress?.completed || 0
      const newLessons = oldLessons + 5

      console.log(`4️⃣ Alterando lições completadas em "${product.productId?.name || 'Produto'}": ${oldLessons} → ${newLessons}`)

      await UserProduct.findByIdAndUpdate(product._id, {
        $set: { 'progress.completed': newLessons }
      })
    }

    // Alteração 5: Total de logins
    if (products.length > 0) {
      const product = products[0]
      const oldLogins = product.engagement?.totalLogins || 0
      const newLogins = oldLogins + 20

      console.log(`5️⃣ Alterando total de logins em "${product.productId?.name || 'Produto'}": ${oldLogins} → ${newLogins}`)

      await UserProduct.findByIdAndUpdate(product._id, {
        $set: { 'engagement.totalLogins': newLogins }
      })
    }

    // 6. Buscar estado atualizado
    console.log('\n📊 Buscando estado atualizado...')
    const updatedUser = await User.findById(user._id)
    const updatedProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'name code platform')

    // 7. Criar snapshot DEPOIS e comparar
    console.log('\n📸 Criando snapshot final e comparando...')
    const { comparison } = await snapshotAndCompare(updatedUser, updatedProducts, 'manual')

    console.log('\n✅ Comparação concluída!')
    console.log(`   Total de alterações: ${comparison.summary.totalChanges}`)
    console.log(`   Alta prioridade: ${comparison.summary.highPriorityChanges}`)
    console.log(`   Média prioridade: ${comparison.summary.mediumPriorityChanges}`)
    console.log(`   Baixa prioridade: ${comparison.summary.lowPriorityChanges}`)

    console.log('\n📝 Alterações detectadas:\n')
    comparison.changes.forEach((change, i) => {
      console.log(`${i + 1}. [${change.significance}] ${change.changeType}`)
      console.log(`   ${change.description}`)
      console.log(`   Anterior: ${JSON.stringify(change.previousValue)}`)
      console.log(`   Novo: ${JSON.stringify(change.newValue)}`)
      console.log('')
    })

    // 8. Mostrar dados para reversão
    console.log('\n💾 Dados para reversão:')
    console.log(JSON.stringify(originalState, null, 2))

    console.log('\n✅ Teste concluído! Verifique o histórico no frontend.')
    console.log(`   User ID: ${user._id}`)
    console.log(`   URL: /dashboard?tab=studentEditor&search=${encodeURIComponent(email)}`)

    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Erro:', err)
    process.exit(1)
  })
