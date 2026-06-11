// ════════════════════════════════════════════════════════════
// scripts/renewal/seed-known-offers.ts
// Seed dos nomes de oferta conhecidos do dashboard Hotmart (a API de vendas
// não devolve nomes). Para DEV/teste do matcher end-to-end enquanto o
// Backoffice (F3) não permite nomear à mão.
//
// IMPORTANTE: só inclui mapeamentos CONFIRMADOS no dashboard. Os restantes
// códigos ficam sem nome para revisão manual no BO. Confirmar sempre no BO.
//
//   npx ts-node scripts/renewal/seed-known-offers.ts
// ════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import RenewalOffer from '../../src/models/RenewalOffer'
import { parseOfferName } from '../../src/services/renewal/turmaParser'

// offerCode → nome do dashboard (confirmados no plano/screenshot)
const KNOWN: Record<string, string> = {
  cjzpbezh: 'Renovação turma 10 | 2605',
  xizcyeqj: 'Renovação turma 1, 2 e 3 | 2605'
}

;(async () => {
  await mongoose.connect(process.env.MONGO_URI as string)

  let updated = 0
  for (const [offerCode, offerName] of Object.entries(KNOWN)) {
    const parsed = parseOfferName(offerName)
    const res = await RenewalOffer.updateOne(
      { offerCode },
      {
        $set: {
          offerName,
          turmaNumbers: parsed.turmaNumbers,
          periodYYMM: parsed.periodYYMM,
          periodStart: parsed.periodStart,
          isRenewal: parsed.isRenewal,
          isManuallyEdited: true // protege do sync
        }
      }
    )
    const hit = res.matchedCount > 0
    console.log(
      `${hit ? '✓' : '· (não existe ainda)'} ${offerCode} → «${offerName}» turmas=[${parsed.turmaNumbers}] ${parsed.periodYYMM}`
    )
    if (hit) updated++
  }

  console.log(`\nactualizados: ${updated}/${Object.keys(KNOWN).length}`)
  await mongoose.disconnect()
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
