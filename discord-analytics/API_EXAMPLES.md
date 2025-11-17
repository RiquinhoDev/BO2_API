# 📊 Discord Analytics Bot - Exemplos de API

Este documento mostra como usar a API REST do Discord Analytics Bot para obter dados de analytics.

## 🔗 Base URL

```
http://localhost:3002/api
```

## 📊 Endpoints Disponíveis

### 1. Overview Geral do Servidor

**Endpoint:** `GET /analytics/overview`

**Parâmetros:**
- `days` (opcional): Número de dias para análise (padrão: 7)
- `guildId` (opcional): ID do servidor Discord

**Exemplo:**
```bash
curl "http://localhost:3002/api/analytics/overview?days=30"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "period": "30 dias",
    "messages": {
      "total": 1250,
      "users": 45,
      "channels": 8
    },
    "voice": {
      "totalMinutes": 2340,
      "sessions": 156,
      "users": 23
    },
    "activeUsers": 67
  }
}
```

### 2. Analytics de Mensagens

**Endpoint:** `GET /analytics/messages`

**Parâmetros:**
- `days` (opcional): Período de análise (padrão: 7)
- `userId` (opcional): Filtrar por usuário específico
- `channelId` (opcional): Filtrar por canal específico

**Exemplo:**
```bash
curl "http://localhost:3002/api/analytics/messages?days=14"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "dailyStats": [
      {
        "date": "2024-01-01",
        "messages": 89,
        "users": 12,
        "characters": 4567,
        "words": 892,
        "channels": 4
      }
    ],
    "topUsers": [
      {
        "userId": "123456789",
        "username": "usuario_exemplo",
        "displayName": "Usuário Exemplo",
        "messages": 45,
        "characters": 2134,
        "words": 423,
        "daysActive": 5
      }
    ],
    "topChannels": [
      {
        "channelName": "geral",
        "messages": 234,
        "users": 18
      }
    ]
  }
}
```

### 3. Analytics de Voz

**Endpoint:** `GET /analytics/voice`

**Parâmetros:**
- `days` (opcional): Período de análise (padrão: 7)

**Exemplo:**
```bash
curl "http://localhost:3002/api/analytics/voice?days=7"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "dailyStats": [
      {
        "date": "2024-01-01",
        "minutes": 345,
        "sessions": 23,
        "users": 8,
        "averageSession": 15
      }
    ],
    "topUsers": [
      {
        "userId": "123456789",
        "username": "usuario_voz",
        "minutes": 89,
        "sessions": 6,
        "averageSession": 14,
        "daysActive": 3
      }
    ]
  }
}
```

### 4. Engagement dos Usuários

**Endpoint:** `GET /analytics/engagement`

**Exemplo:**
```bash
curl "http://localhost:3002/api/analytics/engagement"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "topUsers": [
      {
        "userId": "123456789",
        "username": "top_user",
        "currentScore": 87.5,
        "messageScore": 45.2,
        "voiceScore": 32.1,
        "presenceScore": 10.2,
        "level": "alto",
        "trend": "up",
        "trendPercentage": 15.3
      }
    ],
    "distribution": [
      {
        "_id": "alto",
        "count": 12,
        "averageScore": 78.4
      },
      {
        "_id": "medio",
        "count": 23,
        "averageScore": 34.7
      }
    ],
    "trends": [
      {
        "_id": "up",
        "count": 18
      },
      {
        "_id": "stable",
        "count": 15
      },
      {
        "_id": "down",
        "count": 7
      }
    ]
  }
}
```

### 5. Analytics de Usuário Específico

**Endpoint:** `GET /analytics/user/:userId`

**Parâmetros:**
- `days` (opcional): Período de análise (padrão: 30)

**Exemplo:**
```bash
curl "http://localhost:3002/api/analytics/user/123456789?days=30"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "activity": [
      {
        "userId": "123456789",
        "username": "usuario",
        "date": "2024-01-01",
        "type": "message",
        "count": 15,
        "totalCharacters": 756,
        "totalWords": 148,
        "channels": ["geral", "tech"],
        "hours": [9, 14, 20]
      }
    ],
    "engagement": {
      "userId": "123456789",
      "currentScore": 65.3,
      "messageScore": 40.1,
      "voiceScore": 20.2,
      "presenceScore": 5.0,
      "level": "alto",
      "trend": "up"
    },
    "voice": [
      {
        "userId": "123456789",
        "channelName": "Sala Geral",
        "joinTime": "2024-01-01T14:30:00Z",
        "leaveTime": "2024-01-01T15:15:00Z",
        "duration": 45
      }
    ]
  }
}
```

### 6. Status do Bot

**Endpoint:** `GET /health`

**Exemplo:**
```bash
curl "http://localhost:3002/health"
```

**Resposta:**
```json
{
  "status": "online",
  "bot": "DiscordAnalytics#1234",
  "guilds": 1,
  "uptime": 3600
}
```

## 🔧 Refresh Manual

**Endpoint:** `POST /analytics/refresh`

**Exemplo:**
```bash
curl -X POST "http://localhost:3002/api/analytics/refresh"
```

**Resposta:**
```json
{
  "success": true,
  "message": "Analytics refresh iniciado"
}
```

## 📊 Exemplos de Uso com JavaScript

### Fetch Overview
```javascript
async function getServerOverview(days = 7) {
  try {
    const response = await fetch(`http://localhost:3002/api/analytics/overview?days=${days}`);
    const data = await response.json();
    
    if (data.success) {
      console.log('Overview:', data.data);
      return data.data;
    }
  } catch (error) {
    console.error('Erro ao buscar overview:', error);
  }
}
```

### Fetch Top Users
```javascript
async function getTopMessageUsers(days = 7) {
  try {
    const response = await fetch(`http://localhost:3002/api/analytics/messages?days=${days}`);
    const data = await response.json();
    
    if (data.success) {
      return data.data.topUsers;
    }
  } catch (error) {
    console.error('Erro ao buscar top users:', error);
  }
}
```

### Fetch User Engagement
```javascript
async function getUserEngagement(userId) {
  try {
    const response = await fetch(`http://localhost:3002/api/analytics/user/${userId}`);
    const data = await response.json();
    
    if (data.success) {
      return data.data.engagement;
    }
  } catch (error) {
    console.error('Erro ao buscar engagement:', error);
  }
}
```

## 🚨 Tratamento de Erros

Todas as respostas de erro seguem o padrão:

```json
{
  "success": false,
  "error": "Descrição do erro"
}
```

**Códigos de Status HTTP:**
- `200` - Sucesso
- `400` - Parâmetros inválidos
- `404` - Endpoint não encontrado
- `500` - Erro interno do servidor

## 🔐 Autenticação

Atualmente a API não requer autenticação, mas é recomendado implementar autenticação em produção:

1. **API Key**: Header `X-API-Key`
2. **JWT Token**: Header `Authorization: Bearer <token>`
3. **IP Whitelist**: Restringir acesso por IP

## 📈 Rate Limiting

Para evitar sobrecarga, considere implementar rate limiting:

- **Por IP**: 100 requests/minuto
- **Por endpoint**: Limites específicos
- **Burst protection**: Máximo de 10 requests/segundo

## 🔍 Monitoramento

Para monitorar o uso da API:

1. **Logs**: Todos os requests são logados
2. **Métricas**: Response time, error rate
3. **Alertas**: Notificações para erros frequentes

---

**🤖 Discord Analytics Bot** - Desenvolvido para a comunidade Os Riquinhos
