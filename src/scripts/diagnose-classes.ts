// Script de diagnóstico para investigar problema de turmas duplicadas
import mongoose from 'mongoose'
import { Class } from '../models/Class'
import dotenv from 'dotenv'

dotenv.config()

async function diagnoseClasses() {
  try {
    console.log('🔍 Conectando à base de dados...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')

    // 1. Contar total de turmas
    const totalClasses = await Class.countDocuments({})
    console.log(`📊 TOTAL DE TURMAS NA BD: ${totalClasses}\n`)

    // 2. Agrupar por classId (detectar duplicados)
    console.log('🔍 Verificando duplicados por classId...')
    const duplicatesByClassId = await Class.aggregate([
      {
        $group: {
          _id: '$classId',
          count: { $sum: 1 },
          names: { $addToSet: '$name' },
          sources: { $addToSet: '$source' },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { count: -1 }
      }
    ])

    if (duplicatesByClassId.length > 0) {
      console.log(`❌ Encontrados ${duplicatesByClassId.length} classIds duplicados:`)
      duplicatesByClassId.forEach((dup: any) => {
        console.log(`   - classId: "${dup._id}" (${dup.count}x)`)
        console.log(`     Nomes: ${dup.names.join(', ')}`)
        console.log(`     Sources: ${dup.sources.join(', ')}`)
      })
      console.log('')
    } else {
      console.log('✅ Nenhum classId duplicado encontrado\n')
    }

    // 3. Agrupar por nome (detectar turmas com mesmo nome)
    console.log('🔍 Verificando turmas com mesmo nome...')
    const duplicatesByName = await Class.aggregate([
      {
        $group: {
          _id: '$name',
          count: { $sum: 1 },
          classIds: { $addToSet: '$classId' },
          sources: { $addToSet: '$source' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { count: -1 }
      }
    ])

    if (duplicatesByName.length > 0) {
      console.log(`❌ Encontrados ${duplicatesByName.length} nomes duplicados:`)
      duplicatesByName.slice(0, 10).forEach((dup: any) => {
        console.log(`   - Nome: "${dup._id}" (${dup.count}x)`)
        console.log(`     ClassIds: ${dup.classIds.slice(0, 5).join(', ')}${dup.classIds.length > 5 ? '...' : ''}`)
        console.log(`     Sources: ${dup.sources.join(', ')}`)
      })
      console.log(`   ... e mais ${Math.max(0, duplicatesByName.length - 10)}\n`)
    } else {
      console.log('✅ Nenhum nome duplicado encontrado\n')
    }

    // 4. Contar por source
    console.log('📊 Distribuição por source:')
    const bySource = await Class.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ])

    bySource.forEach((src: any) => {
      console.log(`   - ${src._id || '(vazio)'}: ${src.count} turmas`)
    })
    console.log('')

    // 5. Contar por isActive
    console.log('📊 Distribuição por status:')
    const activeCount = await Class.countDocuments({ isActive: true })
    const inactiveCount = await Class.countDocuments({ isActive: false })
    const nullCount = await Class.countDocuments({ isActive: null })
    console.log(`   - Ativas: ${activeCount}`)
    console.log(`   - Inativas: ${inactiveCount}`)
    console.log(`   - Null/Undefined: ${nullCount}`)
    console.log('')

    // 6. Verificar turmas "Clareza"
    console.log('🔍 Verificando turmas "Clareza":')
    const clarezaClasses = await Class.find({
      name: { $regex: /clareza/i }
    }).select('classId name source isActive').lean()

    console.log(`   Total de turmas Clareza: ${clarezaClasses.length}`)
    if (clarezaClasses.length > 0) {
      console.log('   Primeiras 10:')
      clarezaClasses.slice(0, 10).forEach((cls: any) => {
        console.log(`   - ${cls.name} (${cls.classId}) [${cls.source}] ${cls.isActive ? '✅' : '❌'}`)
      })
    }
    console.log('')

    // 7. Mostrar sample de 10 turmas
    console.log('📋 Sample de 10 turmas:')
    const sample = await Class.find({}).limit(10).select('classId name source isActive').lean()
    sample.forEach((cls: any) => {
      console.log(`   - ${cls.name} (${cls.classId}) [${cls.source}] ${cls.isActive ? '✅' : '❌'}`)
    })
    console.log('')

    // 8. RECOMENDAÇÕES
    console.log('💡 RECOMENDAÇÕES:')
    if (duplicatesByClassId.length > 0) {
      console.log('   ⚠️ CRÍTICO: Existem classIds duplicados!')
      console.log('   → Executar script de limpeza para remover duplicados')
      console.log('   → Manter apenas a turma mais recente por classId')
    }
    if (duplicatesByName.length > 0) {
      console.log('   ⚠️ AVISO: Existem nomes duplicados')
      console.log('   → Verificar se são turmas diferentes com mesmo nome')
      console.log('   → Ou se são duplicados que devem ser removidos')
    }
    if (totalClasses > 100) {
      console.log('   ⚠️ Muitas turmas na BD (${totalClasses})')
      console.log('   → Esperado: 84-86 turmas')
      console.log('   → Verificar se há turmas antigas/obsoletas')
    }

    await mongoose.disconnect()
    console.log('\n✅ Diagnóstico completo!')
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

diagnoseClasses()
