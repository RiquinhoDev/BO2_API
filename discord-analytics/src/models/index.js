"use strict";
// discord-analytics/src/models/index.ts
// 🎯 FICHEIRO PARA INICIALIZAR TODOS OS MODELOS
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceActivity = exports.ServerStats = exports.UserEngagement = exports.DiscordActivity = void 0;
exports.ensureIndexes = ensureIndexes;
require("./DiscordActivity");
require("./UserEngagement");
require("./ServerStats");
require("./VoiceActivity");
console.log('✅ Modelos do Discord Analytics carregados');
// Exportar modelos para uso
var DiscordActivity_1 = require("./DiscordActivity");
Object.defineProperty(exports, "DiscordActivity", { enumerable: true, get: function () { return DiscordActivity_1.DiscordActivity; } });
var UserEngagement_1 = require("./UserEngagement");
Object.defineProperty(exports, "UserEngagement", { enumerable: true, get: function () { return UserEngagement_1.UserEngagement; } });
var ServerStats_1 = require("./ServerStats");
Object.defineProperty(exports, "ServerStats", { enumerable: true, get: function () { return ServerStats_1.ServerStats; } });
var VoiceActivity_1 = require("./VoiceActivity");
Object.defineProperty(exports, "VoiceActivity", { enumerable: true, get: function () { return VoiceActivity_1.VoiceActivity; } });
// Opcional: Criar índices se não existirem
const mongoose_1 = __importDefault(require("mongoose"));
async function ensureIndexes() {
    try {
        console.log('🔄 Verificando índices...');
        // DiscordActivity indexes
        await mongoose_1.default.model('DiscordActivity').ensureIndexes();
        // UserEngagement indexes
        await mongoose_1.default.model('UserEngagement').ensureIndexes();
        // ServerStats indexes
        await mongoose_1.default.model('ServerStats').ensureIndexes();
        // VoiceActivity indexes
        await mongoose_1.default.model('VoiceActivity').ensureIndexes();
        console.log('✅ Índices verificados/criados');
    }
    catch (error) {
        console.error('❌ Erro ao criar índices:', error);
    }
}
