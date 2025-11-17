import { Request, Response } from 'express';
import User from '../models/User';
import UserProduct from '../models/UserProduct';
import Product from '../models/Product';

/**
 * GET /api/dashboard/stats
 * 
 * Retorna estatísticas consolidadas do dashboard
 * Combina dados V1 (User) e V2 (UserProduct) para garantir consistência
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    console.log('📊 Fetching dashboard stats...');
    
    // Usar aggregation pipeline para performance
    const stats = await User.aggregate([
      {
        $facet: {
          // Total de users
          totalUsers: [
            { $count: 'count' }
          ],
          
          // Breakdown por plataforma
          platformBreakdown: [
            {
              $group: {
                _id: null,
                discord: {
                  $sum: {
                    $cond: [
                      { $ifNull: ['$discord.userId', false] },
                      1,
                      0
                    ]
                  }
                },
                hotmart: {
                  $sum: {
                    $cond: [
                      { $ifNull: ['$hotmart.email', false] },
                      1,
                      0
                    ]
                  }
                },
                curseduca: {
                  $sum: {
                    $cond: [
                      { $ifNull: ['$curseduca.email', false] },
                      1,
                      0
                    ]
                  }
                }
              }
            }
          ],
          
          // Breakdown por curso (consolidatedCourses)
          courseBreakdown: [
            { $unwind: { path: '$consolidatedCourses', preserveNullAndEmptyArrays: false } },
            {
              $group: {
                _id: '$consolidatedCourses',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],
          
          // Multi-platform users
          multiPlatform: [
            {
              $match: {
                $expr: {
                  $gt: [
                    { $size: { $ifNull: ['$allPlatforms', []] } },
                    1
                  ]
                }
              }
            },
            { $count: 'count' }
          ],
          
          // Breakdown de combinações de plataformas
          platformCombinations: [
            {
              $match: {
                $expr: {
                  $gt: [
                    { $size: { $ifNull: ['$allPlatforms', []] } },
                    1
                  ]
                }
              }
            },
            {
              $group: {
                _id: '$allPlatforms',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);
    
    // Format response
    const response = {
      success: true,
      data: {
        totalUsers: stats[0].totalUsers[0]?.count || 0,
        
        platforms: {
          discord: stats[0].platformBreakdown[0]?.discord || 0,
          hotmart: stats[0].platformBreakdown[0]?.hotmart || 0,
          curseduca: stats[0].platformBreakdown[0]?.curseduca || 0
        },
        
        courses: stats[0].courseBreakdown.map((c: any) => ({
          name: c._id,
          count: c.count
        })),
        
        multiPlatform: {
          total: stats[0].multiPlatform[0]?.count || 0,
          combinations: stats[0].platformCombinations.map((combo: any) => ({
            platforms: combo._id,
            count: combo.count
          }))
        }
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Dashboard stats fetched successfully');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/dashboard/stats/v2
 * 
 * Retorna estatísticas usando Architecture V2 (UserProduct)
 * Para comparação e validação da migração
 */
export const getDashboardStatsV2 = async (req: Request, res: Response) => {
  try {
    console.log('📊 Fetching dashboard stats (V2)...');
    
    // Check se UserProducts existem
    const totalUserProducts = await UserProduct.countDocuments();
    
    if (totalUserProducts === 0) {
      return res.json({
        success: true,
        data: {
          message: 'Architecture V2 not migrated yet',
          totalUserProducts: 0
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Aggregation usando UserProduct
    const stats = await UserProduct.aggregate([
      {
        $facet: {
          // Total UserProducts
          total: [
            { $count: 'count' }
          ],
          
          // Breakdown por produto
          byProduct: [
            {
              $lookup: {
                from: 'products',
                localField: 'productId',
                foreignField: '_id',
                as: 'product'
              }
            },
            { $unwind: '$product' },
            {
              $group: {
                _id: '$product.code',
                count: { $sum: 1 },
                productName: { $first: '$product.name' }
              }
            },
            { $sort: { count: -1 } }
          ],
          
          // Breakdown por plataforma
          byPlatform: [
            {
              $group: {
                _id: '$platformData.platformId',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],
          
          // Active users
          activeUsers: [
            {
              $match: {
                isActive: true
              }
            },
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    const response = {
      success: true,
      data: {
        totalUserProducts: stats[0].total[0]?.count || 0,
        
        byProduct: stats[0].byProduct.map((p: any) => ({
          code: p._id,
          name: p.productName,
          count: p.count
        })),
        
        byPlatform: stats[0].byPlatform.map((p: any) => ({
          platformId: p._id,
          count: p.count
        })),
        
        activeUsers: stats[0].activeUsers[0]?.count || 0
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Dashboard stats V2 fetched successfully');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error fetching dashboard stats V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics (V2)',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

