// tests/integration/dashboard-v2.test.ts
// 🧪 Sprint 4: Integration Tests for Dashboard API V2

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Product from '../../src/models/Product';
import UserProduct from '../../src/models/UserProduct';
import User from '../../src/models/User';

let app: any;

describe('Dashboard API V2 - Integration Tests', () => {
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/test-db';
    await mongoose.connect(mongoUri);
    app = (await import('../../src/app')).default;
  });

  afterAll(async () => {
    await Product.deleteMany({});
    await UserProduct.deleteMany({});
    await User.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    await UserProduct.deleteMany({});
    await User.deleteMany({});
  });

  describe('GET /api/dashboard/stats/v2', () => {
    it('deve retornar stats V2 corretamente', async () => {
      // Criar produtos
      const product1 = await Product.create({
        code: 'OGI-TEST',
        name: 'OGI Test',
        platform: 'hotmart',
        courseId: new mongoose.Types.ObjectId(),
        settings: { allowMultipleEnrollments: false, requiresApproval: false },
        features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
        isActive: true,
      });

      const product2 = await Product.create({
        code: 'CLAREZA-TEST',
        name: 'Clareza Test',
        platform: 'curseduca',
        courseId: new mongoose.Types.ObjectId(),
        settings: { allowMultipleEnrollments: false, requiresApproval: false },
        features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
        isActive: true,
      });

      // Criar users e UserProducts
      for (let i = 0; i < 5; i++) {
        const user = await User.create({
          name: `User ${i}`,
          email: `user${i}@test.com`,
        });

        // 3 users no produto 1
        if (i < 3) {
          await UserProduct.create({
            userId: user._id,
            productId: product1._id,
            platformData: { platformId: 'hotmart' },
            status: 'ACTIVE',
            isActive: true,
            enrollmentDate: new Date(),
          });
        }

        // 2 users no produto 2
        if (i >= 3) {
          await UserProduct.create({
            userId: user._id,
            productId: product2._id,
            platformData: { platformId: 'curseduca' },
            status: 'ACTIVE',
            isActive: true,
            enrollmentDate: new Date(),
          });
        }
      }

      const response = await request(app)
        .get('/api/dashboard/stats/v2')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalUserProducts');
      expect(response.body.data.totalUserProducts).toBe(5);
      
      expect(response.body.data).toHaveProperty('byProduct');
      expect(Array.isArray(response.body.data.byProduct)).toBe(true);
      
      expect(response.body.data).toHaveProperty('activeUsers');
      expect(response.body.data.activeUsers).toBe(5);
    });

    it('deve retornar breakdown por produto', async () => {
      const product = await Product.create({
        code: 'BREAKDOWN-TEST',
        name: 'Breakdown Test',
        platform: 'hotmart',
        courseId: new mongoose.Types.ObjectId(),
        settings: { allowMultipleEnrollments: false, requiresApproval: false },
        features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
        isActive: true,
      });

      for (let i = 0; i < 3; i++) {
        const user = await User.create({
          name: `User ${i}`,
          email: `user${i}@test.com`,
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
        .get('/api/dashboard/stats/v2')
        .expect(200);

      const productBreakdown = response.body.data.byProduct.find(
        (p: any) => p.code === 'BREAKDOWN-TEST'
      );

      expect(productBreakdown).toBeDefined();
      expect(productBreakdown.count).toBe(3);
    });
  });
});

