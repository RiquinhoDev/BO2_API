// Script para limpar turmas CursEduca duplicadas
// Mantém apenas as turmas corretas (por groupId) e remove duplicados (por curseducaUuid de aluno)

import mongoose from 'mongoose'
import { Class } from '../models/Class'
import dotenv from 'dotenv'

dotenv.config()

async function cleanDuplicateClasses() {
  try {
    console.log('🔍 Conectando à base de dados...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')

    // 1. Buscar todas as turmas CursEduca
    console.log('📊 Buscando turmas CursEduca...')
    const curseducaClasses = await Class.find({ source: 'curseduca_sync' }).lean()
    console.log(`   Total: ${curseducaClasses.length} turmas\n`)

    // 2. Agrupar por nome
    const byName = new Map<string, any[]>()
    curseducaClasses.forEach((cls: any) => {
      if (!byName.has(cls.name)) {
        byName.set(cls.name, [])
      }
      byName.get(cls.name)!.push(cls)
    })

    console.log('📋 Turmas agrupadas por nome:')
    byName.forEach((classes, name) => {
      if (classes.length > 1) {
        console.log(`   - "${name}": ${classes.length} turmas`)
      }
    })
    console.log('')

    // 3. Identificar turmas a manter vs remover
    const toKeep: string[] = []
    const toRemove: string[] = []

    console.log('🔍 Identificando turmas a manter...\n')

    byName.forEach((classes, name) => {
      if (classes.length === 1) {
        // Apenas 1 turma com este nome - manter
        toKeep.push(classes[0]._id.toString())
      } else {
        // Múltiplas turmas com mesmo nome
        console.log(`📦 Processando "${name}" (${classes.length} turmas)`)

        // Estratégia: Manter a turma mais antiga (primeira criada)
        // ou a que tem mais alunos
        const sorted = classes.sort((a, b) => {
          // Prioridade 1: Maior contagem de estudantes
          if ((b.studentCount || 0) !== (a.studentCount || 0)) {
            return (b.studentCount || 0) - (a.studentCount || 0)
          }
          // Prioridade 2: Mais antiga
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })

        const keepClass = sorted[0]
        const removeClasses = sorted.slice(1)

        toKeep.push(keepClass._id.toString())
        removeClasses.forEach(cls => toRemove.push(cls._id.toString()))

        console.log(`   ✅ Manter: ${keepClass.classId} (${keepClass.studentCount || 0} alunos)`)
        console.log(`   ❌ Remover: ${removeClasses.length} duplicados`)
        console.log('')
      }
    })

    // 4. Estatísticas
    console.log('📊 RESUMO:')
    console.log(`   ✅ Turmas a manter: ${toKeep.length}`)
    console.log(`   ❌ Turmas a remover: ${toRemove.length}`)
    console.log('')

    // 5. Confirmação antes de remover
    if (toRemove.length === 0) {
      console.log('✅ Nenhuma turma para remover!')
      await mongoose.disconnect()
      return
    }

    console.log('⚠️  ATENÇÃO: Vamos remover ${toRemove.length} turmas duplicadas!')
    console.log('   Pressione Ctrl+C nos próximos 5 segundos para cancelar...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    // 6. Remover turmas duplicadas
    console.log('\n🗑️  Removendo turmas duplicadas...')
    const result = await Class.deleteMany({
      _id: { $in: toRemove.map(id => new mongoose.Types.ObjectId(id)) }
    })

    console.log(`✅ Removidas ${result.deletedCount} turmas!\n`)

    // 7. Verificação final
    const finalCount = await Class.countDocuments({ source: 'curseduca_sync' })
    console.log(`📊 Turmas CursEduca restantes: ${finalCount}`)

    await mongoose.disconnect()
    console.log('\n✅ Limpeza completa!')
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

cleanDuplicateClasses()
