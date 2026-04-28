const puppeteerCore = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Detect environment
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER;

async function generatePdf(html) {
  let browser = null;

  try {
    if (IS_PRODUCTION) {
      // Enable font rendering for Arabic and other non-Latin scripts
      chromium.setGraphicsMode = false;
      
      browser = await puppeteerCore.launch({
        args: [
          ...chromium.args,
          '--font-render-hinting=none',
          '--disable-font-subpixel-positioning',
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

    // ضبط المحتوى مباشرة (أكثر استقراراً من زيارة الرابط)
    console.log('[PDF] Setting page content...');
    
    // حقن استايلات الطباعة + تحميل الخطوط العربية مباشرة عبر @font-face
    const styledHtml = `
      <style>
        /* Force load Arabic fonts via Google Fonts API directly */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Cairo:wght@400;600;700&family=Almarai:wght@300;400;700;800&family=Readex+Pro:wght@200;300;400;500;600;700&family=Tajawal:wght@300;400;500;700;800&family=Roboto:wght@300;400;500;700&display=swap');
        
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

    // انتظار الخطوط — مع محاولات متعددة
    console.log('[PDF] Waiting for fonts to load...');
    await page.evaluateHandle('document.fonts.ready');
    
    // انتظار إضافي لضمان تحميل الخطوط العربية بالكامل
    const fontsLoaded = await page.evaluate(async () => {
      // Force load critical Arabic fonts
      const testFonts = [
        'Readex Pro', 'IBM Plex Sans Arabic', 'Cairo', 
        'Tajawal', 'Almarai', 'Inter', 'Roboto'
      ];
      
      const results = {};
      for (const font of testFonts) {
        try {
          const loaded = await document.fonts.load(`16px "${font}"`);
          results[font] = loaded.length > 0;
        } catch(e) {
          results[font] = false;
        }
      }
      
      // Wait for all fonts to settle
      await document.fonts.ready;
      return results;
    });
    
    console.log('[PDF] Font loading results:', fontsLoaded);
    
    // انتظار 1.5 ثانية إضافية لضمان تقديم الخطوط
    await new Promise(resolve => setTimeout(resolve, 1500));

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
