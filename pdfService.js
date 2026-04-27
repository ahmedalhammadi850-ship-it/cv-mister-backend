const puppeteer = require('puppeteer');

async function generatePdf(url) {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // محاكاة متصفح حقيقي
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );

    // فتح الصفحة
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // انتظار الخطوط
    await page.evaluateHandle('document.fonts.ready');

    // انتظار اكتمال المحتوى
    await page.waitForSelector('.print-container', { timeout: 10000 });

    // 🔥 أهم خطوة: تفعيل وضع الطباعة
    await page.emulateMediaType('print');

    // 🔥 إزالة أي عناصر UI (اختياري)
    await page.evaluate(() => {
      document.querySelectorAll('.no-print').forEach(el => el.remove());
    });

    // 🔥 ضبط viewport مطابق A4
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2
    });

    // إنشاء PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      }
    });

    return pdfBuffer;

  } catch (error) {
    console.error('[PDF ERROR]', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { generatePdf };
