// ============================================================
// CV-Mister — PDF Generation Service v3.0 (Puppeteer)
// MIRROR-IMAGE EXPORT — Pixel-perfect PDF, identical to preview.
// Engineered for FlowCV-level quality, ATS compatibility,
// and perfect Arabic shaping.
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

// A4 dimensions at 96 DPI (matches browser CSS px exactly)
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
    // ── 1. Launch browser ───────────────────────────────────────
    console.log('[PDF Service] Launching headless browser...');
    try {
      browser = await puppeteer.launch({
        args: [...chromium.args, '--font-render-hinting=none', '--disable-gpu-compositing'],
        defaultViewport: null, // We set viewport manually below
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

    // ── 2. Configure viewport — exact A4 at Retina 2x ──────────
    await page.setViewport({
      width: A4_WIDTH_PX,
      height: A4_HEIGHT_PX,
      deviceScaleFactor: 2, // Retina for crisp text and borders
    });

    // ── 3. Force Light Mode — prevent dark mode color interference ─
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
    ]);

    // ── 4. Build self-contained HTML document ────────────────────
    const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${A4_WIDTH_PX}, initial-scale=1.0">

  <!-- ── Web Fonts: Full weight spectrum for Roboto + Cairo ── -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=Cairo:wght@300;400;500;600;700;800&family=Almarai:wght@300;400;700;800&family=Inter:wght@300;400;500;600;700;800;900&family=Readex+Pro:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

  <style>
    /* ==========================================================
       LAYER 1: Page & Print Setup
       ========================================================== */
    @page {
      size: 210mm 297mm;
      margin: 0;
    }

    /* ==========================================================
       LAYER 2: Universal Reset — Box Model + Color Fidelity
       ========================================================== */
    *, *::before, *::after {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    /* ==========================================================
       LAYER 3: Root Typography & Arabic Shaping
       ========================================================== */
    html, body {
      width: ${A4_WIDTH_PX}px !important;
      max-width: ${A4_WIDTH_PX}px !important;
      margin: 0;
      padding: 0;
      overflow-x: hidden;
      background: #ffffff;
      font-family: 'Roboto', 'Cairo', 'Arial', sans-serif !important;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      /* Arabic shaping: ensure ligatures and connected letters */
      text-rendering: optimizeLegibility;
      font-variant-ligatures: common-ligatures;
      font-feature-settings: 'liga' 1, 'calt' 1;
    }

    /* ==========================================================
       LAYER 4: Font Weight Compensation
       PDF rendering makes text appear ~15% thinner than screen.
       We compensate by bumping body text to 500 and headings to 700+.
       ========================================================== */
    p, span, li, td, th, dd, dt, label, a {
      font-weight: 500;
    }

    /* Headings: enforce bold weight */
    h1, h2, h3, h4, h5, h6 {
      font-weight: 700;
    }

    /* Preserve inline bold/bolder styles set by templates */
    strong, b {
      font-weight: 800 !important;
    }

    /* Allow template inline styles to win for explicitly bold elements */
    [style*="font-weight: 700"],
    [style*="font-weight:700"],
    [style*="font-weight: 800"],
    [style*="font-weight:800"],
    [style*="font-weight: 900"],
    [style*="font-weight:900"] {
      font-weight: inherit !important;
    }

    /* ==========================================================
       LAYER 5: Arabic Text — Perfect Shaping & Direction
       ========================================================== */
    [dir="rtl"], [dir="rtl"] * {
      text-rendering: optimizeLegibility !important;
      font-variant-ligatures: common-ligatures !important;
      font-feature-settings: 'liga' 1, 'calt' 1 !important;
      word-spacing: 0.02em;
    }

    /* ==========================================================
       LAYER 6: A4 Page Container — Strict Dimensions
       ========================================================== */
    .a4-page-outer {
      width: 210mm !important;
      height: 297mm !important;
      min-height: 297mm !important;
      max-height: 297mm !important;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      margin: 0 !important;
      padding: 0;
      border: none !important;
      box-shadow: none !important;
      position: relative;
    }
    .a4-page-outer:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    /* Page content fills the A4 frame — no !important to avoid overriding templates */
    .a4-page-content {
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Template root fills the page — no !important to preserve template layouts */
    [data-cv-root] {
      width: 100%;
      min-height: 100%;
      flex: 1;
    }

    /* ==========================================================
       LAYER 7: Anti-Break Rules for Clean Pagination
       ========================================================== */
    .resume-section { break-inside: avoid; page-break-inside: avoid; }
    .experience-item, .education-item, .project-item,
    .certificate-item, .award-item, .volunteer-item {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    p, li { widows: 3; orphans: 3; }

    /* ==========================================================
       LAYER 8: Hide Non-Printable Elements
       ========================================================== */
    .no-print, .draggable-canvas-controls,
    .page-footer, .zoom-controls,
    [style*="left: -9999"],
    [style*="position: absolute"][style*="visibility: hidden"] {
      display: none !important;
    }

    /* ==========================================================
       LAYER 9: Remove Scroll/Drag Wrappers
       ========================================================== */
    .print-container {
      display: block !important;
      transform: none !important;
      position: static !important;
      width: ${A4_WIDTH_PX}px !important;
    }

    /* ==========================================================
       LAYER 10: User-Injected Styles (from Frontend)
       ========================================================== */
    ${cssContent}
  </style>
</head>
<body dir="auto" lang="ar">
  ${htmlContent}
</body>
</html>`;

    // ── 5. Load content and wait for full network idle ───────────
    console.log('[PDF Service] Loading HTML content...');
    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // ── 6. Wait for ALL web fonts to be fully loaded ─────────────
    //    Using evaluateHandle for stable cross-boundary promise resolution
    console.log('[PDF Service] Waiting for fonts...');
    await page.evaluateHandle('document.fonts.ready');

    // ── 7. Small extra delay for complex layouts to settle ───────
    await new Promise(resolve => setTimeout(resolve, 500));

    // ── 8. Generate high-quality PDF ─────────────────────────────
    console.log('[PDF Service] Generating PDF...');
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
