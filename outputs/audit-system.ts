// ════════════════════════════════════════════════════════════════════════════
// 🔍 AUDITORIA COMPLETA - Sistema de Tags (v2 - Simplificada)
// ════════════════════════════════════════════════════════════════════════════

import mongoose, { type Types } from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

type CourseLean = {
  _id: Types.ObjectId
  code: string
  name: string
  trackingType?: string
  trackingConfig?: {
    actionType?: string
    loginThresholds?: { warning: number; critical: number }
    actionThresholds?: { warning: number; critical: number }
  }
  activeCampaignConfig?: {
    tagPrefix?: string
    listId?: string
  }
  isActive?: boolean
}

type ProductLean = {
  _id: Types.ObjectId
  code: string
  name: string
  platform?: string
  isActive?: boolean
  courseId?: Types.ObjectId | null
}

type RuleLean = {
  _id: Types.ObjectId
  name: string
  category: string
  priority: number
  isActive: boolean
  courseId?: Types.ObjectId | null
  conditions?: unknown[]
  actions?: {
    addTag: string
    removeTags?: string[]
  }
  lastRunAt?: Date
  createdBy?: string
}

async function auditSystem() {
  try {
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🔍 AUDITORIA COMPLETA - Sistema de Tags')
    console.log('════════════════════════════════════════════════════════════\n')

    await mongoose.connect(
      process.env.MONGODB_URI ||
        'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
    )
    console.log('✅ Conectado\n')

    const Course = (await import('../src/models/Course')).default
    const Product = (await import('../src/models/Product')).default
    const TagRule = (await import('../src/models/acTags/TagRule')).default
    const UserProduct = (await import('../src/models/UserProduct')).default

    // ═══════════════════════════════════════════════════════════
    // 1. COURSES
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🏫 COURSES')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const courses = await Course.find({})
      .select('_id code name trackingType trackingConfig activeCampaignConfig isActive')
      .lean<CourseLean[]>()

    if (courses.length === 0) {
      console.log('⚠️  Nenhum course encontrado!\n')
    } else {
      for (const course of courses) {
        const courseId = course._id.toString()

        console.log(`📚 ${course.name} (${course.code})`)
        console.log(`   ID: ${courseId}`)
        console.log(`   Tracking Type: ${course.trackingType ?? '—'}`)
        console.log(`   Status: ${course.isActive ? '✅ ATIVO' : '❌ INATIVO'}`)

        if (course.trackingConfig) {
          console.log(`   Tracking Config:`)
          if (course.trackingConfig.actionType) {
            console.log(`      Action Type: ${course.trackingConfig.actionType}`)
          }
          if (course.trackingConfig.loginThresholds) {
            console.log(
              `      Login Thresholds: Warning ${course.trackingConfig.loginThresholds.warning}d, Critical ${course.trackingConfig.loginThresholds.critical}d`
            )
          }
          if (course.trackingConfig.actionThresholds) {
            console.log(
              `      Action Thresholds: Warning ${course.trackingConfig.actionThresholds.warning}d, Critical ${course.trackingConfig.actionThresholds.critical}d`
            )
          }
        }

        if (course.activeCampaignConfig) {
          console.log(`   AC Config:`)
          console.log(`      Tag Prefix: ${course.activeCampaignConfig.tagPrefix ?? '—'}`)
          console.log(`      List ID: ${course.activeCampaignConfig.listId ?? '—'}`)
        }

        console.log()
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. PRODUCTS
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📦 PRODUCTS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const products = await Product.find({})
      .select('_id code name platform isActive courseId')
      .lean<ProductLean[]>()

    if (products.length === 0) {
      console.log('⚠️  Nenhum produto encontrado!\n')
    } else {
      for (const product of products) {
        const productId = product._id.toString()
        const courseIdStr = product.courseId ? product.courseId.toString() : null

        console.log(`📦 ${product.name} (${product.code})`)
        console.log(`   ID: ${productId}`)
        console.log(`   Platform: ${product.platform ?? '—'}`)
        console.log(`   Status: ${product.isActive ? '✅ ATIVO' : '❌ INATIVO'}`)

        if (courseIdStr) {
          const course = courses.find((c: CourseLean) => c._id.toString() === courseIdStr)
          if (course) {
            console.log(`   Course: ${course.name} (${course.code}) - ${course.trackingType ?? '—'}`)
          } else {
            console.log(`   Course: ⚠️  ID ${courseIdStr} não encontrado`)
          }
        } else {
          console.log(`   Course: ⚠️  SEM COURSE ASSOCIADO`)
        }

        // Contar alunos
        const studentCount = await UserProduct.countDocuments({
          productId: product._id,
          status: 'ACTIVE'
        })
        console.log(`   Alunos Ativos: ${studentCount}`)

        console.log()
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. TAG RULES
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('⚙️  TAG RULES')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const rules = await TagRule.find({})
      .select('_id name category priority isActive courseId conditions actions lastRunAt createdBy')
      .sort({ courseId: 1, priority: -1 })
      .lean<RuleLean[]>()

    if (rules.length === 0) {
      console.log('⚠️  Nenhuma regra encontrada!\n')
    } else {
      // Agrupar por course
      const rulesByCourse: Record<
        string,
        { courseName: string; courseId: string; rules: RuleLean[] }
      > = {}

      for (const rule of rules) {
        const courseIdStr = rule.courseId ? rule.courseId.toString() : 'SEM_COURSE'
        const course = rule.courseId
          ? courses.find((c: CourseLean) => c._id.toString() === courseIdStr)
          : undefined

        const courseKey = course ? course.code : 'SEM_COURSE'

        if (!rulesByCourse[courseKey]) {
          rulesByCourse[courseKey] = {
            courseName: course ? course.name : 'Sem Course',
            courseId: courseIdStr,
            rules: []
          }
        }

        rulesByCourse[courseKey].rules.push(rule)
      }

      // Mostrar por course
      for (const [courseCode, data] of Object.entries(rulesByCourse)) {
        console.log(`📚 ${data.courseName} (${courseCode})`)
        console.log(`   Total de regras: ${data.rules.length}\n`)

        for (const rule of data.rules) {
          console.log(`   ⚙️  ${rule.name}`)
          console.log(`      ID: ${rule._id.toString()}`)
          console.log(`      Categoria: ${rule.category}`)
          console.log(`      Prioridade: ${rule.priority}`)
          console.log(`      Status: ${rule.isActive ? '✅ ATIVA' : '❌ INATIVA'}`)
          console.log(`      Criada por: ${rule.createdBy ?? '—'}`)

          const condCount = Array.isArray(rule.conditions) ? rule.conditions.length : 0
          console.log(`      Condições: ${condCount}`)

          const addTag = rule.actions?.addTag
          console.log(`      Tag: "${addTag ?? '⚠️ SEM actions.addTag'}"`)

          console.log()
        }
      }

      // Resumo
      console.log('   ─────────────────────────────────────────────')
      console.log(`   📊 RESUMO DE REGRAS:`)
      console.log(`      Total: ${rules.length}`)
      console.log(`      Ativas: ${rules.filter((r: RuleLean) => r.isActive).length}`)
      console.log(`      Inativas: ${rules.filter((r: RuleLean) => !r.isActive).length}`)
      console.log()

      // Por categoria
      const byCategory: Record<string, number> = {}
      rules.forEach((r: RuleLean) => {
        byCategory[r.category] = (byCategory[r.category] || 0) + 1
      })

      console.log(`   📊 POR CATEGORIA:`)
      for (const [cat, count] of Object.entries(byCategory)) {
        console.log(`      ${cat}: ${count}`)
      }
      console.log()
    }

    // ═══════════════════════════════════════════════════════════
    // 4. TAGS ÚNICAS
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🏷️  TAGS CONFIGURADAS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const allTags = new Set<string>()
    rules.forEach((rule: RuleLean) => {
      const addTag = rule.actions?.addTag
      if (addTag) allTags.add(addTag)

      rule.actions?.removeTags?.forEach((tag: string) => allTags.add(tag))
    })

    const tagsList = Array.from(allTags).sort()

    if (tagsList.length === 0) {
      console.log('⚠️  Nenhuma tag encontrada!\n')
    } else {
      console.log(`Total de tags únicas: ${tagsList.length}\n`)

      const tagsByPrefix: Record<string, string[]> = {}

      tagsList.forEach((tag: string) => {
        const prefix = tag.split(' - ')[0] || tag.split('_')[0]
        ;(tagsByPrefix[prefix] ??= []).push(tag)
      })

      for (const [prefix, tags] of Object.entries(tagsByPrefix)) {
        console.log(`📌 ${prefix} (${tags.length} tags):`)
        tags.forEach((t: string) => console.log(`   - ${t}`))
        console.log()
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 5. RESUMO GERAL
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 RESUMO GERAL')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log(`✅ Courses criados: ${courses.length}`)
    console.log(`✅ Products configurados: ${products.length}`)
    console.log(`✅ Tag Rules criadas: ${rules.length}`)
    console.log(`✅ Tags únicas: ${tagsList.length}`)

    const totalStudents = await UserProduct.countDocuments({ status: 'ACTIVE' })
    console.log(`👥 Alunos ativos total: ${totalStudents}`)
    console.log()

    console.log('📦 ALUNOS POR PRODUTO:')
    for (const product of products) {
      const count = await UserProduct.countDocuments({
        productId: product._id,
        status: 'ACTIVE'
      })
      console.log(`   ${product.name}: ${count} alunos`)
    }
    console.log()

    // ═══════════════════════════════════════════════════════════
    // 6. VERIFICAÇÕES DE INTEGRIDADE
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 VERIFICAÇÕES DE INTEGRIDADE')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    let hasIssues = false

    const productsWithoutCourse = products.filter((p: ProductLean) => !p.courseId)
    if (productsWithoutCourse.length > 0) {
      console.log(`⚠️  ${productsWithoutCourse.length} produto(s) sem course associado:`)
      productsWithoutCourse.forEach((p: ProductLean) => console.log(`   - ${p.name} (${p.code})`))
      console.log()
      hasIssues = true
    }

    if (!hasIssues) {
      console.log('✅ Nenhum problema de integridade encontrado!')
    }
    console.log()

    // ═══════════════════════════════════════════════════════════
    // 7. PRÓXIMOS PASSOS
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🚀 PRÓXIMOS PASSOS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('1️⃣  VERIFICAR FRONTEND:')
    console.log('   http://localhost:5173/activecampaign')
    console.log('   - Tab "Regras" deve mostrar as 24 regras')
    console.log('   - Tab "Clareza" deve mostrar 354 alunos')
    console.log('   - Tab "OGI" deve mostrar 4,253 alunos')
    console.log()

    console.log('2️⃣  TESTAR EXECUÇÃO MANUAL:')
    console.log('   POST http://localhost:3001/api/activecampaign/test-cron')
    console.log()

    console.log('3️⃣  VERIFICAR TAGS NO ACTIVE CAMPAIGN:')
    console.log('   https://osriquinhos.activehosted.com → Contacts → Tags')
    console.log('   Verificar se as 24 tags foram criadas')
    console.log()

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ AUDITORIA COMPLETA!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('📡 Desconectado da MongoDB\n')
  }
}

auditSystem()
