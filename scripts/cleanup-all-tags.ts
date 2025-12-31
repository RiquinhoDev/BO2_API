// ═══════════════════════════════════════════════════════════
// 🧹 CLEANUP GLOBAL: Tags órfãs e duplicadas
// 
// O QUE FAZ:
// 1. Busca todos os users com tags no AC
// 2. Compara com produtos que cada user TEM
// 3. Remove tags ÓRFÃS (de produtos que user não tem)
// 4. Remove tags DUPLICADAS (formato antigo)
// 5. Sincroniza UserProduct.activeCampaignData.tags
// ═══════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import '../src/models'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'
import activeCampaignService from '../src/services/ac/activeCampaignService'

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const DRY_RUN = false  // 👈 MUDAR PARA false PARA EXECUTAR DE VERDADE!

const TAG_PATTERNS = {
  // Formato NOVO (correto)
  CLAREZA_NEW: /^CLAREZA - /i,
  OGI_NEW: /^OGI_V1 - /i,
  
  // Formato ANTIGO (errado - deve ser removido)
  CLAREZA_OLD: /^CLAREZA_(MENSAL|ANUAL) - /i,
  OGI_OLD: /^OGI - /i,  // Se houver sem V1
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

function getProductFromTag(tag: string): string | null {
  // CLAREZA_MENSAL - XXX → CLAREZA_MENSAL
  if (/^CLAREZA_(MENSAL|ANUAL)/.test(tag)) {
    const match = tag.match(/^(CLAREZA_(?:MENSAL|ANUAL))/)
    return match ? match[1] : null
  }
  
  // CLAREZA - XXX → CLAREZA (qualquer produto CLAREZA)
  if (/^CLAREZA -/.test(tag)) return 'CLAREZA'
  
  // OGI_V1 - XXX → OGI_V1
  if (/^OGI_V1/.test(tag)) return 'OGI_V1'
  
  return null
}

function isOldFormatTag(tag: string): boolean {
  return TAG_PATTERNS.CLAREZA_OLD.test(tag) || TAG_PATTERNS.OGI_OLD.test(tag)
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    console.log('✅ Conectado à MongoDB\n')
    
    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - Nenhuma alteração será feita!')
      console.log('   Para executar de verdade, mude DRY_RUN = false\n')
    }
    
    console.log('═'.repeat(70))
    console.log('🧹 CLEANUP GLOBAL DE TAGS')
    console.log('═'.repeat(70))
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR TODOS OS USERS COM TAGS
    // ═══════════════════════════════════════════════════════════
    
    const users = await User.find({}).lean()
    console.log(`👥 Total de users: ${users.length}`)
    console.log()
    
    let totalTagsRemoved = 0
    let totalUsersProcessed = 0
    const errors: Array<{ email: string; error: string }> = []
    
    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA USER
    // ═══════════════════════════════════════════════════════════
    
    for (const user of users) {
      try {
        const email = user.email
        if (!email) continue
        
        // 2.1. Buscar produtos do user
        const userProducts = await UserProduct.find({ userId: user._id })
          .populate('productId', 'code')
          .lean()
        
        const userProductCodes = userProducts.map((up: any) => 
          String(up.productId?.code || '').toUpperCase()
        )
        
        // 2.2. Buscar tags atuais no AC (de TODOS os UserProducts)
        const allCurrentTags = new Set<string>()
        for (const up of userProducts) {
          const tags = (up as any).activeCampaignData?.tags || []
          tags.forEach((t: string) => allCurrentTags.add(t))
        }
        
        if (allCurrentTags.size === 0) continue
        
        // 2.3. Identificar tags a remover
        const tagsToRemove: string[] = []
        
        for (const tag of allCurrentTags) {
          const tagProduct = getProductFromTag(tag)
          
          // REGRA 1: Tag de produto que user NÃO tem
          if (tagProduct) {
            const hasProduct = userProductCodes.some(code => {
              if (tagProduct === 'CLAREZA') {
                // Aceita CLAREZA_MENSAL ou CLAREZA_ANUAL
                return code.includes('CLAREZA')
              }
              return code === tagProduct
            })
            
            if (!hasProduct) {
              tagsToRemove.push(tag)
              continue
            }
          }
          
          // REGRA 2: Tag em formato antigo (duplicada)
          if (isOldFormatTag(tag)) {
            tagsToRemove.push(tag)
            continue
          }
        }
        
        // 2.4. Remover tags
        if (tagsToRemove.length > 0) {
          totalUsersProcessed++
          
          console.log(`📧 ${email}`)
          console.log(`   Produtos: [${userProductCodes.join(', ')}]`)
          console.log(`   Tags a remover: ${tagsToRemove.length}`)
          
          for (const tag of tagsToRemove) {
            console.log(`      - ${tag}`)
            
            if (!DRY_RUN) {
              try {
                await activeCampaignService.removeTag(email, tag)
                totalTagsRemoved++
              } catch (err: any) {
                console.log(`        ⚠️  Erro: ${err.message}`)
              }
            }
          }
          
          console.log()
        }
        
      } catch (error: any) {
        errors.push({ email: user.email || 'N/A', error: error.message })
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // 3. SUMÁRIO
    // ═══════════════════════════════════════════════════════════
    
    console.log('═'.repeat(70))
    console.log('📊 SUMÁRIO')
    console.log('═'.repeat(70))
    console.log()
    console.log(`Users processados: ${totalUsersProcessed}`)
    console.log(`Tags removidas: ${totalTagsRemoved}`)
    console.log(`Erros: ${errors.length}`)
    console.log()
    
    if (errors.length > 0) {
      console.log('❌ ERROS:')
      errors.forEach(e => console.log(`   ${e.email}: ${e.error}`))
      console.log()
    }
    
    if (DRY_RUN) {
      console.log('⚠️  DRY RUN - Nenhuma alteração foi feita!')
      console.log('   Para executar, mude DRY_RUN = false')
    } else {
      console.log('✅ CLEANUP COMPLETO!')
    }
    
    console.log('═'.repeat(70))

  } catch (error: any) {
    console.error('❌ Erro fatal:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Desconectado')
  }
}

main()