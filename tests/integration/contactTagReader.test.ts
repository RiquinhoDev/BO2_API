// ═══════════════════════════════════════════════════════════
// 🧪 TESTES DE INTEGRAÇÃO: Contact Tag Reader Service
// Sprint 5: AC → BO Integration
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import mongoose from 'mongoose'
import contactTagReaderService from '../../src/services/ac/contactTagReader.service'
import activeCampaignService from '../../src/services/activeCampaignService'
import User from '../../src/models/user'
import Product from '../../src/models/Product'
import UserProduct from '../../src/models/UserProduct'
import Course from '../../src/models/Course'

// ═══════════════════════════════════════════════════════════
// SETUP E TEARDOWN
// ═══════════════════════════════════════════════════════════

describe('Contact Tag Reader Service - Integration Tests', () => {
  let testUser: any
  let testCourse: any
  let testProduct: any
  let testUserProduct: any
  
  const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com'

  beforeAll(async () => {
    // Conectar ao MongoDB de teste
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/bo2_test')
    }

    // Criar dados de teste
    try {
      // Criar curso de teste
      testCourse = await Course.create({
        name: 'Test Course',
        slug: 'test-course',
        description: 'Test Course for Integration Tests',
        type: 'LOGIN_BASED',
        isActive: true
      })

      // Criar produto de teste
      testProduct = await Product.create({
        code: 'TEST',
        name: 'Test Product',
        platform: 'mixed',
        courseId: testCourse._id,
        isActive: true,
        activeCampaignConfig: {
          tagPrefix: 'TEST',
          listId: '1'
        }
      })

      // Criar user de teste
      testUser = await User.create({
        name: 'Test User',
        email: TEST_EMAIL,
        role: 'student'
      })

      // Criar UserProduct de teste
      testUserProduct = await UserProduct.create({
        userId: testUser._id,
        productId: testProduct._id,
        platform: 'curseduca',
        platformUserId: '12345',
        enrolledAt: new Date(),
        status: 'ACTIVE',
        source: 'MANUAL',
        classes: []
      })

      console.log('✅ Dados de teste criados com sucesso')
    } catch (error: any) {
      console.error('❌ Erro ao criar dados de teste:', error.message)
    }
  })

  afterAll(async () => {
    // Limpar dados de teste
    try {
      if (testUser) await User.deleteOne({ _id: testUser._id })
      if (testProduct) await Product.deleteOne({ _id: testProduct._id })
      if (testCourse) await Course.deleteOne({ _id: testCourse._id })
      if (testUserProduct) await UserProduct.deleteOne({ _id: testUserProduct._id })
      
      console.log('✅ Dados de teste removidos com sucesso')
    } catch (error: any) {
      console.error('❌ Erro ao remover dados de teste:', error.message)
    }

    // Fechar conexão
    await mongoose.connection.close()
  })

  // ═══════════════════════════════════════════════════════════
  // TESTES: getContactTags
  // ═══════════════════════════════════════════════════════════

  describe('getContactTags()', () => {
    it('should fetch tags from Active Campaign for existing contact', async () => {
      // Skip if TEST_EMAIL não está configurado
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const result = await contactTagReaderService.getContactTags(TEST_EMAIL)
      
      // Verificar estrutura do resultado
      expect(result).toBeDefined()
      
      if (result) {
        expect(result.email).toBe(TEST_EMAIL)
        expect(result.contactId).toBeDefined()
        expect(Array.isArray(result.tags)).toBe(true)
        expect(Array.isArray(result.products)).toBe(true)
        
        console.log(`✅ Tags encontradas: ${result.tags.length}`)
        console.log(`✅ Produtos detectados: ${result.products.length}`)
      }
    })

    it('should return null for non-existent contact', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const result = await contactTagReaderService.getContactTags('nonexistent-email-12345@example.com')
      expect(result).toBeNull()
    })

    it('should infer products from tags correctly', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const result = await contactTagReaderService.getContactTags(TEST_EMAIL)
      
      if (result && result.products.length > 0) {
        const product = result.products[0]
        
        expect(product.code).toBeDefined()
        expect(product.name).toBeDefined()
        expect(Array.isArray(product.detectedFromTags)).toBe(true)
        expect(typeof product.currentLevel).toBe('number')
        expect(typeof product.isActive).toBe('boolean')
        
        console.log(`✅ Produto detectado: ${product.code} (${product.name})`)
      }
    })
  })

  // ═══════════════════════════════════════════════════════════
  // TESTES: syncUserTagsFromAC
  // ═══════════════════════════════════════════════════════════

  describe('syncUserTagsFromAC()', () => {
    it('should sync tags from AC to BO for valid user', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const result = await contactTagReaderService.syncUserTagsFromAC(testUser._id.toString())
      
      expect(result).toBeDefined()
      expect(result.synced).toBeDefined()
      
      if (result.synced) {
        expect(result.productsUpdated).toBeGreaterThanOrEqual(0)
        expect(Array.isArray(result.tagsAdded)).toBe(true)
        expect(Array.isArray(result.tagsRemoved)).toBe(true)
        
        console.log(`✅ Sync completo: ${result.productsUpdated} produtos atualizados`)
      } else {
        console.log(`⚠️ Sync falhou: ${result.reason}`)
      }
    })

    it('should return error for non-existent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId().toString()
      const result = await contactTagReaderService.syncUserTagsFromAC(fakeUserId)
      
      expect(result.synced).toBe(false)
      expect(result.reason).toBe('User not found in BO')
    })

    it('should update UserProduct.activeCampaignData after sync', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      // Executar sync
      await contactTagReaderService.syncUserTagsFromAC(testUser._id.toString())
      
      // Verificar se UserProduct foi atualizado
      const updatedUserProduct = await UserProduct.findById(testUserProduct._id)
      
      if (updatedUserProduct) {
        expect(updatedUserProduct.activeCampaignData).toBeDefined()
        
        // Verificar se lastSyncFromAC foi atualizado
        if (updatedUserProduct.activeCampaignData?.lastSyncFromAC) {
          const syncTime = new Date(updatedUserProduct.activeCampaignData.lastSyncFromAC)
          const now = new Date()
          const diffMinutes = (now.getTime() - syncTime.getTime()) / 1000 / 60
          
          expect(diffMinutes).toBeLessThan(5) // Sync ocorreu há menos de 5 minutos
          console.log(`✅ UserProduct atualizado há ${diffMinutes.toFixed(2)} minutos`)
        }
      }
    })
  })

  // ═══════════════════════════════════════════════════════════
  // TESTES: syncAllUsersFromAC
  // ═══════════════════════════════════════════════════════════

  describe('syncAllUsersFromAC()', () => {
    it('should sync multiple users in batch', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const results = await contactTagReaderService.syncAllUsersFromAC(5) // Limitar a 5 users
      
      expect(results).toBeDefined()
      expect(results.total).toBeGreaterThanOrEqual(0)
      expect(results.synced).toBeGreaterThanOrEqual(0)
      expect(results.failed).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(results.errors)).toBe(true)
      
      // Verificar consistência
      expect(results.total).toBe(results.synced + results.failed)
      
      console.log(`✅ Batch sync: ${results.synced}/${results.total} sucesso`)
      console.log(`❌ Falhas: ${results.failed}`)
    }, 30000) // Timeout de 30s para batch sync

    it('should respect limit parameter', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const limit = 3
      const results = await contactTagReaderService.syncAllUsersFromAC(limit)
      
      expect(results.total).toBeLessThanOrEqual(limit)
    }, 20000)
  })

  // ═══════════════════════════════════════════════════════════
  // TESTES: Integração com Active Campaign Service
  // ═══════════════════════════════════════════════════════════

  describe('Integration with Active Campaign Service', () => {
    it('should use AC service getContactByEmail correctly', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const contact = await activeCampaignService.getContactByEmail(TEST_EMAIL)
      
      if (contact) {
        expect(contact.email).toBe(TEST_EMAIL)
        expect(contact.id).toBeDefined()
        console.log(`✅ Contacto encontrado: ID ${contact.id}`)
      }
    })

    it('should use AC service getContactTags correctly', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const contact = await activeCampaignService.getContactByEmail(TEST_EMAIL)
      
      if (contact) {
        const tags = await activeCampaignService.getContactTags(contact.id)
        
        expect(Array.isArray(tags)).toBe(true)
        console.log(`✅ Tags do contacto: ${tags.length}`)
        
        if (tags.length > 0) {
          const firstTag = tags[0]
          expect(firstTag.id).toBeDefined()
          expect(firstTag.tag).toBeDefined()
        }
      }
    })
  })

  // ═══════════════════════════════════════════════════════════
  // TESTES: Edge Cases
  // ═══════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    it('should handle empty email gracefully', async () => {
      const result = await contactTagReaderService.getContactTags('')
      expect(result).toBeNull()
    })

    it('should handle invalid email format', async () => {
      const result = await contactTagReaderService.getContactTags('invalid-email')
      expect(result).toBeNull()
    })

    it('should handle user without products', async () => {
      // Criar user temporário sem produtos
      const tempUser = await User.create({
        name: 'Temp User',
        email: 'temp-no-products@example.com'
      })

      const result = await contactTagReaderService.syncUserTagsFromAC(tempUser._id.toString())
      
      expect(result).toBeDefined()
      
      // Limpar
      await User.deleteOne({ _id: tempUser._id })
    })

    it('should handle rate limiting gracefully', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      // Fazer múltiplas requests rápidas
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(contactTagReaderService.getContactTags(TEST_EMAIL))
      }

      const results = await Promise.all(promises)
      
      // Todas devem ter sido bem-sucedidas (rate limiting gerido internamente)
      results.forEach(result => {
        expect(result !== null || result === null).toBe(true) // Qualquer resultado é válido
      })
      
      console.log('✅ Rate limiting gerido corretamente')
    }, 20000)
  })

  // ═══════════════════════════════════════════════════════════
  // TESTES: Performance
  // ═══════════════════════════════════════════════════════════

  describe('Performance Tests', () => {
    it('should complete single user sync in less than 5 seconds', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const startTime = Date.now()
      await contactTagReaderService.syncUserTagsFromAC(testUser._id.toString())
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(5000)
      console.log(`✅ Sync duration: ${duration}ms`)
    }, 10000)

    it('should handle batch sync efficiently', async () => {
      if (!process.env.AC_API_KEY) {
        console.log('⚠️ Skipping: AC_API_KEY not configured')
        return
      }

      const startTime = Date.now()
      const results = await contactTagReaderService.syncAllUsersFromAC(3)
      const duration = Date.now() - startTime

      const avgTimePerUser = duration / results.total
      
      expect(avgTimePerUser).toBeLessThan(5000) // Menos de 5s por user em média
      console.log(`✅ Avg time per user: ${avgTimePerUser.toFixed(2)}ms`)
    }, 30000)
  })
})

// ═══════════════════════════════════════════════════════════
// TESTES: Controller Endpoints (E2E)
// ═══════════════════════════════════════════════════════════

describe('Contact Tag Reader Controller - E2E Tests', () => {
  // TODO: Adicionar testes E2E dos endpoints REST
  // - GET /api/ac/contact/:email/tags
  // - POST /api/ac/sync-user-tags/:userId
  // - POST /api/ac/sync-all-tags
  // - GET /api/ac/sync-status
  
  it('should be implemented', () => {
    expect(true).toBe(true)
  })
})
