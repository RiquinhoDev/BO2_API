/**
 * 🔍 DISCOVERY SYSTEM TYPES - Versão Simplificada
 */

// Produto descoberto
export interface DiscoveredProduct {
  platform: 'hotmart' | 'curseduca';
  externalId: string;
  detectedName: string;
  suggestedCode: string;
  suggestedCategory: ProductCategory;
  confidence: ProductConfidence;
  discoveredAt: Date;
  rawData: any;
  insights: string[];
}

// Confiança do discovery
export interface ProductConfidence {
  score: number; // 0-100
  level: 'low' | 'medium' | 'high';
  reasons: string[];
}

// Categorias disponíveis
export type ProductCategory = 
  | 'biblioteca' 
  | 'investimento' 
  | 'desenvolvimento' 
  | 'marketing' 
  | 'educacao' 
  | 'outros';

// Resultado do discovery
export interface DiscoveryResult {
  hotmartProducts: DiscoveredProduct[];
  totalFound: number;
  executionTime: number;
  lastRun: Date;
  summary: {
    highConfidenceItems: number;
    readyToConfigureItems: number;
  };
}

// Configuração para criar produto
export interface ProductConfigurationData {
  productData: {
    code: string;
    name: string;
    description: string;
    platform: 'hotmart' | 'curseduca';
    hotmartProductId?: string;
    curseducaGroupId?: string;
    isActive: boolean;
  };
  
  profileData: {
    name: string;
    code: string;
    durationDays: number;
    reengagementLevels: Array<{
      level: number;
      name: string;
      daysInactive: number;
      tagAC: string;
      cooldownDays: number;
      tone: string;
    }>;
    progressDefinition: {
      countsAsProgress: string[];
    };
    settings: {
      enableAutoEscalation: boolean;
      enableAutoRemoval: boolean;
    };
  };
  
  activeCampaignConfig: {
    tagPrefix: string;
    listId?: string;
  };
}

// Patterns para categorizar produtos
export const CATEGORY_PATTERNS = {
  'biblioteca': /biblioteca|acesso|premium|collection|vault/i,
  'investimento': /investimento|trading|bolsa|trader|financeiro|ogi|grande.investimento/i,
  'desenvolvimento': /clareza|desenvolvimento|pessoal|mindset|coaching|crescimento/i,
  'marketing': /marketing|vendas|digital|afiliado|traffic|leads/i,
  'educacao': /curso|aula|educacao|ensino|formacao|training/i
};

// Templates de reengajamento por categoria
export const REENGAGEMENT_TEMPLATES = {
  biblioteca: {
    durationDays: 365,
    levels: [
      { level: 1, daysInactive: 30, name: 'Descoberta', tone: 'curious', cooldownDays: 14 },
      { level: 2, daysInactive: 90, name: 'Valor', tone: 'helpful', cooldownDays: 30 }
    ],
    actions: ['LOGIN', 'CONTENT_ACCESSED', 'DOWNLOAD']
  },
  investimento: {
    durationDays: 90,
    levels: [
      { level: 1, daysInactive: 7, name: 'Lembrete', tone: 'friendly', cooldownDays: 5 },
      { level: 2, daysInactive: 30, name: 'Urgência', tone: 'urgent', cooldownDays: 10 }
    ],
    actions: ['LOGIN', 'LESSON_COMPLETED', 'QUIZ_COMPLETED']
  },
  desenvolvimento: {
    durationDays: 90,
    levels: [
      { level: 1, daysInactive: 3, name: 'Check-in', tone: 'gentle', cooldownDays: 3 }
    ],
    actions: ['LOGIN', 'REPORT_OPENED', 'ANALYSIS_COMPLETED']
  },
  default: {
    durationDays: 120,
    levels: [
      { level: 1, daysInactive: 14, name: 'Reengajamento', tone: 'friendly', cooldownDays: 10 }
    ],
    actions: ['LOGIN', 'CONTENT_ACCESSED']
  }
};

// Validadores
export function validateConfigurationData(config: any): config is ProductConfigurationData {
  return config?.productData?.code && config?.profileData?.name;
}

