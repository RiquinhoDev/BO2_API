// Script para analisar e corrigir inconsistências de status
import mongoose from 'mongoose'
import User from '../models/User'
import dotenv from 'dotenv'

dotenv.config()

async function analyzeAndFixStatusInconsistencies() {
  try {
    console.log('🔍 Conectando à base de dados...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 ANÁLISE DE INCONSISTÊNCIAS DE STATUS')
    console.log('═══════════════════════════════════════════════════════════\n')

    // 1. Buscar todos os usuários
    console.log('⏳ Buscando todos os usuários...')
    const allUsers = await User.find({}).lean().maxTimeMS(30000)
    console.log(`Total de usuários: ${allUsers.length}\n`)

    // 2. Analisar inconsistências
    const inconsistencies: any[] = []
    const statusBreakdown: any = {
      bothActive: 0,
      bothInactive: 0,
      statusActiveButCombinedInactive: 0,
      statusInactiveButCombinedActive: 0,
      missingStatus: 0,
      missingCombined: 0
    }

    allUsers.forEach((user: any) => {
      const status = user.status
      const combinedStatus = user.combined?.status

      if (!status && !combinedStatus) {
        statusBreakdown.missingStatus++
      } else if (!status) {
        statusBreakdown.missingStatus++
      } else if (!combinedStatus) {
        statusBreakdown.missingCombined++
      } else if (status === 'ACTIVE' && combinedStatus === 'ACTIVE') {
        statusBreakdown.bothActive++
      } else if (status === 'INACTIVE' && combinedStatus === 'INACTIVE') {
        statusBreakdown.bothInactive++
      } else if (status === 'ACTIVE' && combinedStatus === 'INACTIVE') {
        statusBreakdown.statusActiveButCombinedInactive++
        inconsistencies.push({
          email: user.email,
          name: user.name,
          status: status,
          combinedStatus: combinedStatus,
          inactivation: user.inactivation
        })
      } else if (status === 'INACTIVE' && combinedStatus === 'ACTIVE') {
        statusBreakdown.statusInactiveButCombinedActive++
        inconsistencies.push({
          email: user.email,
          name: user.name,
          status: status,
          combinedStatus: combinedStatus,
          inactivation: user.inactivation
        })
      }
    })

    console.log('📊 RESUMO DE STATUS:')
    console.log(`   ✅ Ambos ACTIVE: ${statusBreakdown.bothActive}`)
    console.log(`   ❌ Ambos INACTIVE: ${statusBreakdown.bothInactive}`)
    console.log(`   ⚠️  status ACTIVE mas combined INACTIVE: ${statusBreakdown.statusActiveButCombinedInactive}`)
    console.log(`   ⚠️  status INACTIVE mas combined ACTIVE: ${statusBreakdown.statusInactiveButCombinedActive}`)
    console.log(`   ⚠️  Sem status: ${statusBreakdown.missingStatus}`)
    console.log(`   ⚠️  Sem combined.status: ${statusBreakdown.missingCombined}`)
    console.log('')

    if (inconsistencies.length === 0) {
      console.log('✅ Nenhuma inconsistência encontrada!')
      await mongoose.disconnect()
      return
    }

    console.log(`❌ ENCONTRADAS ${inconsistencies.length} INCONSISTÊNCIAS:\n`)
    inconsistencies.slice(0, 10).forEach((inc, idx) => {
      console.log(`${idx + 1}. ${inc.email}`)
      console.log(`   Nome: ${inc.name}`)
      console.log(`   status: ${inc.status}`)
      console.log(`   combined.status: ${inc.combinedStatus}`)
      console.log(`   Inativado manualmente: ${inc.inactivation?.isManuallyInactivated ? 'SIM' : 'NÃO'}`)
      console.log('')
    })

    if (inconsistencies.length > 10) {
      console.log(`   ... e mais ${inconsistencies.length - 10}\n`)
    }

    // 3. Definir regra de correção
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔧 REGRA DE CORREÇÃO')
    console.log('═══════════════════════════════════════════════════════════\n')
    console.log('A fonte de verdade deve ser:')
    console.log('1. Se inactivation.isManuallyInactivated === true → INACTIVE')
    console.log('2. Senão, usar status das plataformas (Hotmart, CursEduca)')
    console.log('3. Prioridade: Discord > Hotmart > CursEduca')
    console.log('')

    // 4. Aplicar correções
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔧 APLICANDO CORREÇÕES')
    console.log('═══════════════════════════════════════════════════════════\n')

    let corrected = 0
    for (const inc of inconsistencies) {
      const user = await User.findOne({ email: inc.email })
      if (!user) continue

      let correctStatus = 'ACTIVE'

      // Regra 1: Inativação manual
      if ((user as any).inactivation?.isManuallyInactivated) {
        correctStatus = 'INACTIVE'
        console.log(`✅ ${inc.email}: INACTIVE (inativação manual)`)
      }
      // Regra 2: Discord tem prioridade
      else if ((user as any).discord?.isActive === false) {
        correctStatus = 'INACTIVE'
        console.log(`✅ ${inc.email}: INACTIVE (Discord inativo)`)
      }
      else if ((user as any).discord?.isActive === true) {
        correctStatus = 'ACTIVE'
        console.log(`✅ ${inc.email}: ACTIVE (Discord ativo)`)
      }
      // Regra 3: Hotmart
      else if ((user as any).hotmart?.status) {
        correctStatus = (user as any).hotmart.status
        console.log(`✅ ${inc.email}: ${correctStatus} (Hotmart)`)
      }
      // Regra 4: CursEduca
      else if ((user as any).curseduca?.memberStatus) {
        correctStatus = (user as any).curseduca.memberStatus
        console.log(`✅ ${inc.email}: ${correctStatus} (CursEduca)`)
      }
      else {
        console.log(`⚠️  ${inc.email}: Mantendo ACTIVE (sem dados)`)
      }

      // Aplicar correção
      await User.findByIdAndUpdate((user as any)._id, {
        $set: {
          status: correctStatus,
          'combined.status': correctStatus
        }
      })

      corrected++
    }

    console.log(`\n✅ ${corrected} usuários corrigidos!`)

    await mongoose.disconnect()
    console.log('\n✅ Correção completa!')
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

analyzeAndFixStatusInconsistencies()
