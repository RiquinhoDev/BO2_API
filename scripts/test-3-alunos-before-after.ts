// ════════════════════════════════════════════════════════════════════════════
// 🧪 TEST: Comparar estado de 3 alunos ANTES e DEPOIS do pipeline
// ════════════════════════════════════════════════════════════════════════════
//
// Este script faz snapshot do estado de 3 alunos para comparar antes/depois
// da execução do pipeline completo.
//
// ════════════════════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/user'
import { UserProduct } from '../src/models'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'
import fs from 'fs/promises'
import path from 'path'

// Selecionar 3 alunos: 1 OGI, 1 CLAREZA, 1 com múltiplos produtos
const TEST_USERS = [
  'ruifilipespteixeira@gmail.com',  // Rui - Admin, múltiplos produtos
  // Vamos buscar 2 alunos aleatórios depois
]

interface UserSnapshot {
  email: string
  name: string
  userId: string
  timestamp: string
  products: Array<{
    productCode: string
    productName: string
    status: string
    tagsInBD: string[]
    tagsInAC: string[]
    engagement: {
      daysSinceEnrollment?: number
      daysSinceLastAction?: number
      progressPercentage?: number
    }
  }>
}

async function captureSnapshot(mode: 'BEFORE' | 'AFTER') {
  console.log('════════════════════════════════════════════════════════════════')
  console.log(`🔍 CAPTURANDO SNAPSHOT: ${mode}`)
  console.log('════════════════════════════════════════════════════════════════\n')

  try {
    // 1. Conectar à BD
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('✅ Conectado à BD\n')

    // 2. Se é BEFORE, buscar 2 alunos aleatórios além do Rui
    let emails = [...TEST_USERS]

    if (mode === 'BEFORE') {
      console.log('🔍 Buscando 2 alunos aleatórios...\n')

      // 1 aluno só OGI
      const ogiUser = await User.findOne({
        email: { $exists: true, $nin: [null, '', ...emails] }
      }).limit(1)

      if (ogiUser?.email) {
        const hasOgi = await UserProduct.exists({
          userId: String(ogiUser._id)
        }).populate('productId')

        if (hasOgi) {
          emails.push(ogiUser.email)
          console.log(`   ✅ Aluno OGI: ${ogiUser.email}`)
        }
      }

      // 1 aluno só CLAREZA
      const clarezaUser = await User.findOne({
        email: { $exists: true, $nin: [null, '', ...emails] }
      }).limit(1).skip(1)

      if (clarezaUser?.email) {
        emails.push(clarezaUser.email)
        console.log(`   ✅ Aluno CLAREZA: ${clarezaUser.email}`)
      }

      console.log()
    } else {
      // AFTER: Ler emails do snapshot BEFORE
      const beforePath = path.join(__dirname, '../logs/snapshot-BEFORE.json')
      try {
        const beforeData = await fs.readFile(beforePath, 'utf-8')
        const beforeSnapshots: UserSnapshot[] = JSON.parse(beforeData)
        emails = beforeSnapshots.map(s => s.email)
        console.log(`📂 Lendo emails do snapshot BEFORE: ${emails.join(', ')}\n`)
      } catch (error) {
        console.error('❌ Erro ao ler snapshot BEFORE. Execute BEFORE primeiro.\n')
        process.exit(1)
      }
    }

    // 3. Capturar snapshot de cada aluno
    const snapshots: UserSnapshot[] = []

    for (const email of emails) {
      console.log(`\n${'─'.repeat(60)}`)
      console.log(`👤 Processando: ${email}`)
      console.log('─'.repeat(60))

      const user = await User.findOne({ email })

      if (!user) {
        console.log('   ⚠️  User não encontrado na BD\n')
        continue
      }

      console.log(`   Nome: ${user.name || 'N/A'}`)
      console.log(`   ID: ${user._id}`)

      // Buscar UserProducts
      const userProducts = await UserProduct.find({
        userId: String(user._id)
      }).populate('productId')

      console.log(`   Produtos: ${userProducts.length}`)

      const snapshot: UserSnapshot = {
        email: user.email,
        name: user.name || email,
        userId: String(user._id),
        timestamp: new Date().toISOString(),
        products: []
      }

      // Para cada produto
      for (const up of userProducts) {
        const product = up.productId as any

        console.log(`\n   📦 ${product.name} (${product.code})`)

        // Tags na BD
        const bdTags = up.activeCampaignData?.tags || []
        console.log(`      BD Tags: ${bdTags.length} - ${bdTags.join(', ') || '(nenhuma)'}`)

        // Tags no AC
        let acTags: string[] = []
        try {
          const allAcTags = await activeCampaignService.getContactTagsByEmail(user.email)

          // Filtrar apenas tags BO deste produto
          const BO_TAG_PATTERN = /^[A-Z_0-9]+ - .+$/
          const boTags = allAcTags.filter(tag => BO_TAG_PATTERN.test(tag))

          const productPrefixes = product.code.includes('CLAREZA')
            ? ['CLAREZA -', 'CLAREZA-']
            : [product.code + ' -']

          acTags = boTags.filter(tag =>
            productPrefixes.some(prefix => tag.startsWith(prefix))
          )

          console.log(`      AC Tags: ${acTags.length} - ${acTags.join(', ') || '(nenhuma)'}`)
        } catch (error: any) {
          console.log(`      AC Tags: ERRO - ${error.message}`)
        }

        // Engagement
        const engagement = up.engagement || {}
        console.log(`      Engagement:`)
        console.log(`         daysSinceEnrollment: ${(engagement as any).daysSinceEnrollment ?? 'N/A'}`)
        console.log(`         daysSinceLastAction: ${(engagement as any).daysSinceLastAction ?? 'N/A'}`)
        console.log(`         progressPercentage: ${(engagement as any).progressPercentage ?? 'N/A'}`)

        snapshot.products.push({
          productCode: product.code,
          productName: product.name,
          status: up.status,
          tagsInBD: bdTags,
          tagsInAC: acTags,
          engagement: {
            daysSinceEnrollment: (engagement as any).daysSinceEnrollment,
            daysSinceLastAction: (engagement as any).daysSinceLastAction,
            progressPercentage: (engagement as any).progressPercentage
          }
        })
      }

      snapshots.push(snapshot)
    }

    // 4. Salvar snapshot
    const filename = `snapshot-${mode}.json`
    const filepath = path.join(__dirname, '../logs', filename)

    await fs.mkdir(path.dirname(filepath), { recursive: true })
    await fs.writeFile(filepath, JSON.stringify(snapshots, null, 2), 'utf-8')

    console.log('\n' + '═'.repeat(60))
    console.log(`✅ Snapshot ${mode} guardado: ${filepath}`)
    console.log(`📊 Total de alunos: ${snapshots.length}`)
    console.log('═'.repeat(60) + '\n')

    // 5. Se é AFTER, mostrar comparação
    if (mode === 'AFTER') {
      await showComparison(snapshots)
    }

  } catch (error: any) {
    console.error('\n❌ Erro:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Conexão BD fechada\n')
  }
}

async function showComparison(afterSnapshots: UserSnapshot[]) {
  console.log('\n' + '═'.repeat(60))
  console.log('📊 COMPARAÇÃO BEFORE → AFTER')
  console.log('═'.repeat(60) + '\n')

  // Ler snapshot BEFORE
  const beforePath = path.join(__dirname, '../logs/snapshot-BEFORE.json')
  const beforeData = await fs.readFile(beforePath, 'utf-8')
  const beforeSnapshots: UserSnapshot[] = JSON.parse(beforeData)

  for (const afterSnap of afterSnapshots) {
    const beforeSnap = beforeSnapshots.find(s => s.email === afterSnap.email)

    if (!beforeSnap) {
      console.log(`⚠️  ${afterSnap.email}: Não encontrado no snapshot BEFORE\n`)
      continue
    }

    console.log(`\n👤 ${afterSnap.name} (${afterSnap.email})`)
    console.log('─'.repeat(60))

    for (const afterProd of afterSnap.products) {
      const beforeProd = beforeSnap.products.find(p => p.productCode === afterProd.productCode)

      console.log(`\n📦 ${afterProd.productName} (${afterProd.productCode})`)

      if (!beforeProd) {
        console.log('   ⚠️  Produto não existia no BEFORE')
        continue
      }

      // Comparar tags BD
      const bdAdded = afterProd.tagsInBD.filter(t => !beforeProd.tagsInBD.includes(t))
      const bdRemoved = beforeProd.tagsInBD.filter(t => !afterProd.tagsInBD.includes(t))

      console.log('\n   📊 Tags BD:')
      if (bdAdded.length === 0 && bdRemoved.length === 0) {
        console.log('      ⏸️  Sem alterações')
      } else {
        if (bdAdded.length > 0) {
          console.log(`      ✅ Adicionadas: ${bdAdded.join(', ')}`)
        }
        if (bdRemoved.length > 0) {
          console.log(`      ❌ Removidas: ${bdRemoved.join(', ')}`)
        }
      }

      // Comparar tags AC
      const acAdded = afterProd.tagsInAC.filter(t => !beforeProd.tagsInAC.includes(t))
      const acRemoved = beforeProd.tagsInAC.filter(t => !afterProd.tagsInAC.includes(t))

      console.log('\n   📊 Tags AC:')
      if (acAdded.length === 0 && acRemoved.length === 0) {
        console.log('      ⏸️  Sem alterações')
      } else {
        if (acAdded.length > 0) {
          console.log(`      ✅ Adicionadas: ${acAdded.join(', ')}`)
        }
        if (acRemoved.length > 0) {
          console.log(`      ❌ Removidas: ${acRemoved.join(', ')}`)
        }
      }

      // Comparar engagement
      const engChanged =
        beforeProd.engagement.daysSinceEnrollment !== afterProd.engagement.daysSinceEnrollment ||
        beforeProd.engagement.daysSinceLastAction !== afterProd.engagement.daysSinceLastAction ||
        beforeProd.engagement.progressPercentage !== afterProd.engagement.progressPercentage

      console.log('\n   📊 Engagement:')
      if (!engChanged) {
        console.log('      ⏸️  Sem alterações')
      } else {
        if (beforeProd.engagement.daysSinceEnrollment !== afterProd.engagement.daysSinceEnrollment) {
          console.log(`      daysSinceEnrollment: ${beforeProd.engagement.daysSinceEnrollment} → ${afterProd.engagement.daysSinceEnrollment}`)
        }
        if (beforeProd.engagement.daysSinceLastAction !== afterProd.engagement.daysSinceLastAction) {
          console.log(`      daysSinceLastAction: ${beforeProd.engagement.daysSinceLastAction} → ${afterProd.engagement.daysSinceLastAction}`)
        }
        if (beforeProd.engagement.progressPercentage !== afterProd.engagement.progressPercentage) {
          console.log(`      progressPercentage: ${beforeProd.engagement.progressPercentage} → ${afterProd.engagement.progressPercentage}`)
        }
      }
    }
  }

  console.log('\n' + '═'.repeat(60) + '\n')
}

// ════════════════════════════════════════════════════════════════════════════
// EXECUTAR
// ════════════════════════════════════════════════════════════════════════════

const mode = (process.argv[2]?.toUpperCase() as 'BEFORE' | 'AFTER') || 'BEFORE'

if (!['BEFORE', 'AFTER'].includes(mode)) {
  console.error('❌ Uso: npm run test:3alunos BEFORE|AFTER')
  process.exit(1)
}

captureSnapshot(mode)
  .then(() => {
    console.log('✅ Script finalizado\n')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error)
    process.exit(1)
  })
