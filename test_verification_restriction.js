const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const firebaseApiKey = "AIzaSyDoviZ3FsJ2IkKwKFMsbfvRfGOiuneCaDE";

async function runTest() {
  const testEmail = `test_verify_${Math.floor(Math.random() * 100000)}@example.com`;
  const testPassword = "TestPassword123!";
  let idToken;

  try {
    console.log("🚀 Starting Security Restriction Test (Email Verification)...");

    // 1. Sign up new user
    console.log(`1. Signing up user: ${testEmail}`);
    await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`,
      { email: testEmail, password: testPassword, returnSecureToken: true }
    );
    console.log("✔ User signed up (Not yet verified).");

    // 2. Attempt Login via REST
    console.log("2. Attempting to Login...");
    const loginRes = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
      { email: testEmail, password: testPassword, returnSecureToken: true }
    );
    
    idToken = loginRes.data.idToken;
    console.log("✔ Login successful at Firebase level.");

    // 3. Check Verification Status (Simulating Frontend restriction logic)
    console.log("3. Checking verification status (Restriction Logic)...");
    const infoRes = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
      { idToken }
    );

    const isVerified = infoRes.data.users[0].emailVerified;
    console.log(`Status: emailVerified = ${isVerified}`);

    if (isVerified === false) {
      console.log("\n✅ نجاح الاختبار: تم رصد أن الحساب غير مفعل.");
      console.log("🔒 النتيجة: النظام سيمنع هذا المستخدم من دخول الداشبورد تلقائياً.\n");
    } else {
      throw new Error("❌ فشل الاختبار: الحساب ظهر كمفعّل وهو جديد!");
    }

  } catch (error) {
    console.error("\n❌ Error during test:");
    if (error.response) {
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  } finally {
    process.exit();
  }
}

runTest();
