import dotenv from 'dotenv'
import { bootstrap } from './bootstrap'

export { bootstrap } from './bootstrap'
export { createApp } from './app'

if (require.main === module) {
  dotenv.config()
  void bootstrap().catch((error) => {
    console.error('❌ Falha no bootstrap:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
