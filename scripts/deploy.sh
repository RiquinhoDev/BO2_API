#!/bin/bash
# =====================================================
# 📁 scripts/deploy.sh
# Script principal de deploy com rollback automático
# =====================================================

set -e # Exit on error

echo "╔════════════════════════════════════════════════╗"
echo "║       🚀 DEPLOY - Active Campaign System       ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Variáveis
APP_NAME="ac-backend"
APP_DIR="/var/www/ac-backend"
BACKUP_DIR="/var/backups/ac-backend"
GIT_REPO="https://github.com/seu-usuario/seu-repo.git"
BRANCH="main"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Funções
log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. Verificar root
if [ "$EUID" -ne 0 ]; then 
    log_error "Execute como root (sudo)"
    exit 1
fi

# 2. Criar backup
log_info "Criando backup..."
BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_FILE" -C "$APP_DIR" . 2>/dev/null || log_warn "Sem versão anterior"
log_info "Backup: $BACKUP_FILE"

# 3. Parar aplicação
log_info "Parando aplicação..."
pm2 stop "$APP_NAME" || log_warn "App não estava rodando"

# 4. Atualizar código
log_info "Atualizando código..."
cd "$APP_DIR"
git fetch origin
git reset --hard "origin/$BRANCH"
git pull origin "$BRANCH"

# 5. Instalar dependências
log_info "Instalando dependências..."
npm ci --production

# 6. Build
log_info "Compilando TypeScript..."
npm run build

# 7. Verificar serviços
log_info "Verificando serviços..."

# MongoDB
if ! pgrep -x "mongod" > /dev/null; then
    log_error "MongoDB não está rodando!"
    exit 1
fi

# Redis (opcional)
if ! pgrep -x "redis-server" > /dev/null; then
    log_warn "Redis não está rodando (continuando...)"
fi

# 8. Reiniciar aplicação
log_info "Reiniciando aplicação..."
pm2 restart "$APP_NAME"

# 9. Aguardar healthcheck
log_info "Aguardando healthcheck..."
sleep 5

MAX_RETRIES=10
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)
    
    if [ "$HTTP_CODE" = "200" ]; then
        log_info "Aplicação respondendo! (HTTP $HTTP_CODE)"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    log_warn "Tentativa $RETRY_COUNT/$MAX_RETRIES - HTTP $HTTP_CODE"
    sleep 3
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log_error "Aplicação não respondeu!"
    log_error "Executando rollback..."
    
    # Rollback
    pm2 stop "$APP_NAME"
    tar -xzf "$BACKUP_FILE" -C "$APP_DIR"
    pm2 restart "$APP_NAME"
    
    log_error "Rollback concluído. Deploy FALHOU!"
    exit 1
fi

# 10. Limpeza
log_info "Limpando backups antigos (>30 dias)..."
find "$BACKUP_DIR" -name "backup-*.tar.gz" -mtime +30 -delete

# 11. Salvar PM2
pm2 save

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║        ✅ DEPLOY CONCLUÍDO COM SUCESSO!         ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "📊 Logs: pm2 logs $APP_NAME"
echo "🏥 Health: curl http://localhost:3001/api/health"
echo ""
