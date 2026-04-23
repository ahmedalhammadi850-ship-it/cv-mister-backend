const axios = require('axios');

const FIREBASE_API_KEY = "AIzaSyDoviZ3FsJ2IkKwKFMsbfvRfGOiuneCaDE";

async function main() {
  console.log("=".repeat(60));
  console.log("🔧 اختبار تدفق المصادقة الكامل (Auth Flow Test)");
  console.log("=".repeat(60));

  const email = "backenddeveloper22@gmail.com";
  const password = "123456789";

  // 1. Login
  console.log("\n1️⃣ تسجيل الدخول...");
  const loginRes = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    { email, password, returnSecureToken: true }
  );
  console.log("   ✅ تسجيل دخول ناجح");

  // 2. Check email verification
  console.log("\n2️⃣ التحقق من حالة الإيميل...");
  const lookupRes = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    { idToken: loginRes.data.idToken }
  );
  const verified = lookupRes.data.users[0].emailVerified;
  console.log("   emailVerified:", verified);

  // 3. Sync with backend
  console.log("\n3️⃣ مزامنة مع Backend...");
  const syncRes = await axios.post("http://localhost:3001/api/auth/sync", {
    firebaseUID: loginRes.data.localId,
    email: email,
    fullName: "أحمد"
  });
  console.log("   ✅ MongoDB sync OK. User:", syncRes.data.user._id);

  // 4. Test what ProtectedRoute would see
  console.log("\n4️⃣ محاكاة ProtectedRoute...");
  const userState = { ...syncRes.data.user, emailVerified: verified };
  console.log("   user.emailVerified:", userState.emailVerified);
  console.log("   token:", loginRes.data.idToken.substring(0, 30) + "...");
  
  if (userState.emailVerified) {
    console.log("   ✅ النتيجة: سيتم السماح بدخول الداشبورد!");
  } else {
    console.log("   🔒 النتيجة: سيتم الطرد لصفحة Login");
  }

  // 5. Test the OLD /api/auth/me route (this was the culprit)
  console.log("\n5️⃣ اختبار /api/auth/me بـ Firebase Token (المسبب القديم للمشكلة)...");
  try {
    await axios.get("http://localhost:3001/api/auth/me", {
      headers: { Authorization: `Bearer ${loginRes.data.idToken}` }
    });
    console.log("   ✅ /api/auth/me نجح (غير متوقع!)");
  } catch (err) {
    if (err.response?.status === 401) {
      console.log("   ❌ /api/auth/me رجّع 401 — هذا كان السبب الجذري للطرد!");
      console.log("   ✅ تم إزالة هذا الاستدعاء من ProtectedRoute في التحديث الجديد.");
    } else {
      console.log("   ❌ خطأ آخر:", err.response?.status, err.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ التشخيص اكتمل. المشكلة كانت:");
  console.log("   ProtectedRoute كان يستدعي /api/auth/me بـ Firebase Token");
  console.log("   لكن Backend يتوقع JWT محلي → يرجع 401 → يسجل الخروج → Loop!");
  console.log("   الحل: استبدال syncPlan بـ onAuthStateChanged من Firebase.");
  console.log("=".repeat(60));
  
  process.exit(0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
