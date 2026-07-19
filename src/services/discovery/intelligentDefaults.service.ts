/**
 * 🧠 INTELLIGENT DEFAULTS SERVICE
 */

import { 
  ProductConfigurationData, 
  DiscoveredProduct,
  ProductCategory,
  REENGAGEMENT_TEMPLATES 
} from '../../types/discovery.types';

export class IntelligentDefaultsService {

  /**
   * 🎯 Gerar configuração completa para produto
   */
  generateConfiguration(product: DiscoveredProduct): ProductConfigurationData {
    const template = REENGAGEMENT_TEMPLATES[product.suggestedCategory] || 
                    REENGAGEMENT_TEMPLATES.default;

    return {
      productData: {
        code: product.suggestedCode,
        name: product.detectedName,
        description: this.generateDescription(product),
        platform: product.platform,
        hotmartProductId: product.platform === 'hotmart' ? product.externalId : undefined,
        isActive: true
      },

      profileData: {
        name: `${product.detectedName} - Reengajamento`,
        code: product.suggestedCode,
        durationDays: template.durationDays,
        reengagementLevels: template.levels.map(level => ({
          level: level.level,
          name: level.name,
          daysInactive: level.daysInactive,
          tagAC: `${product.suggestedCode}_${level.daysInactive}D`,
          cooldownDays: level.cooldownDays,
          tone: level.tone
        })),
        progressDefinition: {
          countsAsProgress: template.actions
        },
        settings: {
          enableAutoEscalation: true,
          enableAutoRemoval: true
        }
      },

      activeCampaignConfig: {
        tagPrefix: product.suggestedCode,
        listId: this.getDefaultListId(product.suggestedCategory)
      }
    };
  }

  /**
   * 📝 Gerar descrição automática
   */
  private generateDescription(product: DiscoveredProduct): string {
    const categoryLabels = {
      'biblioteca': 'biblioteca de conteúdos',
      'investimento': 'educação financeira', 
      'desenvolvimento': 'desenvolvimento pessoal',
      'marketing': 'marketing digital',
      'educacao': 'educação online',
      'outros': 'produto educacional'
    };

    const label = categoryLabels[product.suggestedCategory] || 'produto';
    return `Produto de ${label} detectado automaticamente. Configurado para reengajamento inteligente com base na categoria ${product.suggestedCategory}.`;
  }

  /**
   * 📋 Lista padrão por categoria
   */
  private getDefaultListId(category: ProductCategory): string {
    const listMap: Record<ProductCategory, string> = {
      'biblioteca': '1',
      'investimento': '2', 
      'desenvolvimento': '3',
      'marketing': '1',
      'educacao': '1',
      'outros': '1'
    };

    return listMap[category] || '1';
  }
}

export const intelligentDefaultsService = new IntelligentDefaultsService();
export default intelligentDefaultsService;
