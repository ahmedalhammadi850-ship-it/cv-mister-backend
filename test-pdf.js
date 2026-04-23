const fs = require('fs');
const { generatePdf } = require('./pdfService');

async function test() {
  console.log('Testing PDF generation directly in backend...');
  try {
    const html = '<h1>Test Resume</h1><p>This is a simulated export.</p>';
    const css = 'h1 { color: red; }';
    const buffer = await generatePdf(html, css);
    fs.writeFileSync('test_output.pdf', buffer);
    console.log('Saved to test_output.pdf. Size:', buffer.length);
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
