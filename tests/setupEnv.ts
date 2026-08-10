import path from 'path'
import dotenv from 'dotenv'
import { installEgressGuard } from './support/egressGuard'

dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true })

process.env.NODE_ENV = 'test'
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.MONGOMS_DOWNLOAD_DIR || '.cache/mongodb-memory-server',
)
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'

installEgressGuard()
