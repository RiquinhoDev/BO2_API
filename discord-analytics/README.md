# 🤖 Discord Analytics Bot

Bot para analytics completo do Discord da comunidade Os Riquinhos, com tracking avançado de atividade, engagement e métricas de servidor.

## 📋 Funcionalidades

### 📊 Analytics de Mensagens
- Contagem de mensagens por usuário/canal/dia
- Análise de tamanho e conteúdo das mensagens
- Tracking de attachments, mentions e emojis
- Horários de maior atividade

### 🎤 Analytics de Voz
- Tempo gasto em canais de voz
- Sessões de voz com duração precisa
- Canais mais populares
- Estados de voz (mute, deaf, streaming, video)

### 👤 Analytics de Presença
- Status online/offline dos usuários
- Atividades e jogos mais populares
- Padrões de presença

### 👥 Analytics de Membros
- Novos membros e taxa de crescimento
- Retenção e padrões de saída
- Detecção de contas suspeitas

### 📈 Métricas de Engagement
- Score de engagement por usuário
- Classificação de níveis de atividade
- Trends e comparações temporais

## 🚀 Instalação e Configuração

### 1. Instalar Dependências
```bash
cd discord-analytics
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie `env.example` para `.env.local` e configure:

```env
DISCORD_ANALYTICS_TOKEN=seu_token_do_bot
DISCORD_ANALYTICS_CLIENT_ID=1414214162740936755
DISCORD_GUILD_ID=1179187507875827782
MONGO_URI=sua_string_de_conexao_mongodb
PORT=3002
NODE_ENV=development
```

### 3. Compilar TypeScript
```bash
npm run build
```

### 4. Executar Bot
```bash
# Desenvolvimento (auto-reload)
npm run dev

# Produção
npm start
```

## 📁 Estrutura do Projeto

```
discord-analytics/
├── src/
│   ├── bot.ts                    # Bot principal
│   ├── config/
│   │   ├── database.ts           # Conexão MongoDB
│   │   └── discord.ts            # Config Discord
│   ├── events/                   # Event handlers
│   │   ├── messageCreate.ts      # Tracking mensagens
│   │   ├── voiceStateUpdate.ts   # Tracking voz
│   │   ├── presenceUpdate.ts     # Status online/offline
│   │   ├── guildMemberAdd.ts     # Novos membros
│   │   ├── guildMemberRemove.ts  # Membros que saíram
│   │   └── ready.ts              # Bot ready
│   ├── commands/                 # Slash commands (TODO)
│   ├── services/                 # Lógica de negócio
│   │   └── AnalyticsCollector.ts # Coleta dados
│   ├── models/                   # Schemas MongoDB
│   │   ├── DiscordActivity.ts    # Atividade geral
│   │   ├── UserEngagement.ts     # Score engagement
│   │   ├── ServerStats.ts        # Stats servidor
│   │   └── VoiceActivity.ts      # Atividade voz
│   ├── routes/                   # API endpoints (TODO)
│   ├── utils/                    # Utilities
│   │   ├── logger.ts             # Sistema logs
│   │   ├── validators.ts         # Validações
│   │   └── helpers.ts            # Helper functions
│   └── types/                    # TypeScript types
│       ├── discord.ts            # Types Discord
│       ├── analytics.ts          # Types Analytics
│       └── database.ts           # Types Database
├── dist/                         # Build output
├── logs/                         # Log files
├── package.json
├── tsconfig.json
└── env.example
```

## 🛠️ Comandos Disponíveis

```bash
# Desenvolvimento com auto-reload
npm run dev

# Build para produção
npm run build

# Executar em produção
npm start

# Linting
npm run lint

# Testes
npm test
```

## 📊 API Endpoints

O bot expõe uma API REST completa para acesso aos dados:

### Analytics Endpoints
- `GET /api/analytics/overview` - Visão geral do servidor
- `GET /api/analytics/messages` - Analytics de mensagens
- `GET /api/analytics/voice` - Analytics de voz
- `GET /api/analytics/engagement` - Métricas de engagement
- `GET /api/analytics/user/:userId` - Analytics específicas de um usuário
- `POST /api/analytics/refresh` - Refresh manual das analytics

### Health Check
- `GET /health` - Status do bot e estatísticas

## 🔧 Configurações Avançadas

### Permissões Necessárias
O bot precisa das seguintes permissões no Discord:
- View Channels
- Read Message History
- Send Messages
- Use Slash Commands
- Connect (voz)
- Speak (voz)

### Intents Necessárias
- Guilds
- Guild Members
- Guild Messages
- Guild Voice States
- Guild Presences
- Message Content
- Guild Message Reactions
- Guild Emojis and Stickers

## 📈 Métricas Coletadas

### Por Usuário
- Mensagens enviadas
- Tempo em voz
- Score de engagement
- Canais mais utilizados
- Horários de atividade

### Por Servidor
- Membros totais/ativos/online
- Crescimento de membros
- Atividade total
- Canais mais populares
- Distribuição temporal

## 🚨 Monitoramento e Logs

Os logs são salvos em:
- `logs/discord-analytics.log` - Logs gerais
- `logs/errors.log` - Apenas erros
- `logs/analytics.log` - Dados de analytics
- `logs/exceptions.log` - Exceções não tratadas

## 🔒 Privacidade e Segurança

- Apenas dados públicos do Discord são coletados
- Conteúdo das mensagens NÃO é armazenado
- Dados são agregados e anonimizados
- TTL automático para limpeza de dados antigos

## 🤝 Contribuição

Para contribuir:
1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## ✅ Funcionalidades Implementadas

- [x] **Analytics Collector** - Sistema completo de coleta de dados
- [x] **Engagement Calculator** - Cálculo automático de scores de engagement
- [x] **API REST** - Endpoints completos para acesso aos dados
- [x] **Event Handlers** - Tracking de mensagens, voz, presença e membros
- [x] **MongoDB Models** - Schemas otimizados com índices
- [x] **Logging System** - Sistema avançado de logs com Winston
- [x] **TypeScript** - Tipagem completa e validações

## 📝 TODO (Opcional)

- [ ] Implementar slash commands (/analytics, /stats, /report)
- [ ] Adicionar sistema de relatórios automáticos
- [ ] Implementar cache Redis para performance
- [ ] Criar dashboard web React
- [ ] Adicionar testes unitários
- [ ] Documentar API com Swagger
- [ ] Implementar alertas automáticos

## 📞 Suporte

Para suporte ou dúvidas:
- Abra uma issue no GitHub
- Entre em contato via Discord
- Verifique os logs em `./logs/`

---

**Desenvolvido com ❤️ para a comunidade Os Riquinhos**
