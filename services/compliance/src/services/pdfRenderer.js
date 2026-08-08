const { logger } = require('../logger');

let puppeteer = null;

// Lazy load puppeteer so the service still starts where it is unavailable.
try {
  puppeteer = require('puppeteer');
} catch (err) {
  logger.warn('Puppeteer not available - PDF generation disabled');
}

/** Chrome flags required to run headless inside the service container. */
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu'
];

/** Is PDF rendering available in this environment? */
function isAvailable() {
  return puppeteer !== null;
}

/**
 * Render an HTML string to a PDF buffer.
 *
 * Shared by the compliance and external exposure report generators so the
 * browser flags, margins and header/footer behaviour stay identical between
 * the two report families.
 *
 * @param {string} htmlContent
 * @param {Object} [options]
 * @param {string} [options.headerText] - centred header on every page
 * @param {string} [options.format='A4']
 * @returns {Promise<Buffer>}
 * @throws when puppeteer is unavailable; callers fall back to HTML
 */
async function renderPdf(htmlContent, options = {}) {
  if (!puppeteer) {
    throw new Error('Puppeteer is not available');
  }

  const browser = await puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    return await page.pdf({
      format: options.format || 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size: 10px; text-align: center; width: 100%; margin: 0 20px;">
          <span>${escapeHtml(options.headerText || '')}</span>
        </div>
      `,
      footerTemplate: `
        <div style="font-size: 10px; display: flex; justify-content: space-between; width: 100%; margin: 0 20px;">
          <span>Generated: ${new Date().toLocaleDateString()}</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `
    });
  } finally {
    // Always close, even when page.pdf throws, so a failed render cannot leak
    // a Chrome process for the lifetime of the service.
    await browser.close();
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { renderPdf, isAvailable, escapeHtml, LAUNCH_ARGS };
