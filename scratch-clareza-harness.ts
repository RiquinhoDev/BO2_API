// Harness de teste LOCAL temporário — NÃO faz parte do projeto, apagar após uso.
// Monta só as rotas Clareza (sem Mongo, sem Discord/Hotmart/etc.) para validar
// os fixes de normalização de ticker, currency/exchange e pesquisa, sem arrancar
// o index.ts completo (que exige MONGO_URI real e liga integrações externas).
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { cacheService } from './src/services/cache.service'
import clarezaRoutes from './src/routes/clareza.routes'

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())

cacheService.connect()

app.use('/api/clareza', clarezaRoutes)

const PORT = 3901
app.listen(PORT, () => {
  console.log(`Harness Clareza a correr em http://localhost:${PORT}/api/clareza`)
})
