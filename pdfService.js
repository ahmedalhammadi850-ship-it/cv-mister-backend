const puppeteerCore = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Detect environment
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER;

async function generatePdf(html) {
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

    // ضبط High-DPI لضمان حدة الخطوط
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2
    });

    // ضبط المحتوى مباشرة (أكثر استقراراً من زيارة الرابط)
    console.log('[PDF] Setting page content...');
    
    // حقن استايلات الطباعة لضمان دقة الألوان
    const styledHtml = `
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @page { size: A4; margin: 0; }
        body { margin: 0; padding: 0; }
      </style>
      ${html}
    `;

    await page.setContent(styledHtml, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // انتظار الخطوط
    await page.evaluateHandle('document.fonts.ready');

    // تفعيل وضع الطباعة
    await page.emulateMediaType('print');

    // إنشاء PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 60000,
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
