// discord-analytics/src/models/index.ts
// 🎯 FICHEIRO PARA INICIALIZAR TODOS OS MODELOS

import './DiscordActivity';
import './UserEngagement';
import './ServerStats';
import './VoiceActivity';

console.log('✅ Modelos do Discord Analytics carregados');

// Exportar modelos para uso
export { DiscordActivity } from './DiscordActivity';
export { UserEngagement } from './UserEngagement';
export { ServerStats } from './ServerStats';
export { VoiceActivity } from './VoiceActivity';

// Opcional: Criar índices se não existirem
import mongoose from 'mongoose';

export async function ensureIndexes(): Promise<void> {
  try {
    console.log('🔄 Verificando índices...');
    
    // DiscordActivity indexes
    await mongoose.model('DiscordActivity').ensureIndexes();
    
    // UserEngagement indexes
    await mongoose.model('UserEngagement').ensureIndexes();
    
    // ServerStats indexes
    await mongoose.model('ServerStats').ensureIndexes();
    
    // VoiceActivity indexes
    await mongoose.model('VoiceActivity').ensureIndexes();
    
    console.log('✅ Índices verificados/criados');
  } catch (error) {
    console.error('❌ Erro ao criar índices:', error);
  }
}