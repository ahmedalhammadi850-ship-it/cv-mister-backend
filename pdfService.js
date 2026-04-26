// ============================================================
// CV-Mister — PDF Generation Service (Puppeteer)
// HIGH-QUALITY — Pixel-perfect PDF export, identical to preview.
// ============================================================

// Lazy load puppeteer to avoid crashes if it's not installed
let puppeteer;
let chromium;
try {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} catch (e) {
  console.warn('[PDF Service] ⚠️ Puppeteer-core or Chromium module not found. PDF generation will be unavailable.');
}

// A4 dimensions at 96 DPI (matches browser CSS px)
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

/**
 * Generate a high-quality PDF buffer from HTML content using Headless Chrome.
 * @param {string} htmlContent - The resume HTML markup (full outerHTML of .print-container)
 * @param {string} cssContent  - All extracted CSS rules as raw text
 * @returns {Promise<Buffer>} Raw PDF binary buffer
 */
async function generatePdf(htmlContent, cssContent = '') {
  if (!puppeteer) {
    throw new Error('PDF generation service is currently unavailable (Puppeteer not installed).');
  }
  let browser = null;

  try {
    // ── Launch browser ──────────────────────────────────────────
    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    } catch (launchError) {
      console.error("[PDF Service] Failed to launch browser:", launchError);
      throw launchError;
    }

    let page;
    try {
      page = await browser.newPage();
    } catch (error) {
      console.error("[PDF Service] Error creating new page:", error);
      throw error;
    }

    // ── Set viewport to exact A4 pixel dimensions for accurate rendering ──
    await page.setViewport({
      width: A4_WIDTH_PX,
      height: A4_HEIGHT_PX,
      deviceScaleFactor: 2, // 2x for crisp/retina quality
    });

    // ── Build a self-contained HTML document ─────────────────────
    const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${A4_WIDTH_PX}, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=Cairo:wght@300;400;500;600;700;800&family=Almarai:wght@300;400;700;800&family=Inter:wght@300;400;500;600;700;800;900&family=Readex+Pro:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* ── Print & page setup ─────────────────────────── */
    @page {
      size: 210mm 297mm;
      margin: 0;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    html, body {
      width: ${A4_WIDTH_PX}px !important; /* Force exact width */
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: 'Roboto', 'Cairo', 'Arial', sans-serif !important;
      font-weight: 500; /* Slightly bolder for PDF sharpness */
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Force all text elements to have at least font-weight 500 to combat PDF thinness */
    p, span, div, li, td, th {
      font-weight: 500;
    }

    /* Preserve headings and bold text */
    h1, h2, h3, h4, h5, h6, strong, b, [style*="font-weight: 700"], [style*="font-weight: 800"], [style*="font-weight: 900"] {
      font-weight: inherit !important;
    }

    /* ── Anti-break rules for clean pagination ─────── */
    .resume-section { break-inside: avoid; page-break-inside: avoid; }
    .experience-item, .education-item, .project-item,
    .certificate-item, .award-item, .volunteer-item {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    p, li { widows: 3; orphans: 3; }

    /* ── Page break between A4 pages ──────────────── */
    .a4-page-outer {
      width: 210mm !important;
      height: 297mm !important;
      min-height: 297mm !important;
      max-height: 297mm !important;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      margin: 0 !important;
      border: none !important;
      box-shadow: none !important;
    }
    .a4-page-outer:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    /* ── Hide non-printable elements ──────────────── */
    .no-print, .draggable-canvas-controls, 
    .page-footer, .zoom-controls { 
      display: none !important; 
    }

    /* ── Remove any scroll/drag wrappers ─────────── */
    .print-container {
      display: block !important;
      transform: none !important;
      position: static !important;
    }

    /* ── User-injected styles (from frontend) ─────── */
    ${cssContent}
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

    // ── Load content and wait for fonts + images ────────────────
    await page.setContent(fullHtml, { 
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // ── Extra wait for web fonts to fully render ────────────────
    await page.evaluate(() => document.fonts.ready);

    // ── Generate high-quality PDF ───────────────────────────────
    let pdfBuffer;
    try {
      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        timeout: 60000,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
    } catch (error) {
      console.error("[PDF Service] Error generating PDF:", error);
      throw error;
    }

    console.log(`[PDF Service] ✅ PDF generated successfully (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
    return pdfBuffer;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { generatePdf };
