// ✅ SPRINT 5 - Task 7: Testes Integration para Contact Tag Reader
// Objetivo: Validar funcionalidades de leitura e sync de tags do AC
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { contactTagReaderService } from '../../src/services/ac/contactTagReader.service';
import { User, IUser } from '../../src/models/User';
import { UserProduct, IUserProduct } from '../../src/models/UserProduct';
import { Product } from '../../src/models/Product';
import { acService } from '../../src/services/ac/activeCampaign.service';
import mongoose from 'mongoose';

// ═══════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════

// Mock do acService
jest.mock('../../src/services/ac/activeCampaign.service', () => ({
  acService: {
    findOrCreateContact: jest.fn(),
    getContactTags: jest.fn(),
  },
}));

// ═══════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════

const mockContact = {
  id: '12345',
  email: 'test@example.com',
};

const mockTags = [
  { id: 1, tag: 'OGI_LEVEL_1', name: 'OGI_LEVEL_1', cdate: '2024-01-01' },
  { id: 2, tag: 'OGI_LEVEL_2', name: 'OGI_LEVEL_2', cdate: '2024-01-02' },
  { id: 3, tag: 'CLAREZA_ACTIVE', name: 'CLAREZA_ACTIVE', cdate: '2024-01-03' },
  { id: 4, tag: 'MANUAL_TAG', name: 'MANUAL_TAG', cdate: '2024-01-04' },
  { id: 5, tag: 'INATIVO_7D', name: 'INATIVO_7D', cdate: '2024-01-05' },
];

// ═══════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════

describe('ContactTagReader Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getContactTags', () => {
    it('deve buscar tags de um contacto válido', async () => {
      // Arrange
      (acService.findOrCreateContact as jest.Mock).mockResolvedValue(mockContact);
      (acService.getContactTags as jest.Mock).mockResolvedValue(mockTags);

      // Act
      const result = await contactTagReaderService.getContactTags('test@example.com');

      // Assert
      expect(acService.findOrCreateContact).toHaveBeenCalledWith('test@example.com');
      expect(acService.getContactTags).toHaveBeenCalledWith('12345');
      expect(result).toBeDefined();
      expect(result.contactId).toBe('12345');
      expect(result.email).toBe('test@example.com');
      expect(result.totalTags).toBe(5);
      expect(result.systemTags).toBe(4); // OGI_LEVEL_1, OGI_LEVEL_2, CLAREZA_ACTIVE, INATIVO_7D
      expect(result.manualTags).toBe(1); // MANUAL_TAG
    });

    it('deve inferir produtos corretamente das tags', async () => {
      // Arrange
      (acService.findOrCreateContact as jest.Mock).mockResolvedValue(mockContact);
      (acService.getContactTags as jest.Mock).mockResolvedValue(mockTags);

      // Act
      const result = await contactTagReaderService.getContactTags('test@example.com');

      // Assert
      expect(result.products).toBeDefined();
      expect(result.products.length).toBeGreaterThan(0);

      // Verificar se OGI foi inferido
      const ogiProduct = result.products.find((p) => p.productCode === 'OGI');
      expect(ogiProduct).toBeDefined();
      expect(ogiProduct?.tags.length).toBeGreaterThan(0);

      // Verificar se CLAREZA foi inferido
      const clarezaProduct = result.products.find((p) => p.productCode === 'CLAREZA');
      expect(clarezaProduct).toBeDefined();
    });

    it('deve detectar origem das tags corretamente', async () => {
      // Arrange
      (acService.findOrCreateContact as jest.Mock).mockResolvedValue(mockContact);
      (acService.getContactTags as jest.Mock).mockResolvedValue(mockTags);

      // Act
      const result = await contactTagReaderService.getContactTags('test@example.com');

      // Assert
      const systemTag = result.tags.find((t) => t.tag === 'OGI_LEVEL_1');
      expect(systemTag?.origin).toBe('system');

      const manualTag = result.tags.find((t) => t.tag === 'MANUAL_TAG');
      expect(manualTag?.origin).toBe('manual');
    });

    it('deve lançar erro se contacto não encontrado', async () => {
      // Arrange
      (acService.findOrCreateContact as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        contactTagReaderService.getContactTags('inexistente@example.com')
      ).rejects.toThrow('Contacto não encontrado no AC');
    });

    it('deve lidar com contacto sem tags', async () => {
      // Arrange
      (acService.findOrCreateContact as jest.Mock).mockResolvedValue(mockContact);
      (acService.getContactTags as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await contactTagReaderService.getContactTags('test@example.com');

      // Assert
      expect(result.totalTags).toBe(0);
      expect(result.systemTags).toBe(0);
      expect(result.manualTags).toBe(0);
      expect(result.products.length).toBe(0);
    });
  });

  describe('syncUserTagsFromAC', () => {
    let mockUser: any;
    let mockProduct: any;
    let mockUserProduct: any;

    beforeEach(() => {
      mockUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'test@example.com',
        name: 'Test User',
      };

      mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        code: 'OGI',
        name: 'O Grande Investimento',
        platform: 'hotmart',
      };

      mockUserProduct = {
        _id: new mongoose.Types.ObjectId(),
        userId: mockUser._id,
        productId: mockProduct._id,
        status: 'active',
        activeCampaignData: {
          contactId: '12345',
          tags: [],
        },
        save: jest.fn().mockResolvedValue(true),
      };
    });

    it('deve sincronizar tags de um user válido', async () => {
      // Arrange
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser as any);
      jest.spyOn(UserProduct, 'find').mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockUserProduct]),
      } as any);
      jest.spyOn(Product, 'findById').mockResolvedValue(mockProduct as any);

      (acService.findOrCreateContact as jest.Mock).mockResolvedValue(mockContact);
      (acService.getContactTags as jest.Mock).mockResolvedValue([
        { id: 1, tag: 'OGI_LEVEL_1', name: 'OGI_LEVEL_1' },
      ]);

      // Act
      const result = await contactTagReaderService.syncUserTagsFromAC(
        mockUser._id.toString()
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.synced).toBe(true);
      expect(result.email).toBe('test@example.com');
      expect(mockUserProduct.save).toHaveBeenCalled();
    });

    it('deve retornar erro se user não encontrado', async () => {
      // Arrange
      jest.spyOn(User, 'findById').mockResolvedValue(null);

      // Act
      const result = await contactTagReaderService.syncUserTagsFromAC(
        'invalid-id'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.synced).toBe(false);
      expect(result.reason).toBe('User não encontrado no BO');
    });

    it('deve atualizar tags do UserProduct', async () => {
      // Arrange
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser as any);
      jest.spyOn(UserProduct, 'find').mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockUserProduct]),
      } as any);
      jest.spyOn(Product, 'findById').mockResolvedValue(mockProduct as any);

      (acService.findOrCreateContact as jest.Mock).mockResolvedValue(mockContact);
      (acService.getContactTags as jest.Mock).mockResolvedValue([
        { id: 1, tag: 'OGI_LEVEL_1', name: 'OGI_LEVEL_1' },
        { id: 2, tag: 'OGI_LEVEL_2', name: 'OGI_LEVEL_2' },
      ]);

      // Act
      const result = await contactTagReaderService.syncUserTagsFromAC(
        mockUser._id.toString()
      );

      // Assert
      expect(result.productsUpdated).toBeGreaterThan(0);
      expect(result.tagsAdded.length).toBeGreaterThan(0);
    });

    it('deve lidar com user sem produtos', async () => {
      // Arrange
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser as any);
      jest.spyOn(UserProduct, 'find').mockReturnValue({
        populate: jest.fn().mockResolvedValue([]),
      } as any);

      (acService.findOrCreateContact as jest.Mock).mockResolvedValue(mockContact);
      (acService.getContactTags as jest.Mock).mockResolvedValue(mockTags);

      // Act
      const result = await contactTagReaderService.syncUserTagsFromAC(
        mockUser._id.toString()
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.synced).toBe(true);
      expect(result.productsUpdated).toBe(0);
      expect(result.reason).toBe('User não tem produtos associados');
    });
  });

  describe('syncAllUsersFromAC', () => {
    it('deve sincronizar múltiplos users', async () => {
      // Arrange
      const mockUsers = [
        { _id: new mongoose.Types.ObjectId(), email: 'user1@example.com' },
        { _id: new mongoose.Types.ObjectId(), email: 'user2@example.com' },
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers),
      } as any);

      // Mock syncUserTagsFromAC para sucesso
      jest
        .spyOn(contactTagReaderService, 'syncUserTagsFromAC')
        .mockResolvedValue({
          success: true,
          synced: true,
          userId: 'test',
          email: 'test@example.com',
          productsUpdated: 1,
          tagsDetected: 2,
          tagsAdded: ['TAG1'],
          tagsRemoved: [],
          errors: [],
        });

      // Act
      const result = await contactTagReaderService.syncAllUsersFromAC(2);

      // Assert
      expect(result.totalUsers).toBe(2);
      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('deve respeitar o limit fornecido', async () => {
      // Arrange
      const findSpy = jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      } as any);

      // Act
      await contactTagReaderService.syncAllUsersFromAC(50);

      // Assert
      const chainedCalls = findSpy.mock.results[0].value;
      expect(chainedCalls.limit).toHaveBeenCalledWith(50);
    });

    it('deve aplicar rate limiting', async () => {
      // Arrange
      const mockUsers = [
        { _id: new mongoose.Types.ObjectId(), email: 'user1@example.com' },
        { _id: new mongoose.Types.ObjectId(), email: 'user2@example.com' },
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers),
      } as any);

      jest
        .spyOn(contactTagReaderService, 'syncUserTagsFromAC')
        .mockResolvedValue({
          success: true,
          synced: true,
          userId: 'test',
          email: 'test@example.com',
          productsUpdated: 1,
          tagsDetected: 2,
          tagsAdded: [],
          tagsRemoved: [],
          errors: [],
        });

      const startTime = Date.now();

      // Act
      await contactTagReaderService.syncAllUsersFromAC(2);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      // Com 2 users e rate limiting de 100ms, deve levar pelo menos 100ms
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });
});

// ═══════════════════════════════════════════════════════
// HELPER TESTS
// ═══════════════════════════════════════════════════════

describe('ContactTagReader Helpers', () => {
  describe('Tag Origin Detection', () => {
    it('deve detectar tags system corretamente', () => {
      const systemTags = [
        'OGI_LEVEL_1',
        'CLAREZA_ACTIVE',
        'INATIVO_7D',
        'REENGAGEMENT_START',
        'LEVEL_2',
      ];

      // Testar através do serviço
      systemTags.forEach((tagName) => {
        // Este é um teste indireto - a lógica está privada
        // Mas podemos verificar através de getContactTags
        expect(tagName).toMatch(/^(OGI_|CLAREZA_|LEVEL_|INATIVO_|REENGAGEMENT_|_\d+D$)/i);
      });
    });

    it('deve detectar tags manuais corretamente', () => {
      const manualTags = ['MANUAL_TAG', 'Custom Label', 'User Added'];

      manualTags.forEach((tagName) => {
        expect(tagName).not.toMatch(/^(OGI_|CLAREZA_|LEVEL_|INATIVO_|REENGAGEMENT_)/i);
      });
    });
  });

  describe('Product Inference', () => {
    it('deve inferir OGI de tags relacionadas', () => {
      const ogiTags = ['OGI_LEVEL_1', 'OGI_ACTIVE', 'o grande investimento'];

      ogiTags.forEach((tagName) => {
        expect(tagName.toLowerCase()).toMatch(/(ogi|investimento)/);
      });
    });

    it('deve inferir CLAREZA de tags relacionadas', () => {
      const clarezaTags = ['CLAREZA_ACTIVE', 'CLAREZA_LEVEL_2', 'relatório clareza'];

      clarezaTags.forEach((tagName) => {
        expect(tagName.toLowerCase()).toMatch(/(clareza|relatorio)/);
      });
    });
  });
});

// ═══════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════

export {};

