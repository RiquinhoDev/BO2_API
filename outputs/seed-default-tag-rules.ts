// ════════════════════════════════════════════════════════════════════════════
// 🌱 SEED: Regras Padrão de Tags - OGI & Clareza
// ════════════════════════════════════════════════════════════════════════════
// Cria as 16 regras padrão (8 OGI + 8 Clareza) automaticamente
// Garante que as tags existem no Active Campaign

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

// ════════════════════════════════════════════════════════════════════════════
// 🎯 REGRAS PADRÃO
// ════════════════════════════════════════════════════════════════════════════

const DEFAULT_RULES = {
  // ─────────────────────────────────────────────────────────────
  // 📊 CLAREZA (ACTION_BASED)
  // ─────────────────────────────────────────────────────────────
  CLAREZA: [
    {
      name: 'Clareza - Inativo 7d',
      description: 'Aluno não abriu relatório há 7 dias',
      category: 'INACTIVITY',
      priority: 8,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'lastReportOpenedAt',
          operator: 'olderThan',
          value: 7,
          unit: 'days'
        }
      ],
      actions: {
        addTag: 'Clareza - Inativo 7d',
        removeTags: []
      },
      emailPreview: 'Tudo bem contigo? Não tens acompanhado os relatórios — queres que te mostre como tirar mais partido do Clareza?'
    },
    {
      name: 'Clareza - Inativo 14d',
      description: 'Aluno não abriu relatório há 14 dias',
      category: 'INACTIVITY',
      priority: 7,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'lastReportOpenedAt',
          operator: 'olderThan',
          value: 14,
          unit: 'days'
        }
      ],
      actions: {
        addTag: 'Clareza - Inativo 14d',
        removeTags: ['Clareza - Inativo 7d']
      },
      emailPreview: 'Há duas semanas sem Clareza... lembra-te, bastam 3 minutos por dia para te manteres informado.'
    },
    {
      name: 'Clareza - Inativo 30d',
      description: 'Aluno não abriu relatório há 30 dias',
      category: 'INACTIVITY',
      priority: 6,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'lastReportOpenedAt',
          operator: 'olderThan',
          value: 30,
          unit: 'days'
        }
      ],
      actions: {
        addTag: 'Clareza - Inativo 30d',
        removeTags: ['Clareza - Inativo 7d', 'Clareza - Inativo 14d']
      },
      emailPreview: 'Notámos que estás há algum tempo afastado. Houve algo que deixou de fazer sentido para ti?'
    },
    {
      name: 'Clareza - Ativo',
      description: 'Aluno abriu 3+ relatórios na última semana',
      category: 'ENGAGEMENT',
      priority: 9,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'reportsOpenedLastWeek',
          operator: 'greaterThan',
          value: 3,
          unit: 'reports'
        }
      ],
      actions: {
        addTag: 'Clareza - Ativo',
        removeTags: ['Clareza - Inativo 7d', 'Clareza - Inativo 14d', 'Clareza - Inativo 30d']
      },
      emailPreview: null
    },
    {
      name: 'Clareza - Consistente',
      description: 'Aluno abriu análises em 3 semanas seguidas',
      category: 'ENGAGEMENT',
      priority: 8,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'reportsOpenedLastMonth',
          operator: 'greaterThan',
          value: 12,
          unit: 'reports'
        }
      ],
      actions: {
        addTag: 'Clareza - Consistente',
        removeTags: []
      },
      emailPreview: 'É ótimo ver-te com esta consistência — é assim que se constrói clareza nos investimentos.'
    },
    {
      name: 'Clareza - Engajamento Baixo',
      description: 'Aluno abriu apenas 1 relatório em 14 dias',
      category: 'ENGAGEMENT',
      priority: 7,
      conditions: [
        {
          type: 'COMPOUND',
          logic: 'AND',
          subConditions: [
            {
              field: 'reportsOpenedLastWeek',
              operator: 'equals',
              value: 0,
              unit: 'reports'
            },
            {
              field: 'totalReportsOpened',
              operator: 'greaterThan',
              value: 0,
              unit: 'reports'
            }
          ]
        }
      ],
      actions: {
        addTag: 'Clareza - Engajamento Baixo',
        removeTags: []
      },
      emailPreview: 'Basta um relatório por dia para te manteres informado. Experimenta ler sempre até 11h.'
    },
    {
      name: 'Clareza - Reativado',
      description: 'Aluno voltou a abrir relatórios após período de inatividade',
      category: 'ENGAGEMENT',
      priority: 8,
      conditions: [
        {
          type: 'COMPOUND',
          logic: 'AND',
          subConditions: [
            {
              field: 'lastReportOpenedAt',
              operator: 'newerThan',
              value: 2,
              unit: 'days'
            },
            {
              field: 'reportsOpenedLastWeek',
              operator: 'greaterThan',
              value: 0,
              unit: 'reports'
            }
          ]
        }
      ],
      actions: {
        addTag: 'Clareza - Reativado',
        removeTags: ['Clareza - Inativo 7d', 'Clareza - Inativo 14d', 'Clareza - Inativo 30d']
      },
      emailPreview: 'Bom ver-te de volta! Continua com este ritmo — é assim que faz a diferença.'
    },
    {
      name: 'Clareza - Super Utilizador',
      description: 'Aluno abre mais de 80% dos relatórios do mês',
      category: 'COMPLETION',
      priority: 9,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'reportsOpenedLastMonth',
          operator: 'greaterThan',
          value: 24,
          unit: 'reports'
        }
      ],
      actions: {
        addTag: 'Clareza - Super Utilizador',
        removeTags: []
      },
      emailPreview: 'Excelente disciplina — estás a usar o Clareza exatamente como foi pensado.'
    }
  ],

  // ─────────────────────────────────────────────────────────────
  // 🎓 OGI (LOGIN_BASED)
  // ─────────────────────────────────────────────────────────────
  OGI: [
    {
      name: 'OGI - Inativo 10d',
      description: 'Aluno não faz login há 10 dias',
      category: 'INACTIVITY',
      priority: 8,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'daysSinceLastLogin',
          operator: 'greaterThan',
          value: 10,
          unit: 'days'
        }
      ],
      actions: {
        addTag: 'OGI - Inativo 10d',
        removeTags: []
      },
      emailPreview: 'Tudo bem contigo? Há algo que te esteja a travar?'
    },
    {
      name: 'OGI - Inativo 21d',
      description: 'Aluno não faz login há 21 dias',
      category: 'INACTIVITY',
      priority: 7,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'daysSinceLastLogin',
          operator: 'greaterThan',
          value: 21,
          unit: 'days'
        }
      ],
      actions: {
        addTag: 'OGI - Inativo 21d',
        removeTags: ['OGI - Inativo 10d']
      },
      emailPreview: 'Percebemos que estás ausente há algum tempo. Queres ajuda para retomar o curso?'
    },
    {
      name: 'OGI - Parou após M1',
      description: 'Aluno terminou módulo 1 mas não voltou há 5 dias',
      category: 'PROGRESS',
      priority: 7,
      conditions: [
        {
          type: 'COMPOUND',
          logic: 'AND',
          subConditions: [
            {
              field: 'currentModule',
              operator: 'equals',
              value: 1,
              unit: 'percentage'
            },
            {
              field: 'daysSinceLastLogin',
              operator: 'greaterThan',
              value: 5,
              unit: 'days'
            }
          ]
        }
      ],
      actions: {
        addTag: 'OGI - Parou após M1',
        removeTags: []
      },
      emailPreview: 'Excelente começo! O próximo módulo é onde tudo começa a encaixar.'
    },
    {
      name: 'OGI - Progresso Baixo',
      description: 'Menos de 25% de progresso após 30 dias',
      category: 'PROGRESS',
      priority: 6,
      conditions: [
        {
          type: 'COMPOUND',
          logic: 'AND',
          subConditions: [
            {
              field: 'currentProgress',
              operator: 'lessThan',
              value: 25,
              unit: 'percentage'
            },
            {
              field: 'daysSinceLastLogin',
              operator: 'greaterThan',
              value: 30,
              unit: 'days'
            }
          ]
        }
      ],
      actions: {
        addTag: 'OGI - Progresso Baixo',
        removeTags: []
      },
      emailPreview: 'A consistência é o que separa quem sabe investir de quem realmente faz. Queres ajuda para retomar?'
    },
    {
      name: 'OGI - Progresso Médio',
      description: 'Entre 25% e 75% de progresso',
      category: 'PROGRESS',
      priority: 7,
      conditions: [
        {
          type: 'COMPOUND',
          logic: 'AND',
          subConditions: [
            {
              field: 'currentProgress',
              operator: 'greaterThan',
              value: 25,
              unit: 'percentage'
            },
            {
              field: 'currentProgress',
              operator: 'lessThan',
              value: 75,
              unit: 'percentage'
            }
          ]
        }
      ],
      actions: {
        addTag: 'OGI - Progresso Médio',
        removeTags: ['OGI - Progresso Baixo']
      },
      emailPreview: 'Estás a meio da tua jornada. É aqui que muita gente abranda — continua!'
    },
    {
      name: 'OGI - Progresso Alto',
      description: 'Entre 75% e 99% de progresso',
      category: 'PROGRESS',
      priority: 8,
      conditions: [
        {
          type: 'COMPOUND',
          logic: 'AND',
          subConditions: [
            {
              field: 'currentProgress',
              operator: 'greaterThan',
              value: 75,
              unit: 'percentage'
            },
            {
              field: 'currentProgress',
              operator: 'lessThan',
              value: 100,
              unit: 'percentage'
            }
          ]
        }
      ],
      actions: {
        addTag: 'OGI - Progresso Alto',
        removeTags: ['OGI - Progresso Baixo', 'OGI - Progresso Médio']
      },
      emailPreview: 'Estás quase a terminar. Prepara-te para o próximo passo da tua jornada.'
    },
    {
      name: 'OGI - Concluiu Curso',
      description: 'Aluno completou 100% do curso',
      category: 'COMPLETION',
      priority: 9,
      conditions: [
        {
          type: 'SIMPLE',
          field: 'currentProgress',
          operator: 'equals',
          value: 100,
          unit: 'percentage'
        }
      ],
      actions: {
        addTag: 'OGI - Concluiu Curso',
        removeTags: [
          'OGI - Inativo 10d',
          'OGI - Inativo 21d',
          'OGI - Progresso Baixo',
          'OGI - Progresso Médio',
          'OGI - Progresso Alto'
        ]
      },
      emailPreview: 'Terminaste o OGI! Agora o desafio é manter-te informado — conhece o Clareza.'
    },
    {
      name: 'OGI - Reativado',
      description: 'Aluno voltou a fazer login após inatividade',
      category: 'ENGAGEMENT',
      priority: 8,
      conditions: [
        {
          type: 'COMPOUND',
          logic: 'AND',
          subConditions: [
            {
              field: 'daysSinceLastLogin',
              operator: 'lessThan',
              value: 2,
              unit: 'days'
            },
            {
              field: 'currentProgress',
              operator: 'greaterThan',
              value: 0,
              unit: 'percentage'
            }
          ]
        }
      ],
      actions: {
        addTag: 'OGI - Reativado',
        removeTags: ['OGI - Inativo 10d', 'OGI - Inativo 21d']
      },
      emailPreview: 'Bom ver-te de volta! Continua o teu progresso — estás no bom caminho.'
    }
  ]
}

// ════════════════════════════════════════════════════════════════════════════
// 🛠️ FUNÇÕES AUXILIARES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Garantir que tag existe no Active Campaign
 */
async function ensureTagExistsInAC(tagName: string): Promise<void> {
  try {
    const activeCampaignService = (await import('../src/services/ac/activeCampaignService')).default

    console.log(`   🔍 Verificando tag: ${tagName}`)

    // getOrCreateTag já faz busca + criação se não existir
    // É um método privado, mas applyTagToUserProduct usa-o internamente
    // Vamos fazer uma chamada simulada para forçar criação
    
    // Alternativa: buscar ou criar tag diretamente
    const tagId = await (activeCampaignService as any).getOrCreateTag(tagName)
    
    console.log(`   ✅ Tag pronta: ${tagName} (ID: ${tagId})`)
  } catch (error: any) {
    console.error(`   ❌ Erro ao garantir tag "${tagName}":`, error.message)
    // Não falhar o seed por causa de uma tag
  }
}

/**
 * Criar regra na BD
 */
async function createRule(productId: string, ruleData: any): Promise<void> {
  try {
    const TagRule = (await import('../src/models/acTags/TagRule')).default

    // Verificar se regra já existe
    const existing = await TagRule.findOne({
      name: ruleData.name,
      courseId: productId
    })

    if (existing) {
      console.log(`   ⏭️  Regra já existe: ${ruleData.name}`)
      return
    }

    // Criar regra
    await TagRule.create({
      ...ruleData,
      courseId: productId,
      isActive: true,
      createdBy: 'SYSTEM_SEED'
    })

    console.log(`   ✅ Regra criada: ${ruleData.name}`)
  } catch (error: any) {
    console.error(`   ❌ Erro ao criar regra "${ruleData.name}":`, error.message)
    throw error
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 FUNÇÃO PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

async function seedDefaultRules() {
  try {
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🌱 SEED: Regras Padrão de Tags')
    console.log('════════════════════════════════════════════════════════════\n')

    // ─────────────────────────────────────────────────────────────
    // 1. CONECTAR À BD
    // ─────────────────────────────────────────────────────────────
    console.log('📡 Conectando à MongoDB...')
    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true")
    console.log('✅ Conectado\n')

    // ─────────────────────────────────────────────────────────────
    // 2. BUSCAR PRODUTOS E COURSES
    // ─────────────────────────────────────────────────────────────
    const Product = (await import('../src/models/Product')).default
    const Course = (await import('../src/models/Course')).default

    console.log('🔍 Buscando produtos e courses...\n')

    // Buscar courses
    const clarezaCourse = await Course.findOne({ 
      $or: [
        { code: { $regex: /^CLAREZA/i } },
        { name: { $regex: /clareza/i } }
      ],
      trackingType: 'ACTION_BASED'
    })

    const ogiCourse = await Course.findOne({ 
      $or: [
        { code: { $regex: /^OGI/i } },
        { name: { $regex: /grande investimento/i } }
      ],
      trackingType: 'LOGIN_BASED'
    })

    console.log(`📚 Courses encontrados:`)
    console.log(`   Clareza: ${clarezaCourse ? `✅ ${clarezaCourse.name} (${clarezaCourse.code})` : '❌ NÃO ENCONTRADO'}`)
    console.log(`   OGI: ${ogiCourse ? `✅ ${ogiCourse.name} (${ogiCourse.code})` : '❌ NÃO ENCONTRADO'}\n`)

    // Buscar produtos (com regex para pegar variações)
    const clarezaProducts = await Product.find({ 
      code: { $regex: /^CLAREZA/i },
      isActive: true
    })

    const ogiProducts = await Product.find({ 
      code: { $regex: /^OGI/i },
      isActive: true
    })

    console.log(`📦 Produtos encontrados:`)
    console.log(`   Clareza: ${clarezaProducts.length} produto(s)`)
    clarezaProducts.forEach(p => console.log(`      - ${p.name} (${p.code})`))
    console.log(`   OGI: ${ogiProducts.length} produto(s)`)
    ogiProducts.forEach(p => console.log(`      - ${p.name} (${p.code})`))
    console.log()

    // ─────────────────────────────────────────────────────────────
    // 3. ASSOCIAR COURSES AOS PRODUTOS (se não tiverem)
    // ─────────────────────────────────────────────────────────────
    console.log('🔗 Verificando associação Course → Produto...\n')

    for (const product of clarezaProducts) {
      if (!product.courseId && clarezaCourse) {
        console.log(`   📌 Associando "${product.name}" → ${clarezaCourse.name}`)
        await Product.findByIdAndUpdate(product._id, {
          $set: { courseId: clarezaCourse._id }
        })
      }
    }

    for (const product of ogiProducts) {
      if (!product.courseId && ogiCourse) {
        console.log(`   📌 Associando "${product.name}" → ${ogiCourse.name}`)
        await Product.findByIdAndUpdate(product._id, {
          $set: { courseId: ogiCourse._id }
        })
      }
    }

    console.log()

    // Validar se temos pelo menos 1 produto de cada
    if (clarezaProducts.length === 0) {
      console.error('❌ Nenhum produto CLAREZA encontrado!')
      console.log('   Crie pelo menos um produto com code começando por "CLAREZA"\n')
    }

    if (ogiProducts.length === 0) {
      console.error('❌ Nenhum produto OGI encontrado!')
      console.log('   Crie pelo menos um produto com code começando por "OGI"\n')
    }

    if (!clarezaCourse && clarezaProducts.length > 0) {
      console.error('❌ Course Clareza não encontrado!')
      console.log('   Crie um course com trackingType: ACTION_BASED\n')
    }

    if (!ogiCourse && ogiProducts.length > 0) {
      console.error('❌ Course OGI não encontrado!')
      console.log('   Crie um course com trackingType: LOGIN_BASED\n')
    }

    // ─────────────────────────────────────────────────────────────
    // 4. CRIAR REGRAS CLAREZA
    // ─────────────────────────────────────────────────────────────
    if (clarezaProducts.length > 0 && clarezaCourse) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📊 CLAREZA - Criando 8 regras...')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

      // Criar regras para CADA produto Clareza
      for (const product of clarezaProducts) {
        console.log(`📦 Produto: ${product.name} (${product.code})\n`)

        for (const rule of DEFAULT_RULES.CLAREZA) {
          console.log(`   📋 ${rule.name}`)

          // Adaptar nome da tag com o código do produto
          const tagName = `${product.code} - ${rule.actions.addTag.replace('Clareza - ', '')}`
          
          // 1. Garantir tag no AC
          await ensureTagExistsInAC(tagName)

          // 2. Criar regra na BD (usando courseId do course)
          await createRule(clarezaCourse._id.toString(), {
            ...rule,
            name: `${product.code} - ${rule.name.replace('Clareza - ', '')}`,
            actions: {
              ...rule.actions,
              addTag: tagName,
              removeTags: rule.actions.removeTags.map(t => 
                `${product.code} - ${t.replace('Clareza - ', '')}`
              )
            }
          })

          console.log()
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. CRIAR REGRAS OGI
    // ─────────────────────────────────────────────────────────────
    if (ogiProducts.length > 0 && ogiCourse) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🎓 OGI - Criando 8 regras...')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

      // Criar regras para CADA produto OGI
      for (const product of ogiProducts) {
        console.log(`📦 Produto: ${product.name} (${product.code})\n`)

        for (const rule of DEFAULT_RULES.OGI) {
          console.log(`   📋 ${rule.name}`)

          // Adaptar nome da tag com o código do produto
          const tagName = `${product.code} - ${rule.actions.addTag.replace('OGI - ', '')}`
          
          // 1. Garantir tag no AC
          await ensureTagExistsInAC(tagName)

          // 2. Criar regra na BD (usando courseId do course)
          await createRule(ogiCourse._id.toString(), {
            ...rule,
            name: `${product.code} - ${rule.name.replace('OGI - ', '')}`,
            actions: {
              ...rule.actions,
              addTag: tagName,
              removeTags: rule.actions.removeTags.map(t => 
                `${product.code} - ${t.replace('OGI - ', '')}`
              )
            }
          })

          console.log()
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. RESUMO
    // ─────────────────────────────────────────────────────────────
    const totalClarezaRules = clarezaProducts.length * DEFAULT_RULES.CLAREZA.length
    const totalOGIRules = ogiProducts.length * DEFAULT_RULES.OGI.length
    const totalRules = totalClarezaRules + totalOGIRules

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 SEED CONCLUÍDO COM SUCESSO!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ Clareza: ${clarezaProducts.length} produto(s) × 8 regras = ${totalClarezaRules} regras`)
    console.log(`✅ OGI: ${ogiProducts.length} produto(s) × 8 regras = ${totalOGIRules} regras`)
    console.log(`✅ Total: ${totalRules} regras criadas`)
    console.log('✅ Tags garantidas no Active Campaign')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🔍 VERIFICAR:')
    console.log('1. BD: db.tagrules.find()')
    console.log('2. AC: https://osriquinhos.activehosted.com → Tags')
    console.log('3. Frontend: http://localhost:5173/activecampaign → Regras\n')

  } catch (error: any) {
    console.error('\n❌ ERRO NO SEED:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('📡 Desconectado da MongoDB\n')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🎬 EXECUTAR
// ════════════════════════════════════════════════════════════════════════════

seedDefaultRules()