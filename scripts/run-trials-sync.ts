// scripts/run-trials-sync.ts
// Corre o syncTrialsFromGuru (novo) e grava trialStartedAt/trialFinishedAt na BD.
// Escreve apenas os campos de trial dos utilizadores em trial. Reversível (re-sync).
//
// Uso: npx ts-node --transpile-only scripts/run-trials-sync.ts

import 'dotenv/config'
import mongoose from 'mongoose'
import { syncTrialsFromGuru } from '../src/services/guru/guruTrialService'

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI não definido no .env')
  await mongoose.connect(process.env.MONGO_URI)
  console.log('🔄 A correr syncTrialsFromGuru (novo)...')
  const result = await syncTrialsFromGuru()
  console.log('✅ Resultado:', JSON.stringify(result))
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1) })
