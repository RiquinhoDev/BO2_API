# 🧪 GUIA DE TESTES MANUAIS E2E

**Data:** 19 Novembro 2025  
**Versão:** 1.0  
**Tempo Estimado:** 2-3 horas

---

## 📋 PRÉ-REQUISITOS

### Ambiente

```bash
✅ Backend rodando: http://localhost:3001
✅ Frontend rodando: http://localhost:3000
✅ MongoDB acessível
✅ Active Campaign API configurada (VITE_AC_API_KEY)
✅ User de teste criado com produtos
```

### Setup Inicial

```bash
# 1. Iniciar backend
cd BO2_API
npm run dev

# 2. Iniciar frontend (nova janela)
cd Front
npm run dev

# 3. Verificar health
curl http://localhost:3001/health
# Esperado: { "status": "ok" }
```

---

## 🔥 TESTE 1: SPRINT 5 - CONTACT TAG READER

### 1.1. Navegação e UI

**Tempo:** 5 minutos

```
✅ Checklist:

1. [ ] Abrir http://localhost:3000/activecampaign
2. [ ] Verificar tab "Tags Reader" aparece (2ª tab)
3. [ ] Badge "NEW" verde está visível
4. [ ] Ícone Tag aparece na tab
5. [ ] Clicar na tab "Tags Reader"
6. [ ] Página carrega em < 3 segundos
7. [ ] Header "Tags Reader" aparece
8. [ ] Search box com input email visível
9. [ ] Botão "Buscar" visível
10. [ ] Info box "Como Usar" aparece
```

**Critérios de Aceitação:**
- ✅ Todos os elementos UI aparecem
- ✅ Layout responsivo funciona
- ✅ Sem erros no console

---

### 1.2. Busca de Tags

**Tempo:** 10 minutos

```
✅ Teste com Email Válido:

1. [ ] Inserir email de teste: test@example.com
2. [ ] Clicar "Buscar"
3. [ ] Loading spinner aparece
4. [ ] Mensagem "A carregar tags..." visível
5. [ ] Após < 5s, resultados aparecem
6. [ ] Card "Informações do Contacto" visível
7. [ ] Email exibido corretamente
8. [ ] Contact ID aparece
9. [ ] Total tags exibido (número)
10. [ ] System tags vs Manual tags separados
```

```
✅ Teste Enter Key:

1. [ ] Limpar search (se houver botão Limpar)
2. [ ] Inserir email test@example.com
3. [ ] Pressionar Enter
4. [ ] Busca é iniciada
5. [ ] Resultados aparecem
```

```
✅ Teste Email Inválido:

1. [ ] Limpar search
2. [ ] Inserir email: invalid-email
3. [ ] Clicar "Buscar"
4. [ ] Alert de erro aparece
5. [ ] Mensagem clara de erro
```

```
✅ Teste Email Não Existente:

1. [ ] Limpar search
2. [ ] Inserir: nonexistent-12345@example.com
3. [ ] Clicar "Buscar"
4. [ ] Após < 5s, mensagem "Contact not found" aparece
5. [ ] Não há crash ou erro
```

**Critérios de Aceitação:**
- ✅ Busca funciona para emails válidos
- ✅ Error handling apropriado
- ✅ Loading states visíveis
- ✅ Performance < 5s

---

### 1.3. Visualização de Tags

**Tempo:** 10 minutos

```
✅ Card de Tags:

1. [ ] Após busca bem-sucedida, card "Tags (N)" aparece
2. [ ] Tags exibidas como badges
3. [ ] System tags têm emoji 🔧 ou cor verde
4. [ ] Manual tags têm emoji ✋ ou cor amarela
5. [ ] Hover sobre tag mostra tooltip (se aplicável)
6. [ ] Lista de tags é scrollable (se > 20 tags)
7. [ ] Sem overflow de texto
```

**Critérios de Aceitação:**
- ✅ Tags visíveis e organizadas
- ✅ Distinção clara system vs manual
- ✅ UX agradável

---

### 1.4. Produtos Detectados

**Tempo:** 10 minutos

```
✅ Card de Produtos:

1. [ ] Card "Produtos Detectados (N)" aparece
2. [ ] Se N = 0, mensagem "Nenhum produto detectado"
3. [ ] Se N > 0, lista de produtos aparece
4. [ ] Para cada produto:
   - [ ] Nome do produto visível
   - [ ] Código do produto visível (ex: OGI, CLAREZA)
   - [ ] Badge de confiança (high/medium/low)
   - [ ] Status (Ativo/Inativo) visível
   - [ ] Nível atual exibido (ex: 14 dias)
   - [ ] Tags detectadas listadas
5. [ ] Cards de produtos bem formatados
```

**Critérios de Aceitação:**
- ✅ Produtos inferidos corretamente
- ✅ Informações completas e claras
- ✅ UI consistente

---

### 1.5. Sincronização AC → BO

**Tempo:** 10 minutos

```
✅ Botão Sync:

1. [ ] Card "Sincronizar com Back Office" aparece
2. [ ] Botão "Sync BO ← AC" visível
3. [ ] Clicar no botão
4. [ ] Loading state: "A sincronizar..."
5. [ ] Após < 3s, uma das opções:
   - [ ] Toast de sucesso aparece
   - [ ] Alert com info "Para sincronizar, implemente..."
6. [ ] Se sucesso:
   - [ ] Mensagem "X produtos atualizados"
   - [ ] Lista de tags adicionadas (se houver)
7. [ ] Botão volta ao estado normal
```

```
✅ Verificar no MongoDB:

1. [ ] Abrir MongoDB Compass ou shell
2. [ ] Buscar collection `userproducts`
3. [ ] Filtrar por userId do teste
4. [ ] Verificar campo `activeCampaignData.tags`
5. [ ] Confirmar que tags foram atualizadas
6. [ ] Verificar `activeCampaignData.lastSyncFromAC` tem timestamp recente
```

**Critérios de Aceitação:**
- ✅ Sync funciona sem erros
- ✅ Dados são atualizados no BO
- ✅ Feedback visual claro

---

### 1.6. Botão Limpar

**Tempo:** 3 minutos

```
✅ Clear Search:

1. [ ] Após busca, botão "Limpar" aparece
2. [ ] Clicar "Limpar"
3. [ ] Input email é limpo
4. [ ] Resultados desaparecem
5. [ ] Info box "Como Usar" volta a aparecer
6. [ ] Botão "Limpar" desaparece
```

**Critérios de Aceitação:**
- ✅ Estado inicial restaurado
- ✅ Sem erros

---

## 🎨 TESTE 2: FRONTEND V2 - DASHBOARD

### 2.1. Dashboard V2 Tab

**Tempo:** 10 minutos

```
✅ Navegação:

1. [ ] Abrir http://localhost:3000/dashboard
2. [ ] Tab "Dashboard V2" aparece
3. [ ] Badge "V2" azul visível
4. [ ] Clicar na tab
5. [ ] Página carrega em < 2s
6. [ ] Header "Dashboard V2" aparece
```

```
✅ Stats Cards:

1. [ ] Card "Total Users" visível
2. [ ] Número de users exibido
3. [ ] Card "Active Users" visível
4. [ ] Percentagem de active exibida
5. [ ] Cards "Breakdown por Produto" visíveis
6. [ ] Cards "Breakdown por Plataforma" visíveis
7. [ ] Progress bars aparecem (se aplicável)
8. [ ] Cores consistentes e legíveis
```

**Critérios de Aceitação:**
- ✅ Todos os stats cards aparecem
- ✅ Dados são realistas
- ✅ UI limpa e profissional

---

### 2.2. Filtros V2

**Tempo:** 15 minutos

```
✅ Filtro por Produto:

1. [ ] Select "Produto" visível
2. [ ] Clicar no select
3. [ ] Lista de produtos aparece (OGI, CLAREZA, etc)
4. [ ] Selecionar "OGI"
5. [ ] Tabela de users atualiza
6. [ ] Apenas users com OGI aparecem
7. [ ] Stats cards atualizam
```

```
✅ Filtro por Plataforma:

1. [ ] Select "Plataforma" visível
2. [ ] Clicar no select
3. [ ] Opções: Hotmart, Curseduca, Discord
4. [ ] Selecionar "Curseduca"
5. [ ] Tabela filtra por plataforma
6. [ ] Stats atualizam
```

```
✅ Filtros Combinados:

1. [ ] Aplicar filtro Produto: "OGI"
2. [ ] Aplicar filtro Plataforma: "Curseduca"
3. [ ] Tabela mostra apenas users OGI + Curseduca
4. [ ] Stats refletem filtros
5. [ ] Clicar "Reset Filters"
6. [ ] Todos os filtros são limpos
7. [ ] Tabela volta ao estado inicial
```

**Critérios de Aceitação:**
- ✅ Filtros funcionam individualmente
- ✅ Filtros funcionam em combinação
- ✅ Reset funciona perfeitamente
- ✅ Performance < 1s para filtrar

---

### 2.3. Tabela Users V2

**Tempo:** 10 minutos

```
✅ Colunas:

1. [ ] Coluna "Nome" aparece
2. [ ] Coluna "Email" aparece
3. [ ] Coluna "Produtos" aparece com badges
4. [ ] Coluna "Plataformas" aparece com ícones
5. [ ] Coluna "Status" aparece
6. [ ] Coluna "Engagement" aparece
```

```
✅ Badges de Produtos:

1. [ ] Selecionar user com múltiplos produtos
2. [ ] Ver coluna "Produtos"
3. [ ] Badges aparecem (ex: OGI, CLAREZA)
4. [ ] Hover sobre badge mostra tooltip (opcional)
5. [ ] Cores diferentes por produto
```

```
✅ Ícones de Plataforma:

1. [ ] Ver coluna "Plataformas"
2. [ ] Ícones aparecem (Hotmart, Curseduca, Discord)
3. [ ] Ícones são reconhecíveis
4. [ ] Hover mostra nome da plataforma (opcional)
```

**Critérios de Aceitação:**
- ✅ Tabela bem formatada
- ✅ Dados corretos
- ✅ UX intuitiva

---

## 📊 TESTE 3: ANALYTICS V2 PAGE

### 3.1. Navegação para Analytics

**Tempo:** 5 minutos

```
✅ Sidebar Navigation:

1. [ ] No sidebar, link "Analytics" aparece
2. [ ] Clicar em "Analytics"
3. [ ] Navegar para /analytics
4. [ ] Página carrega em < 3s
5. [ ] Header "Analytics V2" aparece
```

**Critérios de Aceitação:**
- ✅ Navegação funciona
- ✅ Página carrega rápido

---

### 3.2. Tabs Analytics

**Tempo:** 15 minutos

```
✅ Tab "Overview":

1. [ ] Tab "Overview" selecionada por default
2. [ ] Stats gerais aparecem
3. [ ] Gráficos aparecem (Recharts)
4. [ ] Pie chart de distribuição visível
5. [ ] Bar chart de comparação visível
6. [ ] Sem erros de renderização
```

```
✅ Tab "Por Produto":

1. [ ] Clicar tab "Por Produto"
2. [ ] Conteúdo atualiza
3. [ ] Gráficos por produto aparecem
4. [ ] Breakdown por OGI, CLAREZA, etc
5. [ ] Dados fazem sentido
```

```
✅ Tab "Por Plataforma":

1. [ ] Clicar tab "Por Plataforma"
2. [ ] Conteúdo atualiza
3. [ ] Gráficos por plataforma aparecem
4. [ ] Breakdown Hotmart, Curseduca, Discord
5. [ ] Cores consistentes
```

**Critérios de Aceitação:**
- ✅ 3 tabs funcionam
- ✅ Gráficos renderizam corretamente
- ✅ Dados são consistentes

---

## 🔍 TESTE 4: BACKEND API (POSTMAN/CURL)

### 4.1. Endpoint GET Tags

**Tempo:** 5 minutos

```bash
# Teste 1: Email válido
curl -X GET "http://localhost:3001/api/ac/contact/test@example.com/tags" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Esperado:
# - Status: 200
# - Body: { success: true, data: { contactId, email, tags, products } }

# Teste 2: Email não existente
curl -X GET "http://localhost:3001/api/ac/contact/nonexistent@example.com/tags" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Esperado:
# - Status: 404
# - Body: { success: false, message: "Contact not found" }
```

**Critérios de Aceitação:**
- ✅ 200 para email válido
- ✅ 404 para email inexistente
- ✅ Response JSON correto

---

### 4.2. Endpoint POST Sync User

**Tempo:** 5 minutos

```bash
# Teste: Sincronizar user
curl -X POST "http://localhost:3001/api/ac/sync-user-tags/USER_ID_AQUI" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Esperado:
# - Status: 200
# - Body: { success: true, data: { synced: true, productsUpdated, tagsAdded } }
```

**Critérios de Aceitação:**
- ✅ 200 para userId válido
- ✅ 400 para userId inválido
- ✅ UserProduct atualizado no MongoDB

---

### 4.3. Script Check AC Sync

**Tempo:** 5 minutos

```bash
# Executar script
cd BO2_API
npm run check-ac-sync

# Esperado:
# - Output: Stats de verificação
# - Exit code: 0 (se <5% divergências)
# - Divergências documentadas (se houver)
```

**Critérios de Aceitação:**
- ✅ Script executa sem crash
- ✅ Output é claro e informativo
- ✅ Divergências < 5%

---

## ⚡ TESTE 5: PERFORMANCE

### 5.1. Page Load Times

**Tempo:** 10 minutos

```
✅ Medir com Chrome DevTools:

1. [ ] Abrir DevTools > Network
2. [ ] Carregar http://localhost:3000/activecampaign
3. [ ] Medir DOMContentLoaded
4. [ ] Esperado: < 1.5s
5. [ ] Medir Load completo
6. [ ] Esperado: < 3s
```

```
✅ Lighthouse Audit:

1. [ ] DevTools > Lighthouse
2. [ ] Run audit (Desktop)
3. [ ] Performance score
4. [ ] Esperado: >90
5. [ ] Accessibility score
6. [ ] Esperado: >90
```

**Critérios de Aceitação:**
- ✅ Performance >90
- ✅ Accessibility >90
- ✅ Best Practices >80

---

### 5.2. API Response Times

**Tempo:** 5 minutos

```bash
# Medir com curl
time curl -X GET "http://localhost:3001/api/ac/contact/test@example.com/tags" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Esperado: < 2s
```

**Critérios de Aceitação:**
- ✅ API responde em < 2s
- ✅ Sem timeouts

---

## 🛡️ TESTE 6: ERROR HANDLING

### 6.1. Network Offline

**Tempo:** 5 minutos

```
✅ Simular Offline:

1. [ ] DevTools > Network > Throttling > Offline
2. [ ] Tentar buscar tags
3. [ ] Verificar erro apropriado
4. [ ] Mensagem clara ao usuário
5. [ ] Sem crash da aplicação
```

**Critérios de Aceitação:**
- ✅ Erro é tratado graciosamente
- ✅ UI não quebra
- ✅ Mensagem clara

---

### 6.2. API Errors (500)

**Tempo:** 5 minutos

```
✅ Backend Down:

1. [ ] Parar backend (Ctrl+C)
2. [ ] Tentar buscar tags no frontend
3. [ ] Verificar erro exibido
4. [ ] Mensagem: "Erro ao conectar ao servidor"
5. [ ] Reiniciar backend
6. [ ] Retry funciona
```

**Critérios de Aceitação:**
- ✅ Error handling robusto
- ✅ Retry mechanism funciona

---

## 📱 TESTE 7: RESPONSIVE & MOBILE

### 7.1. Mobile View

**Tempo:** 10 minutos

```
✅ Chrome DevTools - Mobile:

1. [ ] Toggle device toolbar (Ctrl+Shift+M)
2. [ ] Selecionar iPhone 12
3. [ ] Navegar para /activecampaign
4. [ ] Tab "Tags Reader" acessível
5. [ ] Search box adaptado
6. [ ] Botões tocáveis (>44px)
7. [ ] Texto legível
8. [ ] Sem scroll horizontal
```

```
✅ Tablet View:

1. [ ] Selecionar iPad
2. [ ] Verificar layout adapta
3. [ ] 2 colunas (se aplicável)
4. [ ] UI otimizada
```

**Critérios de Aceitação:**
- ✅ Mobile-friendly
- ✅ Touch targets >44px
- ✅ Sem quebras de layout

---

## ✅ RELATÓRIO FINAL

### Template de Relatório

```markdown
# Relatório de Testes Manuais E2E

**Data:** ___________
**Testador:** ___________
**Ambiente:** Staging / Local
**Duração:** ___ horas

## Sprint 5 - Contact Tag Reader
- [ ] Navegação e UI (5 min)
- [ ] Busca de Tags (10 min)
- [ ] Visualização de Tags (10 min)
- [ ] Produtos Detectados (10 min)
- [ ] Sincronização (10 min)
- [ ] Botão Limpar (3 min)

**Issues Encontrados:**
1. _______________________
2. _______________________

## Frontend V2 - Dashboard
- [ ] Dashboard V2 Tab (10 min)
- [ ] Filtros V2 (15 min)
- [ ] Tabela Users V2 (10 min)

**Issues Encontrados:**
1. _______________________

## Analytics V2 Page
- [ ] Navegação (5 min)
- [ ] Tabs Analytics (15 min)

**Issues Encontrados:**
1. _______________________

## Backend API
- [ ] GET Tags (5 min)
- [ ] POST Sync (5 min)
- [ ] Check Script (5 min)

**Issues Encontrados:**
1. _______________________

## Performance
- [ ] Page Load (10 min)
- [ ] API Response (5 min)

**Scores:**
- Performance: ___/100
- Accessibility: ___/100

## Error Handling
- [ ] Network Offline (5 min)
- [ ] API Errors (5 min)

**Issues Encontrados:**
1. _______________________

## Mobile
- [ ] Mobile View (10 min)

**Issues Encontrados:**
1. _______________________

---

## RESUMO FINAL

**Total de Testes:** ___/___
**Taxa de Sucesso:** ___%
**Issues Críticos:** ___
**Issues Menores:** ___

**Aprovado para Produção:** ☐ SIM  ☐ NÃO  ☐ COM RESSALVAS

**Comentários:**
_______________________
_______________________
```

---

**Fim do Guia de Testes Manuais E2E**  
**Tempo Total Estimado:** 2-3 horas  
**Boa Sorte! 🚀**

