// ════════════════════════════════════════════════════════════════════════════
// 📁 ADICIONAR em: src/controllers/acTags/activecampaign.controller.ts
// Endpoint de TESTE para avaliar apenas 1 aluno (COM IMPORTS CORRETOS!)
// ════════════════════════════════════════════════════════════════════════════

// ✅ VERIFICAR SE ESTES IMPORTS JÁ EXISTEM NO TOPO DO FICHEIRO:
// Se não existirem, adicionar:

import type { RequestHandler } from 'express'
import mongoose from 'mongoose'
import Course from '../../models/Course'
import User from '../../models/user'
import { Product, UserProduct } from '../../models'  // ✅ IMPORTANTE!
import tagRuleEngine from '../../services/ac/tagRuleEngine'
import CommunicationHistory from '../../models/acTags/CommunicationHistory'

/**
 * POST /api/activecampaign/test-single-user
 * Testa avaliação de regras para apenas 1 aluno (SEGURO PARA TESTES)
 * 
 * Body: { email: "joaomcf37@gmail.com" }
 */
export const testSingleUserForce: RequestHandler = async (req, res) => {
  const startTime = Date.now()
  
  try {
    const { email } = req.body

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email é obrigatório no body: { email: "..." }'
      })
      return
    }

    console.log(`\n════════════════════════════════════════════════════════════`)
    console.log(`🧪 TESTE FORCE (SEM COOLDOWN) - Email: ${email}`)
    console.log(`════════════════════════════════════════════════════════════\n`)

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR USER
    // ═══════════════════════════════════════════════════════════
    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user) {
      console.log(`❌ User não encontrado: ${email}`)
      res.status(404).json({
        success: false,
        error: `User não encontrado: ${email}`
      })
      return
    }

    console.log(`✅ User encontrado: ${user._id}`)

    // ═══════════════════════════════════════════════════════════
    // 2. APAGAR HISTÓRICO ANTERIOR (para forçar re-execução)
    // ═══════════════════════════════════════════════════════════
    const deletedCount = await CommunicationHistory.deleteMany({
      userId: user._id
    })
    
    console.log(`🗑️  Histórico anterior apagado: ${deletedCount.deletedCount} registo(s)`)

    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR USERPRODUCTS
    // ═══════════════════════════════════════════════════════════
    const userProducts = await UserProduct.find({
      userId: user._id,
      status: 'ACTIVE'
    }).populate('productId')

    console.log(`\n📦 UserProducts ativos: ${userProducts.length}`)

    if (userProducts.length === 0) {
      res.json({
        success: true,
        message: 'User não tem produtos ativos',
        user: { id: user._id, name: user.name, email: user.email },
        productsDeleted: deletedCount.deletedCount,
        products: [],
        evaluations: []
      })
      return
    }

    // ═══════════════════════════════════════════════════════════
    // 4. AVALIAR REGRAS (igual ao testSingleUser)
    // ═══════════════════════════════════════════════════════════
    const courseIds = new Set<string>()
    const productDetails: any[] = []

    for (const up of userProducts) {
      const product = up.productId as any
      if (product && product.courseId) {
        courseIds.add(product.courseId.toString())
        productDetails.push({
          productId: product._id,
          productName: product.name,
          productCode: product.code,
          courseId: product.courseId,
          status: up.status
        })
      }
    }

    console.log(`\n📚 Courses associados: ${courseIds.size}`)

    const allResults: any[] = []
    let totalTagsApplied = 0
    let totalTagsRemoved = 0

    for (const courseIdStr of courseIds) {
      const courseId = new mongoose.Types.ObjectId(courseIdStr)
      const course = await Course.findById(courseId)

      if (!course) continue

      console.log(`\n📖 Avaliando course: ${course.name} (${course.code})`)

      try {
        const results = await tagRuleEngine.evaluateUserRules(user.id, courseId)

        results.forEach(result => {
          if (result.executed) {
            if (result.action === 'ADD_TAG') totalTagsApplied++
            if (result.action === 'REMOVE_TAG') totalTagsRemoved++
          }

          allResults.push({
            courseId: courseId.toString(),
            courseName: course.name,
            courseCode: course.code,
            ...result
          })
        })

      } catch (evalError: any) {
        allResults.push({
          courseId: courseId.toString(),
          courseName: course.name,
          courseCode: course.code,
          error: evalError.message
        })
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 5. VERIFICAR NOVO HISTÓRICO
    // ═══════════════════════════════════════════════════════════
    const newHistory = await CommunicationHistory.find({
      userId: user._id,
      createdAt: { $gte: new Date(startTime) }
    })
      .populate('courseId', 'name code')
      .populate('tagRuleId', 'name')
      .lean()

    console.log(`\n📜 Novo histórico criado: ${newHistory.length} registo(s)`)

    const historyDetails = newHistory.map((h: any) => ({
      action: h.action,
      tagName: h.tagApplied,
      course: h.courseId?.name,
      rule: h.tagRuleId?.name,
      timestamp: h.createdAt
    }))

    // ═══════════════════════════════════════════════════════════
    // 6. RESPOSTA
    // ═══════════════════════════════════════════════════════════
    const duration = Date.now() - startTime

    console.log(`\n════════════════════════════════════════════════════════════`)
    console.log(`✅ TESTE FORCE CONCLUÍDO`)
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    console.log(`🗑️  Histórico apagado: ${deletedCount.deletedCount}`)
    console.log(`🏷️  Tags aplicadas: ${totalTagsApplied}`)
    console.log(`🏷️  Tags removidas: ${totalTagsRemoved}`)
    console.log(`📜 Novo histórico: ${newHistory.length}`)
    console.log(`════════════════════════════════════════════════════════════\n`)

    res.json({
      success: true,
      duration: `${(duration / 1000).toFixed(2)}s`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      cleanedRecords: deletedCount.deletedCount,
      products: productDetails,
      summary: {
        coursesEvaluated: courseIds.size,
        rulesEvaluated: allResults.length,
        tagsApplied: totalTagsApplied,
        tagsRemoved: totalTagsRemoved,
        historyRecordsCreated: newHistory.length
      },
      evaluations: allResults,
      history: historyDetails
    })
    return

  } catch (error: any) {
    console.error('\n❌ ERRO NO TESTE FORCE:', error)
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    })
    return
  }
}