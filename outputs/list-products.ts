// ════════════════════════════════════════════════════════════════════════════
// 🔍 LISTAR PRODUTOS EXISTENTES
// ════════════════════════════════════════════════════════════════════════════
// Verifica que produtos existem na BD e como estão configurados

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

async function listProducts() {
  try {
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🔍 LISTAR PRODUTOS EXISTENTES')
    console.log('════════════════════════════════════════════════════════════\n')

    // Conectar
    console.log('📡 Conectando à MongoDB...')
    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true")
    console.log('✅ Conectado\n')

    // Importar models
    const Product = (await import('../src/models/Product')).default
    const Course = (await import('../src/models/Course')).default

    // Buscar todos os produtos
    console.log('🔍 Buscando produtos...\n')
    
    const products = await Product.find({})
      .populate('courseId', 'name code trackingType')
      .lean()

    if (products.length === 0) {
      console.log('⚠️  NENHUM PRODUTO ENCONTRADO NA BD!\n')
      console.log('📝 Estrutura esperada:')
      console.log('   {')
      console.log('     code: "CLAREZA" ou "OGI"')
      console.log('     name: "Clareza" ou "O Grande Investimento"')
      console.log('     platform: "curseduca" ou "hotmart"')
      console.log('     isActive: true')
      console.log('     courseId: ObjectId referência ao Course')
      console.log('   }\n')
      
      // Mostrar cursos disponíveis
      const courses = await Course.find({}).lean()
      console.log(`📚 Cursos disponíveis (${courses.length}):`)
      courses.forEach((c: any) => {
        console.log(`   - ${c.code}: ${c.name} (${c.trackingType})`)
      })
      
    } else {
      console.log(`✅ ${products.length} PRODUTOS ENCONTRADOS:\n`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

      products.forEach((p: any, index: number) => {
        console.log(`${index + 1}. ${p.name}`)
        console.log(`   ID: ${p._id}`)
        console.log(`   Code: ${p.code}`)
        console.log(`   Platform: ${p.platform}`)
        console.log(`   Status: ${p.isActive ? '✅ ATIVO' : '❌ INATIVO'}`)
        
        if (p.courseId) {
          console.log(`   Course: ${p.courseId.name} (${p.courseId.code})`)
          console.log(`   Tracking: ${p.courseId.trackingType}`)
        } else {
          console.log(`   Course: ⚠️  SEM COURSE ASSOCIADO`)
        }
        
        // IDs de plataforma
        if (p.hotmartProductId) {
          console.log(`   Hotmart ID: ${p.hotmartProductId}`)
        }
        if (p.curseducaGroupId) {
          console.log(`   CursEduca Group ID: ${p.curseducaGroupId}`)
        }
        if (p.curseducaGroupUuid) {
          console.log(`   CursEduca UUID: ${p.curseducaGroupUuid}`)
        }
        
        // Active Campaign Config
        if (p.activeCampaignConfig) {
          console.log(`   AC Tag Prefix: ${p.activeCampaignConfig.tagPrefix || 'N/A'}`)
          console.log(`   AC List ID: ${p.activeCampaignConfig.listId || 'N/A'}`)
        }
        
        console.log()
      })

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      
      // Verificar quais códigos existem
      const codes = products.map((p: any) => p.code)
      console.log('📋 Códigos existentes:')
      codes.forEach((code: string) => console.log(`   - ${code}`))
      console.log()
      
      // Verificar se CLAREZA e OGI existem
      const hasClareza = codes.some((c: string) => c.toUpperCase().includes('CLAREZA'))
      const hasOGI = codes.some((c: string) => c.toUpperCase().includes('OGI'))
      
      console.log('🎯 Status dos produtos principais:')
      console.log(`   Clareza: ${hasClareza ? '✅ EXISTE' : '❌ NÃO ENCONTRADO'}`)
      console.log(`   OGI: ${hasOGI ? '✅ EXISTE' : '❌ NÃO ENCONTRADO'}`)
      console.log()
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('💡 PRÓXIMO PASSO:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    if (products.length === 0) {
      console.log('1. Criar produtos na BD primeiro')
      console.log('2. Depois executar seed de regras')
    } else {
      const hasClareza = products.some((p: any) => p.code.toUpperCase().includes('CLAREZA'))
      const hasOGI = products.some((p: any) => p.code.toUpperCase().includes('OGI'))
      
      if (!hasClareza || !hasOGI) {
        console.log('⚠️  Produtos principais não encontrados!')
        console.log('   Opções:')
        console.log('   A) Criar produtos com codes: "CLAREZA" e "OGI"')
        console.log('   B) Atualizar seed para usar codes existentes')
      } else {
        console.log('✅ Produtos prontos!')
        console.log('   Pode executar: npx ts-node scripts/seed-default-tag-rules.ts')
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('📡 Desconectado da MongoDB\n')
  }
}

listProducts()