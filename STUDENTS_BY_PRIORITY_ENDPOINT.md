# Endpoint: Students by Priority

## 📝 Descrição
Endpoint para buscar alunos que possuem tags de determinadas prioridades (CRITICAL, MEDIUM, LOW).

## 🔗 URL
```
GET /api/tag-monitoring/students-by-priority
```

## 🔐 Autenticação
Requer autenticação via middleware `authenticate`.

## 📥 Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `priorities[]` | Array<'CRITICAL' \| 'MEDIUM' \| 'LOW'> | Não | Array de prioridades para filtrar (padrão: ['CRITICAL']) |
| `tagName` | string | Não | Nome de tag específica para filtrar |
| `limit` | number | Não | Número de resultados por página (padrão: 20) |
| `skip` | number | Não | Número de resultados para pular (padrão: 0) |

## 📤 Resposta

### Sucesso (200 OK)
```json
{
  "success": true,
  "data": {
    "students": [
      {
        "_id": "64a1b2c3d4e5f6g7h8i9j0k1",
        "name": "João Silva",
        "email": "joao.silva@example.com",
        "tags": [
          {
            "name": "Cliente VIP",
            "priority": "CRITICAL"
          },
          {
            "name": "Curso Avançado",
            "priority": "MEDIUM"
          }
        ],
        "products": ["OGI V1", "Clareza Premium"]
      }
    ],
    "total": 150,
    "page": 1,
    "totalPages": 8
  }
}
```

### Erro (500)
```json
{
  "success": false,
  "message": "Erro ao buscar alunos por prioridade",
  "error": "Descrição do erro"
}
```

## 🧪 Exemplos de Uso

### 1. Buscar alunos com tags CRITICAL
```bash
GET /api/tag-monitoring/students-by-priority?priorities[]=CRITICAL
```

### 2. Buscar alunos com tags CRITICAL e MEDIUM
```bash
GET /api/tag-monitoring/students-by-priority?priorities[]=CRITICAL&priorities[]=MEDIUM
```

### 3. Buscar alunos com tag específica
```bash
GET /api/tag-monitoring/students-by-priority?priorities[]=CRITICAL&tagName=Cliente%20VIP
```

### 4. Buscar com paginação
```bash
GET /api/tag-monitoring/students-by-priority?priorities[]=CRITICAL&limit=10&skip=20
```

## 🏗️ Lógica de Implementação

1. **Buscar tags críticas ativas** filtradas por prioridade
2. **Buscar snapshots da última semana** que contenham essas tags
3. **Extrair emails únicos** dos alunos
4. **Buscar informações completas** dos alunos (com paginação)
5. **Enriquecer com produtos** e tags com prioridades
6. **Filtrar alunos** que têm pelo menos uma tag
7. **Retornar lista paginada**

## 📂 Ficheiros Implementados

### Backend
- **Service:** `BO2_API/src/services/tagMonitoring/weeklyTagMonitoring.service.ts` (linha 494-625)
  - Método: `getStudentsByPriority()`

- **Controller:** `BO2_API/src/controllers/tagMonitoring/tagMonitoring.controller.ts` (linha 320-359)
  - Método: `getStudentsByPriority()`

- **Route:** `BO2_API/src/routes/tagMonitoring.routes.ts` (linha 86-91)
  - Rota: `GET /students-by-priority`

### Frontend
- **Hook:** `Front/src/pages/gerirAlunos/syncUtilizadores/hooks/useStudentsByPriority.ts`
  - Hook customizado para consumir o endpoint

- **Component:** `Front/src/pages/gerirAlunos/syncUtilizadores/components/tagMonitoring/StudentsByPriority.tsx`
  - UI completa com filtros, tabela, paginação e export CSV

## ✅ Status
- [x] Service implementado
- [x] Controller implementado
- [x] Route registada
- [x] Frontend implementado
- [x] Integração completa

## 🧪 Como Testar

### 1. Usando Thunder Client / Postman
```
1. Abrir Thunder Client no VSCode
2. Criar novo request:
   - Method: GET
   - URL: http://localhost:5000/api/tag-monitoring/students-by-priority?priorities[]=CRITICAL
   - Headers:
     - Authorization: Bearer {seu_token}
3. Enviar request
```

### 2. Usando Frontend
```
1. Navegar para: Gestão de Alunos > Sync Utilizadores
2. Clicar na tab "Gestão de Tags"
3. Abrir a sub-tab "Alunos Afetados"
4. Usar filtros de prioridade (CRITICAL, MEDIUM, LOW)
5. Selecionar tag específica (opcional)
6. Verificar tabela de resultados
7. Testar paginação
8. Testar export CSV
```

## 🔄 Dependências
- **Models:**
  - `CriticalTag` - Tags críticas ativas
  - `WeeklyNativeTagSnapshot` - Snapshots semanais
  - `User` - Informações dos utilizadores
  - `UserProduct` - Produtos dos alunos

## 📊 Performance
- **Cache:** Não implementado (considerar Redis para 5 minutos)
- **Índices recomendados:**
  - `WeeklyNativeTagSnapshot`: compound index em `(weekNumber, year, nativeTags)`
  - `CriticalTag`: index em `(isActive, priority)`

## ⚠️ Notas
- O endpoint busca apenas snapshots da **semana atual**
- Alunos sem produtos aparecem com array vazio `products: []`
- Alunos sem tags críticas são filtrados automaticamente
- Paginação baseada em emails únicos encontrados nos snapshots
