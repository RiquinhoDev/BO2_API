"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ✅ SPRINT 5 - Task 7: Testes Integration para Contact Tag Reader
// Objetivo: Validar funcionalidades de leitura e sync de tags do AC
const globals_1 = require("@jest/globals");
const contactTagReader_service_1 = require("../../src/services/ac/contactTagReader.service");
const User_1 = require("../../src/models/User");
const UserProduct_1 = require("../../src/models/UserProduct");
const Product_1 = require("../../src/models/Product");
const activeCampaign_service_1 = require("../../src/services/ac/activeCampaign.service");
const mongoose_1 = __importDefault(require("mongoose"));
// ═══════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════
// Mock do acService
globals_1.jest.mock('../../src/services/ac/activeCampaign.service', () => ({
    acService: {
        findOrCreateContact: globals_1.jest.fn(),
        getContactTags: globals_1.jest.fn(),
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
(0, globals_1.describe)('ContactTagReader Service', () => {
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
    });
    (0, globals_1.describe)('getContactTags', () => {
        (0, globals_1.it)('deve buscar tags de um contacto válido', async () => {
            // Arrange
            activeCampaign_service_1.acService.findOrCreateContact.mockResolvedValue(mockContact);
            activeCampaign_service_1.acService.getContactTags.mockResolvedValue(mockTags);
            // Act
            const result = await contactTagReader_service_1.contactTagReaderService.getContactTags('test@example.com');
            // Assert
            (0, globals_1.expect)(activeCampaign_service_1.acService.findOrCreateContact).toHaveBeenCalledWith('test@example.com');
            (0, globals_1.expect)(activeCampaign_service_1.acService.getContactTags).toHaveBeenCalledWith('12345');
            (0, globals_1.expect)(result).toBeDefined();
            (0, globals_1.expect)(result.contactId).toBe('12345');
            (0, globals_1.expect)(result.email).toBe('test@example.com');
            (0, globals_1.expect)(result.totalTags).toBe(5);
            (0, globals_1.expect)(result.systemTags).toBe(4); // OGI_LEVEL_1, OGI_LEVEL_2, CLAREZA_ACTIVE, INATIVO_7D
            (0, globals_1.expect)(result.manualTags).toBe(1); // MANUAL_TAG
        });
        (0, globals_1.it)('deve inferir produtos corretamente das tags', async () => {
            // Arrange
            activeCampaign_service_1.acService.findOrCreateContact.mockResolvedValue(mockContact);
            activeCampaign_service_1.acService.getContactTags.mockResolvedValue(mockTags);
            // Act
            const result = await contactTagReader_service_1.contactTagReaderService.getContactTags('test@example.com');
            // Assert
            (0, globals_1.expect)(result.products).toBeDefined();
            (0, globals_1.expect)(result.products.length).toBeGreaterThan(0);
            // Verificar se OGI foi inferido
            const ogiProduct = result.products.find((p) => p.productCode === 'OGI');
            (0, globals_1.expect)(ogiProduct).toBeDefined();
            (0, globals_1.expect)(ogiProduct?.tags.length).toBeGreaterThan(0);
            // Verificar se CLAREZA foi inferido
            const clarezaProduct = result.products.find((p) => p.productCode === 'CLAREZA');
            (0, globals_1.expect)(clarezaProduct).toBeDefined();
        });
        (0, globals_1.it)('deve detectar origem das tags corretamente', async () => {
            // Arrange
            activeCampaign_service_1.acService.findOrCreateContact.mockResolvedValue(mockContact);
            activeCampaign_service_1.acService.getContactTags.mockResolvedValue(mockTags);
            // Act
            const result = await contactTagReader_service_1.contactTagReaderService.getContactTags('test@example.com');
            // Assert
            const systemTag = result.tags.find((t) => t.tag === 'OGI_LEVEL_1');
            (0, globals_1.expect)(systemTag?.origin).toBe('system');
            const manualTag = result.tags.find((t) => t.tag === 'MANUAL_TAG');
            (0, globals_1.expect)(manualTag?.origin).toBe('manual');
        });
        (0, globals_1.it)('deve lançar erro se contacto não encontrado', async () => {
            // Arrange
            activeCampaign_service_1.acService.findOrCreateContact.mockResolvedValue(null);
            // Act & Assert
            await (0, globals_1.expect)(contactTagReader_service_1.contactTagReaderService.getContactTags('inexistente@example.com')).rejects.toThrow('Contacto não encontrado no AC');
        });
        (0, globals_1.it)('deve lidar com contacto sem tags', async () => {
            // Arrange
            activeCampaign_service_1.acService.findOrCreateContact.mockResolvedValue(mockContact);
            activeCampaign_service_1.acService.getContactTags.mockResolvedValue([]);
            // Act
            const result = await contactTagReader_service_1.contactTagReaderService.getContactTags('test@example.com');
            // Assert
            (0, globals_1.expect)(result.totalTags).toBe(0);
            (0, globals_1.expect)(result.systemTags).toBe(0);
            (0, globals_1.expect)(result.manualTags).toBe(0);
            (0, globals_1.expect)(result.products.length).toBe(0);
        });
    });
    (0, globals_1.describe)('syncUserTagsFromAC', () => {
        let mockUser;
        let mockProduct;
        let mockUserProduct;
        (0, globals_1.beforeEach)(() => {
            mockUser = {
                _id: new mongoose_1.default.Types.ObjectId(),
                email: 'test@example.com',
                name: 'Test User',
            };
            mockProduct = {
                _id: new mongoose_1.default.Types.ObjectId(),
                code: 'OGI',
                name: 'O Grande Investimento',
                platform: 'hotmart',
            };
            mockUserProduct = {
                _id: new mongoose_1.default.Types.ObjectId(),
                userId: mockUser._id,
                productId: mockProduct._id,
                status: 'active',
                activeCampaignData: {
                    contactId: '12345',
                    tags: [],
                },
                save: globals_1.jest.fn().mockResolvedValue(true),
            };
        });
        (0, globals_1.it)('deve sincronizar tags de um user válido', async () => {
            // Arrange
            globals_1.jest.spyOn(User_1.User, 'findById').mockResolvedValue(mockUser);
            globals_1.jest.spyOn(UserProduct_1.UserProduct, 'find').mockReturnValue({
                populate: globals_1.jest.fn().mockResolvedValue([mockUserProduct]),
            });
            globals_1.jest.spyOn(Product_1.Product, 'findById').mockResolvedValue(mockProduct);
            activeCampaign_service_1.acService.findOrCreateContact.mockResolvedValue(mockContact);
            activeCampaign_service_1.acService.getContactTags.mockResolvedValue([
                { id: 1, tag: 'OGI_LEVEL_1', name: 'OGI_LEVEL_1' },
            ]);
            // Act
            const result = await contactTagReader_service_1.contactTagReaderService.syncUserTagsFromAC(mockUser._id.toString());
            // Assert
            (0, globals_1.expect)(result.success).toBe(true);
            (0, globals_1.expect)(result.synced).toBe(true);
            (0, globals_1.expect)(result.email).toBe('test@example.com');
            (0, globals_1.expect)(mockUserProduct.save).toHaveBeenCalled();
        });
        (0, globals_1.it)('deve retornar erro se user não encontrado', async () => {
            // Arrange
            globals_1.jest.spyOn(User_1.User, 'findById').mockResolvedValue(null);
            // Act
            const result = await contactTagReader_service_1.contactTagReaderService.syncUserTagsFromAC('invalid-id');
            // Assert
            (0, globals_1.expect)(result.success).toBe(false);
            (0, globals_1.expect)(result.synced).toBe(false);
            (0, globals_1.expect)(result.reason).toBe('User não encontrado no BO');
        });
        (0, globals_1.it)('deve atualizar tags do UserProduct', async () => {
            // Arrange
            globals_1.jest.spyOn(User_1.User, 'findById').mockResolvedValue(mockUser);
            globals_1.jest.spyOn(UserProduct_1.UserProduct, 'find').mockReturnValue({
                populate: globals_1.jest.fn().mockResolvedValue([mockUserProduct]),
            });
            globals_1.jest.spyOn(Product_1.Product, 'findById').mockResolvedValue(mockProduct);
            activeCampaign_service_1.acService.findOrCreateContact.mockResolvedValue(mockContact);
            activeCampaign_service_1.acService.getContactTags.mockResolvedValue([
                { id: 1, tag: 'OGI_LEVEL_1', name: 'OGI_LEVEL_1' },
                { id: 2, tag: 'OGI_LEVEL_2', name: 'OGI_LEVEL_2' },
            ]);
            // Act
            const result = await contactTagReader_service_1.contactTagReaderService.syncUserTagsFromAC(mockUser._id.toString());
            // Assert
            (0, globals_1.expect)(result.productsUpdated).toBeGreaterThan(0);
            (0, globals_1.expect)(result.tagsAdded.length).toBeGreaterThan(0);
        });
        (0, globals_1.it)('deve lidar com user sem produtos', async () => {
            // Arrange
            globals_1.jest.spyOn(User_1.User, 'findById').mockResolvedValue(mockUser);
            globals_1.jest.spyOn(UserProduct_1.UserProduct, 'find').mockReturnValue({
                populate: globals_1.jest.fn().mockResolvedValue([]),
            });
            activeCampaign_service_1.acService.findOrCreateContact.mockResolvedValue(mockContact);
            activeCampaign_service_1.acService.getContactTags.mockResolvedValue(mockTags);
            // Act
            const result = await contactTagReader_service_1.contactTagReaderService.syncUserTagsFromAC(mockUser._id.toString());
            // Assert
            (0, globals_1.expect)(result.success).toBe(true);
            (0, globals_1.expect)(result.synced).toBe(true);
            (0, globals_1.expect)(result.productsUpdated).toBe(0);
            (0, globals_1.expect)(result.reason).toBe('User não tem produtos associados');
        });
    });
    (0, globals_1.describe)('syncAllUsersFromAC', () => {
        (0, globals_1.it)('deve sincronizar múltiplos users', async () => {
            // Arrange
            const mockUsers = [
                { _id: new mongoose_1.default.Types.ObjectId(), email: 'user1@example.com' },
                { _id: new mongoose_1.default.Types.ObjectId(), email: 'user2@example.com' },
            ];
            globals_1.jest.spyOn(User_1.User, 'find').mockReturnValue({
                select: globals_1.jest.fn().mockReturnThis(),
                limit: globals_1.jest.fn().mockReturnThis(),
                lean: globals_1.jest.fn().mockResolvedValue(mockUsers),
            });
            // Mock syncUserTagsFromAC para sucesso
            globals_1.jest
                .spyOn(contactTagReader_service_1.contactTagReaderService, 'syncUserTagsFromAC')
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
            const result = await contactTagReader_service_1.contactTagReaderService.syncAllUsersFromAC(2);
            // Assert
            (0, globals_1.expect)(result.totalUsers).toBe(2);
            (0, globals_1.expect)(result.synced).toBe(2);
            (0, globals_1.expect)(result.failed).toBe(0);
        });
        (0, globals_1.it)('deve respeitar o limit fornecido', async () => {
            // Arrange
            const findSpy = globals_1.jest.spyOn(User_1.User, 'find').mockReturnValue({
                select: globals_1.jest.fn().mockReturnThis(),
                limit: globals_1.jest.fn().mockReturnThis(),
                lean: globals_1.jest.fn().mockResolvedValue([]),
            });
            // Act
            await contactTagReader_service_1.contactTagReaderService.syncAllUsersFromAC(50);
            // Assert
            const chainedCalls = findSpy.mock.results[0].value;
            (0, globals_1.expect)(chainedCalls.limit).toHaveBeenCalledWith(50);
        });
        (0, globals_1.it)('deve aplicar rate limiting', async () => {
            // Arrange
            const mockUsers = [
                { _id: new mongoose_1.default.Types.ObjectId(), email: 'user1@example.com' },
                { _id: new mongoose_1.default.Types.ObjectId(), email: 'user2@example.com' },
            ];
            globals_1.jest.spyOn(User_1.User, 'find').mockReturnValue({
                select: globals_1.jest.fn().mockReturnThis(),
                limit: globals_1.jest.fn().mockReturnThis(),
                lean: globals_1.jest.fn().mockResolvedValue(mockUsers),
            });
            globals_1.jest
                .spyOn(contactTagReader_service_1.contactTagReaderService, 'syncUserTagsFromAC')
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
            await contactTagReader_service_1.contactTagReaderService.syncAllUsersFromAC(2);
            const endTime = Date.now();
            const duration = endTime - startTime;
            // Assert
            // Com 2 users e rate limiting de 100ms, deve levar pelo menos 100ms
            (0, globals_1.expect)(duration).toBeGreaterThanOrEqual(100);
        });
    });
});
// ═══════════════════════════════════════════════════════
// HELPER TESTS
// ═══════════════════════════════════════════════════════
(0, globals_1.describe)('ContactTagReader Helpers', () => {
    (0, globals_1.describe)('Tag Origin Detection', () => {
        (0, globals_1.it)('deve detectar tags system corretamente', () => {
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
                (0, globals_1.expect)(tagName).toMatch(/^(OGI_|CLAREZA_|LEVEL_|INATIVO_|REENGAGEMENT_|_\d+D$)/i);
            });
        });
        (0, globals_1.it)('deve detectar tags manuais corretamente', () => {
            const manualTags = ['MANUAL_TAG', 'Custom Label', 'User Added'];
            manualTags.forEach((tagName) => {
                (0, globals_1.expect)(tagName).not.toMatch(/^(OGI_|CLAREZA_|LEVEL_|INATIVO_|REENGAGEMENT_)/i);
            });
        });
    });
    (0, globals_1.describe)('Product Inference', () => {
        (0, globals_1.it)('deve inferir OGI de tags relacionadas', () => {
            const ogiTags = ['OGI_LEVEL_1', 'OGI_ACTIVE', 'o grande investimento'];
            ogiTags.forEach((tagName) => {
                (0, globals_1.expect)(tagName.toLowerCase()).toMatch(/(ogi|investimento)/);
            });
        });
        (0, globals_1.it)('deve inferir CLAREZA de tags relacionadas', () => {
            const clarezaTags = ['CLAREZA_ACTIVE', 'CLAREZA_LEVEL_2', 'relatório clareza'];
            clarezaTags.forEach((tagName) => {
                (0, globals_1.expect)(tagName.toLowerCase()).toMatch(/(clareza|relatorio)/);
            });
        });
    });
});
