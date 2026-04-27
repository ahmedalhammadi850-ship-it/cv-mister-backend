const puppeteerCore = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Detect environment
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER;

async function generatePdf(url) {
  let browser = null;

  try {
    if (IS_PRODUCTION) {
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
    } else {
      const puppeteer = require('puppeteer');
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );

    // ضبط viewport مطابق A4
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2
    });

    // فتح الصفحة
    console.log('[PDF] Opening URL:', url);
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // انتظار الخطوط
    await page.evaluateHandle('document.fonts.ready');

    // 🔥 انتظار العلامة التي تؤكد أن البيانات جاهزة
    console.log('[PDF] Waiting for #pdf-ready marker...');
    await page.waitForSelector('#pdf-ready', { timeout: 30000 });
    console.log('[PDF] Data is ready, generating PDF...');

    // تأخير إضافي للتأكد من اكتمال الرسم
    await new Promise(resolve => setTimeout(resolve, 1000));

    // تفعيل وضع الطباعة
    await page.emulateMediaType('print');

    // إزالة أي عناصر UI
    await page.evaluate(() => {
      document.querySelectorAll('.no-print').forEach(el => el.remove());
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

    console.log('[PDF] Generated successfully, size:', pdfBuffer.length, 'bytes');
    return pdfBuffer;

  } catch (error) {
    console.error('[PDF ERROR]', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { generatePdf };
