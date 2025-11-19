// ✅ SPRINT 5 - Task 2: Contact Tag Reader Controller
// Objetivo: Endpoints para ler tags de contactos do AC
import { Request, Response } from 'express';
import { contactTagReaderService } from '../services/ac/contactTagReader.service';

/**
 * GET /api/ac/contact/:email/tags
 * Buscar tags de um contacto no Active Campaign
 */
export const getContactTags = async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email é obrigatório',
      });
    }

    console.log(`[ContactTagReader Controller] GET tags para: ${email}`);

    const contactInfo = await contactTagReaderService.getContactTags(email);

    res.json({
      success: true,
      data: contactInfo,
      meta: {
        totalTags: contactInfo.totalTags,
        productsInferred: contactInfo.products.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[ContactTagReader Controller] Erro ao buscar tags:', error);

    const statusCode = error.message.includes('não encontrado') ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Erro ao buscar tags do contacto',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

/**
 * POST /api/ac/sync-user-tags/:userId
 * Sincronizar tags de um user do AC para o BO
 */
export const syncUserTags = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId é obrigatório',
      });
    }

    console.log(`[ContactTagReader Controller] Sync tags para user: ${userId}`);

    const result = await contactTagReaderService.syncUserTagsFromAC(userId);

    const statusCode = result.success ? 200 : result.synced ? 200 : 500;

    res.status(statusCode).json({
      success: result.success,
      data: result,
      message: result.reason,
      meta: {
        productsUpdated: result.productsUpdated,
        tagsDetected: result.tagsDetected,
        hasErrors: result.errors.length > 0,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[ContactTagReader Controller] Erro no sync:', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao sincronizar tags do user',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

/**
 * POST /api/ac/sync-all-tags
 * Sincronizar todos os users (ADMIN ONLY)
 */
export const syncAllTags = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    // Validar limit
    if (limit > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Limit máximo é 1000',
      });
    }

    console.log(`[ContactTagReader Controller] Sync em massa (limit: ${limit})`);

    const summary = await contactTagReaderService.syncAllUsersFromAC(limit);

    const hasErrors = summary.failed > 0;

    res.json({
      success: !hasErrors || summary.synced > 0,
      data: summary,
      message: hasErrors
        ? `Sync completo com ${summary.failed} erros`
        : 'Sync completo com sucesso',
      meta: {
        successRate:
          summary.totalUsers > 0
            ? ((summary.synced / summary.totalUsers) * 100).toFixed(1) + '%'
            : '0%',
        averageTime:
          summary.totalUsers > 0
            ? Math.round(summary.duration / summary.totalUsers) + 'ms'
            : '0ms',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[ContactTagReader Controller] Erro no sync em massa:', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao sincronizar todos os users',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

/**
 * GET /api/ac/sync-status
 * Verificar status do sistema de sync
 */
export const getSyncStatus = async (req: Request, res: Response) => {
  try {
    // Buscar estatísticas gerais
    const { User } = require('../models/User');
    const { UserProduct } = require('../models/UserProduct');

    const totalUsers = await User.countDocuments();
    const usersWithAC = await UserProduct.countDocuments({
      'activeCampaignData.contactId': { $exists: true },
    });
    const usersWith Tags = await UserProduct.countDocuments({
      'activeCampaignData.tags.0': { $exists: true },
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        usersWithAC,
        usersWithTags,
        coverage: totalUsers > 0 ? ((usersWithAC / totalUsers) * 100).toFixed(1) + '%' : '0%',
        lastCheck: new Date().toISOString(),
      },
      meta: {
        system: 'Contact Tag Reader',
        version: '1.0.0',
        status: 'operational',
      },
    });
  } catch (error: any) {
    console.error('[ContactTagReader Controller] Erro ao verificar status:', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao verificar status',
    });
  }
};

