// src/services/tagApplicationService.ts

import { Product, TagRule, User, UserProduct } from "../../models"
import activeCampaignService from "./activeCampaignService"
import tagRuleEngine from "./tagRuleEngine"



const BO_TAG_PREFIXES = [
  'CLAREZA_MENSAL',
  'CLAREZA_ANUAL',
  'OGI_V1',
  'DISCORD_COMMUNITY'
]

class TagApplicationService {
  
  async applyTagsForAllProducts(): Promise<{
    executions: number
    users: number
    errors: number
  }> {
    const products = await Product.find({ isActive: true })
    
    let totalExecutions = 0
    let totalUsers = 0
    let totalErrors = 0

    for (const product of products) {
      console.log(`📦 ${product.code}`)

      // ✅ SÓ USERPRODUCTS PRIMÁRIOS!
      const userProducts = await UserProduct.find({
        productId: product._id,
        status: 'ACTIVE',
        isPrimary: true
      })

      for (const up of userProducts) {
        const user = await User.findById(up.userId)
        if (!user?.email) continue

        try {
          // 1. Avaliar regras
          const results = await tagRuleEngine.evaluateUserRules(
            up.userId,
            product.courseId
          )

          const executed = results.filter(r => r.executed)
          if (executed.length === 0) continue

          // 2. Coletar tags
          const tagsToAdd: string[] = []
          const tagsToRemove: string[] = []

          for (const result of executed) {
            const rule = await TagRule.findById(result.ruleId)
            if (!rule) continue

            if (rule.actions.addTag) {
              tagsToAdd.push(rule.actions.addTag)
            }

            if (rule.actions.removeTags?.length > 0) {
              for (const tag of rule.actions.removeTags) {
                // ✅ SÓ REMOVER SE FOR TAG DO BO!
                if (BO_TAG_PREFIXES.some(prefix => tag.startsWith(prefix))) {
                  tagsToRemove.push(tag)
                }
              }
            }
          }

          if (tagsToAdd.length === 0 && tagsToRemove.length === 0) continue

          // 3. ✅ REMOVER TAGS ANTIGAS (AC)
          let removedCount = 0
          for (const tag of tagsToRemove) {
            const removed = await activeCampaignService.removeTag(user.email, tag)
            if (removed) removedCount++
          }

          // 4. ✅ ADICIONAR TAGS NOVAS (AC)
          let addedCount = 0
          for (const tag of tagsToAdd) {
            try {
              await activeCampaignService.addTag(user.email, tag)
              addedCount++
            } catch (error: any) {
              console.error(`❌ Erro ao adicionar "${tag}":`, error.message)
              totalErrors++
            }
          }

          // 5. ✅ ATUALIZAR BD
          const currentTags = up.activeCampaignData?.tags || []
                  const finalTags = currentTags.filter((tag: string) => !tagsToRemove.includes(tag))

          
          for (const tag of tagsToAdd) {
            if (!finalTags.includes(tag)) finalTags.push(tag)
          }

          await UserProduct.updateOne(
            { _id: up._id },
            {
              $set: {
                'activeCampaignData.tags': finalTags,
                'activeCampaignData.lastSyncAt': new Date()
              }
            }
          )

          if (addedCount > 0 || removedCount > 0) {
            console.log(`   ✅ ${user.email}: +${addedCount} -${removedCount}`)
            totalExecutions++
            totalUsers++
          }

          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 500))

        } catch (error: any) {
          console.error(`❌ ${user.email}:`, error.message)
          totalErrors++
        }
      }
    }

    return {
      executions: totalExecutions,
      users: totalUsers,
      errors: totalErrors
    }
  }
}

export default new TagApplicationService()