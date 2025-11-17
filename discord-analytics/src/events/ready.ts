import { Client, ActivityType } from 'discord.js';
import { logger, logAuditEvent } from '../utils/logger';

export const name = 'ready';
export const once = true;

export async function execute(client: Client): Promise<void> {
  try {
    logger.info(`🤖 Bot conectado como: ${client.user?.tag}`);
    logger.info(`📊 Servindo ${client.guilds.cache.size} servidor(es)`);
    logger.info(`👥 Monitorizando ${client.users.cache.size} utilizador(es)`);

    // Configurar presença do bot
    if (client.user) {
      await client.user.setPresence({
        activities: [{
          name: '📊 Analytics do servidor',
          type: ActivityType.Watching,
        }],
        status: 'online',
      });
      logger.info('✅ Presença do bot configurada');
    }

    // Verificar se o bot está no servidor correto
    const targetGuildId = process.env.DISCORD_GUILD_ID;
    if (targetGuildId) {
      const guild = client.guilds.cache.get(targetGuildId);
      
      if (guild) {
        logger.info(`🏠 Conectado ao servidor: ${guild.name}`);
        logger.info(`👥 Membros do servidor: ${guild.memberCount}`);
        
        // Log dos canais disponíveis
        const textChannels = guild.channels.cache.filter(channel => channel.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(channel => channel.type === 2).size;
        logger.info(`📺 Canais: ${textChannels} texto, ${voiceChannels} voz`);
        
        // Verificar permissões essenciais
        const botMember = guild.members.cache.get(client.user!.id);
        if (botMember) {
          const permissions = botMember.permissions;
          
          // Permissões essenciais para analytics
          const essentialPerms = [
            'ViewChannel',
            'ReadMessageHistory',
            'SendMessages'
          ];
          
          const missingPerms = essentialPerms.filter(perm => !permissions.has(perm as any));
          
          if (missingPerms.length > 0) {
            logger.warn(`⚠️ Permissões em falta: ${missingPerms.join(', ')}`);
            logger.warn('⚠️ Algumas funcionalidades podem não funcionar corretamente');
          } else {
            logger.info('✅ Todas as permissões essenciais estão disponíveis');
          }
          
          // Log de permissões avançadas (opcionais)
          const advancedPerms = [
            'ManageGuild', // Para Server Insights
            'Connect',     // Para analytics de voz
            'Speak'        // Para voice channels
          ];
          
          const missingAdvanced = advancedPerms.filter(perm => !permissions.has(perm as any));
          if (missingAdvanced.length > 0) {
            logger.info(`💡 Permissões opcionais em falta: ${missingAdvanced.join(', ')}`);
          }
        }
        
        // Log de estatísticas do servidor
        const onlineMembers = guild.members.cache.filter(member => 
          member.presence?.status && ['online', 'idle', 'dnd'].includes(member.presence.status)
        ).size;
        
        logger.info(`📈 Estatísticas: ${onlineMembers} membros online de ${guild.memberCount} total`);
        
        // Audit log do startup
        logAuditEvent('BOT_STARTUP', client.user!.id, {
          guildId: guild.id,
          guildName: guild.name,
          memberCount: guild.memberCount,
          onlineMembers
        });
        
      } else {
        logger.error(`❌ Servidor com ID ${targetGuildId} não encontrado!`);
        logger.error('❌ Verificar se o bot foi adicionado ao servidor correto');
        logger.error('❌ Verificar se o DISCORD_GUILD_ID está correto no .env');
        
        // Listar servidores disponíveis para debug
        logger.info('📋 Servidores disponíveis:');
        client.guilds.cache.forEach(guild => {
          logger.info(`   - ${guild.name} (ID: ${guild.id})`);
        });
      }
    } else {
      logger.warn('⚠️ DISCORD_GUILD_ID não definido - bot vai monitorizar todos os servidores');
    }

    // Log de inicialização bem-sucedida
    logger.info('🚀 Discord Analytics Bot totalmente operacional!');
    logger.info(`🕐 Iniciado em: ${new Date().toLocaleString('pt-PT')}`);
    
    // Configurar timer para estatísticas periódicas (opcional)
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const memUsage = process.memoryUsage();
        logger.debug(`📊 Uso de memória: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
      }, 300000); // A cada 5 minutos
    }

  } catch (error) {
    logger.error('❌ Erro crítico no evento ready:', error);
    
    // Em caso de erro crítico, terminar o processo
    process.exit(1);
  }
}