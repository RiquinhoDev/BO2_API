const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true';

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const u = await db.collection('users').findOne({ email: 'edgar@edgargomes.com' });

  const pd = u.hotmart?.purchaseDate;
  const purchaseDate = pd ? new Date(pd) : null;
  const inactivatedAt = u.inactivation?.inactivatedAt ? new Date(u.inactivation.inactivatedAt) : null;
  const now = new Date();
  const daysSincePurchase = purchaseDate ? Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24)) : null;

  console.log('=== EDGAR - ESTADO ATUAL ===');
  console.log('status (root):               ', u.status);
  console.log('combined.status:             ', u.combined?.status);
  console.log('estado:                      ', u.estado);
  console.log('hotmart.status:              ', u.hotmart?.status);
  console.log('---');
  console.log('hotmart.purchaseDate:        ', purchaseDate?.toISOString().split('T')[0]);
  console.log('dias desde purchase:         ', daysSincePurchase, '(limite: 380)');
  console.log('---');
  console.log('inactivation.isManuallyInactivated:', u.inactivation?.isManuallyInactivated);
  console.log('inactivation.inactivatedAt:  ', inactivatedAt?.toISOString().split('T')[0]);
  console.log('inactivation.reason:         ', u.inactivation?.reason);
  console.log('---');
  console.log('combined.classId:            ', u.combined?.classId);
  console.log('classId (root):              ', u.classId);
  console.log('hotmart.enrolledClasses[0]:  ', u.hotmart?.enrolledClasses?.[0]?.classId);
  console.log('---');

  // Testar a lógica do detectRenewal
  console.log('=== SIMULAÇÃO detectRenewal ===');
  const isManuallyInactivated = u.inactivation?.isManuallyInactivated;
  const hasInactivatedAt = !!inactivatedAt;

  console.log('isManuallyInactivated:', isManuallyInactivated);
  console.log('hasInactivatedAt:', hasInactivatedAt);

  if (!isManuallyInactivated || !hasInactivatedAt) {
    console.log('→ detectRenewal RETORNA CEDO (não verifica renovação)');
    console.log('  ESTE É O BUG: status=INACTIVE mas isManuallyInactivated=false → nunca reativa');
  } else if (purchaseDate && inactivatedAt && purchaseDate > inactivatedAt) {
    console.log('→ RENOVAÇÃO DETETADA (purchaseDate > inactivatedAt)');
    console.log('  Deveria reativar!');
  } else {
    console.log('→ Sem renovação detetada');
    console.log('  purchaseDate:', purchaseDate?.toISOString());
    console.log('  inactivatedAt:', inactivatedAt?.toISOString());
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });
