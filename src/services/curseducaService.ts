// src/services/curseducaService.ts - ESTRATÉGIA V2 COMPLETA
import axios from 'axios';
import User, { Course } from '../models/user';
import UserProduct from '../models/UserProduct';
import Product from '../models/Product';

const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL;
const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_AccessToken;
const CURSEDUCA_API_KEY = process.env.CURSEDUCA_API_KEY;

interface CursEducaGroup {
  id: number;
  uuid?: string;
  name: string;
  description?: string;
}

interface CursEducaMember {
  memberId?: number;
  memberUuid?: string;
  id?: number;
  uuid?: string;
  name: string;
  email: string;
  groupId: number;
  groupName: string;
  enrolledAt?: string;
  expiresAt?: string;
  progress?: number;
  lastAccess?: string;
  status?: string;
}

/**
 * Mapeia grupos do CursEduca para códigos de produtos
 */
function mapCursEducaGroupToProduct(groupId: string, groupName: string): Course | null {
  const mapping: Record<string, Course> = {
    '4': Course.CLAREZA, // Clareza = groupId 4
    '5': Course.OGI_V1,  // OGI = groupId 5 (ajustar conforme necessário)
    // Adicionar mais mapeamentos conforme necessário
  };
  
  const course = mapping[groupId];
  
  if (!course) {
    console.log(`⚠️  Grupo não mapeado: ${groupId} (${groupName})`);
  }
  
  return course || null;
}

/**
 * SINCRONIZAÇÃO CURSEDUCA - ESTRATÉGIA V2
 * 
 * ETAPA 1: Buscar grupos (/groups)
 * ETAPA 2: Para cada grupo, buscar membros COM progresso (/reports/group/members)
 * ETAPA 3: Criar/atualizar User (V1) + Product + UserProduct (V2)
 */
export const syncCursEducaStudents = async () => {
  try {
    console.log('🔄 SINCRONIZAÇÃO CURSEDUCA - ESTRATÉGIA V2');
    console.log('='.repeat(80));
    console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-PT')}`);
    console.log(`🌐 API URL: ${CURSEDUCA_API_URL}`);
    console.log(`🔑 API Key: ${CURSEDUCA_API_KEY ? '✅ Configurada' : '❌ Falta configurar'}`);
    console.log(`🎫 Access Token: ${CURSEDUCA_ACCESS_TOKEN ? '✅ Configurado' : '❌ Falta configurar'}`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // ETAPA 1: BUSCAR TODOS OS GRUPOS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📚 ETAPA 1: Buscando grupos...\n');
    
    const groupsResponse = await axios.get(`${CURSEDUCA_API_URL}/groups`, {
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'api_key': CURSEDUCA_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📦 Estrutura da resposta de grupos:', {
      statusCode: groupsResponse.status,
      isArray: Array.isArray(groupsResponse.data),
      hasDataProperty: !!groupsResponse.data?.data,
      keys: Object.keys(groupsResponse.data || {})
    });
    
    // Extrair array de grupos (suporta múltiplas estruturas)
    const groups: CursEducaGroup[] = Array.isArray(groupsResponse.data) 
      ? groupsResponse.data 
      : groupsResponse.data?.data || groupsResponse.data?.groups || [];
    
    console.log(`✅ ${groups.length} grupos encontrados`);
    
    if (groups.length > 0) {
      console.log('📄 Exemplo do primeiro grupo:');
      console.log(JSON.stringify(groups[0], null, 2));
    }
    
    if (groups.length === 0) {
      console.log('⚠️  Nenhum grupo encontrado. Abortando sincronização.');
      return {
        success: false,
        message: 'Nenhum grupo encontrado',
        stats: { created: 0, updated: 0, skipped: 0, errors: 0 }
      };
    }
    
    // Contadores globais
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    // ═══════════════════════════════════════════════════════════════════════
    // ETAPA 2: PARA CADA GRUPO, BUSCAR MEMBROS COM PROGRESSO
    // ═══════════════════════════════════════════════════════════════════════
    for (const group of groups) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📚 Processando grupo: ${group.name} (ID: ${group.id})`);
      console.log('='.repeat(80));
      
      // Mapear grupo para curso
      const course = mapCursEducaGroupToProduct(group.id.toString(), group.name);
      
      if (!course) {
        console.log(`⏭️  SKIP: Grupo "${group.name}" não mapeado para nenhum produto`);
        totalSkipped++;
        continue;
      }
      
      console.log(`   🎯 Mapeado para: ${course}`);
      
      try {
        // Buscar membros deste grupo COM progresso
        console.log(`   📡 Buscando membros...`);
        
        const membersResponse = await axios.get(
          `${CURSEDUCA_API_URL}/reports/group/members`,
          {
            params: { groupId: group.id },
            headers: {
              'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
              'api_key': CURSEDUCA_API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('📦 Estrutura da resposta de membros:', {
          statusCode: membersResponse.status,
          isArray: Array.isArray(membersResponse.data),
          hasDataProperty: !!membersResponse.data?.data,
          keys: Object.keys(membersResponse.data || {})
        });
        
        // Extrair array de membros
        const members: CursEducaMember[] = Array.isArray(membersResponse.data)
          ? membersResponse.data
          : membersResponse.data?.data || membersResponse.data?.members || [];
        
        console.log(`   ✅ ${members.length} membros encontrados`);
        
        if (members.length > 0) {
          console.log('   📄 Exemplo do primeiro membro:');
          console.log(JSON.stringify(members[0], null, 2));
        }
        
        if (members.length === 0) {
          console.log(`   ⚠️  Nenhum membro neste grupo\n`);
          continue;
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // ETAPA 3: PROCESSAR CADA MEMBRO
        // ═══════════════════════════════════════════════════════════════════════
        for (let i = 0; i < members.length; i++) {
          const member = members[i];
          
          console.log(`\n   [${i + 1}/${members.length}] ${member.email || member.name || 'SEM EMAIL'}`);
          
          try {
            // Validar email
            if (!member.email) {
              console.log(`      ⚠️  SKIP: Sem email`);
              totalSkipped++;
              continue;
            }
            
            const email = member.email.toLowerCase().trim();
            
            // ─────────────────────────────────────────────────────────────
            // 3.1: CRIAR/ATUALIZAR USER (V1)
            // ─────────────────────────────────────────────────────────────
            let user = await User.findOne({ email });
            
            if (!user) {
              console.log(`      ➕ CRIAR novo user`);
              
              user = await User.create({
                email,
                name: member.name || email,
                curseduca: {
                  curseducaUserId: (member.memberId || member.id)?.toString(),
                  curseducaUuid: member.memberUuid || member.uuid,
                  email,
                  groupId: group.id.toString(),
                  groupUuid: group.uuid,
                  groupName: group.name,
                  groupCurseducaId: group.id,
                  groupCurseducaUuid: group.uuid,
                  enrollmentDate: member.enrolledAt ? new Date(member.enrolledAt) : new Date(),
                  expiresAt: member.expiresAt ? new Date(member.expiresAt) : null,
                  courses: [course],
                  progress: {
                    estimatedProgress: member.progress || 0,
                    progressSource: 'curseduca_reports'
                  },
                  lastAccess: member.lastAccess ? new Date(member.lastAccess) : new Date(),
                  memberStatus: member.status || 'ACTIVE'
                }
              });
              
              totalCreated++;
              console.log(`      ✅ User criado: ${user._id}`);
            } else {
              console.log(`      🔄 ATUALIZAR user existente: ${user._id}`);
              
              if (!user.curseduca) {
                user.curseduca = {} as any;
              }
              
              // Atualizar dados CursEduca
              user.curseduca.curseducaUserId = (member.memberId || member.id)?.toString();
              user.curseduca.curseducaUuid = member.memberUuid || member.uuid;
              user.curseduca.groupId = group.id.toString();
              user.curseduca.groupUuid = group.uuid;
              user.curseduca.groupName = group.name;
              user.curseduca.groupCurseducaId = group.id;
              user.curseduca.groupCurseducaUuid = group.uuid;
              
              if (member.enrolledAt) {
                user.curseduca.enrollmentDate = new Date(member.enrolledAt);
              }
              
              if (member.expiresAt) {
                user.curseduca.expiresAt = new Date(member.expiresAt);
              }
              
              // Adicionar curso se não existir
              if (!user.curseduca.courses) {
                user.curseduca.courses = [];
              }
              if (!user.curseduca.courses.includes(course)) {
                user.curseduca.courses.push(course);
              }
              
              // Atualizar progresso
              if (!user.curseduca.progress) {
                user.curseduca.progress = {} as any;
              }
              user.curseduca.progress.estimatedProgress = member.progress || 0;
              user.curseduca.progress.progressSource = 'curseduca_reports';
              
              // Atualizar último acesso
              if (member.lastAccess) {
                user.curseduca.lastAccess = new Date(member.lastAccess);
              }
              
              // Atualizar status
              user.curseduca.memberStatus = member.status || 'ACTIVE';
              
              await user.save();
              totalUpdated++;
              console.log(`      ✅ User atualizado`);
            }
            
            // ─────────────────────────────────────────────────────────────
            // 3.2: CRIAR/ATUALIZAR PRODUCT
            // ─────────────────────────────────────────────────────────────
            let product = await Product.findOne({ code: course });
            
            if (!product) {
              product = await Product.create({
                code: course,
                name: group.name,
                platform: 'curseduca',
                platformData: {
                  groupId: group.id.toString(),
                  groupUuid: group.uuid,
                  groupName: group.name
                },
                isActive: true
              });
              console.log(`      ✅ Produto criado: ${product._id}`);
            }
            
            // ─────────────────────────────────────────────────────────────
            // 3.3: CRIAR/ATUALIZAR USERPRODUCT (V2)
            // ─────────────────────────────────────────────────────────────
            const existingUserProduct = await UserProduct.findOne({
              userId: user._id,
              productId: product._id
            });
            
            if (existingUserProduct) {
              // Atualizar UserProduct existente
              existingUserProduct.platformData = {
                platformId: 'CURSEDUCA',
                externalUserId: (member.memberId || member.id)?.toString(),
                externalProductId: group.id.toString()
              };
              
              existingUserProduct.progress = {
                current: member.progress || 0,
                total: 100,
                percentage: member.progress || 0,
                completedClasses: existingUserProduct.progress?.completedClasses || [],
                lastUpdated: new Date()
              };
              
              existingUserProduct.status = member.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
              existingUserProduct.isActive = member.status === 'ACTIVE';
              existingUserProduct.lastActivityDate = member.lastAccess 
                ? new Date(member.lastAccess) 
                : new Date();
              
              if (member.expiresAt) {
                existingUserProduct.expirationDate = new Date(member.expiresAt);
              }
              
              await existingUserProduct.save();
              console.log(`      ✅ UserProduct atualizado`);
            } else {
              // Criar novo UserProduct
              await UserProduct.create({
                userId: user._id,
                productId: product._id,
                platformData: {
                  platformId: 'CURSEDUCA',
                  externalUserId: (member.memberId || member.id)?.toString(),
                  externalProductId: group.id.toString()
                },
                progress: {
                  current: member.progress || 0,
                  total: 100,
                  percentage: member.progress || 0,
                  completedClasses: [],
                  lastUpdated: new Date()
                },
                status: member.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
                isActive: member.status === 'ACTIVE',
                enrollmentDate: member.enrolledAt ? new Date(member.enrolledAt) : new Date(),
                expirationDate: member.expiresAt ? new Date(member.expiresAt) : null,
                lastActivityDate: member.lastAccess ? new Date(member.lastAccess) : new Date()
              });
              
              console.log(`      ✅ UserProduct criado`);
            }
            
          } catch (error: any) {
            totalErrors++;
            console.error(`      ❌ Erro: ${error.message}`);
          }
        }
        
      } catch (error: any) {
        console.error(`   ❌ Erro ao buscar membros do grupo "${group.name}": ${error.message}`);
        if (error.response) {
          console.error(`   📡 Status HTTP: ${error.response.status}`);
          console.error(`   📄 Resposta: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        }
        totalErrors++;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // RESUMO FINAL
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMO DA SINCRONIZAÇÃO');
    console.log('='.repeat(80));
    console.log(`📚 Grupos processados: ${groups.length}`);
    console.log(`➕ Users criados: ${totalCreated}`);
    console.log(`🔄 Users atualizados: ${totalUpdated}`);
    console.log(`⏭️  Ignorados: ${totalSkipped}`);
    console.log(`❌ Erros: ${totalErrors}`);
    console.log('='.repeat(80));
    
    return {
      success: true,
      stats: {
        groupsProcessed: groups.length,
        created: totalCreated,
        updated: totalUpdated,
        skipped: totalSkipped,
        errors: totalErrors
      }
    };
    
  } catch (error: any) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ ERRO CRÍTICO NA SINCRONIZAÇÃO');
    console.error('='.repeat(80));
    console.error(`Mensagem: ${error.message}`);
    if (error.response) {
      console.error(`Status HTTP: ${error.response.status}`);
      console.error(`Resposta: ${JSON.stringify(error.response.data).substring(0, 500)}`);
    }
    console.error('='.repeat(80));
    
    throw error;
  }
};

/**
 * Buscar grupos do CursEduca
 */
export const fetchCursEducaGroups = async () => {
  try {
    console.log('📡 Fetching CursEduca groups...');
    
    const response = await axios.get(`${CURSEDUCA_API_URL}/groups`, {
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'api_key': CURSEDUCA_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    const groups = Array.isArray(response.data) 
      ? response.data 
      : response.data?.data || response.data?.groups || [];
    
    console.log(`✅ ${groups.length} groups fetched`);
    return groups;
  } catch (error) {
    console.error('❌ Error fetching groups:', error);
    throw error;
  }
};

/**
 * Testar conexão com CursEduca
 */
export const testCurseducaConnection = async () => {
  try {
    console.log('🔌 Testando conexão com CursEduca...');
    console.log(`   URL: ${CURSEDUCA_API_URL}`);
    console.log(`   API Key: ${CURSEDUCA_API_KEY ? '✅' : '❌'}`);
    console.log(`   Token: ${CURSEDUCA_ACCESS_TOKEN ? '✅' : '❌'}`);
    
    const response = await axios.get(`${CURSEDUCA_API_URL}/groups`, {
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'api_key': CURSEDUCA_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log(`✅ Conexão bem-sucedida! Status: ${response.status}`);
    return { success: true, status: response.status, message: 'Conexão OK' };
  } catch (error: any) {
    console.error('❌ Erro na conexão:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    return { success: false, error: error.message };
  }
};

/**
 * Sincronizar membros (alias para syncCursEducaStudents)
 */
export const syncCurseducaMembers = syncCursEducaStudents;

/**
 * Sincronizar progresso (placeholder - já incluído em syncCursEducaStudents)
 */
export const syncCurseducaProgress = async () => {
  console.log('ℹ️  syncCurseducaProgress: Progresso já sincronizado via syncCursEducaStudents');
  return { success: true, message: 'Use syncCursEducaStudents para sincronização completa' };
};

/**
 * Obter estatísticas do dashboard CursEduca
 */
export const getCurseducaDashboardStats = async () => {
  try {
    console.log('📊 [DASHBOARD] Calculando estatísticas CursEduca...');
    
    const curseducaProducts = await Product.find({
      platform: 'curseduca',
      isActive: true
    });
    
    const totalUsers = await User.countDocuments({
      'curseduca.email': { $exists: true }
    });
    
    const activeUsers = await User.countDocuments({
      'curseduca.memberStatus': 'ACTIVE'
    });
    
    const totalUserProducts = await UserProduct.countDocuments({
      productId: { $in: curseducaProducts.map(p => p._id) }
    });
    
    console.log('✅ Estatísticas calculadas');
    
    return {
      totalUsers,
      activeUsers,
      totalUserProducts,
      products: curseducaProducts.length
    };
  } catch (error: any) {
    console.error('❌ Erro ao calcular estatísticas:', error.message);
    throw error;
  }
};
