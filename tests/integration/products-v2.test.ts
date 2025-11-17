// tests/integration/products-v2.test.ts
// 🧪 Sprint 4: Integration Tests for Products API V2

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Product from '../../src/models/Product';
import UserProduct from '../../src/models/UserProduct';
import User from '../../src/models/User';

// Import app (assumindo que existe um export em src/app.ts)
// Se não existir, ajustar para o export correto
let app: any;

describe('Products API V2 - Integration Tests', () => {
  let testProductId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Conectar ao MongoDB de teste
    const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/test-db';
    await mongoose.connect(mongoUri);
    
    // Importar app depois da conexão
    app = (await import('../../src/app')).default;
  });

  afterAll(async () => {
    // Limpar database de teste
    await Product.deleteMany({});
    await UserProduct.deleteMany({});
    await User.deleteMany({});
    
    // Desconectar
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Limpar coleções antes de cada teste
    await Product.deleteMany({});
    await UserProduct.deleteMany({});
  });

  describe('GET /api/products', () => {
    it('deve retornar todos os produtos V2', async () => {
      // Criar produtos de teste
      await Product.create([
        {
          code: 'TEST-OGI',
          name: 'Test OGI Product',
          platform: 'hotmart',
          courseId: new mongoose.Types.ObjectId(),
          settings: {
            allowMultipleEnrollments: false,
            requiresApproval: false,
          },
          features: {
            hasClasses: true,
            hasProgress: true,
            hasEngagement: true,
            hasReports: true,
          },
          isActive: true,
        },
        {
          code: 'TEST-CLAREZA',
          name: 'Test Clareza Product',
          platform: 'curseduca',
          courseId: new mongoose.Types.ObjectId(),
          settings: {
            allowMultipleEnrollments: false,
            requiresApproval: false,
          },
          features: {
            hasClasses: true,
            hasProgress: true,
            hasEngagement: true,
            hasReports: true,
          },
          isActive: true,
        },
      ]);

      const response = await request(app)
        .get('/api/products')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.products)).toBe(true);
      expect(response.body.products.length).toBeGreaterThanOrEqual(2);
      
      // Verificar estrutura V2
      const product = response.body.products[0];
      expect(product).toHaveProperty('_id');
      expect(product).toHaveProperty('code');
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('platform');
      expect(product).toHaveProperty('settings');
      expect(product).toHaveProperty('features');
    });

    it('deve filtrar produtos por plataforma', async () => {
      // Criar produtos de diferentes plataformas
      await Product.create([
        {
          code: 'HOTMART-1',
          name: 'Hotmart Product',
          platform: 'hotmart',
          courseId: new mongoose.Types.ObjectId(),
          settings: { allowMultipleEnrollments: false, requiresApproval: false },
          features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
          isActive: true,
        },
        {
          code: 'CURSEDUCA-1',
          name: 'CursEduca Product',
          platform: 'curseduca',
          courseId: new mongoose.Types.ObjectId(),
          settings: { allowMultipleEnrollments: false, requiresApproval: false },
          features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
          isActive: true,
        },
      ]);

      const response = await request(app)
        .get('/api/products?platform=hotmart')
        .expect(200);

      expect(response.body.products.length).toBe(1);
      expect(response.body.products[0].platform).toBe('hotmart');
    });
  });

  describe('POST /api/products', () => {
    it('deve criar novo produto V2', async () => {
      const newProduct = {
        code: 'TEST-NEW-PRODUCT',
        name: 'Test New Product V2',
        description: 'Test description',
        platform: 'hotmart',
        courseId: new mongoose.Types.ObjectId().toString(),
      };

      const response = await request(app)
        .post('/api/products')
        .send(newProduct)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.product.code).toBe('TEST-NEW-PRODUCT');
      expect(response.body.product.name).toBe('Test New Product V2');
      
      // Salvar ID para outros testes
      testProductId = response.body.product._id;
    });

    it('deve falhar ao criar produto sem campos obrigatórios', async () => {
      const invalidProduct = {
        name: 'Invalid Product',
        // Faltando: code, platform, courseId
      };

      const response = await request(app)
        .post('/api/products')
        .send(invalidProduct)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('deve falhar ao criar produto com código duplicado', async () => {
      const product1 = {
        code: 'DUPLICATE-CODE',
        name: 'Product 1',
        platform: 'hotmart',
        courseId: new mongoose.Types.ObjectId().toString(),
      };

      // Criar primeiro produto
      await request(app)
        .post('/api/products')
        .send(product1)
        .expect(201);

      // Tentar criar com mesmo código
      const response = await request(app)
        .post('/api/products')
        .send(product1)
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/products/:id', () => {
    it('deve retornar produto específico com stats', async () => {
      // Criar produto
      const product = await Product.create({
        code: 'TEST-SPECIFIC',
        name: 'Test Specific Product',
        platform: 'hotmart',
        courseId: new mongoose.Types.ObjectId(),
        settings: { allowMultipleEnrollments: false, requiresApproval: false },
        features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
        isActive: true,
      });

      const response = await request(app)
        .get(`/api/products/${product._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.product._id).toBe(product._id.toString());
      expect(response.body).toHaveProperty('stats');
    });

    it('deve retornar 404 para produto inexistente', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .get(`/api/products/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('UserProduct Integration', () => {
    it('deve criar UserProduct vinculado ao Product', async () => {
      // Criar user
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
      });

      // Criar produto
      const product = await Product.create({
        code: 'TEST-INTEGRATION',
        name: 'Test Integration Product',
        platform: 'hotmart',
        courseId: new mongoose.Types.ObjectId(),
        settings: { allowMultipleEnrollments: false, requiresApproval: false },
        features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
        isActive: true,
      });

      // Criar UserProduct
      const userProduct = await UserProduct.create({
        userId: user._id,
        productId: product._id,
        platformData: {
          platformId: 'hotmart',
          externalUserId: 'hotmart-123',
        },
        status: 'ACTIVE',
        isActive: true,
        enrollmentDate: new Date(),
      });

      expect(userProduct.productId.toString()).toBe(product._id.toString());
      expect(userProduct.userId.toString()).toBe(user._id.toString());
      expect(userProduct.status).toBe('ACTIVE');
    });

    it('deve verificar unicidade userId + productId', async () => {
      const user = await User.create({
        name: 'Test User 2',
        email: 'test2@example.com',
      });

      const product = await Product.create({
        code: 'TEST-UNIQUE',
        name: 'Test Unique',
        platform: 'hotmart',
        courseId: new mongoose.Types.ObjectId(),
        settings: { allowMultipleEnrollments: false, requiresApproval: false },
        features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
        isActive: true,
      });

      // Criar primeiro UserProduct
      await UserProduct.create({
        userId: user._id,
        productId: product._id,
        platformData: { platformId: 'hotmart' },
        status: 'ACTIVE',
        isActive: true,
        enrollmentDate: new Date(),
      });

      // Tentar criar duplicado
      try {
        await UserProduct.create({
          userId: user._id,
          productId: product._id,
          platformData: { platformId: 'hotmart' },
          status: 'ACTIVE',
          isActive: true,
          enrollmentDate: new Date(),
        });
        
        // Se não lançou erro, falhar teste
        expect(true).toBe(false);
      } catch (error: any) {
        // Esperado - erro de unique constraint
        expect(error.code).toBe(11000);
      }
    });
  });

  describe('GET /api/products/:id/students', () => {
    it('deve retornar students de um produto', async () => {
      // Criar produto
      const product = await Product.create({
        code: 'TEST-STUDENTS',
        name: 'Test Students Product',
        platform: 'hotmart',
        courseId: new mongoose.Types.ObjectId(),
        settings: { allowMultipleEnrollments: false, requiresApproval: false },
        features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
        isActive: true,
      });

      // Criar users e UserProducts
      for (let i = 0; i < 3; i++) {
        const user = await User.create({
          name: `Test User ${i}`,
          email: `test${i}@example.com`,
        });

        await UserProduct.create({
          userId: user._id,
          productId: product._id,
          platformData: { platformId: 'hotmart' },
          status: 'ACTIVE',
          isActive: true,
          enrollmentDate: new Date(),
        });
      }

      const response = await request(app)
        .get(`/api/products/${product._id}/students`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.students.length).toBe(3);
    });
  });
});

