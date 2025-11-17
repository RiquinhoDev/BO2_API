"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
exports.getDatabaseStatus = getDatabaseStatus;
const mongoose_1 = __importDefault(require("mongoose"));
async function connectDatabase() {
    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI não definida');
        }
        await mongoose_1.default.connect(mongoUri);
        console.log('✅ MongoDB conectado');
    }
    catch (error) {
        console.error('❌ Erro MongoDB:', error);
        throw error;
    }
}
async function disconnectDatabase() {
    try {
        await mongoose_1.default.connection.close();
        console.log('✅ MongoDB desconectado');
    }
    catch (error) {
        console.error('❌ Erro ao desconectar MongoDB:', error);
        throw error;
    }
}
function getDatabaseStatus() {
    const state = mongoose_1.default.connection.readyState;
    switch (state) {
        case 0: return 'disconnected';
        case 1: return 'connected';
        case 2: return 'connecting';
        case 3: return 'disconnecting';
        default: return 'unknown';
    }
}
