const puppeteerCore = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Detect environment
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER;

async function generatePdf(url) {
  let browser = null;

  try {
    if (IS_PRODUCTION) {
      // ── Production (Render / Cloud) ──
      // Use @sparticuz/chromium which bundles a compatible Chromium binary
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
    } else {
      // ── Local Development ──
      // Use full puppeteer with bundled Chrome
      const puppeteer = require('puppeteer');
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

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
    try {
      await page.waitForSelector('.print-container', { timeout: 10000 });
    } catch (e) {
      console.warn('[PDF] .print-container not found, continuing anyway...');
    }

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
