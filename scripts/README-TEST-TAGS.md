# 🧪 TESTE: Tags BO - Rui

Scripts para testar addTag() e removeTag() com todas as otimizações aplicadas.

---

## 📋 O QUE FAZ

### Script 1: `test-tags-rui.ts` (APLICAR)
1. Busca todos os UserProducts ACTIVE do Rui
2. Para cada produto, avalia TagRules (via DecisionEngine)
3. Aplica TODAS as tags BO corretas ao Rui no Active Campaign
4. Remove tags antigas/órfãs
5. Mostra resumo completo

### Script 2: `test-tags-rui-remove.ts` (REMOVER)
1. Busca TODAS as tags BO do Rui no AC
2. Remove TODAS elas (uma por uma)
3. Limpa também da BD
4. Verifica se limpou tudo

---

## 🚀 COMO USAR

### 1️⃣ APLICAR TAGS

```bash
npx tsx scripts/test-tags-rui.ts
```

**Output esperado**:
```
🧪 TESTE: Tags BO - Aplicar e Remover (Rui)

✅ User encontrado: Rui Filipe Sampaio Teixeira

📦 UserProducts ACTIVE: 4
   - Comunidade Discord (DISCORD_COMMUNITY)
   - OGI V1 (OGI_V1)
   - Clareza - Mensal (CLAREZA_MENSAL)
   - Clareza - Anual (CLAREZA_ANUAL)

📝 FASE 1: APLICAR TODAS AS TAGS BO

[1/4] 🏷️  Processando: DISCORD_COMMUNITY
   ✅ Sucesso!
      Tags aplicadas: 0
      Tags removidas: 0

[2/4] 🏷️  Processando: OGI_V1
   ✅ Sucesso!
      Tags aplicadas: 2
         + OGI_V1 - Inativo 10d
         + OGI_V1 - Progresso Baixo
      Tags removidas: 0

[3/4] 🏷️  Processando: CLAREZA_MENSAL
   ✅ Sucesso!
      Tags aplicadas: 2
         + CLAREZA - Ativo
         + CLAREZA - Super Utilizador
      Tags removidas: 0

[4/4] 🏷️  Processando: CLAREZA_ANUAL
   ✅ Sucesso!
      Tags aplicadas: 0
      Tags removidas: 0

📊 RESUMO - APLICAR TAGS
✅ Sucessos: 4/4
❌ Falhas: 0/4
🏷️  Tags aplicadas: 4
🗑️  Tags removidas: 0

🔍 VERIFICANDO TAGS NO ACTIVE CAMPAIGN
📊 Total tags no AC: 25
🏷️  Tags BO: 4

Tags BO encontradas:
   1. OGI_V1 - Inativo 10d
   2. OGI_V1 - Progresso Baixo
   3. CLAREZA - Ativo
   4. CLAREZA - Super Utilizador

✅ TESTE COMPLETO - TAGS APLICADAS
```

---

### 2️⃣ VERIFICAR NO AC (Manual)

Vai ao Active Campaign e verifica se as tags estão corretas no contacto do Rui:
- Email: `ruifilipespteixeira@gmail.com`

---

### 3️⃣ REMOVER TODAS AS TAGS

Quando estiveres pronto para remover:

```bash
npx tsx scripts/test-tags-rui-remove.ts
```

**Output esperado**:
```
🗑️  TESTE: REMOVER TODAS as Tags BO (Rui)

✅ User encontrado: Rui Filipe Sampaio Teixeira

📡 Buscando tags no Active Campaign...
📊 Total tags no AC: 25
🏷️  Tags BO: 4

Tags BO a remover:
   1. OGI_V1 - Inativo 10d
   2. OGI_V1 - Progresso Baixo
   3. CLAREZA - Ativo
   4. CLAREZA - Super Utilizador

🗑️  REMOVENDO TODAS AS TAGS BO

[1/4] 🗑️  Removendo: "OGI_V1 - Inativo 10d"
   ✅ Tag removida do AC

[2/4] 🗑️  Removendo: "OGI_V1 - Progresso Baixo"
   ✅ Tag removida do AC

[3/4] 🗑️  Removendo: "CLAREZA - Ativo"
   ✅ Tag removida do AC

[4/4] 🗑️  Removendo: "CLAREZA - Super Utilizador"
   ✅ Tag removida do AC

🧹 LIMPANDO TAGS DA BD
📦 4 UserProducts a limpar
   ✅ UserProduct 123: 2 tags limpas
   ✅ UserProduct 456: 2 tags limpas
✅ Total de tags limpas da BD: 4

📊 RESUMO - REMOÇÃO DE TAGS
✅ Removidas do AC: 4/4
❌ Falhas: 0/4
🧹 Limpas da BD: 4 tags

🔍 VERIFICAÇÃO FINAL
📡 Buscando tags no AC novamente...
📊 Tags BO restantes no AC: 0
✅ TODAS as tags BO foram removidas do AC!

✅ LIMPEZA COMPLETA
```

---

## ✅ O QUE ESTAMOS A TESTAR

### Com Aplicar Tags (`test-tags-rui.ts`)
1. ✅ **TagOrchestrator**: Avalia regras corretamente?
2. ✅ **DecisionEngine**: Decide tags certas?
3. ✅ **addTag()**: Aplica tags no AC?
4. ✅ **BD**: Guarda tags no UserProduct.activeCampaignData.tags?
5. ✅ **Diff**: Remove tags antigas/órfãs?

### Com Remover Tags (`test-tags-rui-remove.ts`)
1. ✅ **removeTag()**: Remove tags do AC?
2. ✅ **Retry**: Tenta várias vezes se falhar?
3. ✅ **404**: Trata 404 como sucesso (tag já removida)?
4. ✅ **BD**: Limpa tags do UserProduct?
5. ✅ **Verificação**: Confirma que tags foram removidas?

---

## ⚠️ NOTAS IMPORTANTES

### Rate Limiting
- Scripts fazem pausa de **500ms** entre operações
- Configurado para não atingir rate limit do AC

### Cache do AC
- Às vezes tags persistem por **cache do AC** (1-5 min)
- Se removeTag retornar sucesso mas tag ainda aparecer → aguardar alguns minutos

### BD = Fonte da Verdade
- Scripts **SEMPRE** atualizam BD
- Mesmo se AC falhar, BD fica consistente
- Próxima execução do pipeline vai corrigir inconsistências

---

## 🎯 FLUXO COMPLETO DE TESTE

```
1. Executar: npx tsx scripts/test-tags-rui.ts
   ↓
   ✅ Tags aplicadas ao Rui

2. Verificar no Active Campaign
   ↓
   ✅ Tags estão corretas?

3. Executar: npx tsx scripts/test-tags-rui-remove.ts
   ↓
   ✅ Tags removidas do Rui

4. Verificar no Active Campaign
   ↓
   ✅ Tags foram removidas?

5. (OPCIONAL) Executar aplicar novamente
   ↓
   ✅ Tags voltam a ser aplicadas?
```

---

## 📝 FICHEIROS

| Ficheiro | Descrição |
|----------|-----------|
| `test-tags-rui.ts` | Aplica TODAS as tags BO ao Rui |
| `test-tags-rui-remove.ts` | Remove TODAS as tags BO do Rui |
| `README-TEST-TAGS.md` | Este ficheiro (instruções) |

---

**Criado por**: Claude Code
**Data**: 2026-01-06
**Versão**: 1.0
