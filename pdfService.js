const puppeteerCore = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Detect environment
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER;

// URLs for production fonts to ensure high-fidelity Arabic rendering
const ARABIC_FONTS = [
  'https://fonts.gstatic.com/s/readexpro/v27/SLXnc1bJ7HE5YDoGPuzj_dh8uc7wUy8ZQQyX2KY8TL0kGZN6blTCBkOmgg.ttf', // Readex Pro Bold
  'https://fonts.gstatic.com/s/readexpro/v27/SLXnc1bJ7HE5YDoGPuzj_dh8uc7wUy8ZQQyX2KY8TL0kGZN6blTC4USmgg.ttf', // Readex Pro Regular
];

async function generatePdf(html) {
  let browser = null;

  try {
    if (IS_PRODUCTION) {
      // 🚀 THE FIX: Load fonts directly into the Chromium environment on Render/AWS
      // This bypasses issues with web font downloading and subsetting
      for (const fontUrl of ARABIC_FONTS) {
        try {
          await chromium.font(fontUrl);
          console.log('[PDF] Loaded font:', fontUrl.split('/').pop());
        } catch (e) {
          console.error('[PDF] Failed to load font:', fontUrl, e);
        }
      }

      chromium.setGraphicsMode = false;
      
      browser = await puppeteerCore.launch({
        args: [
          ...chromium.args,
          '--font-render-hinting=none',
          '--disable-font-subpixel-positioning',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ],
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

    console.log('[PDF] Setting page content...');
    
    const styledHtml = `
      <style>
        /* Embed Google Fonts definition */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Readex+Pro:wght@200;300;400;500;600;700&family=Cairo:wght@400;700&family=Tajawal:wght@400;700&display=swap');
        
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @page { size: A4; margin: 0; }
        body { margin: 0; padding: 0; }
        
        /* Global Font Fix for Arabic on Render */
        [dir="rtl"], [dir="rtl"] * {
          font-family: 'Readex Pro', 'Cairo', 'Tajawal', sans-serif !important;
        }
      </style>
      ${html}
    `;

    await page.setContent(styledHtml, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // Wait for fonts to be ready
    await page.evaluateHandle('document.fonts.ready');
    
    // Add a small delay for Render to catch up
    await new Promise(resolve => setTimeout(resolve, 1000));

    // تفعيل وضع الطباعة
    await page.emulateMediaType('print');

    // إنشاء PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });

    console.log('[PDF] Generated successfully');
    return pdfBuffer;

  } catch (error) {
    console.error('[PDF ERROR]', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { generatePdf };
