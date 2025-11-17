#!/bin/bash
# =====================================================
# 📁 scripts/backup.sh
# Backup diário do MongoDB
# =====================================================

set -e

BACKUP_DIR="/var/backups/mongodb"
DATE=$(date +%Y%m%d-%H%M%S)
DB_NAME="ac-system"

mkdir -p "$BACKUP_DIR"

echo "🗄️  Iniciando backup do MongoDB..."

# Backup
mongodump --db "$DB_NAME" --out "$BACKUP_DIR/dump-$DATE"

# Comprimir
tar -czf "$BACKUP_DIR/mongodb-$DATE.tar.gz" -C "$BACKUP_DIR" "dump-$DATE"

# Remover dump descomprimido
rm -rf "$BACKUP_DIR/dump-$DATE"

# Limpar backups antigos (>7 dias)
find "$BACKUP_DIR" -name "mongodb-*.tar.gz" -mtime +7 -delete

echo "✅ Backup concluído: $BACKUP_DIR/mongodb-$DATE.tar.gz"
