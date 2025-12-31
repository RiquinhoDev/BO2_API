// ════════════════════════════════════════════════════════════
// 📁 src/config/activecampaign.config.ts
// Configurações do Active Campaign
// ════════════════════════════════════════════════════════════

export const activeCampaignConfig = {
  // ⚠️ PREENCHER com dados reais depois
  apiUrl: process.env.AC_API_URL || 'https://serriquinho71518.api-us1.com',
  apiKey: process.env.AC_API_KEY || '001fca1fbd99ae7cddc45db8a0fafa83875697938e53eb9a95be40c083f1a6892098b6a7',
  
  // Configurações de sync
  syncInterval: 24 * 60 * 60 * 1000, // 24 horas
  batchSize: 100,
  
  // Rate limiting
  maxRequestsPerMinute: 120,
  requestDelay: 500,
  
  // Timeouts
  requestTimeout: 30000,
  
  // Retry policy
  maxRetries: 3,
  retryDelay: 2000,
  
  // Webhook
  webhookSecret: process.env.AC_WEBHOOK_SECRET || '',
  
  // Listas default
  lists: {
    clareza: process.env.AC_LIST_CLAREZA || '',
    ogi: process.env.AC_LIST_OGI || ''
  }
}

// Validação
export const validateConfig = (): boolean => {
  const { apiUrl, apiKey } = activeCampaignConfig
  
  if (!apiUrl || !apiKey) {
    console.error('❌ Active Campaign não configurado!')
    console.error('   Defina AC_API_URL e AC_API_KEY no .env')
    return false
  }
  
  return true
}

