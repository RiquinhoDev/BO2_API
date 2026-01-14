// ════════════════════════════════════════════════════════════
// 🔧 SCRIPT: Set isAdmin flag for specific user
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
require('dotenv').config();

// Simple schema for UserProduct (just what we need for this script)
const UserProductSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  isAdmin: { type: Boolean, default: false }
}, { collection: 'userproducts' });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true }
}, { collection: 'users' });

const UserProduct = mongoose.model('UserProduct', UserProductSchema);
const User = mongoose.model('User', UserSchema);

async function setAdminForUser(email) {
  try {
    console.log(`\n🔍 Searching for user with email: ${email}`);

    // Find the user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      return;
    }

    console.log(`✅ User found: ${user._id}`);

    // Find all UserProduct documents for this user
    const userProducts = await UserProduct.find({ userId: user._id });

    if (userProducts.length === 0) {
      console.log(`⚠️  No UserProduct documents found for this user`);
      return;
    }

    console.log(`\n📦 Found ${userProducts.length} UserProduct document(s)`);

    // Update all UserProduct documents to set isAdmin: true
    const result = await UserProduct.updateMany(
      { userId: user._id },
      { $set: { isAdmin: true } }
    );

    console.log(`\n✅ Successfully updated ${result.modifiedCount} UserProduct document(s)`);
    console.log(`📊 Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

    // Verify the update
    const updatedProducts = await UserProduct.find({ userId: user._id });
    console.log(`\n🔍 Verification:`);
    updatedProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. UserProduct ${product._id}: isAdmin = ${product.isAdmin}`);
    });

  } catch (error) {
    console.error(`❌ Error setting admin flag:`, error);
    throw error;
  }
}

async function main() {
  const targetEmail = 'joaomcf37@gmail.com';

  console.log('════════════════════════════════════════════════════════════');
  console.log('🔑 SET ADMIN FLAG FOR USER');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Target email: ${targetEmail}`);
  console.log(`MongoDB URI: ${process.env.MONGO_URI ? '✅ Found' : '❌ Not found'}`);
  console.log('════════════════════════════════════════════════════════════\n');

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    // Set admin flag
    await setAdminForUser(targetEmail);

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✅ Script completed successfully!');
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
main();
