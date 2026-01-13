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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Script simples para verificar produtos de utilizadores
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";
async function main() {
    console.log('A conectar...');
    await mongoose_1.default.connect(MONGO_URI);
    console.log('Conectado!\n');
    const { User, UserProduct } = await Promise.resolve().then(() => __importStar(require('../src/models')));
    const emails = [
        'andregaspar1996@gmail.com',
        'jcarmovaz@gmail.com',
        'joaopmgomes.1995@gmail.com',
        'francinamoreira@sapo.pt',
        'antlusilva@gmail.com'
    ];
    console.log('Verificando produtos de cada utilizador:\n');
    for (const email of emails) {
        const user = await User.findOne({ email }).lean();
        if (!user) {
            console.log(`${email}: NAO ENCONTRADO`);
            continue;
        }
        const userProducts = await UserProduct.find({ userId: user._id })
            .populate('productId', 'code name')
            .lean();
        console.log(`${email}:`);
        if (userProducts.length === 0) {
            console.log('   - Nenhum produto');
        }
        else {
            for (const up of userProducts) {
                const productCode = up.productId?.code || 'N/A';
                console.log(`   - ${productCode} (${up.status})`);
            }
        }
        console.log('');
    }
    await mongoose_1.default.disconnect();
    console.log('Feito!');
}
main().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
