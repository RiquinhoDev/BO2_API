// ═══════════════════════════════════════════════════════════════════════════
// 🔧 SCRIPT: Atualizar campo `condition` nas regras CLAREZA
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import TagRule from '../src/models/acTags/TagRule'

async function main() {
  try {
    await mongoose.connect( 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
)
    console.log('✅ Conectado à MongoDB\n')

    const updates = [
      {
        name: 'CLAREZA - Novo Aluno',
        condition: '(daysSinceEnrollment < 7 AND daysSinceLastAction < 7)'
      },
      {
        name: 'CLAREZA - Super Utilizador',
        condition: '(daysSinceLastAction < 3 AND daysSinceEnrollment >= 7)'
      },
      {
        name: 'CLAREZA - Ativo',
        condition: '(daysSinceLastAction < 7 AND daysSinceEnrollment >= 7)'
      },
      {
        name: 'CLAREZA - Inativo 7-14d',
        condition: '(daysSinceLastAction >= 7 AND daysSinceLastAction < 14)'
      },
      {
        name: 'CLAREZA - Inativo 14-30d',
        condition: '(daysSinceLastAction >= 14 AND daysSinceLastAction < 30)'
      },
      {
        name: 'CLAREZA - Inativo 30d+',
        condition: 'daysSinceLastAction >= 30'
      }
    ]

    console.log('🔧 Atualizando campo `condition` nas regras CLAREZA...\n')

    for (const update of updates) {
      const result = await TagRule.updateOne(
        { name: update.name },
        { $set: { condition: update.condition } }
      )

      if (result.matchedCount > 0) {
        console.log(`✅ ${update.name}`)
        console.log(`   Condição: ${update.condition}`)
      } else {
        console.log(`❌ ${update.name} - NÃO ENCONTRADA!`)
      }
      console.log()
    }

    console.log('✅ Atualização completa!\n')

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Desconectado')
  }
}

main()