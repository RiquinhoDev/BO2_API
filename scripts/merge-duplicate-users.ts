// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/merge-duplicate-users.ts
// MERGE AUTOMÁTICO DE USERS DUPLICADOS (Case Sensitivity)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import fs from 'fs'
import path from 'path'

interface DuplicateGroup {
  normalizedEmail: string
  users: Array<{
    id: string
    email: string
    hasProducts: boolean
    productCount: number
    createdAt: Date
  }>
}

interface MergeResult {
  totalDuplicateGroups: number
  totalUsersProcessed: number
  merged: number
  deleted: number
  errors: string[]
  details: Array<{
    email: string
    kept: string
    deleted: string[]
    productsMoved: number
  }>
}

async function mergeDuplicateUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🔀 MERGE DE USERS DUPLICADOS')
    console.log('═'.repeat(80))
    console.log('\n📋 REGRAS:')
    console.log('   • User COM produtos = MANTÉM (principal)')
    console.log('   • User SEM produtos = APAGA (secundário)')
    console.log('   • Se ambos têm produtos = Mantém o mais antigo')
    console.log('   • UserProducts são movidos se necessário')
    console.log('')
    
    const result: MergeResult = {
      totalDuplicateGroups: 0,
      totalUsersProcessed: 0,
      merged: 0,
      deleted: 0,
      errors: [],
      details: []
    }
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 1: CRIAR BACKUP COMPLETO
    // ═════════════════════════════════════════════════════════════
    
    console.log('━━━ ETAPA 1/5: CRIAR BACKUP ━━━\n')
    
    const backupPath = path.join(__dirname, '..', 'backups')
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true })
    }
    
    const allUsers = await User.find({}).lean()
    const allUserProducts = await UserProduct.find({}).lean()
    
    const backupData = {
      timestamp: new Date().toISOString(),
      users: allUsers,
      userProducts: allUserProducts,
      counts: {
        users: allUsers.length,
        userProducts: allUserProducts.length
      }
    }
    
    const backupFile = path.join(backupPath, `merge-backup-${Date.now()}.json`)
    fs.writeFileSync(
      backupFile,
      JSON.stringify(backupData, null, 2),
      'utf-8'
    )
    
    console.log(`✅ Backup criado: ${backupFile}`)
    console.log(`   Users salvos: ${allUsers.length}`)
    console.log(`   UserProducts salvos: ${allUserProducts.length}\n`)
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 2: IDENTIFICAR DUPLICADOS
    // ═════════════════════════════════════════════════════════════
    
    console.log('━━━ ETAPA 2/5: IDENTIFICAR DUPLICADOS ━━━\n')
    
    // Agrupar users por email normalizado
    const duplicateGroups: DuplicateGroup[] = []
    
    const emailGroups = await User.aggregate([
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$email' } } },
          users: {
            $push: {
              id: '$_id',
              email: '$email',
              createdAt: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ])
    
    console.log(`📊 Grupos de duplicados encontrados: ${emailGroups.length}\n`)
    
    if (emailGroups.length === 0) {
      console.log('✅ Nenhum duplicado encontrado! BD já está limpa.\n')
      console.log('═'.repeat(80))
      return
    }
    
    // Para cada grupo, buscar detalhes completos
    for (const group of emailGroups) {
      const userDetails = []
      
      for (const userInfo of group.users) {
        const userProducts = await UserProduct.find({ userId: userInfo.id }).lean()
        
        userDetails.push({
          id: userInfo.id.toString(),
          email: userInfo.email,
          hasProducts: userProducts.length > 0,
          productCount: userProducts.length,
          createdAt: userInfo.createdAt
        })
      }
      
      duplicateGroups.push({
        normalizedEmail: group._id,
        users: userDetails
      })
    }
    
    result.totalDuplicateGroups = duplicateGroups.length
    result.totalUsersProcessed = duplicateGroups.reduce((sum, g) => sum + g.users.length, 0)
    
    console.log('📋 RESUMO DOS DUPLICADOS:\n')
    
    let usersWithProducts = 0
    let usersWithoutProducts = 0
    
    for (const group of duplicateGroups.slice(0, 10)) {
      console.log(`   ${group.normalizedEmail}:`)
      for (const user of group.users) {
        const status = user.hasProducts ? `✅ ${user.productCount} produtos` : '⚪ vazio'
        console.log(`      • ${user.email} → ${status}`)
        
        if (user.hasProducts) usersWithProducts++
        else usersWithoutProducts++
      }
      console.log('')
    }
    
    if (duplicateGroups.length > 10) {
      console.log(`   ... e mais ${duplicateGroups.length - 10} grupos\n`)
    }
    
    console.log(`📊 ESTATÍSTICAS:`)
    console.log(`   Users com produtos: ${usersWithProducts}`)
    console.log(`   Users vazios: ${usersWithoutProducts}`)
    console.log(`   Total a processar: ${result.totalUsersProcessed}\n`)
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 3: DECIDIR ESTRATÉGIA DE MERGE
    // ═════════════════════════════════════════════════════════════
    
    console.log('━━━ ETAPA 3/5: DECIDIR ESTRATÉGIA ━━━\n')
    
    const mergeStrategies: Array<{
      group: DuplicateGroup
      keep: string
      delete: string[]
      reason: string
    }> = []
    
    for (const group of duplicateGroups) {
      const withProducts = group.users.filter(u => u.hasProducts)
      const withoutProducts = group.users.filter(u => !u.hasProducts)
      
      let keepUserId: string
      let deleteUserIds: string[]
      let reason: string
      
      if (withProducts.length === 1 && withoutProducts.length >= 1) {
        // CASO 1: 1 com produtos, resto vazio → Mantém o que tem produtos
        keepUserId = withProducts[0].id
        deleteUserIds = withoutProducts.map(u => u.id)
        reason = 'User com produtos mantido, vazios apagados'
        
      } else if (withProducts.length > 1) {
        // CASO 2: Múltiplos com produtos → Mantém o mais antigo
        withProducts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        keepUserId = withProducts[0].id
        deleteUserIds = [...withProducts.slice(1), ...withoutProducts].map(u => u.id)
        reason = 'Mantido o mais antigo (com produtos), resto será merged'
        
      } else if (withoutProducts.length > 1) {
        // CASO 3: Todos vazios → Mantém o mais antigo
        withoutProducts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        keepUserId = withoutProducts[0].id
        deleteUserIds = withoutProducts.slice(1).map(u => u.id)
        reason = 'Todos vazios, mantido o mais antigo'
        
      } else {
        // CASO 4: Situação inesperada
        keepUserId = group.users[0].id
        deleteUserIds = group.users.slice(1).map(u => u.id)
        reason = 'Estratégia padrão (primeiro da lista)'
      }
      
      mergeStrategies.push({
        group,
        keep: keepUserId,
        delete: deleteUserIds,
        reason
      })
    }
    
    console.log('✅ Estratégias definidas para todos os grupos\n')
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 4: EXECUTAR MERGE
    // ═════════════════════════════════════════════════════════════
    
    console.log('━━━ ETAPA 4/5: EXECUTAR MERGE ━━━\n')
    console.log('⚠️  Processando... (não interromper)\n')
    
    let processedGroups = 0
    
    for (const strategy of mergeStrategies) {
      processedGroups++
      
      try {
        const keepUser = await User.findById(strategy.keep)
        if (!keepUser) {
          result.errors.push(`User principal não encontrado: ${strategy.keep}`)
          continue
        }
        
        let totalProductsMoved = 0
        
        // Processar cada user a apagar
        for (const deleteUserId of strategy.delete) {
          const deleteUser = await User.findById(deleteUserId)
          if (!deleteUser) {
            result.errors.push(`User secundário não encontrado: ${deleteUserId}`)
            continue
          }
          
          // Mover UserProducts se houver
          const userProducts = await UserProduct.find({ userId: deleteUserId })
          
          if (userProducts.length > 0) {
            console.log(`   📦 Movendo ${userProducts.length} produtos de ${deleteUser.email} → ${keepUser.email}`)
            
            for (const up of userProducts) {
              // Verificar se já existe no user principal
              const existing = await UserProduct.findOne({
                userId: keepUser._id,
                productId: up.productId
              })
              
              if (!existing) {
                up.userId = keepUser._id as any
                await up.save()
                totalProductsMoved++
              } else {
                console.log(`      ⚠️  Produto já existe, mantendo o existente`)
              }
            }
          }
          
          // Apagar user secundário
          await User.findByIdAndDelete(deleteUserId)
          result.deleted++
        }
        
        result.merged++
        
        // Normalizar email do user mantido
        keepUser.email = strategy.group.normalizedEmail
        await keepUser.save()
        
        result.details.push({
          email: strategy.group.normalizedEmail,
          kept: keepUser.email,
          deleted: strategy.delete,
          productsMoved: totalProductsMoved
        })
        
        if (processedGroups % 10 === 0) {
          console.log(`   Progresso: ${processedGroups}/${mergeStrategies.length} grupos processados`)
        }
        
      } catch (error: any) {
        result.errors.push(`Erro no merge de ${strategy.group.normalizedEmail}: ${error.message}`)
        console.error(`   ❌ Erro: ${strategy.group.normalizedEmail}`)
      }
    }
    
    console.log(`\n✅ Merge completo!`)
    console.log(`   Grupos processados: ${result.merged}`)
    console.log(`   Users apagados: ${result.deleted}`)
    
    if (result.errors.length > 0) {
      console.log(`   ⚠️  Erros: ${result.errors.length}`)
    }
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 5: VERIFICAÇÃO FINAL
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ ETAPA 5/5: VERIFICAÇÃO FINAL ━━━\n')
    
    const remainingDuplicates = await User.aggregate([
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$email' } } },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ])
    
    if (remainingDuplicates.length === 0) {
      console.log('✅ SUCESSO! Nenhum duplicado restante na BD!')
    } else {
      console.log(`⚠️  Ainda existem ${remainingDuplicates.length} emails duplicados`)
      console.log('   (Pode ser necessário executar o script novamente)')
    }
    
    const totalUsers = await User.countDocuments()
    const totalUserProducts = await UserProduct.countDocuments()
    
    console.log(`\n📊 ESTADO FINAL DA BD:`)
    console.log(`   Total Users: ${totalUsers} (antes: ${backupData.counts.users})`)
    console.log(`   Total UserProducts: ${totalUserProducts} (antes: ${backupData.counts.userProducts})`)
    console.log(`   Users removidos: ${backupData.counts.users - totalUsers}`)
    
    // Salvar relatório
    const reportPath = path.join(backupPath, `merge-report-${Date.now()}.json`)
    fs.writeFileSync(
      reportPath,
      JSON.stringify(result, null, 2),
      'utf-8'
    )
    
    console.log(`\n📄 Relatório salvo: ${reportPath}`)
    
    console.log('\n═'.repeat(80))
    console.log('✅ MERGE COMPLETO')
    console.log('═'.repeat(80))
    
    console.log('\n💡 PRÓXIMO PASSO:')
    console.log('   Execute: npx ts-node scripts/normalize-all-emails.ts')
    console.log('')
    
  } catch (error) {
    console.error('❌ Erro fatal:', error)
    throw error
  } finally {
    await mongoose.disconnect()
  }
}

mergeDuplicateUsers()