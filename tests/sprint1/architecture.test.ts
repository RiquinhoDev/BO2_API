// ════════════════════════════════════════════════════════════
// 📁 tests/sprint1/architecture.test.ts
// TESTES DA NOVA ARQUITETURA V2
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { getRequiredTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import Product from '../../src/models/product/Product'
import UserProduct from '../../src/models/UserProduct'
import Course from '../../src/models/Course'
import { Class } from '../../src/models/Class'

const describeArchitecture = process.env.RUN_ARCHITECTURE_TESTS === 'true' ? describe : describe.skip

describeArchitecture('Sprint 1: Architecture V2 (opt-in)', () => {
  
  beforeAll(async () => {
    await mongoose.connect(getRequiredTestMongoUri())
  })
  
  afterAll(async () => {
    // Cleanup
    await UserProduct.deleteMany({ source: 'TEST' })
    await Product.deleteMany({ code: /^TEST-/ })
    await User.deleteMany({ email: /test-arch-v2/ })
    await mongoose.disconnect()
  })
  
  describe('Product Model', () => {
    
    it('deve criar produto com todos os campos obrigatórios', async () => {
      const course = await Course.findOne({ code: 'OGI' })
      
      if (!course) {
        console.warn('⚠️  Course OGI não encontrado, pulando teste')
        return
      }
      
      const product = await Product.create({
        code: 'TEST-PRODUCT-1',
        name: 'Produto de Teste 1',
        platform: 'hotmart',
        courseId: course._id,
        hotmartProductId: 'test-123',
        isActive: true,
        activeCampaignConfig: {
          tagPrefix: 'TEST',
          listId: '1'
        }
      })
      
      expect(product.code).toBe('TEST-PRODUCT-1')
      expect(product.platform).toBe('hotmart')
      expect(product.isActive).toBe(true)
      expect(product.getPlatformId()).toBe('test-123')
    })
    
    it('deve impedir produtos com mesmo code', async () => {
      const course = await Course.findOne({ code: 'OGI' })
      
      if (!course) {
        console.warn('⚠️  Course OGI não encontrado, pulando teste')
        return
      }
      
      try {
        await Product.create({
          code: 'TEST-PRODUCT-1', // Duplicado do teste anterior
          name: 'Duplicado',
          platform: 'curseduca',
          courseId: course._id,
          isActive: true
        })
        throw new Error('Deveria ter falhado com duplicate key')
      } catch (error: any) {
        expect(error.code).toBe(11000) // Duplicate key
      }
    })
    
    it('deve verificar disponibilidade do produto', async () => {
      const course = await Course.findOne({ code: 'OGI' })
      
      if (!course) {
        console.warn('⚠️  Course OGI não encontrado, pulando teste')
        return
      }
      
      // Produto ativo
      const activeProduct = await Product.create({
        code: 'TEST-PRODUCT-ACTIVE',
        name: 'Produto Ativo',
        platform: 'hotmart',
        courseId: course._id,
        isActive: true
      })
      
      expect(activeProduct.isAvailable()).toBe(true)
      
      // Produto inativo
      const inactiveProduct = await Product.create({
        code: 'TEST-PRODUCT-INACTIVE',
        name: 'Produto Inativo',
        platform: 'hotmart',
        courseId: course._id,
        isActive: false
      })
      
      expect(inactiveProduct.isAvailable()).toBe(false)
    })
    
  })
  
  describe('UserProduct Model', () => {
    
    let testUser: any
    let testProduct: any
    
    beforeAll(async () => {
      const course = await Course.findOne({ code: 'OGI' })
      
      if (!course) {
        console.warn('⚠️  Course OGI não encontrado, pulando testes UserProduct')
        return
      }
      
      testUser = await User.create({
        name: 'Test User Arch V2',
        email: 'test-arch-v2@example.com',
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          sources: {}
        }
      })
      
      testProduct = await Product.findOne({ code: 'TEST-PRODUCT-1' })
      
      if (!testProduct) {
        testProduct = await Product.create({
          code: 'TEST-PRODUCT-UP',
          name: 'Produto para UserProduct',
          platform: 'hotmart',
          courseId: course._id,
          isActive: true
        })
      }
    })
    
    it('deve criar enrollment de user em produto', async () => {
      if (!testUser || !testProduct) {
        console.warn('⚠️  testUser ou testProduct não disponível, pulando teste')
        return
      }
      
      const userProduct = await UserProduct.create({
        userId: testUser._id,
        productId: testProduct._id,
        platform: 'hotmart',
        platformUserId: 'hotmart-test-123',
        enrolledAt: new Date(),
        status: 'ACTIVE',
        source: 'TEST',
        progress: {
          percentage: 0
        },
        engagement: {
          engagementScore: 0
        },
        classes: []
      })
      
      expect(userProduct.userId.toString()).toBe(testUser._id.toString())
      expect(userProduct.platform).toBe('hotmart')
      expect(userProduct.isActive()).toBe(true)
    })
    
    it('deve impedir enrollment duplicado no mesmo produto', async () => {
      if (!testUser || !testProduct) {
        console.warn('⚠️  testUser ou testProduct não disponível, pulando teste')
        return
      }
      
      try {
        await UserProduct.create({
          userId: testUser._id,
          productId: testProduct._id,
          platform: 'hotmart',
          platformUserId: 'hotmart-test-456',
          enrolledAt: new Date(),
          status: 'ACTIVE',
          source: 'TEST'
        })
        throw new Error('Deveria ter falhado com duplicate key')
      } catch (error: any) {
        expect(error.code).toBe(11000) // Duplicate key
      }
    })
    
    it('deve permitir user em produtos diferentes', async () => {
      if (!testUser) {
        console.warn('⚠️  testUser não disponível, pulando teste')
        return
      }
      
      const course = await Course.findOne({ code: 'CLAREZA' })
      
      if (!course) {
        console.warn('⚠️  Course CLAREZA não encontrado, pulando teste')
        return
      }
      
      const clarezaProduct = await Product.create({
        code: 'TEST-CLAREZA-1',
        name: 'Clareza Teste',
        platform: 'curseduca',
        courseId: course._id,
        isActive: true
      })
      
      const userProduct = await UserProduct.create({
        userId: testUser._id,
        productId: clarezaProduct._id,
        platform: 'curseduca',
        platformUserId: 'curseduca-test-789',
        enrolledAt: new Date(),
        status: 'ACTIVE',
        source: 'TEST'
      })
      
      expect(userProduct).toBeDefined()
      
      // Verificar que user tem 2 produtos
      const userProducts = await UserProduct.find({ userId: testUser._id, source: 'TEST' })
      expect(userProducts.length).toBeGreaterThanOrEqual(2)
    })
    
    it('deve calcular dias desde enrollment', async () => {
      if (!testUser || !testProduct) {
        console.warn('⚠️  testUser ou testProduct não disponível, pulando teste')
        return
      }
      
      const userProduct = await UserProduct.findOne({
        userId: testUser._id,
        productId: testProduct._id
      })
      
      if (!userProduct) {
        console.warn('⚠️  UserProduct não encontrado, pulando teste')
        return
      }
      
      const days = userProduct.getDaysSinceEnrollment()
      expect(days).toEqual(expect.any(Number))
      expect(days).toBeGreaterThanOrEqual(0)
    })
    
  })
  
  describe('Class Model com productId', () => {
    
    let testProduct: any
    
    beforeAll(async () => {
      testProduct = await Product.findOne({ code: 'TEST-PRODUCT-1' })
    })
    
    it('deve criar turma com productId', async () => {
      if (!testProduct) {
        console.warn('⚠️  testProduct não disponível, pulando teste')
        return
      }
      
      const classDoc = await Class.create({
        classId: 'TEST-CLASS-V2-1',
        name: 'Turma Teste V2',
        productId: testProduct._id,
        studentCount: 0,
        isActive: true,
        source: 'manual'
      })
      
      expect(classDoc.productId?.toString()).toBe(testProduct._id.toString())
      
      // Cleanup
      await Class.deleteOne({ _id: classDoc._id })
    })
    
  })
  
  describe('Índices e Performance', () => {
    
    it('deve ter índice único em userId + productId no UserProduct', async () => {
      const indexes = await UserProduct.collection.getIndexes()
      
      const uniqueIndex = Object.values(indexes).find((idx: any) => 
        idx.unique && 
        idx.key && 
        idx.key.userId && 
        idx.key.productId
      )
      
      expect(uniqueIndex).toBeDefined()
    })
    
    it('deve ter índices em Product.code', async () => {
      const indexes = await Product.collection.getIndexes()
      
      const codeIndex = Object.values(indexes).find((idx: any) => 
        idx.key && idx.key.code
      )
      
      expect(codeIndex).toBeDefined()
    })
    
  })
  
})

