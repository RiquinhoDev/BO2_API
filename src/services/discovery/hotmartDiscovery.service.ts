/**
 * 🔥 HOTMART DISCOVERY SERVICE - Versão Simplificada
 */

import Product from '../../models/product/Product';
import { 
  DiscoveredProduct, 
  ProductCategory,
  ProductConfidence,
  CATEGORY_PATTERNS 
} from '../../types/discovery.types';

export class HotmartDiscoveryService {
  
  /**
   * 🎯 DISCOVERY PRINCIPAL
   */
  async discoverNewProducts(): Promise<DiscoveredProduct[]> {
    try {
      console.log('🔍 Iniciando discovery Hotmart...');

      // 1. Buscar produtos da API Hotmart
      const allHotmartProducts = await this.getHotmartProducts();
      
      // 2. Filtrar produtos já existentes
      const existingIds = await this.getExistingProductIds();
      const newProducts = allHotmartProducts.filter(
        product => !existingIds.includes(product.id.toString())
      );

      console.log(`🆕 ${newProducts.length} produtos novos encontrados`);

      // 3. Processar produtos novos
      const discoveredProducts: DiscoveredProduct[] = [];
      for (const product of newProducts) {
        try {
          const discovered = this.processProduct(product);
          discoveredProducts.push(discovered);
          console.log(`✅ Processado: ${discovered.detectedName}`);
        } catch (error: any) {
          console.error(`❌ Erro ao processar ${product.id}:`, error);
        }
      }

      return discoveredProducts;

    } catch (error: any) {
      console.error('❌ Erro no discovery:', error);
      throw new Error(`Discovery falhou: ${error.message}`);
    }
  }

  /**
   * 📞 Buscar produtos da API Hotmart
   */
  private async getHotmartProducts(): Promise<any[]> {
    // ⚠️ MOCK - Implementar integração real aqui
    // TODO: Integrar com sua API Hotmart existente
    console.log('📦 Usando dados MOCK - Integre com API Hotmart real');
    
    return [
      {
        id: '999999',
        name: 'Biblioteca Premium 2025',
        description: 'Acesso a 500+ cursos de investimento',
        totalSales: 156,
        price: 197
      },
      {
        id: '888888', 
        name: 'Trading Masterclass Pro',
        description: 'Curso completo de trading',
        totalSales: 89,
        price: 497
      }
    ];
  }

  /**
   * 🗄️ IDs de produtos já existentes
   */
  private async getExistingProductIds(): Promise<string[]> {
    const products = await Product.find({ 
      platform: 'hotmart',
      isActive: true 
    }).select('hotmartProductId').lean();
    
    return products
      .filter(p => p.hotmartProductId)
      .map(p => p.hotmartProductId);
  }

  /**
   * 🧠 Processar produto individual
   */
  private processProduct(apiProduct: any): DiscoveredProduct {
    const category = this.inferCategory(apiProduct.name, apiProduct.description);
    const code = this.generateCode(apiProduct.name);
    const confidence = this.calculateConfidence(apiProduct);
    const insights = this.generateInsights(apiProduct, confidence);

    return {
      platform: 'hotmart',
      externalId: apiProduct.id.toString(),
      detectedName: this.cleanName(apiProduct.name),
      suggestedCode: code,
      suggestedCategory: category,
      confidence,
      discoveredAt: new Date(),
      rawData: apiProduct,
      insights
    };
  }

  /**
   * 🏷️ Gerar código único
   */
  private generateCode(name: string): string {
    if (!name) return 'PRODUTO_NOVO';

    return name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 20)
      .replace(/^_+|_+$/g, '') || 'PRODUTO_' + Date.now().toString().slice(-4);
  }

  /**
   * 📛 Limpar nome
   */
  private cleanName(name: string): string {
    return name?.trim()?.replace(/\s+/g, ' ')?.slice(0, 100) || 'Produto sem nome';
  }

  /**
   * 🎨 Inferir categoria
   */
  private inferCategory(name: string, description?: string): ProductCategory {
    const text = (name + ' ' + (description || '')).toLowerCase();
    
    for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
      if (pattern.test(text)) {
        return category as ProductCategory;
      }
    }
    
    return 'outros';
  }

  /**
   * 🎯 Calcular confiança
   */
  private calculateConfidence(apiProduct: any): ProductConfidence {
    let score = 30;
    const reasons: string[] = [];

    // Nome válido
    if (apiProduct.name?.length > 5) {
      score += 25;
      reasons.push('Nome válido');
    }

    // Descrição
    if (apiProduct.description?.length > 20) {
      score += 20;
      reasons.push('Descrição presente');
    }

    // Vendas
    if (apiProduct.totalSales > 0) {
      score += 20;
      reasons.push(`${apiProduct.totalSales} vendas`);
    }

    // Preço
    if (apiProduct.price > 0) {
      score += 5;
      reasons.push('Preço definido');
    }

    let level: 'low' | 'medium' | 'high';
    if (score >= 80) level = 'high';
    else if (score >= 60) level = 'medium';
    else level = 'low';

    return { score: Math.min(score, 100), level, reasons };
  }

  /**
   * 💡 Gerar insights
   */
  private generateInsights(apiProduct: any, confidence: ProductConfidence): string[] {
    const insights: string[] = [];

    if (confidence.level === 'high') {
      insights.push('✅ Alta confiança - pronto para configuração');
    } else if (confidence.level === 'medium') {
      insights.push('🔶 Confiança média - revisar dados');
    } else {
      insights.push('⚠️ Baixa confiança - verificar manualmente');
    }

    if (apiProduct.totalSales > 100) {
      insights.push(`🔥 Produto popular - ${apiProduct.totalSales} vendas`);
    }

    insights.push('🤖 Configuração automática disponível');

    return insights;
  }
}

export const hotmartDiscoveryService = new HotmartDiscoveryService();
export default hotmartDiscoveryService;

