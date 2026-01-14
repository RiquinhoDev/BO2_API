# BO2_API Scripts

Scripts de manutenção e migração para o projeto BO2_API.

## setAdminUser.js

Script para definir a flag `isAdmin: true` em documentos UserProduct para um utilizador específico.

### Uso

```bash
# Na raiz do projeto BO2_API
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API

# Executar o script
node scripts/setAdminUser.js
```

### O que faz

1. Conecta à base de dados MongoDB usando `MONGO_URI` do `.env`
2. Procura o utilizador com email `joaomcf37@gmail.com`
3. Atualiza todos os documentos UserProduct desse utilizador para `isAdmin: true`
4. Verifica as mudanças e exibe confirmação

### Configuração

O email do utilizador alvo está hardcoded no script:
```javascript
const targetEmail = 'joaomcf37@gmail.com';
```

Para alterar para outro utilizador, edite esta linha no script.

### Requisitos

- Ficheiro `.env` com `MONGO_URI` configurado
- Conexão à base de dados MongoDB
- Pacotes: `mongoose`, `dotenv`

### Output Esperado

```
════════════════════════════════════════════════════════════
🔑 SET ADMIN FLAG FOR USER
════════════════════════════════════════════════════════════
Target email: joaomcf37@gmail.com
MongoDB URI: ✅ Found
════════════════════════════════════════════════════════════

🔌 Connecting to MongoDB...
✅ Connected to MongoDB

🔍 Searching for user with email: joaomcf37@gmail.com
✅ User found: 507f1f77bcf86cd799439011

📦 Found 2 UserProduct document(s)

✅ Successfully updated 2 UserProduct document(s)
📊 Matched: 2, Modified: 2

🔍 Verification:
   1. UserProduct 507f191e810c19729de860ea: isAdmin = true
   2. UserProduct 507f191e810c19729de860eb: isAdmin = true

════════════════════════════════════════════════════════════
✅ Script completed successfully!
════════════════════════════════════════════════════════════

🔌 Disconnected from MongoDB
```
