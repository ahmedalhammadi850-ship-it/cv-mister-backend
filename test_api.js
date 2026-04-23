const fs = require('fs');

async function testApi() {
  try {
    const res = await fetch('http://localhost:3001/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/pdf' },
      body: JSON.stringify({
        html: '<h1>Hello World</h1><p>Test PDF Content</p>',
        css: 'h1 { color: red; }'
      })
    });

    const buffer = await res.arrayBuffer();
    fs.writeFileSync('api_test.pdf', Buffer.from(buffer));
    console.log('PDF saved as api_test.pdf. Size:', buffer.byteLength);
  } catch (err) {
    console.error('API Error:', err.message);
  }
}

testApi();
