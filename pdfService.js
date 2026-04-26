// ============================================================
// CV-Mister — PDF Generation Service v4.0 (Pure Puppeteer)
// MIRROR-IMAGE EXPORT — Zero DOM manipulation.
// Frontend sends the full rendered page HTML → Puppeteer re-renders
// it identically → page.pdf() captures a pixel-perfect PDF.
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
 * Generate a pixel-perfect PDF from the full rendered page HTML.
 * No cloneNode. No getComputedStyle. No manual CSS extraction.
 * Puppeteer re-renders the EXACT same HTML the user sees.
 *
 * @param {string} fullPageHtml - The complete document HTML (document.documentElement.outerHTML)
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

    // ── 3. Force Light Mode ─────────────────────────────────────
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
    ]);

    // ── 4. Clean the HTML: strip scripts, inject print overrides ─
    let cleanHtml = fullPageHtml;

    // Remove ALL <script> tags to prevent React hydration & errors
    cleanHtml = cleanHtml.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Remove dark mode class from <html> if present
    cleanHtml = cleanHtml.replace(/class="[^"]*dark[^"]*"/, (match) => {
      return match.replace(/\bdark\b/g, '').replace(/\s+/g, ' ').trim();
    });

    // ── 5. Inject print-override CSS before </head> ─────────────
    const printOverrideCSS = `
    <style id="pdf-export-overrides">
      /* ── Force Light Mode ─────────────────────────── */
      html, :root { color-scheme: light !important; }

      /* ── Hide ALL UI elements — show ONLY the resume ── */
      nav, header, footer,
      .navbar, .sidebar-panel, .form-panel, .builder-sidebar,
      .toolbar, .zoom-controls, .zoom-bar, .floating-controls,
      .no-print, .draggable-canvas-controls, .page-footer,
      .mobile-menu, .mobile-nav, .toast-container, .toaster,
      .subscription-widget, .chat-widget,
      [class*="Toaster"], [class*="modal"], [class*="overlay"],
      [id*="chat"], [class*="chat"], iframe,
      .builder-layout > :not(.preview-panel),
      .builder-content > :not(.preview-panel) {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
      }

      /* ── Show the resume preview panel full-width ──── */
      .preview-panel, .print-container {
        position: static !important;
        transform: none !important;
        width: ${A4_WIDTH_PX}px !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        display: block !important;  /* override flex to prevent gap */
        gap: 0 !important;
      }

      /* ── Body reset for clean rendering ────────────── */
      html, body {
        width: ${A4_WIDTH_PX}px !important;
        max-width: ${A4_WIDTH_PX}px !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: #ffffff !important;
      }

      /* ── Builder layout: collapse to single column ── */
      .builder-layout, .builder-content, .builder-wrapper,
      main, #root, #app {
        display: block !important;
        width: ${A4_WIDTH_PX}px !important;
        max-width: ${A4_WIDTH_PX}px !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }

      /* ── Hide off-screen measurement containers ───── */
      [style*="left: -9999"], [style*="left:-9999"],
      [style*="position: absolute"][style*="visibility: hidden"] {
        display: none !important;
      }

      /* ── A4 Page: strict dimensions + page breaks ── */
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
        page-break-after: always;
        break-after: page;
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
        position: relative;
        float: none !important;
      }
      .a4-page-outer:last-of-type {
        page-break-after: auto !important;
        break-after: auto !important;
      }

      /* ── Color fidelity ────────────────────────────── */
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }

      /* ── Typography: crisp fonts for PDF ────────────── */
      html, body {
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        font-variant-ligatures: common-ligatures;
        font-feature-settings: 'liga' 1, 'calt' 1;
      }

      /* ── Arabic shaping ────────────────────────────── */
      [dir="rtl"], [dir="rtl"] * {
        text-rendering: optimizeLegibility !important;
        font-variant-ligatures: common-ligatures !important;
        font-feature-settings: 'liga' 1, 'calt' 1 !important;
      }

      /* ── DraggableCanvas: remove transforms ────────── */
      .draggable-resume-canvas, .resume-canvas-wrapper,
      [class*="draggable"], [class*="canvas"] {
        transform: none !important;
        scale: unset !important;
        position: static !important;
        cursor: default !important;
        overflow: visible !important;
        width: auto !important;
        height: auto !important;
        min-height: unset !important;
      }
    </style>`;

    // Inject before </head>
    if (cleanHtml.includes('</head>')) {
      cleanHtml = cleanHtml.replace('</head>', printOverrideCSS + '\n</head>');
    } else {
      // Fallback: wrap in a full document
      cleanHtml = `<!DOCTYPE html><html><head>${printOverrideCSS}</head><body>${cleanHtml}</body></html>`;
    }

    // Ensure DOCTYPE
    if (!cleanHtml.startsWith('<!DOCTYPE') && !cleanHtml.startsWith('<!doctype')) {
      cleanHtml = '<!DOCTYPE html>\n' + cleanHtml;
    }

    // ── 6. Load the page in Puppeteer ───────────────────────────
    console.log('[PDF Service] Loading full page HTML...');
    await page.setContent(cleanHtml, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // ── 6.5 BULLETPROOF CLEANUP: Remove everything except the resume ──
    console.log('[PDF Service] Stripping extraneous DOM elements...');
    await page.evaluate(() => {
      const resume = document.querySelector('.print-container') || document.querySelector('.preview-panel');
      if (resume) {
        // Remove ALL chat widgets, iframes, and scripts explicitly before clearing body
        document.querySelectorAll('iframe, script, [id*="chat"], [class*="chat"]').forEach(el => el.remove());
        
        // Move resume to body and clear the rest
        document.body.innerHTML = '';
        document.body.appendChild(resume);
      }
    });

    // ── 7. Wait for fonts to fully load ─────────────────────────
    console.log('[PDF Service] Waiting for fonts...');
    await page.evaluateHandle('document.fonts.ready');

    // ── 8. Extra settle time for complex layouts ────────────────
    await new Promise(resolve => setTimeout(resolve, 800));

    // ── 9. Generate PDF ─────────────────────────────────────────
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
