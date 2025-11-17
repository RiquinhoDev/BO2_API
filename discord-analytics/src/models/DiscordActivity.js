"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordActivity = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// Schema MongoDB
const discordActivitySchema = new mongoose_1.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true
    },
    displayName: String,
    date: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['message', 'voice', 'presence'],
        required: true,
        index: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    // Contadores
    count: {
        type: Number,
        default: 0
    },
    totalCharacters: {
        type: Number,
        default: 0
    },
    totalWords: {
        type: Number,
        default: 0
    },
    totalMinutes: {
        type: Number,
        default: 0
    },
    // Arrays
    channels: [String],
    hours: [Number],
    attachments: {
        type: Number,
        default: 0
    },
    mentions: {
        type: Number,
        default: 0
    },
    emojis: {
        type: Number,
        default: 0
    },
    // Status
    currentStatus: {
        type: String,
        enum: ['online', 'idle', 'dnd', 'offline']
    },
    lastActivity: {
        type: Date,
        default: Date.now,
        index: true
    },
    // Dados recentes
    recentMessages: [{
            messageId: String,
            channelId: String,
            timestamp: Date,
            length: Number
        }],
    statusChanges: [{
            status: String,
            timestamp: Date
        }]
}, {
    timestamps: true,
    collection: 'discord_activities'
});
// Índices compostos para performance
discordActivitySchema.index({ userId: 1, date: 1, type: 1 });
discordActivitySchema.index({ guildId: 1, date: 1 });
discordActivitySchema.index({ date: 1, type: 1 });
discordActivitySchema.index({ lastActivity: -1 });
// Middleware para limpar dados antigos (opcional)
discordActivitySchema.pre('save', function (next) {
    // Limpar dados mais antigos que 90 dias
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    if (this.statusChanges) {
        this.statusChanges = this.statusChanges.filter(change => change.timestamp > ninetyDaysAgo);
    }
    if (this.recentMessages) {
        this.recentMessages = this.recentMessages.filter(msg => msg.timestamp > ninetyDaysAgo);
    }
    next();
});
exports.DiscordActivity = mongoose_1.default.model('DiscordActivity', discordActivitySchema);
