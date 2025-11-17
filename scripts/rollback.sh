#!/bin/bash
# =====================================================
# 📁 scripts/rollback.sh
# Rollback para versão anterior
# =====================================================

set -e

APP_NAME="ac-backend"
APP_DIR="/var/www/ac-backend"
BACKUP_DIR="/var/backups/ac-backend"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar root
if [ "$EUID" -ne 0 ]; then 
    log_error "Execute como root (sudo)"
    exit 1
fi

# Listar backups
echo "Backups disponíveis:"
echo ""
ls -lht "$BACKUP_DIR" | grep backup- | head -5
echo ""

# Pedir confirmação
read -p "Deseja fazer rollback para o último backup? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Rollback cancelado"
    exit 0
fi

# Pegar último backup
LAST_BACKUP=$(ls -t "$BACKUP_DIR"/backup-*.tar.gz | head -1)

if [ -z "$LAST_BACKUP" ]; then
    log_error "Nenhum backup encontrado!"
    exit 1
fi

log_info "Rollback para: $LAST_BACKUP"

# Parar aplicação
log_info "Parando aplicação..."
pm2 stop "$APP_NAME"

# Restaurar backup
log_info "Restaurando backup..."
tar -xzf "$LAST_BACKUP" -C "$APP_DIR"

# Reiniciar
log_info "Reiniciando aplicação..."
pm2 restart "$APP_NAME"

# Verificar
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)

if [ "$HTTP_CODE" = "200" ]; then
    log_info "Rollback concluído com sucesso! (HTTP $HTTP_CODE)"
else
    log_error "Aplicação não respondeu após rollback (HTTP $HTTP_CODE)"
    exit 1
fi
