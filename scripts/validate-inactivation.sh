#!/bin/bash

# Script para validar dados de inativação (Guru vs CursEduca)
# Uso: bash scripts/validate-inactivation.sh [base_url]
# Exemplo: bash scripts/validate-inactivation.sh https://api.backoffice.serriquinho.com

BASE_URL="${1:-http://localhost:3001}"
API="${BASE_URL}/api"
TOKEN="${2:-}" # Token JWT opcional para endpoints protegidos

echo "🔍 VALIDANDO DADOS DE INATIVAÇÃO GURU + CURSEDUCA"
echo "=================================================="
echo "API: $API"
echo ""

# Função helper para fazer requests
make_request() {
  local method=$1
  local endpoint=$2
  local data=$3

  if [ -z "$data" ]; then
    curl -s -X "$method" "$API$endpoint" \
      -H "Content-Type: application/json" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"}
  else
    curl -s -X "$method" "$API$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"}
  fi
}

# ════════════════════════════════════════════════════════════
# 1. LISTAR USERS MARCADOS PARA INATIVAR (Guru)
# ════════════════════════════════════════════════════════════

echo "1️⃣ GURU INACTIVATION - Users marcados para inativar"
echo "   GET $API/guru/inactivation/pending"
echo ""

PENDING=$(make_request "GET" "/guru/inactivation/pending")

if echo "$PENDING" | grep -q "error\|Error"; then
  echo "❌ Erro ao chamar endpoint:"
  echo "$PENDING" | head -20
else
  COUNT=$(echo "$PENDING" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
  TOTAL=$(echo "$PENDING" | grep -o '"total":[0-9]*' | grep -o '[0-9]*')

  echo "✅ Resposta recebida"
  echo "   - Marcados para inativar: $COUNT"
  echo "   - Total na BD: $TOTAL"
  echo ""
  echo "$PENDING" | head -50
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# ════════════════════════════════════════════════════════════
# 2. ESTATÍSTICAS DE INATIVAÇÃO
# ════════════════════════════════════════════════════════════

echo "2️⃣ GURU INACTIVATION - Estatísticas"
echo "   GET $API/guru/inactivation/stats"
echo ""

STATS=$(make_request "GET" "/guru/inactivation/stats")

if echo "$STATS" | grep -q "error\|Error"; then
  echo "❌ Erro ao chamar endpoint:"
  echo "$STATS" | head -20
else
  echo "✅ Resposta recebida:"
  echo "$STATS" | head -50
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# ════════════════════════════════════════════════════════════
# 3. RESUMO E VALIDAÇÃO
# ════════════════════════════════════════════════════════════

echo "📊 RESUMO DE VALIDAÇÃO"
echo ""
echo "Interface mostra: 61 marcados para inativar"
echo "API retorna:     $COUNT marcados para inativar"
echo ""

if [ "$COUNT" = "61" ]; then
  echo "✅ ✅ ✅ DADOS CONFEREM! ✅ ✅ ✅"
else
  echo "⚠️  DIVERGÊNCIA DETECTADA!"
  echo "   Diferença: $((61 - COUNT)) registos"
fi

echo ""
echo "💡 PRÓXIMOS PASSOS:"
echo "   - Se OK: Proceder com inativação em massa (POST /guru/inactivation/bulk)"
echo "   - Se NOK: Executar diagnóstico (POST /guru/inactivation/diagnose)"
