// ============================================================
// CV-Mister — PDF Generation Service v5.0 (Clean Puppeteer)
// MIRROR-IMAGE EXPORT — Frontend sends clean resume-only HTML.
// Puppeteer renders it identically → page.pdf() captures pixel-perfect PDF.
// ============================================================

let puppeteer;
let chromium;
try {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} catch (e) {
  console.warn('[PDF Service] ⚠️ Puppeteer-core or Chromium not found.');
}

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

/**
 * Generate a pixel-perfect PDF from clean resume HTML.
 * Frontend now sends ONLY the visible A4 pages + all stylesheets.
 * No DOM manipulation needed — just render and capture.
 *
 * @param {string} fullPageHtml - Clean HTML document with resume pages only
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePdf(fullPageHtml) {
  if (!puppeteer) {
    throw new Error('PDF generation service unavailable (Puppeteer not installed).');
  }

  let browser = null;

  try {
    // ── 1. Launch headless Chrome ────────────────────────────────
    console.log('[PDF Service] Launching headless browser...');
    browser = await puppeteer.launch({
      args: [...chromium.args, '--font-render-hinting=none'],
      defaultViewport: null,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // ── 2. Set viewport to exact A4 at Retina 2x ────────────────
    await page.setViewport({
      width: A4_WIDTH_PX,
      height: A4_HEIGHT_PX,
      deviceScaleFactor: 2,
    });

    // ── 3. Force Screen Media Type & Light Mode ──────────────────
    // CRITICAL: This guarantees the PDF looks EXACTLY like the screen preview.
    // Without this, the browser applies @media print rules which ruin the layout.
    await page.emulateMediaType('screen');
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
    ]);

    // ── 4. Clean the HTML: remove scripts, ensure DOCTYPE ────────
    let cleanHtml = fullPageHtml;

    // Remove ALL <script> tags to prevent errors
    cleanHtml = cleanHtml.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Remove dark mode class from <html> if present
    cleanHtml = cleanHtml.replace(/class="[^"]*dark[^"]*"/, (match) => {
      return match.replace(/\bdark\b/g, '').replace(/\s+/g, ' ').trim();
    });

    // Ensure DOCTYPE
    if (!cleanHtml.startsWith('<!DOCTYPE') && !cleanHtml.startsWith('<!doctype')) {
      cleanHtml = '<!DOCTYPE html>\n' + cleanHtml;
    }

    // ── 5. Inject additional PDF-specific overrides ──────────────
    const pdfOverrides = `
    <style id="pdf-export-overrides">
      /* Force Light Mode */
      html, :root { color-scheme: light !important; }

      /* Body reset */
      html, body {
        width: 100% !important;
        max-width: ${A4_WIDTH_PX}px !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: #ffffff !important;
      }

      /* A4 Page dimensions */
      @page {
        size: 210mm 297mm;
        margin: 0;
      }

      .a4-page-outer {
        width: 210mm !important;
        height: 297mm !important;
        min-height: 297mm !important;
        max-height: 297mm !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
        position: relative !important;
        page-break-after: always !important;
        break-after: page !important;
      }

      .a4-page-outer:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }

      /* Color fidelity */
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }

      /* Typography: crisp fonts for PDF */
      html, body {
        text-rendering: optimizeLegibility !important;
        -webkit-font-smoothing: antialiased !important;
        font-variant-ligatures: common-ligatures !important;
        font-feature-settings: 'liga' 1, 'calt' 1 !important;
      }

      /* Arabic shaping */
      [dir="rtl"], [dir="rtl"] * {
        text-rendering: optimizeLegibility !important;
        font-variant-ligatures: common-ligatures !important;
        font-feature-settings: 'liga' 1, 'calt' 1 !important;
      }

      /* Print container */
      .print-container {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        width: 100% !important;
        gap: 0 !important;
        background: transparent !important;
      }

      /* Remove DraggableCanvas transforms if any leaked through */
      .draggable-resume-canvas, .resume-canvas-wrapper,
      [class*="draggable"], [class*="canvas"] {
        transform: none !important;
        scale: unset !important;
        position: static !important;
        cursor: default !important;
        overflow: visible !important;
      }

      /* Hide UI elements that shouldn't be in PDF */
      .nav-bar, .navbar, .form-panel, .sidebar, .no-print,
      .builder-tabs-container, .save-indicator, .template-grid,
      .category-grid, .btn-primary, .btn-secondary, .btn-premium,
      [class*="Toaster"], [class*="chat-widget"], [class*="tidio"] {
        display: none !important;
      }
    </style>`;

    // Inject before </head>
    if (cleanHtml.includes('</head>')) {
      cleanHtml = cleanHtml.replace('</head>', pdfOverrides + '\n</head>');
    } else {
      cleanHtml = `<!DOCTYPE html><html><head>${pdfOverrides}</head><body>${cleanHtml}</body></html>`;
    }

    // ── 6. Load the page in Puppeteer ───────────────────────────
    console.log('[PDF Service] Loading clean resume HTML...');
    await page.setContent(cleanHtml, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // ── 7. Ensure only resume content remains ───────────────────
    console.log('[PDF Service] Verifying resume content...');
    await page.evaluate(() => {
      // Find the print-container (should be the only relevant element now)
      const resume = document.querySelector('.print-container');
      if (resume) {
        // Move it directly into body, remove everything else
        document.body.innerHTML = '';
        document.body.appendChild(resume);
      }
    });

    // ── 8. Wait for fonts to fully load ─────────────────────────
    console.log('[PDF Service] Waiting for fonts...');
    await page.evaluateHandle('document.fonts.ready');

    // ── 9. Extra settle time for complex layouts ────────────────
    await new Promise(resolve => setTimeout(resolve, 800));

    // ── 10. Generate PDF ────────────────────────────────────────
    console.log('[PDF Service] Generating PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 60000,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    console.log(`[PDF Service] ✅ PDF generated (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
    return pdfBuffer;

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { generatePdf };
