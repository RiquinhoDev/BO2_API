const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const UserProduct = mongoose.model('UserProduct', new mongoose.Schema({}, { strict: false, collection: 'userproducts' }));

  const total = await UserProduct.countDocuments();
  const active = await UserProduct.countDocuments({ status: 'ACTIVE' });
  const byStatus = await UserProduct.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  console.log('Total UserProducts:', total);
  console.log('ACTIVE:', active);
  console.log('\nPor status:');
  byStatus.forEach(s => console.log('  ' + (s._id || 'NULL') + ':', s.count));

  // Count unique users
  const uniqueUsers = await UserProduct.distinct('userId');
  const uniqueActiveUsers = await UserProduct.find({ status: 'ACTIVE' }).distinct('userId');

  console.log('\nUsuários únicos:');
  console.log('  Total:', uniqueUsers.length);
  console.log('  Com produtos ACTIVE:', uniqueActiveUsers.length);

  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
