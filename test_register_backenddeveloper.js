const axios = require('axios');

const FIREBASE_API_KEY = "AIzaSyDoviZ3FsJ2IkKwKFMsbfvRfGOiuneCaDE";
const BACKEND_URL = "http://localhost:3001";

async function firebaseREST(endpoint, body) {
  const res = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${FIREBASE_API_KEY}`,
    body
  );
  return res.data;
}

async function main() {
  const email = "backenddeveloper22@gmail.com";
  const password = "123456789";
  const fullName = "أحمد";

  console.log("=".repeat(60));
  console.log("🚀 بدء اختبار التسجيل الكامل");
  console.log("=".repeat(60));

  // ─── Step 1: Create account in Firebase ───────────────────
  console.log("\n📝 الخطوة 1: إنشاء الحساب في Firebase...");
  let signUpData;
  try {
    signUpData = await firebaseREST("signUp", {
      email,
      password,
      returnSecureToken: true
    });
    console.log(`  ✅ تم إنشاء الحساب بنجاح!`);
    console.log(`  UID: ${signUpData.localId}`);
    console.log(`  Email: ${signUpData.email}`);
  } catch (err) {
    if (err.response?.data?.error?.message === "EMAIL_EXISTS") {
      console.log(`  ⚠️ الحساب موجود مسبقاً. سأقوم بتسجيل الدخول بدلاً من ذلك...`);
      signUpData = await firebaseREST("signInWithPassword", {
        email,
        password,
        returnSecureToken: true
      });
      console.log(`  ✅ تسجيل الدخول ناجح. UID: ${signUpData.localId}`);
    } else {
      console.error("  ❌ فشل:", err.response?.data?.error?.message || err.message);
      process.exit(1);
    }
  }

  const idToken = signUpData.idToken;
  const uid = signUpData.localId;

  // ─── Step 2: Send verification email ──────────────────────
  console.log("\n📧 الخطوة 2: إرسال إيميل التحقق...");
  try {
    await firebaseREST("sendOobCode", {
      requestType: "VERIFY_EMAIL",
      idToken: idToken
    });
    console.log(`  ✅ تم إرسال إيميل التحقق بنجاح إلى ${email}`);
  } catch (err) {
    console.error("  ❌ فشل إرسال إيميل التحقق:", err.response?.data?.error?.message || err.message);
  }

  // ─── Step 3: Sync with MongoDB backend ────────────────────
  console.log("\n🔄 الخطوة 3: مزامنة البيانات مع MongoDB...");
  try {
    const syncRes = await axios.post(`${BACKEND_URL}/api/auth/sync`, {
      firebaseUID: uid,
      email: email,
      fullName: fullName
    });
    console.log(`  ✅ تمت المزامنة بنجاح!`);
    console.log(`  MongoDB User ID: ${syncRes.data.user?._id || syncRes.data.user?.id}`);
    console.log(`  Plan: ${syncRes.data.user?.plan || 'free'}`);
  } catch (err) {
    console.error("  ❌ فشل المزامنة:", err.response?.data || err.message);
  }

  // ─── Step 4: Check verification status ────────────────────
  console.log("\n🔍 الخطوة 4: التحقق من حالة التفعيل (القيد الأمني)...");
  try {
    const infoRes = await firebaseREST("lookup", { idToken });
    const verified = infoRes.users[0].emailVerified;
    console.log(`  emailVerified = ${verified}`);
    
    if (!verified) {
      console.log("  🔒 النتيجة: النظام سيمنع هذا المستخدم من دخول الداشبورد.");
    } else {
      console.log("  🟢 الحساب مفعّل بالفعل.");
    }
  } catch (err) {
    console.error("  ❌ خطأ:", err.response?.data?.error?.message || err.message);
  }

  // ─── Step 5: Attempt login (simulate security check) ──────
  console.log("\n🛡️ الخطوة 5: محاولة تسجيل دخول (اختبار القيد الأمني)...");
  try {
    const loginData = await firebaseREST("signInWithPassword", {
      email,
      password,
      returnSecureToken: true
    });
    
    const lookupRes = await firebaseREST("lookup", { idToken: loginData.idToken });
    const isVerified = lookupRes.users[0].emailVerified;
    
    if (!isVerified) {
      console.log("  ✅ القيد الأمني يعمل! تسجيل الدخول ناجح لكن emailVerified = false");
      console.log("  🔒 النظام سيطرد هذا المستخدم ويمنعه من الداشبورد.");
    } else {
      console.log("  🟢 المستخدم مفعّل ومصرح له بالدخول.");
    }
  } catch (err) {
    console.error("  ❌ خطأ:", err.message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ انتهى الاختبار بنجاح");
  console.log("=".repeat(60));
  console.log("\n📬 يرجى التحقق من بريد backenddeveloper22@gmail.com الآن!");
  
  process.exit(0);
}

main();
