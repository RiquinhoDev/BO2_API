import 'dotenv/config'
import mongoose from 'mongoose'
import RenewalOffer from '../../src/models/RenewalOffer'
import { GENERIC_RENEWAL_OFFER_CODE, GENERIC_RENEWAL_OFFER_NAME } from '../../src/services/renewal/renewalConstants'
import { buildCheckoutLink } from '../../src/services/renewal/renewalSync.service'

;(async () => {
  const mongoUri = [process.env.MONGO_URI, process.env.MONGODB_URI]
    .map((value) => value?.trim())
    .find((value) => value?.startsWith('mongodb://') || value?.startsWith('mongodb+srv://'))

  if (!mongoUri) {
    throw new Error('MONGO_URI ou MONGODB_URI nao configurado com connection string Mongo valida')
  }

  await mongoose.connect(mongoUri)

  const now = new Date()
  const result = await RenewalOffer.updateOne(
    { offerCode: GENERIC_RENEWAL_OFFER_CODE },
    {
      $set: {
        offerName: GENERIC_RENEWAL_OFFER_NAME,
        link: buildCheckoutLink(GENERIC_RENEWAL_OFFER_CODE),
        isActive: true,
        isRenewal: true,
        source: 'manual',
        isManuallyEdited: true,
        turmaNumbers: [],
        lastSeenAt: now
      },
      $setOnInsert: {
        offerCode: GENERIC_RENEWAL_OFFER_CODE
      }
    },
    { upsert: true }
  )

  console.log(JSON.stringify({
    offerCode: GENERIC_RENEWAL_OFFER_CODE,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upsertedId: result.upsertedId || null
  }, null, 2))

  await mongoose.disconnect()
  process.exit(0)
})().catch(async (error) => {
  console.error('Erro ao garantir oferta generica:', error.message)
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
  process.exit(1)
})
