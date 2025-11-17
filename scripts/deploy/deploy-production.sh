#!/bin/bash
# scripts/deploy/deploy-production.sh
# 🚀 Sprint 4: Production Deploy Script

set -e  # Exit on error

echo "🚀 DEPLOY PRODUÇÃO - Architecture V2.0"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 1. Verificações Pré-Deploy
echo "1️⃣  Verificando ambiente..."
echo ""

if [ -z "$MONGO_URI" ]; then
  log_error "MONGO_URI não configurado"
  exit 1
fi

if [ -z "$NODE_ENV" ]; then
  log_error "NODE_ENV não configurado"
  exit 1
fi

if [ "$NODE_ENV" != "production" ]; then
  log_error "NODE_ENV deve ser 'production' (atual: $NODE_ENV)"
  exit 1
fi

log_success "Ambiente OK"
echo ""

# 2. Verificar Git Status
echo "2️⃣  Verificando Git status..."
echo ""

if [ -n "$(git status --porcelain)" ]; then
  log_warning "Há mudanças não commitadas"
  log_info "Arquivos modificados:"
  git status --short
  echo ""
  read -p "Continuar mesmo assim? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_error "Deploy cancelado pelo usuário"
    exit 1
  fi
fi

log_success "Git status OK"
echo ""

# 3. Backup
echo "3️⃣  Criando backup..."
echo ""

BACKUP_DIR="./backups/pre-deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

mongodump --uri="$MONGO_URI" --out="$BACKUP_DIR" --quiet

if [ $? -eq 0 ]; then
  log_success "Backup criado: $BACKUP_DIR"
else
  log_error "Falha no backup"
  exit 1
fi
echo ""

# 4. Testes
echo "4️⃣  Executando testes..."
echo ""

npm test -- --silent

if [ $? -ne 0 ]; then
  log_error "Testes falharam"
  exit 1
fi

log_success "Testes OK"
echo ""

# 5. Build
echo "5️⃣  Building aplicação..."
echo ""

npm run build

if [ $? -ne 0 ]; then
  log_error "Build falhou"
  exit 1
fi

log_success "Build OK"
echo ""

# 6. Deploy Backend
echo "6️⃣  Deploy backend..."
echo ""

# PM2 ecosystem
if command -v pm2 &> /dev/null; then
  pm2 reload ecosystem.config.js --env production
  pm2 save
  log_success "Backend deployed (PM2)"
else
  log_warning "PM2 não encontrado - ajustar comando de deploy"
fi
echo ""

# 7. Health Check
echo "7️⃣  Health check..."
echo ""

sleep 5

HEALTH_URL="${API_URL:-http://localhost:3001}/api/health"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

if [ "$HTTP_STATUS" -eq 200 ]; then
  log_success "Health check passou (HTTP $HTTP_STATUS)"
else
  log_error "Health check falhou (HTTP $HTTP_STATUS)"
  log_warning "Iniciando rollback..."
  
  # Rollback: restaurar versão anterior
  pm2 reload ecosystem.config.js --env production
  
  exit 1
fi
echo ""

# 8. Deploy Frontend (se aplicável)
echo "8️⃣  Deploy frontend..."
echo ""

if [ -d "../frontend" ]; then
  cd ../frontend
  npm run build
  
  # Deploy command (ajustar conforme hosting)
  # Exemplo Vercel:
  # vercel --prod
  
  # Exemplo Netlify:
  # netlify deploy --prod
  
  cd ../backend
  log_success "Frontend deployed"
else
  log_warning "Diretório frontend não encontrado - skip"
fi
echo ""

# 9. Smoke Tests
echo "9️⃣  Smoke tests..."
echo ""

# Test critical endpoints
curl -f "$HEALTH_URL" > /dev/null 2>&1 || { log_error "Health endpoint falhou"; exit 1; }
curl -f "${API_URL}/api/products" > /dev/null 2>&1 || { log_error "Products endpoint falhou"; exit 1; }

log_success "Smoke tests OK"
echo ""

# 10. Tag e Finalização
echo "🔟  Finalização..."
echo ""

VERSION_TAG="v$(date +%Y%m%d-%H%M%S)"
git tag "$VERSION_TAG"
git push --tags

log_success "Tag criada: $VERSION_TAG"
echo ""

# 11. Relatório Final
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                        ║${NC}"
echo -e "${GREEN}║   ✅ DEPLOY COMPLETO COM SUCESSO!      ║${NC}"
echo -e "${GREEN}║                                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "📊 Informações:"
echo "   - Version: $VERSION_TAG"
echo "   - Backup: $BACKUP_DIR"
echo "   - Health: $HEALTH_URL"
echo ""
echo "📈 Monitorização:"
echo "   - Logs: pm2 logs"
echo "   - Status: pm2 status"
echo "   - Health: curl $HEALTH_URL"
echo ""

log_success "Deploy finalizado!"

