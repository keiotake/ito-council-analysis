const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');

async function main() {
  const data = new Uint8Array(fs.readFileSync('giin_shokai.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  console.log(`Total pages: ${doc.numPages}`);
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    console.log(`\n=== Page ${i} ===`);
    console.log(text);
  }
}
main().catch(console.error);
