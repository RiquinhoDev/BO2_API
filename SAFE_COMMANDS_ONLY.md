# ✅ COMANDOS SEGUROS - SÓ LEITURA AC

**IMPORTANTE:** Esta lista contém **APENAS** comandos que **NÃO ESCREVEM** no Active Campaign.

---

## ✅ 100% SEGURO - PODE EXECUTAR

### 1. Verificar Sync AC ↔ BO (Só Leitura)

```bash
cd BO2_API

# Verificação padrão (10 users)
npm run check-ac-sync

# Modo verbose (detalhes completos)
npm run check-ac-sync:verbose

# Exportar relatório JSON
npm run check-ac-sync:export
```

**O que faz:**
- ✅ **LÊ** contactos do AC
- ✅ **LÊ** tags do AC
- ✅ **LÊ** dados do MongoDB
- ✅ Compara e gera relatório
- ❌ **NÃO ESCREVE** em lado nenhum

---

### 2. Testes E2E Frontend

```bash
cd Front

# Executar todos os testes
npm run test:e2e

# UI interativa (recomendado)
npm run test:e2e:ui

# Ver browser (modo headed)
npm run test:e2e:headed

# Ver relatório
npm run test:e2e:report
```

**O que faz:**
- ✅ Testa UI (40 testes Contact Tag Reader + 32 Dashboard V2)
- ✅ Verifica elementos aparecem
- ✅ Testa navegação
- ❌ **NÃO COMPLETA sync** (teste está skip)
- ❌ **NÃO ESCREVE** no AC

---

### 3. Testes E2E Backend

```bash
cd BO2_API

# Executar todos os testes
npm run test:e2e

# UI interativa
npm run test:e2e:ui
```

**O que faz:**
- ✅ Testa UI de produtos (13 testes)
- ❌ **NÃO TOCA** no AC

---

### 4. Compilação (Build)

```bash
# Backend
cd BO2_API
npm run build

# Frontend
cd Front
npm run build
```

**O que faz:**
- ✅ Compila TypeScript
- ❌ **ZERO operações runtime**

---

## ⚠️ COMANDOS QUE ESCREVEM (EVITAR)

### ❌ NÃO EXECUTAR estes:

```bash
# ❌ PERIGO: Aplica/remove tags no AC
ts-node src/jobs/evaluateEngagementV2.job.ts

# ❌ PERIGO: Qualquer CRON job manualmente
node dist/jobs/*.job.js
```

---

## 🎯 RESUMO ULTRA-RÁPIDO

### Quer validar a implementação SEM tocar no AC?

**Execute APENAS isto:**

```bash
# 1. Backend compila? (30 seg)
cd BO2_API && npm run build

# 2. Frontend compila? (30 seg)
cd Front && npm run build

# 3. Script check-ac-sync existe e funciona? (2 min)
cd BO2_API && npm run check-ac-sync

# 4. Testes E2E passam? (5 min)
cd Front && npm run test:e2e:ui
```

**Total: ~8 minutos**

**Garantia:** ✅ **ZERO escrita no AC**

---

## 📊 O QUE CADA COMANDO VALIDA

| Comando | Valida | Escreve AC? | Tempo |
|---------|--------|-------------|-------|
| `npm run build` | Código compila | ❌ Não | 30s |
| `npm run check-ac-sync` | Script funciona + lê AC | ❌ Não | 2min |
| `npm run test:e2e` | Testes E2E passam | ❌ Não | 5min |

**Resultado:** Validação completa sem risco! ✅

---

**Criado:** 19 Novembro 2025  
**Para:** Testes seguros sem escrita no AC  
**Status:** ✅ **VALIDADO**

