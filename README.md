# 🎓 Sistema de Gestão Educacional - Architecture V2.0

> Sistema escalável para gestão de múltiplos produtos educacionais em múltiplas plataformas

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/your-repo)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/mongodb-%3E%3D5.0-green.svg)](https://www.mongodb.com)

---

## 📋 Índice

- [Stack Tecnológica](#-stack-tecnológica)
- [Arquitetura V2.0](#-arquitetura-v20)
- [Setup](#-setup)
- [Migração V1 → V2](#-migração-v1--v2)
- [Documentação](#-documentação)
- [Testes](#-testes)
- [Deploy](#-deploy)

---

## 🚀 Stack Tecnológica

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express + TypeScript
- **Database:** MongoDB + Mongoose
- **Integrações:** Active Campaign, Hotmart, CursEduca, Discord
- **Caching:** Redis (opcional)
- **Logs:** Winston
- **Testes:** Jest + Supertest

### Frontend
- **Framework:** React 18 + TypeScript
- **State:** Zustand
- **Styling:** TailwindCSS + shadcn/ui
- **Build:** Vite
- **Routing:** React Router / Vite-Plugin-SSR
- **Testes:** Vitest + Playwright

---

## 🏗️ Arquitetura V2.0

### Modelo de Dados

```
┌─────────┐       ┌──────────────┐       ┌─────────┐
│  User   │ ←──── │ UserProduct  │ ────→ │ Product │
└─────────┘       └──────────────┘       └─────────┘
    │                    │                     │
    │                    │                     │
    ↓                    ↓                     ↓
Personal Info      Enrollment Data    Product Config
- name             - Progress          - Code
- email            - Engagement        - Platform
                   - Classes           - Settings
```

**User**: Dados pessoais (name, email)

**UserProduct**: Enrollment do user num produto (join table)
- Progress por produto
- Engagement por produto  
- Classes por produto
- Communication por produto

**Product**: Configuração do produto
- Multi-plataforma (Hotmart, CursEduca, Discord)
- Settings específicos
- Features habilitadas

### Escalabilidade

✅ Suporta **N produtos** sem limite  
✅ Suporta **N plataformas**  
✅ Adicionar produto = **Config DB** (sem deploy)  
✅ Stats e analytics **por produto**  
✅ **CRUD** via interface admin  
✅ **Multi-tenant** ready

---

## 🛠️ Setup

### 1. Pré-requisitos

```bash
Node.js >= 18
MongoDB >= 5.0
npm >= 9
```

### 2. Clonar Repositório

```bash
git clone https://github.com/your-org/sistema-educacional.git
cd sistema-educacional
```

### 3. Instalar Dependências

```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install
```

### 4. Configurar Variáveis de Ambiente

**Backend (.env):**

```bash
# MongoDB
MONGO_URI=mongodb://localhost:27017/sistema-educacional

# Node
NODE_ENV=development
PORT=3001

# Active Campaign
ACTIVECAMPAIGN_API_KEY=your_key
ACTIVECAMPAIGN_API_URL=https://your_account.api-us1.com

# Hotmart
HOTMART_CLIENT_ID=your_client_id
HOTMART_CLIENT_SECRET=your_secret
HOTMART_WEBHOOK_SECRET=your_webhook_secret

# CursEduca
CURSEDUCA_API_URL=https://prof.curseduca.pro
CURSEDUCA_AccessToken=your_token

# Discord
DISCORD_BOT_TOKEN=your_token
DISCORD_GUILD_ID=your_guild_id

# Redis (opcional)
REDIS_URL=redis://localhost:6379
```

**Frontend (.env):**

```bash
VITE_API_URL=http://localhost:3001/api
VITE_DISCORD_BOT_API_URL=http://localhost:3002
```

### 5. Executar Migração (Primeira Vez)

```bash
cd backend

# Criar produtos base
npm run seed:products

# Simulação (safe - não modifica DB)
npm run migrate:v2:dry

# Executar migração (cria UserProducts)
npm run migrate:v2

# Verificar integridade
npm run migrate:verify
```

### 6. Iniciar Aplicação

```bash
# Backend (Terminal 1)
cd backend
npm run dev
# http://localhost:3001

# Frontend (Terminal 2)
cd frontend
npm run dev
# http://localhost:3000
```

### 7. Health Check

```bash
# Verificar backend
curl http://localhost:3001/api/health

# Verificar frontend
curl http://localhost:3000
```

---

## 🔄 Migração V1 → V2

### O que muda?

**V1 (Deprecated):**
```typescript
// Dados por plataforma dentro do User
user.hotmart.progress
user.curseduca.engagement
user.discord.roles
```

**V2 (Atual):**
```typescript
// Dados em UserProduct (join table)
const userProducts = await UserProduct.find({ userId })
  .populate('productId');

const ogiProduct = userProducts.find(
  up => up.productId.code === 'OGI-V1'
);

const progress = ogiProduct.progress;
```

### Scripts de Migração

| Script | Descrição |
|--------|-----------|
| `migrate:v2` | Executa migração V1→V2 |
| `migrate:v2:dry` | Simulação (safe) |
| `migrate:verify` | Verifica integridade |
| `migrate:rollback` | Reverte migração |

### Compatibilidade

Durante **60 dias**, mantemos **DUAL WRITE**:
- ✅ Grava em **V2** (UserProduct)
- ✅ Grava em **V1** (User.hotmart/curseduca)
- ✅ Frontend pode ler de ambos
- ✅ Zero breaking changes

**Data de término:** 01 Janeiro 2026

---

## 📖 Documentação

### Guias Completos

- [📐 Architecture V2.0](docs/ARCHITECTURE_V2.md) - Arquitetura detalhada
- [🔌 API Reference](docs/API_REFERENCE.md) - Todos os endpoints
- [🔄 Migration Guide](docs/MIGRATION_GUIDE.md) - Guia de migração
- [🎨 Frontend Guide](docs/FRONTEND_GUIDE.md) - Componentes React
- [📋 Legacy Code Plan](docs/LEGACY_CODE.md) - Plano de remoção V1

### Quick References

- [Sprint de Correções](SPRINT_CORRECOES_SUMMARY.md)
- [Sprint 3: Frontend](Front/SPRINT3_SUMMARY.md)
- [Sprint 4: Cleanup](docs/SPRINT4_SUMMARY.md)

---

## 🧪 Testes

### Backend - Testes de Integração

```bash
cd backend

# Todos os testes
npm test

# Testes específicos
npm test -- products-v2.test.ts

# Com coverage
npm run test:coverage
```

### Frontend - Testes E2E

```bash
cd frontend

# Executar Playwright
npx playwright test

# UI Mode (interativo)
npx playwright test --ui

# Apenas um browser
npx playwright test --project=chromium

# Com relatório
npx playwright show-report
```

### Cobertura

- **Backend:** >80% coverage
- **Frontend:** >75% coverage
- **E2E:** 15+ cenários críticos

---

## 🚀 Deploy

### Checklist Pré-Deploy

```bash
# 1. Verificar ambiente
[ ] MONGO_URI configurado
[ ] API keys configurados
[ ] NODE_ENV=production

# 2. Backup
[ ] Backup MongoDB criado
[ ] Backup código (git tag)

# 3. Testes
[ ] Todos os testes passando
[ ] E2E executados
[ ] Load testing (opcional)

# 4. Build
[ ] Backend build OK
[ ] Frontend build OK
[ ] Assets otimizados
```

### Script de Deploy

```bash
cd backend

# Executar deploy automatizado
./scripts/deploy/deploy-production.sh
```

**O script faz:**
1. ✅ Verifica ambiente
2. ✅ Cria backup
3. ✅ Executa testes
4. ✅ Build aplicação
5. ✅ Deploy backend
6. ✅ Health check
7. ✅ Deploy frontend
8. ✅ Smoke tests
9. ✅ Tag versão

### Monitorização

```bash
# Logs backend
pm2 logs backend-api

# Health check
curl http://your-domain.com/api/health

# Stats
curl http://your-domain.com/api/dashboard/stats/v2
```

---

## 📊 Sprints Implementados

| Sprint | Status | Descrição |
|--------|--------|-----------|
| **Correções** | ✅ Completo | Validação, indexes, diagnostics |
| **Sprint 1** | ✅ Completo | Architecture V2.0 (Models + Migration) |
| **Sprint 2** | ✅ Completo | Backend API com DUAL WRITE |
| **Sprint 3** | ✅ Completo | Frontend adaptado para V2 |
| **Sprint 4** | ✅ Completo | Cleanup, testes, deploy |

---

## 🤝 Contribuir

1. Fork o projeto
2. Criar branch (`git checkout -b feature/MinhaFeature`)
3. Commit (`git commit -m 'feat: Adicionar MinhaFeature'`)
4. Push (`git push origin feature/MinhaFeature`)
5. Abrir Pull Request

### Conventional Commits

```
feat: nova feature
fix: correção de bug
docs: documentação
test: testes
chore: manutenção
refactor: refatoração
```

---

## 📝 Licença

MIT License - ver [LICENSE](LICENSE)

---

## 👥 Equipa

- **Desenvolvimento:** Your Team
- **Arquitetura:** Claude Sonnet 4.5 (AI Assistant)
- **Manutenção:** Your Org

---

## 📞 Suporte

- **Issues:** [GitHub Issues](https://github.com/your-repo/issues)
- **Docs:** [Documentation](https://docs.your-domain.com)
- **Email:** support@your-domain.com

---

## 🎯 Roadmap

### Q1 2026
- [ ] Multi-tenancy completo
- [ ] API v3 (GraphQL)
- [ ] Mobile apps (React Native)

### Q2 2026
- [ ] AI-powered insights
- [ ] Advanced analytics
- [ ] Marketplace de produtos

---

## ⭐ Estatísticas

- **Lines of Code:** ~15,000
- **API Endpoints:** 50+
- **Models:** 10+
- **Tests:** 30+
- **Coverage:** >80%

---

**🚀 Sistema 100% V2.0 em Produção!**

Built with ❤️ using TypeScript, React, Node.js, and MongoDB

---

**Versão:** 2.0.0  
**Data:** 16 Novembro 2025  
**Status:** 🟢 Production Ready

