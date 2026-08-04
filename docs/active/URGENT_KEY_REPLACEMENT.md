# 🔴 URGENT — Key Replacement Required

**Data:** 2026-07-01
**Contexto:** credenciais estiveram hardcoded neste repositório **público** e foram
expostas no GitHub. O código e o histórico git já foram limpos (secrets removidos,
histórico reescrito com `git-filter-repo` e force-push). **Falta rotar as chaves** —
enquanto não forem trocadas, continuam válidas e comprometidas.

> ⚠️ Os valores reais **não** estão neste documento de propósito (evitar re-vazamento).

---

## Chaves a trocar (por prioridade)

### 1. 🔴 MongoDB Atlas — PRODUÇÃO (crítico)
- **User exposto:** `desenvolvimentoserriquinho`
- **Cluster:** `clusterriquinho.djt0j.mongodb.net` / db `riquinho`
- **Risco:** acesso total de leitura/escrita à BD de produção.
- **Onde rotar:** MongoDB Atlas → **Database Access** → editar o user → **Edit Password** → gerar nova password.
- **Depois:** atualizar `MONGODB_URI` no `.env` local e no ambiente de produção (Railway).

### 2. 🔴 Curseduca — API Key
- **Key exposta:** começa por `ce9ef2a4…`
- **Onde rotar:** painel Curseduca → Developer / API → revogar e gerar nova.
- **Depois:** atualizar `CURSEDUCA_API_KEY`.

### 3. 🔴 Curseduca — Access Token (JWT admin)
- **Token exposto:** JWT com role `ADMIN` (conta `contactos@serriquinho.com`).
- **Onde rotar:** Curseduca → invalidar a sessão/token admin e gerar novo.
- **Depois:** atualizar `CURSEDUCA_ACCESS_TOKEN`.

### ✅ Já tratada — ActiveCampaign
- Key `001fca1f…` — **revogada/rotada** (feito).

---

## NÃO precisam de rotação
- **Tokens Discord** (14, no `.env`) — confirmado que o `.env` está gitignored e
  **nunca** foi committado. Não vazaram.

---

## Ação adicional no GitHub
Os commits órfãos abaixo ainda respondem por SHA direto (contêm secrets) até o GitHub
fazer garbage collection. Abrir pedido em <https://support.github.com/> a pedir purge:
- `de07eb858898689a98f9d3de63cba950d418e460`
- `4fd052a636ede99ccd28efa4a111eb030bf16c8e`
- `2e065c4857e729e802a14b0967fb06e19a096d3d` (o do report original)

---

## Checklist
- [ ] Rotar MongoDB Atlas password
- [ ] Rotar Curseduca API Key
- [ ] Rotar Curseduca Access Token
- [x] Rotar ActiveCampaign key
- [ ] Atualizar `.env` local + Railway com os novos valores
- [ ] Pedir purge dos commits órfãos ao GitHub Support
- [ ] Apagar este ficheiro depois de tudo concluído
