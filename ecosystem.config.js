// =====================================================
// 📁 ecosystem.config.js
// Configuração PM2 para produção com cluster mode
// =====================================================

module.exports = {
  apps: [
    {
      name: 'ac-backend',
      script: './dist/server.js',
      instances: 3, // 3 instâncias em cluster
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001,
      },
      
      // Logs
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto-restart
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Kill timeout
      kill_timeout: 5000,
      
      // Listen timeout
      listen_timeout: 10000,
      
      // Graceful shutdown
      shutdown_with_message: true,
      
      // Cron restart (reiniciar toda noite às 4h)
      cron_restart: '0 4 * * *',
      
      // Post update hooks
      post_update: ['npm install', 'npm run build'],
      
      // Environment variables
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      }
    }
  ],
  
  // Deploy configuration
  deploy: {
    production: {
      user: 'deploy',
      host: 'seu-servidor.com',
      ref: 'origin/main',
      repo: 'git@github.com:seu-usuario/seu-repo.git',
      path: '/var/www/ac-backend',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
}
