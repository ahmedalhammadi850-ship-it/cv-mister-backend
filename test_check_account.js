const axios = require('axios');

const FIREBASE_API_KEY = "AIzaSyDoviZ3FsJ2IkKwKFMsbfvRfGOiuneCaDE";

async function checkAccount() {
  const email = "backenddeveloper22@gmail.com";
  const password = "123456789";

  console.log("=".repeat(60));
  console.log("🔍 فحص شامل لحساب:", email);
  console.log("=".repeat(60));

  // 1. Login attempt
  console.log("\n1️⃣ محاولة تسجيل الدخول...");
  let loginData;
  try {
    const res = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      { email, password, returnSecureToken: true }
    );
    loginData = res.data;
    console.log("   ✅ تسجيل دخول ناجح!");
    console.log("   UID:", loginData.localId);
    console.log("   Email:", loginData.email);
    console.log("   Display Name:", loginData.displayName || "(غير محدد)");
  } catch (err) {
    const msg = err.response?.data?.error?.message;
    console.error("   ❌ فشل تسجيل الدخول:", msg);
    if (msg === "INVALID_PASSWORD" || msg === "INVALID_LOGIN_CREDENTIALS") {
      console.log("   ⚠️ كلمة المرور خاطئة!");
    } else if (msg === "EMAIL_NOT_FOUND") {
      console.log("   ⚠️ الحساب غير موجود في Firebase!");
    }
    process.exit(1);
  }

  // 2. Check verification status
  console.log("\n2️⃣ فحص حالة التفعيل...");
  try {
    const res = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      { idToken: loginData.idToken }
    );
    const user = res.data.users[0];
    console.log("   emailVerified:", user.emailVerified);
    console.log("   createdAt:", new Date(parseInt(user.createdAt)).toLocaleString('ar-SA'));
    console.log("   lastLoginAt:", new Date(parseInt(user.lastLoginAt)).toLocaleString('ar-SA'));
    console.log("   providerUserInfo:", JSON.stringify(user.providerUserInfo?.map(p => p.providerId)));
    
    if (user.emailVerified) {
      console.log("\n   ✅ الحساب مفعّل وجاهز للدخول إلى الداشبورد!");
    } else {
      console.log("\n   🔒 الحساب غير مفعّل — لن يُسمح بالدخول.");
    }
  } catch (err) {
    console.error("   ❌ فشل الفحص:", err.response?.data?.error?.message || err.message);
  }

  // 3. Check MongoDB sync
  console.log("\n3️⃣ فحص المزامنة مع MongoDB...");
  try {
    const syncRes = await axios.post("http://localhost:3001/api/auth/sync", {
      firebaseUID: loginData.localId,
      email: email,
      fullName: loginData.displayName || "أحمد"
    });
    const u = syncRes.data.user;
    console.log("   ✅ موجود في MongoDB!");
    console.log("   _id:", u._id);
    console.log("   fullName:", u.fullName);
    console.log("   email:", u.email);
    console.log("   firebaseUID:", u.firebaseUID);
    console.log("   plan:", u.plan);
  } catch (err) {
    console.error("   ❌ فشل المزامنة:", err.response?.data || err.message);
  }

  // 4. Token check
  console.log("\n4️⃣ صلاحية الـ Token...");
  const tokenParts = loginData.idToken.split(".");
  if (tokenParts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      const expiresAt = new Date(payload.exp * 1000);
      const issuedAt = new Date(payload.iat * 1000);
      const now = new Date();
      console.log("   صدر في:", issuedAt.toLocaleString('ar-SA'));
      console.log("   ينتهي في:", expiresAt.toLocaleString('ar-SA'));
      console.log("   الوقت الحالي:", now.toLocaleString('ar-SA'));
      console.log("   email_verified (in token):", payload.email_verified);
      if (expiresAt > now) {
        console.log("   ✅ الـ Token صالح ولم ينتهِ بعد.");
      } else {
        console.log("   ❌ الـ Token منتهي الصلاحية!");
      }
    } catch (e) {
      console.error("   خطأ في تحليل Token:", e.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ انتهى الفحص الشامل");
  console.log("=".repeat(60));
  process.exit(0);
}

checkAccount();
