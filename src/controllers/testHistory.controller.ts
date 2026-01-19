// ══════════════════════════════════════════════════════════════════════
// 📁 src/controllers/testHistory.controller.ts
// Controller de TESTE para sistema de histórico
// ⚠️ APENAS PARA DESENVOLVIMENTO - REMOVER EM PRODUÇÃO
// ══════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import User from '../models/user'
import UserProduct from '../models/UserProduct'
import { snapshotAndCompare } from '../services/snapshotServices/userSnapshot.service'

/**
 * POST /api/test/history/make-changes
 * Faz alterações de teste no user para testar sistema de histórico
 */
export const makeTestChanges = async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email é obrigatório'
      })
    }

    console.log(`\n📋 [TEST] Buscando dados de ${email}...`)

    // 1. Buscar user
    const user = await User.findOne({ email })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User não encontrado'
      })
    }

    console.log(`✅ [TEST] User encontrado: ${user.name} (${user._id})`)

    // 2. Buscar produtos
    const products = await UserProduct.find({ userId: user._id })
      .populate('productId', 'name code platform')

    console.log(`✅ [TEST] ${products.length} produtos encontrados`)

    // 3. Guardar estado original
    const originalState = {
      userId: user._id.toString(),
      name: user.name,
      averageEngagement: user.averageEngagement,
      products: products.map((p: any) => ({
        _id: p._id.toString(),
        productName: p.productId?.name || 'Produto',
        status: p.status,
        progressPercentage: p.progress?.percentage || 0,
        completedLessons: p.progress?.completed || 0,
        totalLogins: p.engagement?.totalLogins || 0,
        engagementScore: p.engagement?.engagementScore || 0
      }))
    }

    // 4. Criar snapshot ANTES das alterações
    console.log('\n📸 [TEST] Criando snapshot inicial...')
    await snapshotAndCompare(user, products as any[], 'manual')

    // 5. Fazer alterações
    console.log('\n🔧 [TEST] Fazendo alterações...\n')

    const changes: string[] = []

    // Alteração 1: Nome
    const oldName = user.name
    const newName = user.name.includes('(TESTE)') ? user.name : user.name + ' (TESTE)'
    console.log(`1️⃣ [TEST] Nome: "${oldName}" → "${newName}"`)
    changes.push(`Nome alterado de "${oldName}" para "${newName}"`)

    // Atualizar apenas o nome, sem validação do modelo completo
    await User.findByIdAndUpdate(user._id, {
      $set: { name: newName }
    })

    // Alteração 2: Engagement médio
    const oldEngagement = user.averageEngagement || 50
    const newEngagement = Math.min(oldEngagement + 10, 100)
    console.log(`2️⃣ [TEST] Engagement: ${oldEngagement} → ${newEngagement}`)
    changes.push(`Engagement alterado de ${oldEngagement} para ${newEngagement}`)

    // Atualizar apenas o campo averageEngagement, sem validação do modelo completo
    await User.findByIdAndUpdate(user._id, {
      $set: { averageEngagement: newEngagement }
    })

    // Alteração 3-5: No primeiro produto
    if (products.length > 0) {
      const product = products[0] as any
      const productName = product.productId?.name || 'Produto'

      // 3. Progresso
      const oldProgress = product.progress?.percentage || 0
      const newProgress = Math.min(oldProgress + 15, 100)
      console.log(`3️⃣ [TEST] Progresso em "${productName}": ${oldProgress}% → ${newProgress}%`)
      changes.push(`Progresso em ${productName} alterado de ${oldProgress}% para ${newProgress}%`)

      await UserProduct.findByIdAndUpdate(product._id, {
        $set: { 'progress.percentage': newProgress }
      })

      // 4. Lições
      const oldLessons = product.progress?.completed || 0
      const newLessons = oldLessons + 5
      console.log(`4️⃣ [TEST] Lições em "${productName}": ${oldLessons} → ${newLessons}`)
      changes.push(`Lições completadas em ${productName} alteradas de ${oldLessons} para ${newLessons}`)

      await UserProduct.findByIdAndUpdate(product._id, {
        $set: { 'progress.completed': newLessons }
      })

      // 5. Logins
      const oldLogins = product.engagement?.totalLogins || 0
      const newLogins = oldLogins + 20
      console.log(`5️⃣ [TEST] Logins em "${productName}": ${oldLogins} → ${newLogins}`)
      changes.push(`Total de logins em ${productName} alterado de ${oldLogins} para ${newLogins}`)

      await UserProduct.findByIdAndUpdate(product._id, {
        $set: { 'engagement.totalLogins': newLogins }
      })
    }

    // 6. Buscar estado atualizado
    console.log('\n📊 [TEST] Buscando estado atualizado...')
    const updatedUser = await User.findById(user._id)
    const updatedProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'name code platform')

    // 7. Criar snapshot DEPOIS e comparar
    console.log('\n📸 [TEST] Criando snapshot final e comparando...')
    const { comparison } = await snapshotAndCompare(
      updatedUser!,
      updatedProducts as any[],
      'manual'
    )

    console.log('\n✅ [TEST] Comparação concluída!')
    console.log(`   Total de alterações: ${comparison.summary.totalChanges}`)
    console.log(`   Alta prioridade: ${comparison.summary.highPriorityChanges}`)

    return res.status(200).json({
      success: true,
      message: 'Alterações de teste realizadas com sucesso',
      data: {
        userId: user._id,
        email: user.email,
        changesApplied: changes,
        comparison: {
          totalChanges: comparison.summary.totalChanges,
          highPriority: comparison.summary.highPriorityChanges,
          mediumPriority: comparison.summary.mediumPriorityChanges,
          lowPriority: comparison.summary.lowPriorityChanges,
          changes: comparison.changes.map(c => ({
            type: c.changeType,
            description: c.description,
            significance: c.significance
          }))
        },
        originalState,
        viewHistoryUrl: `/dashboard?tab=studentEditor&search=${encodeURIComponent(email)}`
      }
    })
  } catch (error: any) {
    console.error('[TEST] Erro:', error)
    return res.status(500).json({
      success: false,
      error: 'Erro ao fazer alterações de teste',
      message: error.message
    })
  }
}

/**
 * POST /api/test/history/revert-changes
 * Reverte as alterações de teste
 */
export const revertTestChanges = async (req: Request, res: Response) => {
  try {
    const { originalState } = req.body

    if (!originalState || !originalState.userId) {
      return res.status(400).json({
        success: false,
        error: 'originalState é obrigatório'
      })
    }

    console.log(`\n🔄 [TEST] Revertendo alterações para user ${originalState.userId}...`)

    // 1. Reverter user
    await User.findByIdAndUpdate(originalState.userId, {
      $set: {
        name: originalState.name,
        averageEngagement: originalState.averageEngagement
      }
    })

    console.log(`✅ [TEST] User revertido`)

    // 2. Reverter produtos
    for (const product of originalState.products) {
      await UserProduct.findByIdAndUpdate(product._id, {
        $set: {
          status: product.status,
          'progress.percentage': product.progressPercentage,
          'progress.completed': product.completedLessons,
          'engagement.totalLogins': product.totalLogins,
          'engagement.engagementScore': product.engagementScore
        }
      })

      console.log(`✅ [TEST] Produto ${product.productName} revertido`)
    }

    // 3. Criar snapshot da reversão
    const user = await User.findById(originalState.userId)
    const products = await UserProduct.find({ userId: originalState.userId })
      .populate('productId', 'name code platform')

    console.log('\n📸 [TEST] Criando snapshot pós-reversão...')
    await snapshotAndCompare(user!, products as any[], 'manual')

    console.log('✅ [TEST] Reversão concluída!')

    return res.status(200).json({
      success: true,
      message: 'Alterações revertidas com sucesso',
      data: {
        userId: originalState.userId,
        productsReverted: originalState.products.length
      }
    })
  } catch (error: any) {
    console.error('[TEST] Erro na reversão:', error)
    return res.status(500).json({
      success: false,
      error: 'Erro ao reverter alterações',
      message: error.message
    })
  }
}
