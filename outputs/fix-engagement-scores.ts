// scripts/fix-engagement-scores.ts
const UserProduct = require('../src/models/UserProduct').default

async function fixScores() {
  const abnormal = await UserProduct.find({
    'engagement.engagementScore': { $gt: 100 }
  })
  
  console.log(`📊 ${abnormal.length} UserProducts com score > 100`)
  
  for (const up of abnormal) {
    console.log(`🔧 Normalizando: ${up._id} (${up.engagement.engagementScore} → 100)`)
    up.engagement.engagementScore = 100
    await up.save({ validateBeforeSave: true })
  }
  
  console.log('✅ Concluído!')
}

fixScores()