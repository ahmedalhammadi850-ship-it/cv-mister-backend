const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const emailTemplate = (title, code) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f7f6;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background-color: #0f172a;
      padding: 20px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 1px;
    }
    .content {
      padding: 30px;
      text-align: center;
      color: #333333;
    }
    .content h2 {
      font-size: 22px;
      color: #0f172a;
      margin-top: 0;
    }
    .content p {
      font-size: 16px;
      line-height: 1.6;
      color: #555555;
    }
    .code-box {
      margin: 30px auto;
      padding: 15px 30px;
      font-size: 32px;
      font-weight: bold;
      color: #2563eb;
      background-color: #eff6ff;
      border: 2px dashed #93c5fd;
      border-radius: 8px;
      display: inline-block;
      letter-spacing: 4px;
    }
    .footer {
      background-color: #f1f5f9;
      padding: 15px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CV-Mister</h1>
    </div>
    <div class="content">
      <h2>${title}</h2>
      <p>مرحباً بك في منصة CV-Mister،</p>
      <p>يرجى استخدام الكود التالي لإتمام طلبك. هذا الكود صالح لفترة محدودة، نرجو عدم مشاركته مع أحد.</p>
      <div class="code-box">${code}</div>
      <p>إذا لم تقم بهذا الطلب، يمكنك تجاهل هذه الرسالة بأمان.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} CV-Mister. جميع الحقوق محفوظة.
    </div>
  </div>
</body>
</html>
`;

/**
 * دالة احترافية لإرسال الإيميلات
 * @param {string} to - البريد الإلكتروني للمستلم
 * @param {string} subject - عنوان الرسالة
 * @param {string} title - العنوان الداخلي في القالب
 * @param {string} code - كود التفعيل أو الاستعادة (OTP / Token)
 */
const sendEmail = async (to, subject, title, code) => {
  try {
    const data = await resend.emails.send({
      from: 'CV-Mister <onboarding@resend.dev>', // يمكنك تغيير الدومين الموثق الخاص بك هنا
      to: [to],
      subject: subject,
      html: emailTemplate(title, code),
    });
    return { success: true, data };
  } catch (error) {
    console.error('Resend Email Error:', error);
    return { success: false, error };
  }
};

module.exports = { sendEmail };
