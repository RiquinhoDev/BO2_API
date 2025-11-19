// ✅ SPRINT 5 - Task 1: Contact Tag Reader Service
// Objetivo: Ler tags de contactos do AC e sincronizar com BO
import { acService } from './activeCampaign.service';
import { User, IUser } from '../../models/User';
import { UserProduct, IUserProduct } from '../../models/UserProduct';
import { Product } from '../../models/Product';

// ═══════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════

export interface ContactTagInfo {
  contactId: string;
  email: string;
  tags: TagInfo[];
  products: ProductInference[];
  totalTags: number;
  systemTags: number;
  manualTags: number;
  lastSyncAt: Date;
}

export interface TagInfo {
  id: number;
  tag: string;
  origin: 'system' | 'manual';
  createdAt?: string;
  productInferred?: string; // Código do produto inferido
}

export interface ProductInference {
  productCode: string;
  productName?: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  tags: string[];
}

export interface SyncResult {
  success: boolean;
  synced: boolean;
  userId: string;
  email: string;
  reason?: string;
  productsUpdated: number;
  tagsDetected: number;
  tagsAdded: string[];
  tagsRemoved: string[];
  errors: string[];
}

export interface SyncSummary {
  totalUsers: number;
  synced: number;
  failed: number;
  skipped: number;
  productsUpdated: number;
  tagsDetected: number;
  duration: number;
  errors: Array<{ userId: string; error: string }>;
}

// ═══════════════════════════════════════════════════════
// CONTACT TAG READER SERVICE
// ═══════════════════════════════════════════════════════

class ContactTagReaderService {
  /**
   * Buscar todas as tags de um contacto no Active Campaign por email
   */
  async getContactTags(email: string): Promise<ContactTagInfo> {
    console.log(`[ContactTagReader] Buscando tags para: ${email}`);

    try {
      // 1. Buscar contacto no AC por email
      const contact = await acService.findOrCreateContact(email);

      if (!contact || !contact.id) {
        throw new Error(`Contacto não encontrado no AC: ${email}`);
      }

      console.log(`[ContactTagReader] Contacto encontrado: ${contact.id}`);

      // 2. Buscar tags do contacto
      const contactTags = await acService.getContactTags(contact.id);

      console.log(`[ContactTagReader] Tags encontradas: ${contactTags.length}`);

      // 3. Processar tags e inferir produtos
      const tags: TagInfo[] = contactTags.map((ct: any) => {
        const tagName = ct.tag || ct.name || '';
        const origin = this.detectTagOrigin(tagName);
        const productInferred = this.inferProductFromTag(tagName);

        return {
          id: ct.id,
          tag: tagName,
          origin,
          createdAt: ct.cdate || ct.createdAt,
          productInferred,
        };
      });

      // 4. Inferir produtos das tags
      const products = this.inferProducts(tags);

      // 5. Contar tags por origem
      const systemTags = tags.filter((t) => t.origin === 'system').length;
      const manualTags = tags.filter((t) => t.origin === 'manual').length;

      const result: ContactTagInfo = {
        contactId: contact.id,
        email,
        tags,
        products,
        totalTags: tags.length,
        systemTags,
        manualTags,
        lastSyncAt: new Date(),
      };

      console.log(`[ContactTagReader] Resultado:`, {
        totalTags: result.totalTags,
        productsInferred: result.products.length,
      });

      return result;
    } catch (error: any) {
      console.error(`[ContactTagReader] Erro ao buscar tags:`, error);
      throw new Error(`Erro ao buscar tags do contacto ${email}: ${error.message}`);
    }
  }

  /**
   * Sincronizar tags de um user do AC para o BO
   */
  async syncUserTagsFromAC(userId: string): Promise<SyncResult> {
    console.log(`[ContactTagReader] Sync tags para user: ${userId}`);

    const result: SyncResult = {
      success: false,
      synced: false,
      userId,
      email: '',
      productsUpdated: 0,
      tagsDetected: 0,
      tagsAdded: [],
      tagsRemoved: [],
      errors: [],
    };

    try {
      // 1. Buscar user no BO
      const user = await User.findById(userId).lean();

      if (!user) {
        result.reason = 'User não encontrado no BO';
        return result;
      }

      result.email = user.email;

      console.log(`[ContactTagReader] User encontrado: ${user.email}`);

      // 2. Buscar tags no AC
      const contactInfo = await this.getContactTags(user.email);

      result.tagsDetected = contactInfo.totalTags;

      // 3. Buscar UserProducts do user
      const userProducts = await UserProduct.find({ userId }).populate('productId');

      if (userProducts.length === 0) {
        result.reason = 'User não tem produtos associados';
        result.synced = true;
        result.success = true;
        return result;
      }

      console.log(`[ContactTagReader] UserProducts encontrados: ${userProducts.length}`);

      // 4. Para cada UserProduct, atualizar tags do AC
      for (const up of userProducts) {
        try {
          const product =
            typeof up.productId === 'object' ? up.productId : await Product.findById(up.productId);

          if (!product) continue;

          // Tags relevantes para este produto
          const productTags = contactInfo.tags.filter(
            (t) =>
              t.productInferred === product.code ||
              t.tag.toLowerCase().includes(product.code.toLowerCase()) ||
              t.tag.toLowerCase().includes(product.name.toLowerCase())
          );

          if (productTags.length === 0) continue;

          // Atualizar UserProduct
          const currentTags = up.activeCampaignData?.tags || [];
          const newTags = productTags.map((t) => t.tag);

          // Tags adicionadas
          const added = newTags.filter((t) => !currentTags.includes(t));
          const removed = currentTags.filter((t) => !newTags.includes(t));

          if (added.length > 0 || removed.length > 0) {
            // Atualizar tags
            if (!up.activeCampaignData) {
              up.activeCampaignData = {
                contactId: contactInfo.contactId,
                tags: [],
              };
            }

            up.activeCampaignData.tags = newTags;
            up.activeCampaignData.lastSyncAt = new Date();

            // Atualizar engagement status baseado nas tags
            const hasActiveTag = newTags.some((t) => t.toLowerCase().includes('active'));
            const hasInactiveTag = newTags.some((t) => t.toLowerCase().includes('inactiv'));

            if (hasActiveTag) {
              if (!up.engagement) {
                up.engagement = {
                  lastActivityAt: new Date(),
                  loginCount: 0,
                };
              }
              // Não sobrescrever se já houver dados
            }

            if (hasInactiveTag && up.engagement) {
              // Marcar como possivelmente inativo (mas manter dados de engagement)
            }

            await up.save();

            result.productsUpdated++;
            result.tagsAdded.push(...added);
            result.tagsRemoved.push(...removed);

            console.log(`[ContactTagReader] UserProduct atualizado:`, {
              product: product.name,
              tagsAdded: added,
              tagsRemoved: removed,
            });
          }
        } catch (error: any) {
          console.error(`[ContactTagReader] Erro ao atualizar UserProduct:`, error);
          result.errors.push(`Erro ao atualizar produto: ${error.message}`);
        }
      }

      result.synced = true;
      result.success = result.errors.length === 0;
      result.reason = result.success ? 'Sync completo com sucesso' : 'Sync com erros parciais';

      console.log(`[ContactTagReader] Sync resultado:`, {
        productsUpdated: result.productsUpdated,
        tagsAdded: result.tagsAdded.length,
        errors: result.errors.length,
      });

      return result;
    } catch (error: any) {
      console.error(`[ContactTagReader] Erro no sync:`, error);
      result.errors.push(error.message);
      result.reason = `Erro no sync: ${error.message}`;
      return result;
    }
  }

  /**
   * Sincronizar todos os users do BO com tags do AC (em massa)
   */
  async syncAllUsersFromAC(limit: number = 100): Promise<SyncSummary> {
    console.log(`[ContactTagReader] Sync em massa iniciado (limit: ${limit})`);

    const startTime = Date.now();

    const summary: SyncSummary = {
      totalUsers: 0,
      synced: 0,
      failed: 0,
      skipped: 0,
      productsUpdated: 0,
      tagsDetected: 0,
      duration: 0,
      errors: [],
    };

    try {
      // Buscar users (limit)
      const users = await User.find().select('_id email').limit(limit).lean();

      summary.totalUsers = users.length;

      console.log(`[ContactTagReader] Users para sync: ${users.length}`);

      // Sync cada user (com rate limiting)
      for (let i = 0; i < users.length; i++) {
        const user = users[i];

        try {
          console.log(
            `[ContactTagReader] Sync ${i + 1}/${users.length}: ${user.email}`
          );

          const result = await this.syncUserTagsFromAC(user._id.toString());

          if (result.success) {
            summary.synced++;
            summary.productsUpdated += result.productsUpdated;
            summary.tagsDetected += result.tagsDetected;
          } else if (result.synced) {
            summary.skipped++;
          } else {
            summary.failed++;
            summary.errors.push({
              userId: user._id.toString(),
              error: result.reason || 'Erro desconhecido',
            });
          }

          // Rate limiting: aguardar 100ms entre requests
          if (i < users.length - 1) {
            await this.delay(100);
          }
        } catch (error: any) {
          console.error(`[ContactTagReader] Erro no sync do user ${user.email}:`, error);
          summary.failed++;
          summary.errors.push({
            userId: user._id.toString(),
            error: error.message,
          });
        }
      }

      summary.duration = Date.now() - startTime;

      console.log(`[ContactTagReader] Sync em massa completo:`, {
        synced: summary.synced,
        failed: summary.failed,
        duration: `${summary.duration}ms`,
      });

      return summary;
    } catch (error: any) {
      console.error(`[ContactTagReader] Erro no sync em massa:`, error);
      summary.duration = Date.now() - startTime;
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ═══════════════════════════════════════════════════════

  /**
   * Detectar origem da tag (system vs manual)
   */
  private detectTagOrigin(tagName: string): 'system' | 'manual' {
    const systemPatterns = [
      /^OGI_/i,
      /^CLAREZA_/i,
      /^LEVEL_/i,
      /^INATIVO_/i,
      /^REENGAGEMENT_/i,
      /_\d+D$/i, // Ex: INATIVO_7D
    ];

    for (const pattern of systemPatterns) {
      if (pattern.test(tagName)) {
        return 'system';
      }
    }

    return 'manual';
  }

  /**
   * Inferir produto da tag
   */
  private inferProductFromTag(tagName: string): string | undefined {
    const tagLower = tagName.toLowerCase();

    if (tagLower.includes('ogi') || tagLower.includes('investimento')) {
      return 'OGI';
    }

    if (tagLower.includes('clareza') || tagLower.includes('relatorio')) {
      return 'CLAREZA';
    }

    if (tagLower.includes('discord')) {
      return 'DISCORD';
    }

    return undefined;
  }

  /**
   * Inferir produtos com base nas tags
   */
  private inferProducts(tags: TagInfo[]): ProductInference[] {
    const productMap = new Map<string, ProductInference>();

    tags.forEach((tag) => {
      if (!tag.productInferred) return;

      if (!productMap.has(tag.productInferred)) {
        productMap.set(tag.productInferred, {
          productCode: tag.productInferred,
          productName: this.getProductName(tag.productInferred),
          confidence: 'medium',
          reason: 'Inferido de tags',
          tags: [],
        });
      }

      const product = productMap.get(tag.productInferred)!;
      product.tags.push(tag.tag);

      // Aumentar confiança se há múltiplas tags
      if (product.tags.length >= 3) {
        product.confidence = 'high';
      }
    });

    return Array.from(productMap.values());
  }

  /**
   * Get product name from code
   */
  private getProductName(code: string): string {
    const names: Record<string, string> = {
      OGI: 'O Grande Investimento',
      CLAREZA: 'Relatórios Clareza',
      DISCORD: 'Discord Community',
    };

    return names[code] || code;
  }

  /**
   * Delay helper para rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton
export const contactTagReaderService = new ContactTagReaderService();
