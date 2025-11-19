import axios from 'axios';
import User, { Course } from '../models/user';
import UserProduct from '../models/UserProduct';
import Product from '../models/Product';

const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL;
const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_AccessToken;

interface CursEducaStudent {
  id: number;
  email: string;
  name: string;
  enrollmentDate: string;
  groupId: string;
  groupName: string;
  progress?: number;
  lastAccess?: string;
}

interface CursEducaGroup {
  id: number;
  name: string;
  description?: string;
}

/**
 * Mapeia grupos do CursEduca para códigos de produtos
 */
function mapCursEducaGroupToProduct(groupId: string, groupName: string): Course | null {
  const mapping: Record<string, Course> = {
    '4': Course.CLAREZA, // Clareza = groupId 4
    // Adicionar mais mapeamentos conforme necessário
  };
  
  const course = mapping[groupId];
  
  if (!course) {
    console.log(`⚠️  Grupo não mapeado: ${groupId} (${groupName})`);
  }
  
  return course || null;
}

/**
 * Sincroniza estudantes do CursEduca
 * Atualiza TANTO User (V1) quanto UserProduct (V2)
 */
export const syncCursEducaStudents = async () => {
  try {
    console.log('🔄 Iniciando sincronização CursEduca...');
    console.log('='.repeat(70));
    
    // 1. Fetch students from CursEduca API
    console.log('\n📡 Fetching students from CursEduca API...\n');
    
    const response = await axios.get(`${CURSEDUCA_API_URL}/api/students`, {
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const students: CursEducaStudent[] = response.data;
    console.log(`✅ ${students.length} students fetched from CursEduca`);
    
    // 2. Process each student
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const student of students) {
      try {
        // Map CursEduca group to product
        const course = mapCursEducaGroupToProduct(student.groupId, student.groupName);
        
        if (!course) {
          skipped++;
          continue;
        }
        
        // Find or create user
        let user = await User.findOne({ email: student.email });
        
        if (!user) {
          // Create new user
          user = await User.create({
            email: student.email,
            name: student.name,
            curseduca: {
              email: student.email,
              enrollmentDate: new Date(student.enrollmentDate),
              courses: [course],
              progress: student.progress,
              lastAccess: student.lastAccess ? new Date(student.lastAccess) : undefined
            },
            consolidatedCourses: [course],
            allPlatforms: [Platform.CURSEDUCA]
          });
          
          created++;
          console.log(`✅ Created: ${student.email}`);
        } else {
          // Update existing user (V1 structure)
          user.curseduca = {
            email: student.email,
            enrollmentDate: new Date(student.enrollmentDate),
            courses: [course],
            progress: student.progress,
            lastAccess: student.lastAccess ? new Date(student.lastAccess) : undefined
          };
          
          // Update consolidated courses
          const allCourses = [
            ...(user.discord?.courses || []),
            ...(user.hotmart?.courses || []),
            ...(user.curseduca?.courses || [])
          ];
          user.consolidatedCourses = Array.from(new Set(allCourses));
          
          // Update platforms
          if (!user.allPlatforms.includes(Platform.CURSEDUCA)) {
            user.allPlatforms.push(Platform.CURSEDUCA);
          }
          
          // Update lastActivityDate
          const lastAccess = student.lastAccess ? new Date(student.lastAccess) : new Date();
          if (!user.lastActivityDate || lastAccess > user.lastActivityDate) {
            user.lastActivityDate = lastAccess;
          }
          
          await user.save();
          updated++;
          console.log(`✅ Updated: ${student.email}`);
        }
        
        // V2: Create/Update UserProduct
        const product = await Product.findOne({ code: course });
        
        if (product) {
          const existingUserProduct = await UserProduct.findOne({
            userId: user._id,
            productId: product._id
          });
          
          if (existingUserProduct) {
            // Update existing UserProduct
            existingUserProduct.platformData = {
              platformId: 'CURSEDUCA',
              externalUserId: student.id.toString(),
              externalProductId: student.groupId
            };
            
            existingUserProduct.progress = {
              current: student.progress || 0,
              total: 100,
              percentage: student.progress || 0,
              completedClasses: [],
              lastUpdated: new Date()
            };
            
            existingUserProduct.lastActivityDate = student.lastAccess 
              ? new Date(student.lastAccess) 
              : new Date();
            
            await existingUserProduct.save();
          } else {
            // Create new UserProduct
            await UserProduct.create({
              userId: user._id,
              productId: product._id,
              platformData: {
                platformId: 'CURSEDUCA',
                externalUserId: student.id.toString(),
                externalProductId: student.groupId
              },
              progress: {
                current: student.progress || 0,
                total: 100,
                percentage: student.progress || 0,
                completedClasses: [],
                lastUpdated: new Date()
              },
              isActive: true,
              enrollmentDate: new Date(student.enrollmentDate),
              lastActivityDate: student.lastAccess 
                ? new Date(student.lastAccess) 
                : new Date()
            });
          }
        }
        
      } catch (error) {
        errors++;
        console.error(`❌ Error processing ${student.email}:`, error);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('\n📊 SYNC RESULTS:');
    console.log(`Total students: ${students.length}`);
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log('\n✅ CursEduca sync complete!\n');
    
    return {
      success: true,
      stats: { created, updated, skipped, errors }
    };
    
  } catch (error) {
    console.error('❌ Error in CursEduca sync:', error);
    throw error;
  }
};

/**
 * Fetch groups from CursEduca
 * Para debug e verificação de mapeamentos
 */
export const fetchCursEducaGroups = async () => {
  try {
    console.log('📡 Fetching CursEduca groups...');
    
    const response = await axios.get(`${CURSEDUCA_API_URL}/api/groups`, {
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const groups: CursEducaGroup[] = response.data;
    
    console.log(`\n✅ ${groups.length} groups found:\n`);
    
    groups.forEach(group => {
      const mapped = mapCursEducaGroupToProduct(group.id.toString(), group.name);
      const status = mapped ? '✅ MAPPED' : '⚠️  NOT MAPPED';
      
      console.log(`${status} - ID: ${group.id}, Name: ${group.name}${mapped ? ` → ${mapped}` : ''}`);
    });
    
    return groups;
    
  } catch (error) {
    console.error('❌ Error fetching CursEduca groups:', error);
    throw error;
  }
};

/**
 * 🧪 Testa conexão com a API CursEduca
 */
export const testCurseducaConnection = async () => {
  try {
    if (!CURSEDUCA_API_URL || !CURSEDUCA_ACCESS_TOKEN) {
      return {
        success: false,
        message: '❌ Credenciais CursEduca não configuradas',
        details: {
          hasUrl: !!CURSEDUCA_API_URL,
          hasToken: !!CURSEDUCA_ACCESS_TOKEN
        }
      }
    }

    // Tenta buscar grupos como teste de conexão
    const response = await axios.get(`${CURSEDUCA_API_URL}/api/groups`, {
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    })

    return {
      success: true,
      message: '✅ Conexão CursEduca estabelecida com sucesso',
      details: {
        apiUrl: CURSEDUCA_API_URL,
        groupsFound: response.data?.length || 0,
        timestamp: new Date().toISOString()
      }
    }
  } catch (error: any) {
    return {
      success: false,
      message: `❌ Erro ao conectar à CursEduca: ${error.message}`,
      details: {
        error: error.response?.data || error.message,
        status: error.response?.status
      }
    }
  }
}

/**
 * 🔄 Sincroniza membros do CursEduca (alias para syncCursEducaStudents)
 */
export const syncCurseducaMembers = async () => {
  try {
    const result = await syncCursEducaStudents()
    return {
      success: true,
      message: '✅ Sincronização de membros completa',
      data: result
    }
  } catch (error: any) {
    return {
      success: false,
      message: `❌ Erro ao sincronizar membros: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * 📊 Sincroniza progresso dos estudantes (placeholder por agora)
 */
export const syncCurseducaProgress = async () => {
  try {
    // TODO: Implementar quando a API CursEduca disponibilizar endpoint de progresso
    console.log('⚠️ Sincronização de progresso ainda não implementada pela API CursEduca')
    
    return {
      success: true,
      message: '⚠️ Sincronização de progresso não disponível',
      note: 'A API CursEduca ainda não fornece dados de progresso detalhados'
    }
  } catch (error: any) {
    return {
      success: false,
      message: `❌ Erro ao sincronizar progresso: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * 📊 Obtém estatísticas do dashboard CursEduca
 */
export const getCurseducaDashboardStats = async () => {
  try {
    console.log('📊 [DASHBOARD] Calculando estatísticas...')
    
    // Buscar users do CursEduca
    const curseducaUsers = await User.find({
      'curseduca.curseducaUserId': { $exists: true, $ne: null }
    })
    
    // Buscar produtos CursEduca
    const curseducaProducts = await Product.find({
      platform: 'curseduca',
      isActive: true
    })
    
    // Buscar UserProducts relacionados
    const userProducts = await UserProduct.find({
      productId: { $in: curseducaProducts.map(p => p._id) }
    })
    
    // Calcular estatísticas
    const totalUsers = curseducaUsers.length
    const activeUsers = curseducaUsers.filter(u => 
      u.curseduca?.lastActivity && 
      (Date.now() - new Date(u.curseduca.lastActivity).getTime()) < 30 * 24 * 60 * 60 * 1000
    ).length
    
    const totalEnrollments = userProducts.length
    const activeEnrollments = userProducts.filter(up => up.status === 'ACTIVE').length
    
    // Breakdown por grupo
    const groupBreakdown: Record<string, number> = {}
    curseducaUsers.forEach(user => {
      const groupName = user.curseduca?.groupName || 'Sem Grupo'
      groupBreakdown[groupName] = (groupBreakdown[groupName] || 0) + 1
    })
    
    const stats = {
      success: true,
      message: '✅ Estatísticas calculadas com sucesso',
      data: {
        overview: {
          totalUsers,
          activeUsers,
          inactiveUsers: totalUsers - activeUsers,
          totalEnrollments,
          activeEnrollments
        },
        products: curseducaProducts.map(p => ({
          id: p._id,
          code: p.code,
          name: p.name,
          enrollments: userProducts.filter(up => up.productId.toString() === p._id.toString()).length
        })),
        groupBreakdown,
        timestamp: new Date().toISOString()
      }
    }
    
    console.log('✅ [DASHBOARD] Estatísticas:', {
      totalUsers,
      activeUsers,
      products: curseducaProducts.length,
      groups: Object.keys(groupBreakdown).length
    })
    
    return stats
  } catch (error: any) {
    console.error('❌ [DASHBOARD] Erro ao calcular estatísticas:', error)
    return {
      success: false,
      message: `❌ Erro ao buscar estatísticas: ${error.message}`,
      error: error.message
    }
  }
}