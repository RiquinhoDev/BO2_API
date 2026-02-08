const mongoose = require('mongoose');
require('dotenv').config();

async function checkStatuses() {
  await mongoose.connect(process.env.MONGO_URI);

  const UserProduct = require('../dist/models/UserProduct').default;

  // Contar por status
  const statusCounts = await UserProduct.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  console.log('═'.repeat(60));
  console.log('📊 STATUSES NA BD (UserProduct):');
  console.log('═'.repeat(60));

  statusCounts.forEach(s => {
    console.log(`${s._id || 'null'}: ${s.count}`);
  });

  console.log('\n═'.repeat(60));

  await mongoose.disconnect();
}

checkStatuses().catch(console.error);
