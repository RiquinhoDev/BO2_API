"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logAuditEvent = logAuditEvent;
const winston_1 = __importDefault(require("winston"));
const fs_1 = __importDefault(require("fs"));
const logDir = './logs';
if (!fs_1.default.existsSync(logDir)) {
    fs_1.default.mkdirSync(logDir, { recursive: true });
}
exports.logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })),
    transports: [
        new winston_1.default.transports.File({ filename: `${logDir}/error.log`, level: 'error' }),
        new winston_1.default.transports.File({ filename: `${logDir}/combined.log` }),
        new winston_1.default.transports.Console()
    ]
});
function logAuditEvent(action, userId, details) {
    exports.logger.info(`Audit: ${action}`, { userId, ...details });
}
