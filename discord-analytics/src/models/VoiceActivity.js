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
exports.VoiceActivity = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// Schema para atividade de voz
const VoiceActivitySchema = new mongoose_1.Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    username: {
        type: String,
        required: true,
        maxlength: 32,
    },
    displayName: {
        type: String,
        required: true,
        maxlength: 32,
    },
    channelId: {
        type: String,
        required: true,
        index: true,
    },
    channelName: {
        type: String,
        required: true,
        maxlength: 100,
    },
    // Dados da sessão
    joinTime: {
        type: Date,
        required: true,
        index: true,
    },
    leaveTime: {
        type: Date,
        index: true,
    },
    duration: {
        type: Number,
        min: 0,
    },
    date: {
        type: String,
        required: true,
        index: true,
    },
    // Estado da sessão
    status: {
        type: String,
        enum: ['active', 'completed', 'disconnected'],
        default: 'active',
        index: true,
    },
    // Dados adicionais
    wasDeafened: {
        type: Boolean,
        default: false,
    },
    wasMuted: {
        type: Boolean,
        default: false,
    },
    wasStreaming: {
        type: Boolean,
        default: false,
    },
    wasVideo: {
        type: Boolean,
        default: false,
    },
    guildId: {
        type: String,
        required: true,
        index: true,
    },
}, {
    timestamps: true,
    collection: 'voice_activities',
});
// Índices compostos
VoiceActivitySchema.index({ guildId: 1, joinTime: -1 });
VoiceActivitySchema.index({ userId: 1, joinTime: -1 });
VoiceActivitySchema.index({ channelId: 1, joinTime: -1 });
VoiceActivitySchema.index({ guildId: 1, status: 1, joinTime: -1 });
// TTL index para limpar dados antigos (1 ano)
VoiceActivitySchema.index({ joinTime: 1 }, { expireAfterSeconds: 31536000 });
// Middleware para calcular duração
VoiceActivitySchema.pre('save', function (next) {
    // Calcular duração se leaveTime estiver definido
    if (this.leaveTime && this.joinTime) {
        this.duration = Math.max(0, Math.floor((this.leaveTime.getTime() - this.joinTime.getTime()) / (1000 * 60)));
        // Se há duração, marcar como completed
        if (this.status === 'active') {
            this.status = 'completed';
        }
    }
    next();
});
// Métodos estáticos
VoiceActivitySchema.statics.findActiveSession = function (userId, channelId) {
    return this.findOne({
        userId,
        channelId,
        status: 'active',
    });
};
VoiceActivitySchema.statics.findUserActiveSessions = function (userId) {
    return this.find({
        userId,
        status: 'active',
    });
};
VoiceActivitySchema.statics.endSession = function (userId, channelId, leaveTime = new Date()) {
    return this.findOneAndUpdate({
        userId,
        channelId,
        status: 'active',
    }, {
        $set: {
            leaveTime,
            status: 'completed',
        },
    }, { new: true });
};
VoiceActivitySchema.statics.getUserVoiceStats = function (userId, startDate, endDate) {
    const match = { userId, status: 'completed' };
    if (startDate || endDate) {
        match.joinTime = {};
        if (startDate)
            match.joinTime.$gte = startDate;
        if (endDate)
            match.joinTime.$lte = endDate;
    }
    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                totalMinutes: { $sum: '$duration' },
                avgSessionDuration: { $avg: '$duration' },
                longestSession: { $max: '$duration' },
                shortestSession: { $min: '$duration' },
                channelsUsed: { $addToSet: '$channelId' },
                daysActive: {
                    $addToSet: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$joinTime',
                        },
                    },
                },
            },
        },
        {
            $project: {
                _id: 0,
                totalSessions: 1,
                totalMinutes: 1,
                totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
                avgSessionDuration: { $round: ['$avgSessionDuration', 1] },
                longestSession: 1,
                shortestSession: 1,
                uniqueChannels: { $size: '$channelsUsed' },
                daysActive: { $size: '$daysActive' },
            },
        },
    ]);
};
VoiceActivitySchema.statics.getChannelVoiceStats = function (channelId, startDate, endDate) {
    const match = { channelId, status: 'completed' };
    if (startDate || endDate) {
        match.joinTime = {};
        if (startDate)
            match.joinTime.$gte = startDate;
        if (endDate)
            match.joinTime.$lte = endDate;
    }
    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                totalMinutes: { $sum: '$duration' },
                avgSessionDuration: { $avg: '$duration' },
                uniqueUsers: { $addToSet: '$userId' },
                peakConcurrent: { $max: '$concurrent' }, // Será calculado separadamente
            },
        },
        {
            $project: {
                _id: 0,
                totalSessions: 1,
                totalMinutes: 1,
                totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
                avgSessionDuration: { $round: ['$avgSessionDuration', 1] },
                uniqueUsers: { $size: '$uniqueUsers' },
            },
        },
    ]);
};
VoiceActivitySchema.statics.getVoiceActivityTrends = function (guildId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return this.aggregate([
        {
            $match: {
                guildId,
                joinTime: { $gte: startDate },
                status: 'completed',
            },
        },
        {
            $group: {
                _id: {
                    year: { $year: '$joinTime' },
                    month: { $month: '$joinTime' },
                    day: { $dayOfMonth: '$joinTime' },
                },
                totalSessions: { $sum: 1 },
                totalMinutes: { $sum: '$duration' },
                uniqueUsers: { $addToSet: '$userId' },
                uniqueChannels: { $addToSet: '$channelId' },
            },
        },
        {
            $project: {
                date: {
                    $dateFromParts: {
                        year: '$_id.year',
                        month: '$_id.month',
                        day: '$_id.day',
                    },
                },
                totalSessions: 1,
                totalMinutes: 1,
                totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
                uniqueUsers: { $size: '$uniqueUsers' },
                uniqueChannels: { $size: '$uniqueChannels' },
                avgSessionDuration: {
                    $round: [{ $divide: ['$totalMinutes', '$totalSessions'] }, 1],
                },
                _id: 0,
            },
        },
        { $sort: { date: 1 } },
    ]);
};
VoiceActivitySchema.statics.getHourlyDistribution = function (guildId, startDate, endDate) {
    const match = { guildId, status: 'completed' };
    if (startDate || endDate) {
        match.joinTime = {};
        if (startDate)
            match.joinTime.$gte = startDate;
        if (endDate)
            match.joinTime.$lte = endDate;
    }
    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $hour: '$joinTime' },
                totalSessions: { $sum: 1 },
                totalMinutes: { $sum: '$duration' },
                uniqueUsers: { $addToSet: '$userId' },
            },
        },
        {
            $project: {
                hour: '$_id',
                totalSessions: 1,
                totalMinutes: 1,
                totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
                uniqueUsers: { $size: '$uniqueUsers' },
                avgSessionDuration: {
                    $round: [{ $divide: ['$totalMinutes', '$totalSessions'] }, 1],
                },
                _id: 0,
            },
        },
        { $sort: { hour: 1 } },
    ]);
};
VoiceActivitySchema.statics.getTopVoiceUsers = function (guildId, startDate, endDate, limit = 10) {
    return this.aggregate([
        {
            $match: {
                guildId,
                joinTime: { $gte: startDate, $lte: endDate },
                status: 'completed',
            },
        },
        {
            $group: {
                _id: '$userId',
                username: { $last: '$username' },
                displayName: { $last: '$displayName' },
                totalSessions: { $sum: 1 },
                totalMinutes: { $sum: '$duration' },
                avgSessionDuration: { $avg: '$duration' },
                longestSession: { $max: '$duration' },
                channelsUsed: { $addToSet: '$channelId' },
            },
        },
        {
            $project: {
                userId: '$_id',
                username: 1,
                displayName: 1,
                totalSessions: 1,
                totalMinutes: 1,
                totalHours: { $round: [{ $divide: ['$totalMinutes', 60] }, 2] },
                avgSessionDuration: { $round: ['$avgSessionDuration', 1] },
                longestSession: 1,
                channelsUsed: { $size: '$channelsUsed' },
                _id: 0,
            },
        },
        { $sort: { totalMinutes: -1 } },
        { $limit: limit },
    ]);
};
VoiceActivitySchema.statics.getConcurrentUsers = function (guildId, timestamp) {
    return this.countDocuments({
        guildId,
        joinTime: { $lte: timestamp },
        $or: [
            { leaveTime: { $gte: timestamp } },
            { leaveTime: { $exists: false } },
            { status: 'active' },
        ],
    });
};
// Criar e exportar o modelo
exports.VoiceActivity = mongoose_1.default.model('VoiceActivity', VoiceActivitySchema);
