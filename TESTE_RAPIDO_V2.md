# 🧪 TESTE RÁPIDO - ENDPOINT /api/users/v2

## 🚀 PASSO 1: REINICIAR BACKEND

```bash
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
npm run dev
```

**Verificar logs:**
```
✅ Ligado ao MongoDB
🚀 Servidor iniciado em http://localhost:3001/api
```

---

## 🧪 PASSO 2: TESTAR ENDPOINT

### Teste Básico (PowerShell):
```powershell
curl http://localhost:3001/api/users/v2?page=1&limit=10
```

### Teste Básico (Browser):
Abrir: http://localhost:3001/api/users/v2?page=1&limit=10

**Esperado:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 6478,
    "totalPages": 648,
    "currentPage": 1,
    "limit": 10,
    "hasMore": true,
    "showing": 10
  }
}
```

---

## 🎯 PASSO 3: TESTAR FRONTEND

1. **Abrir Dashboard V2**
   - URL: http://localhost:3000/dashboard-v2 (ou a rota que usar)

2. **Verificar Console do Browser (F12)**
   - **NÃO deve haver**: `404 (Not Found)`
   - **Deve haver**: `✅ [FASE 5] Alunos carregados`

3. **Verificar Tabela**
   - Deve mostrar lista de alunos
   - Deve mostrar contador: "📊 Mostrando 1 a 50 de X alunos"

4. **Testar Filtro Rápido "Em Risco"**
   - Clicar no botão "🚨 Em Risco"
   - Botão deve ficar vermelho (ativo)
   - Tabela deve atualizar com alunos de baixo engagement
   - Console deve mostrar: `⚡ [FASE 2] Quick filter aplicado: at-risk`

5. **Testar Filtro de Progresso**
   - Selecionar "🟠 Alto (60-80%)"
   - Clicar "🔍 Pesquisar"
   - Tabela deve mostrar apenas alunos com progresso entre 60-80%

---

## ✅ CHECKLIST DE VALIDAÇÃO

### Backend:
- [ ] Servidor iniciou sem erros
- [ ] curl retorna 200 OK (não 404)
- [ ] Resposta tem campos `success`, `data`, `pagination`
- [ ] Logs mostram: `🔍 [API /users/v2] Recebendo requisição`

### Frontend:
- [ ] Dashboard carrega sem erro 404
- [ ] Tabela mostra alunos
- [ ] Contador de resultados aparece
- [ ] Filtros Rápidos funcionam
- [ ] Botão "Pesquisar" funciona
- [ ] Paginação funciona

---

## 🐛 SE DER ERRO

### Erro 404 ainda ocorre:
1. Verificar se backend foi reiniciado
2. Verificar porta (deve ser 3001)
3. Testar curl direto: `curl http://localhost:3001/api/users/v2`

### Erro 500:
1. Ver logs do backend no terminal
2. Verificar conexão com MongoDB
3. Verificar que `dualReadService.ts` existe

### Tabela vazia:
1. Verificar se há dados no banco
2. Ver logs: `✅ [API /users/v2] X UserProducts encontrados`
3. Se X = 0, precisa sincronizar dados primeiro

---

## 📊 LOGS ESPERADOS NO BACKEND

Quando frontend chamar o endpoint:

```
🔍 [API /users/v2] Recebendo requisição: { page: '1', limit: '50' }
📊 [API /users/v2] Buscando UserProducts unificados...
✅ [API /users/v2] 6478 UserProducts encontrados
📄 [Paginação] Página 1/130 (50 de 6478 resultados)
✅ [API /users/v2] Resposta enviada com sucesso
```

---

## 🎉 SUCESSO!

Se todos os testes acima passaram:
- ✅ Endpoint criado corretamente
- ✅ Frontend integrado corretamente
- ✅ Filtros funcionam
- ✅ Sistema pronto para uso

---

**Próximo passo**: Testar todos os filtros usando o GUIA_TESTES_FILTROS_V2.md

