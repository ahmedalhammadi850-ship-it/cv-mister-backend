// ============================================================
// CV-Mister — PDF Generation Service (Puppeteer)
// REBUILT FROM SCRATCH — Clean, minimal, guaranteed to work.
// ============================================================

// Lazy load puppeteer to avoid crashes if it's not installed (e.g. on Railway without specific buildpacks)
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('[PDF Service] ⚠️ Puppeteer module not found. PDF generation will be unavailable.');
}

/**
 * Generate a PDF buffer from HTML content using Headless Chrome.
 * @param {string} htmlContent - The resume HTML markup
 * @param {string} cssContent - Additional inline CSS (optional)
 * @returns {Promise<Buffer>} Raw PDF binary buffer
 */
async function generatePdf(htmlContent, cssContent = '') {
  if (!puppeteer) {
    throw new Error('PDF generation service is currently unavailable (Puppeteer not installed).');
  }
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome' || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });

    const page = await browser.newPage();

    // Build a self-contained HTML document with embedded fonts
    const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&family=Almarai:wght@300;400;700;800&family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* Force A4 dimensions and print-quality colors */
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
      width: 210mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: 'Inter', 'Cairo', 'Almarai', sans-serif;
    }

    /* Anti-break rules */
    .resume-section { break-inside: avoid; page-break-inside: avoid; }
    .experience-item, .education-item, .project-item,
    .certificate-item, .award-item, .volunteer-item {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    p, li { widows: 3; orphans: 3; }

    /* User-injected styles */
    ${cssContent}
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

    // Set content and wait for ALL network requests to finish (fonts, images)
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    // Generate the PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      timeout: 60000,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return pdfBuffer;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { generatePdf };
