const axios = require('axios');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const firebaseApiKey = "AIzaSyDoviZ3FsJ2IkKwKFMsbfvRfGOiuneCaDE";
const User = require('./models/User');

async function runTest() {
  const testEmail = `test_${Math.floor(Math.random() * 100000)}@example.com`;
  const testPassword = "TestPassword123!";
  const testName = "Test User E2E (REST)";
  let firebaseUID;

  try {
    console.log("🚀 Starting E2E Test...");

    // 1. Create user in Firebase
    console.log(`1. Creating user in Firebase: ${testEmail}`);
    const firebaseResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`,
      {
        email: testEmail,
        password: testPassword,
        returnSecureToken: true
      }
    );
    
    firebaseUID = firebaseResponse.data.localId;
    console.log(`✔ User created in Firebase with UID: ${firebaseUID}`);

    // 2. Call Sync API
    console.log("2. Calling Sync API...");
    const syncResponse = await axios.post('http://localhost:3001/api/auth/sync', {
      firebaseUID: firebaseUID,
      email: testEmail,
      fullName: testName
    });
    console.log("✔ Sync API Response:", syncResponse.data.message);

    // 3. Verify in MongoDB
    console.log("3. Verifying in MongoDB...");
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    
    const dbUser = await User.findOne({ firebaseUID: firebaseUID });

    if (dbUser && dbUser.email === testEmail) {
      console.log("\n✅ الاختبار تم بنجاح: الحساب أُنشئ ومزامنته تمت مع القاعدة\n");
    } else {
      throw new Error(`❌ فشل الاختبار: بيانات المستخدم لم توجد في MongoDB. UID searched: ${firebaseUID}`);
    }

  } catch (error) {
    console.error("\n❌ Error during E2E Test:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
      if (error.stack) console.error(error.stack);
    }
  } finally {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit();
  }
}

runTest();
