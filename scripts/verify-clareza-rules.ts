// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SCRIPT: Verificar regras CLAREZA na BD
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import TagRule from '../src/models/acTags/TagRule'

async function main() {
  try {
    await mongoose.connect( 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    console.log('✅ Conectado à MongoDB\n')

    console.log('🔍 Buscando regras CLAREZA...\n')

    const rules = await TagRule.find({
      name: { $regex: /^CLAREZA/ }
    }).sort({ priority: -1 })

    console.log(`Encontradas ${rules.length} regras:\n`)

    for (const rule of rules) {
      console.log(`📋 ${rule.name}`)
      console.log(`   ID: ${rule._id}`)
      console.log(`   Priority: ${rule.priority}`)
      console.log(`   IsActive: ${rule.isActive}`)
      console.log(`   condition (string): "${rule.condition || ''}"`)
      console.log(`   conditions (array): ${JSON.stringify(rule.conditions)}`)
      console.log()
    }

    console.log('✅ Verificação completa!\n')

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Desconectado')
  }
}

main()