# ✅ CHECKLIST PRÉ-DEPLOY - PRODUÇÃO

**Projeto:** Sistema de Gestão Educacional V2.0  
**Data:** ________________  
**Responsável:** ________________

---

## 📋 BACKEND

### Ambiente
- [ ] `MONGO_URI` configurado e testado
- [ ] `NODE_ENV=production`
- [ ] `PORT` configurado
- [ ] Active Campaign API keys válidos
- [ ] Hotmart credentials válidos
- [ ] CursEduca API token válido
- [ ] Discord bot token válido
- [ ] Redis URL configurado (se aplicável)

### Segurança
- [ ] Rate limiting ativo
- [ ] CORS configurado corretamente
- [ ] Helmet.js instalado e configurado
- [ ] Logs sanitizados (sem secrets/passwords)
- [ ] Variáveis de ambiente não commitadas
- [ ] `.env` não está no repositório
- [ ] Secrets em sistema seguro (AWS Secrets Manager, etc)

### Performance
- [ ] Indexes MongoDB criados (`npm run maintenance:indexes`)
- [ ] Connection pooling configurado
- [ ] Query optimization verificada
- [ ] Caching implementado (Redis - opcional)
- [ ] Compression middleware ativo
- [ ] Static assets otimizados

### Monitorização
- [ ] Health check endpoint funcionando (`/api/health`)
- [ ] Logs centralizados (Winston configurado)
- [ ] Error tracking (Sentry/similar - opcional)
- [ ] Uptime monitoring configurado
- [ ] Alerts configurados (disk space, memory, CPU)
- [ ] Metrics endpoint disponível (opcional)

### Database
- [ ] Backup completo criado
- [ ] Backup testado (restore simulado)
- [ ] Migração V2 executada e verificada
- [ ] Indexes verificados
- [ ] Disk space suficiente (>20% livre)
- [ ] Replication configurada (se aplicável)

### Testes
- [ ] Todos os testes unitários passando
- [ ] Testes de integração passando
- [ ] E2E tests executados
- [ ] Load testing realizado (opcional)
- [ ] Coverage >80%

---

## 🎨 FRONTEND

### Build
- [ ] `npm run build` sem erros
- [ ] Assets otimizados (<200KB por bundle)
- [ ] Code splitting ativo
- [ ] Source maps configurados
- [ ] Tree shaking funcionando

### Ambiente
- [ ] `VITE_API_URL` correto (produção)
- [ ] Analytics configurado (Google Analytics, etc)
- [ ] Error boundary implementado
- [ ] Service worker configurado (PWA - opcional)

### Performance
- [ ] Lighthouse score >90
- [ ] Core Web Vitals OK
  - [ ] LCP <2.5s
  - [ ] FID <100ms
  - [ ] CLS <0.1
- [ ] Lazy loading de rotas implementado
- [ ] Imagens otimizadas (WebP, AVIF)
- [ ] Fonts otimizados

### SEO (se aplicável)
- [ ] Meta tags configurados
- [ ] robots.txt criado
- [ ] sitemap.xml gerado
- [ ] OpenGraph tags
- [ ] Twitter cards

---

## 🗄️ DATABASE

### Preparação
- [ ] Backup completo criado
- [ ] Backup verificado (não corrompido)
- [ ] Backup salvo em local seguro
- [ ] Migração V2 executada
- [ ] Verification script executado (`npm run migrate:verify`)
- [ ] Indexes criados
- [ ] Disk space >20% livre
- [ ] Slow queries identificadas e otimizadas

### Validação de Dados
- [ ] Dados de teste removidos
- [ ] Dados inconsistentes corrigidos
- [ ] Script de diagnóstico executado (`npm run diagnose:all`)
- [ ] Zero issues críticos encontrados

---

## 🚀 DEPLOY

### Preparação
- [ ] Branch `main` atualizada
- [ ] Pull request aprovado e merged
- [ ] Tags de versão criadas
- [ ] Changelog atualizado
- [ ] Release notes escritas
- [ ] Equipa notificada (data/hora de deploy)

### Comunicação
- [ ] Stakeholders informados
- [ ] Usuários notificados (se downtime esperado)
- [ ] Status page atualizada
- [ ] Suporte de plantão

### Rollback Plan
- [ ] Backup disponível
- [ ] Script de rollback testado
- [ ] Versão anterior identificada
- [ ] Rollback procedures documentadas

### Execução
- [ ] Deploy backend executado
- [ ] Health check passou
- [ ] Logs verificados (sem erros críticos)
- [ ] Deploy frontend executado
- [ ] Smoke tests executados e passaram

---

## ✅ PÓS-DEPLOY

### Validação Imediata (0-15min)
- [ ] Health check OK
- [ ] Logs sem erros críticos
- [ ] Homepage carrega
- [ ] Login funciona
- [ ] Endpoints principais respondem

### Validação Estendida (15min-1h)
- [ ] Dashboard stats carrega
- [ ] Products page funciona
- [ ] Users listing funciona
- [ ] API response times OK (<500ms P95)
- [ ] Database performance OK

### Monitorização (1h-24h)
- [ ] Error rate normal (<0.1%)
- [ ] CPU usage normal (<70%)
- [ ] Memory usage normal (<80%)
- [ ] Disk usage OK
- [ ] No alerts disparados

### Comunicação
- [ ] Stakeholders notificados (deploy completo)
- [ ] Status page atualizada (tudo OK)
- [ ] Release notes publicadas
- [ ] Changelog atualizado no site

---

## 🔴 CRITÉRIOS DE ROLLBACK

Fazer rollback imediatamente se:

- [ ] Health check falha por >5 minutos
- [ ] Error rate >5%
- [ ] API response time P95 >2s
- [ ] Database down
- [ ] Critical feature quebrada
- [ ] Data loss detectado

---

## 📞 CONTATOS DE EMERGÊNCIA

**Dev Team:**
- Tech Lead: _______________ (tel: _______________)
- DevOps: _______________ (tel: _______________)
- Backend Dev: _______________ (tel: _______________)

**Infraestrutura:**
- MongoDB Admin: _______________ (tel: _______________)
- Hosting Support: _______________

**Business:**
- Product Owner: _______________ (tel: _______________)
- CEO/CTO: _______________ (tel: _______________)

---

## ✍️ ASSINATURAS

| Papel | Nome | Assinatura | Data |
|-------|------|------------|------|
| Tech Lead | __________ | __________ | ___/___/___ |
| DevOps | __________ | __________ | ___/___/___ |
| Product Owner | __________ | __________ | ___/___/___ |

---

## 📝 NOTAS ADICIONAIS

_Espaço para notas específicas deste deploy:_

```
[Escrever aqui]
```

---

**Status:** [ ] Aprovado para Deploy  [ ] Não Aprovado

**Data de Aprovação:** ___/___/___

**Data de Deploy Planejada:** ___/___/___ às ___:___

---

✨ **Boa sorte no deploy!** 🚀

